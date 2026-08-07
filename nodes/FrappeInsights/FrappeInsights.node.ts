import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	ALERT_REQUIRED_ON_CREATE,
	alertDescription,
	CHART_REQUIRED_ON_CREATE,
	chartDescription,
	DASHBOARD_REQUIRED_ON_CREATE,
	dashboardDescription,
	DATA_SOURCE_REQUIRED_ON_CREATE,
	dataSourceDescription,
	QUERY_REQUIRED_ON_CREATE,
	queryDescription,
	tableDescription,
	TEAM_REQUIRED_ON_CREATE,
	teamDescription,
	WORKBOOK_REQUIRED_ON_CREATE,
	workbookDescription,
} from './descriptions';
import { frappeApiRequest, frappeApiRequestAllItems, frappeRunDocMethod } from './GenericFunctions';
import { getDoctype } from './types';
import type { FrappeInsightsResource } from './types';

/**
 * Date fields (day only) among those exposed by the node.
 *
 * Empty today: every writable date on the Insights v3 doctypes is a Datetime. The set is
 * kept so that adding a Date field stays a one-line change instead of a refactor — a field
 * missing from these sets is sent as ISO 8601, which Frappe rejects or silently shifts.
 */
const DATE_FIELDS = new Set<string>([]);

/**
 * Datetime fields among those exposed by the node.
 *
 * Empty too, for a different reason: the only candidate was `Insights Alert.next_execution`,
 * which Insights recomputes on every save — see `AlertDescription.ts`. It is no longer
 * exposed, so nothing needs converting today.
 */
const DATETIME_FIELDS = new Set<string>([]);

/**
 * Fields the doctypes declare as `JSON`. Frappe stores them as text and parses on read, so
 * they travel as strings — see `normalizeJsonFields` for why they are not sent as objects.
 */
const JSON_FIELDS = new Set([
	'api_custom_headers',
	'bigquery_service_account_key',
	'config',
	'http_headers',
	'items',
	'operations',
]);

/** Date or datetime carrying no timezone: `2026-08-15`, `2026-08-15T17:00:00`. */
const NAIVE_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?)?$/;

/**
 * Fields each resource exposes at the top level on create, outside the collection.
 *
 * Composed from the lists the descriptions declare rather than restated here: the two
 * used to be written twice and had already drifted apart in order.
 */
const REQUIRED_ON_CREATE: Record<string, string[]> = {
	workbook: WORKBOOK_REQUIRED_ON_CREATE,
	query: QUERY_REQUIRED_ON_CREATE,
	chart: CHART_REQUIRED_ON_CREATE,
	dashboard: DASHBOARD_REQUIRED_ON_CREATE,
	dataSource: DATA_SOURCE_REQUIRED_ON_CREATE,
	alert: ALERT_REQUIRED_ON_CREATE,
	team: TEAM_REQUIRED_ON_CREATE,
};

/**
 * Formats an instant as wall-clock time in a given timezone.
 *
 * `toISOString()` would yield UTC, which is wrong here: Frappe stores *naive* datetimes,
 * interpreted in the site's timezone. An alert due at 08:00 in Paris must therefore be sent
 * as `08:00:00`, not `06:00:00`.
 */
function formatInTimeZone(date: Date, timeZone: string, withTime: boolean): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		...(withTime
			? ({ hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' } as const)
			: {}),
	}).formatToParts(date);

	const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
	const day = `${part('year')}-${part('month')}-${part('day')}`;

	return withTime ? `${day} ${part('hour')}:${part('minute')}:${part('second')}` : day;
}

/**
 * n8n returns dateTime fields as ISO 8601; Frappe expects `YYYY-MM-DD` for a Date field
 * and `YYYY-MM-DD HH:mm:ss` for a Datetime field, both expressed in the site's timezone.
 *
 * A value carrying a timezone (`...Z` or `...+02:00`) is converted to `timeZone`, that of
 * the n8n workflow. A value that is already naive is passed through untouched: the user
 * entered wall-clock time, and reinterpreting it would shift it.
 */
function normalizeDates(fields: IDataObject, timeZone: string): IDataObject {
	const normalized: IDataObject = {};

	for (const [key, value] of Object.entries(fields)) {
		const isDate = DATE_FIELDS.has(key);
		const isDatetime = DATETIME_FIELDS.has(key);

		if (typeof value === 'string' && value !== '' && (isDate || isDatetime)) {
			const naive = NAIVE_DATE_PATTERN.exec(value);
			if (naive !== null) {
				const [, day, time, seconds] = naive;
				normalized[key] = isDate || time === undefined ? day : `${day} ${time}:${seconds ?? '00'}`;
				continue;
			}

			const parsed = new Date(value);
			if (!Number.isNaN(parsed.getTime())) {
				normalized[key] = formatInTimeZone(parsed, timeZone, isDatetime);
				continue;
			}
		}

		normalized[key] = value;
	}

	return normalized;
}

/**
 * Validates the `JSON` fields and hands them to Frappe as strings.
 *
 * Frappe's base `Document.get_valid_dict()` does **not** serialize a dict or a list written
 * into a `JSON` field — `InsightsQueryv3` overrides it precisely to json-encode `operations`
 * when it is a list, which is the tell that the base class leaves the value alone. Sending
 * an object would therefore reach the database as `"[object Object]"` on any field whose
 * controller lacks that override. A string is what the column holds anyway.
 *
 * Parsing here is only a check: it turns a typo into a node error naming the field, instead
 * of a document that saves fine and breaks when Insights next reads it.
 */
function normalizeJsonFields(
	context: IExecuteFunctions,
	fields: IDataObject,
	itemIndex: number,
): IDataObject {
	const normalized: IDataObject = {};

	for (const [key, value] of Object.entries(fields)) {
		if (!JSON_FIELDS.has(key) || value === undefined || value === null || value === '') {
			normalized[key] = value;
			continue;
		}

		// An expression may already have produced the parsed structure.
		if (typeof value === 'object') {
			normalized[key] = JSON.stringify(value);
			continue;
		}

		if (typeof value !== 'string') {
			normalized[key] = value;
			continue;
		}

		try {
			JSON.parse(value);
		} catch {
			throw new NodeOperationError(
				context.getNode(),
				`Field "${key}" is not valid JSON: ${value}`,
				{
					itemIndex,
					description:
						'The Insights doctype declares this field as JSON. Expected a JSON object or array.',
				},
			);
		}

		normalized[key] = value;
	}

	return normalized;
}

/** Parses a JSON parameter entered in the UI, tolerating an expression that already produced an object. */
function parseJsonParameter(
	context: IExecuteFunctions,
	value: unknown,
	parameterName: string,
	itemIndex: number,
): IDataObject | unknown[] | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'object') return value as IDataObject | unknown[];

	if (typeof value !== 'string') return undefined;

	try {
		return JSON.parse(value) as IDataObject | unknown[];
	} catch {
		throw new NodeOperationError(
			context.getNode(),
			`Parameter "${parameterName}" is not valid JSON: ${value}`,
			{
				itemIndex,
				description:
					'Expected an object {"field": "value"} or an array [["field","operator","value"]].',
			},
		);
	}
}

/** Accepts `name,title` as well as ["name","title"]. */
function parseFieldList(value: string): string[] {
	const trimmed = value.trim();
	if (trimmed.startsWith('[')) {
		return JSON.parse(trimmed) as string[];
	}
	return trimmed
		.split(',')
		.map((field) => field.trim())
		.filter((field) => field.length > 0);
}

/**
 * Builds the `order_by` clause, qualifying a bare column with its table.
 *
 * The naive `sortField sortOrder` breaks on Frappe 15 and the naive backtick fix breaks on
 * Frappe 16, so neither is written as-is:
 *
 * - Frappe 15 inlines `order_by` into the SQL almost verbatim, so a column whose name is a
 *   reserved word blows up in the database rather than in Frappe. `Insights Table v3.table`
 *   is exactly that case — the most natural sort field for the Table resource — and yields
 *   `ERROR 1064 … near 'table asc'` on MariaDB. Backticks fix it there.
 * - Frappe 16 rewrote `db_query` onto pypika (`frappe/database/query.py`): `order_by` is now
 *   *parsed* rather than inlined, and `_validate_and_parse_field_for_clause` accepts a
 *   backticked name only in the two-part form. A lone `` `table` `` raises
 *   `Order By has invalid backtick notation`. Verified on a live 16.29.0 site.
 *
 * The qualified form `tab<doctype>`.`<field>`, both parts backticked, satisfies the two:
 * for the Table resource that is `tabInsights Table v3`.`table`. Frappe 16 parses it,
 * and Frappe 15 inlines it into valid SQL, since `tab{doctype}` is the very table `db_query`
 * selects from. Verified sorting correctly on all eight doctypes.
 *
 * Only a plain identifier is qualified. Anything else (a name the user already qualified,
 * an expression, a value already backticked) is left alone rather than being quoted into
 * something invalid.
 */
function buildOrderBy(doctype: string, sortField: string, sortOrder: string): string {
	const field = sortField.trim();
	const qualified = /^[A-Za-z_][A-Za-z0-9_]*$/.test(field)
		? `\`tab${doctype}\`.\`${field}\``
		: field;
	return `${qualified} ${sortOrder}`;
}

/**
 * Wraps ad-hoc filters into the shape Insights actually looks for.
 *
 * `adhoc_filters` is **keyed by query name**, not a filter itself. `IbisQueryBuilder`
 * reads it as `adhoc_filters_by_query[self.doc.name]` and expects a `filter_group`
 * operation there — anything else is ignored *silently*, which is the worst possible
 * failure mode: the query runs, returns every row, and nothing says the filter was
 * dropped. Measured on a live site against 1177 rows: `{"istable": 1}` and a bare
 * `filter_group` both counted 1177, the keyed form counted 446.
 *
 * The node therefore accepts three forms and normalizes the first two:
 *
 * - an array  -> the `filters` of an `And` group on the query being run;
 * - a `filter_group` object -> keyed under the query being run;
 * - anything else -> passed through, which is how a pipeline filters a *nested* query
 *   by naming it explicitly.
 */
function wrapAdhocFilters(
	filters: IDataObject | unknown[],
	queryName: string,
): IDataObject | unknown[] {
	if (Array.isArray(filters)) {
		return { [queryName]: { type: 'filter_group', logical_operator: 'And', filters } };
	}

	if (filters !== null && typeof filters === 'object') {
		const candidate = filters as IDataObject;
		if (candidate.type === 'filter_group') return { [queryName]: candidate };
	}

	return filters;
}

/**
 * Collects the arguments of `Insights Query v3.execute` / `.get_count`.
 *
 * Only the keys the Python signature declares may be sent: `run_doc_method` spreads them as
 * keyword arguments, so a stray key is a `TypeError` on the site, surfaced as an HTTP 417.
 * `adhoc_filters` is parsed rather than passed through — `set_adhoc_filters()` stores the
 * value on `frappe.local` without calling `parse_json`, so a string would reach the query
 * builder as a string and be ignored.
 */
function buildQueryMethodArgs(
	context: IExecuteFunctions,
	options: IDataObject,
	itemIndex: number,
	withPagination: boolean,
	queryName: string,
): IDataObject {
	const args: IDataObject = {};

	if (typeof options.active_operation_idx === 'number') {
		args.active_operation_idx = options.active_operation_idx;
	}

	const adhocFilters = parseJsonParameter(
		context,
		options.adhoc_filters,
		'Adhoc Filters (JSON)',
		itemIndex,
	);
	if (adhocFilters !== undefined) args.adhoc_filters = wrapAdhocFilters(adhocFilters, queryName);

	if (withPagination) {
		if (typeof options.page === 'number') args.page = options.page;
		if (typeof options.page_size === 'number') args.page_size = options.page_size;
		if (options.force === true) args.force = true;
	}

	return args;
}

/** Documents fetched per page by the "Document" locator. It asks for more through its token. */
const SEARCH_PAGE_SIZE = 50;

/**
 * Field carrying the human-readable label of a resource, when `name` is not already it.
 *
 * Most doctypes here are autonamed with a series or a hash, so a list of bare `name` values
 * would be unusable. Exceptions, left out on purpose: team, whose `autoname` is `field:team_name` — its `name` already is the label.
 *
 * A wrong entry does not break the picker: `searchDocuments` retries on `name` alone when
 * Frappe rejects the field, so the list degrades to identifiers instead of erroring.
 */
const TITLE_FIELD_BY_RESOURCE: Partial<Record<FrappeInsightsResource, string>> = {
	alert: 'title',
	chart: 'title',
	dashboard: 'title',
	dataSource: 'title',
	query: 'title',
	table: 'label',
	workbook: 'title',
};

/** Escapes the LIKE wildcards Frappe forwards to SQL, so a literal `%` searches for `%`. */
function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Lists the documents of one doctype, filtered server-side.
 *
 * A plain dropdown is not an option: these doctypes grow without bound, so Frappe does the
 * filtering and the node only pages through the answer.
 */
async function searchIn(
	this: ILoadOptionsFunctions,
	doctype: string,
	titleField: string | undefined,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const start = Number(paginationToken ?? 0);

	const query = (title: string | undefined): IDataObject => {
		const qs: IDataObject = {
			fields: title === undefined ? ['name'] : ['name', title],
			order_by: 'modified desc',
			limit_start: start,
			limit_page_length: SEARCH_PAGE_SIZE,
		};

		if (filter) {
			const pattern = `%${escapeLike(filter)}%`;
			// On a titled doctype the search has to match either side: nobody looks a record up
			// by the identifier Frappe gave it.
			qs.or_filters =
				title === undefined
					? [['name', 'like', pattern]]
					: [
							['name', 'like', pattern],
							[title, 'like', pattern],
						];
		}

		return qs;
	};

	const fetch = async (title: string | undefined): Promise<IDataObject[]> =>
		await frappeApiRequest.call<
			ILoadOptionsFunctions,
			[IHttpRequestMethods, string, IDataObject, IDataObject, number],
			Promise<IDataObject[]>
		>(this, 'GET', `/api/resource/${encodeURIComponent(doctype)}`, {}, query(title), 0);

	let effectiveTitle = titleField;
	let documents: IDataObject[];
	if (effectiveTitle === undefined) {
		documents = await fetch(undefined);
	} else {
		try {
			documents = await fetch(effectiveTitle);
		} catch {
			// The title field is a mapping, not a contract: a customised doctype, or a Frappe
			// version that renamed it, makes the query fail. Falling back to `name` keeps the
			// picker usable rather than turning a cosmetic detail into a blocking error. The
			// retry cannot fail for the same reason, so the error it may raise is the real one.
			effectiveTitle = undefined;
			documents = await fetch(undefined);
		}
	}

	return {
		results: documents.map((document) => {
			const name = String(document.name);
			const title = effectiveTitle === undefined ? undefined : document[effectiveTitle];
			return {
				name: typeof title === 'string' && title !== '' ? `${name} — ${title}` : name,
				value: name,
			};
		}),
		// A short page is the last one; returning no token stops the locator from asking again.
		paginationToken:
			documents.length === SEARCH_PAGE_SIZE ? String(start + SEARCH_PAGE_SIZE) : undefined,
	};
}

/**
 * Lists the documents of the resource currently selected — the "Document" locator.
 *
 * The doctype comes from the `resource` parameter rather than from one of its own: that
 * mapping is what this node knows and the generic Frappe node does not.
 */
export async function searchDocuments(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const resource = this.getNodeParameter('resource') as string;
	return await searchIn.call(
		this,
		getDoctype(resource),
		TITLE_FIELD_BY_RESOURCE[resource as FrappeInsightsResource],
		filter,
		paginationToken,
	);
}

/**
 * Builds the search method of a Link field, bound to the doctype that field points at.
 *
 * One method per target doctype, and not a single generic one, because n8n names the method
 * in the field (`searchListMethod`) and calls it with nothing but the filter and the
 * pagination token — it never says which field asked. `searchDocuments` gets away with a
 * single method only because it can read the `resource` parameter.
 */
function linkSearch(doctype: string, titleField?: string) {
	return async function (
		this: ILoadOptionsFunctions,
		filter?: string,
		paginationToken?: string,
	): Promise<INodeListSearchResult> {
		return await searchIn.call(this, doctype, titleField, filter, paginationToken);
	};
}

// No `linkOptions` here, unlike the sibling packages: every Link this node exposes points at
// `Insights Query v3` or `Insights Workbook`, both fed by the user and both unreadable on
// their own, so all of them are searches. There is no configuration doctype to list.

/**
 * Replaces the resource-locator objects a collection carries with the identifiers they hold.
 *
 * A locator is stored as `{ __rl: true, mode, value }`. Reading a whole collection with
 * `getNodeParameter('additionalFields', i)` returns those objects untouched: n8n only
 * unwraps a locator when the parameter is addressed by its own path with
 * `extractValue: true`, which would mean one call per field. Spreading the collection into
 * the request body without this would send Frappe an object where it expects a name.
 *
 * Only the stored `value` is taken. That is exact here because the manual mode of these
 * locators is a plain string with no `extractValue` regex of its own — the day one gains
 * one, it has to be read through `getNodeParameter` instead.
 */
function unwrapResourceLocators(collection: IDataObject): IDataObject {
	const unwrapped: IDataObject = {};

	for (const [key, value] of Object.entries(collection)) {
		const isLocator =
			value !== null && typeof value === 'object' && '__rl' in (value as IDataObject);
		unwrapped[key] = isLocator ? ((value as IDataObject).value as IDataObject[string]) : value;
	}

	return unwrapped;
}

export class FrappeInsights implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Frappe Insights',
		name: 'frappeInsights',
		// Frappe Insights logo: opaque teal #18aeb7 badge with the glyph knocked out in white.
		// A single file, hence the same teal on both themes, by choice: the badge carries its
		// own background and holds contrast on light as well as dark.
		//
		// `icon-prefer-themed-variants` is silenced rather than worked around: the rule only
		// checks that `icon` is not a string literal, it never compares the two files, so the
		// { light, dark } form with the same path twice would satisfy it without changing a
		// single pixel on screen.
		//
		// Should monochrome variants ever be reintroduced: in n8n the key names the UI
		// theme, not the ink colour. A white icon belongs under `dark`, a black one under
		// `light` — the other way round makes them invisible.
		// eslint-disable-next-line @n8n/community-nodes/icon-prefer-themed-variants
		icon: 'file:../../icons/frappe-insights.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Run Frappe Insights queries and manage workbooks, charts, dashboards, data sources and alerts',
		defaults: {
			name: 'Frappe Insights',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'frappeApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Alert', value: 'alert' },
					{ name: 'Chart', value: 'chart' },
					{ name: 'Dashboard', value: 'dashboard' },
					{ name: 'Data Source', value: 'dataSource' },
					{ name: 'Query', value: 'query' },
					{ name: 'Table', value: 'table' },
					{ name: 'Team', value: 'team' },
					{ name: 'Workbook', value: 'workbook' },
				],
				default: 'query',
			},
			...workbookDescription,
			...queryDescription,
			...chartDescription,
			...dashboardDescription,
			...dataSourceDescription,
			...tableDescription,
			...alertDescription,
			...teamDescription,
		],
	};

	methods = {
		listSearch: {
			searchDocuments,
			// Both are unreadable on their own — a query is a hash, a workbook an integer — so
			// each carries its title beside the identifier.
			searchInsightsQuery: linkSearch('Insights Query v3', 'title'),
			searchInsightsWorkbook: linkSearch('Insights Workbook', 'title'),
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const doctype = getDoctype(resource);
		const basePath = `/api/resource/${encodeURIComponent(doctype)}`;
		const timeZone = this.getTimezone();

		for (let i = 0; i < items.length; i++) {
			try {
				if (operation === 'create' || operation === 'update') {
					const collectionName = operation === 'create' ? 'additionalFields' : 'updateFields';
					const collected = unwrapResourceLocators(
						this.getNodeParameter(collectionName, i, {}) as IDataObject,
					);

					let body: IDataObject = { ...collected };

					// Required fields are exposed at the top level, outside the collection.
					if (operation === 'create') {
						for (const field of REQUIRED_ON_CREATE[resource] ?? []) {
							body[field] = this.getNodeParameter(field, i);
						}
					}

					body = normalizeDates(body, timeZone);
					body = normalizeJsonFields(this, body, i);

					if (operation === 'create') {
						const created = await frappeApiRequest.call(this, 'POST', basePath, body, {}, i);
						returnData.push({ json: created as IDataObject, pairedItem: { item: i } });
					} else {
						const documentId = this.getNodeParameter('documentId', i, undefined, {
							extractValue: true,
						}) as string;
						const updated = await frappeApiRequest.call(
							this,
							'PUT',
							`${basePath}/${encodeURIComponent(documentId)}`,
							body,
							{},
							i,
						);
						returnData.push({ json: updated as IDataObject, pairedItem: { item: i } });
					}
				} else if (operation === 'get') {
					const documentId = this.getNodeParameter('documentId', i, undefined, {
						extractValue: true,
					}) as string;
					const document = await frappeApiRequest.call(
						this,
						'GET',
						`${basePath}/${encodeURIComponent(documentId)}`,
						{},
						{},
						i,
					);
					returnData.push({ json: document as IDataObject, pairedItem: { item: i } });
				} else if (operation === 'delete') {
					const documentId = this.getNodeParameter('documentId', i, undefined, {
						extractValue: true,
					}) as string;
					await frappeApiRequest.call(
						this,
						'DELETE',
						`${basePath}/${encodeURIComponent(documentId)}`,
						{},
						{},
						i,
					);
					returnData.push({
						json: { success: true, doctype, name: documentId },
						pairedItem: { item: i },
					});
				} else if (operation === 'execute') {
					const documentId = this.getNodeParameter('documentId', i, undefined, {
						extractValue: true,
					}) as string;
					const options = this.getNodeParameter('executeOptions', i, {}) as IDataObject;
					const splitRows = this.getNodeParameter('splitRows', i, true) as boolean;

					const result = (await frappeRunDocMethod.call(
						this,
						doctype,
						documentId,
						'execute',
						buildQueryMethodArgs(this, options, i, true, documentId),
						i,
					)) as IDataObject;

					if (splitRows) {
						// One item per row is what a workflow iterates over; the columns and the
						// generated SQL stay available through "Split Rows Into Items" = false.
						const rows = Array.isArray(result.rows) ? (result.rows as IDataObject[]) : [];
						for (const row of rows) {
							returnData.push({ json: row, pairedItem: { item: i } });
						}
					} else {
						returnData.push({ json: result, pairedItem: { item: i } });
					}
				} else if (operation === 'getCount') {
					const documentId = this.getNodeParameter('documentId', i, undefined, {
						extractValue: true,
					}) as string;
					const options = this.getNodeParameter('countOptions', i, {}) as IDataObject;

					const count = await frappeRunDocMethod.call<
						IExecuteFunctions,
						[string, string, string, IDataObject, number],
						Promise<number>
					>(
						this,
						doctype,
						documentId,
						'get_count',
						buildQueryMethodArgs(this, options, i, false, documentId),
						i,
					);

					returnData.push({
						json: { name: documentId, count: Number(count) },
						pairedItem: { item: i },
					});
				} else if (operation === 'duplicate') {
					const documentId = this.getNodeParameter('documentId', i, undefined, {
						extractValue: true,
					}) as string;
					const duplicated = await frappeRunDocMethod.call(
						this,
						doctype,
						documentId,
						'duplicate',
						{},
						i,
					);
					// `Insights Workbook.duplicate` returns the **name** of the copy, not the
					// document — and `Insights Workbook` is autoincrement, so that name is a
					// number. Verified against a live site: the call answers `2`. n8n requires
					// `json` to be an object, so the scalar is re-read as a document to keep the
					// output shape identical to Create. An object is passed through untouched,
					// in case a later Insights release starts returning the document itself.
					const document =
						duplicated !== null && typeof duplicated === 'object'
							? (duplicated as IDataObject)
							: ((await frappeApiRequest.call(
									this,
									'GET',
									`${basePath}/${encodeURIComponent(String(duplicated))}`,
									{},
									{},
									i,
								)) as IDataObject);

					returnData.push({ json: document, pairedItem: { item: i } });
				} else if (operation === 'testConnection') {
					const documentId = this.getNodeParameter('documentId', i, undefined, {
						extractValue: true,
					}) as string;
					const result = await frappeRunDocMethod.call(
						this,
						doctype,
						documentId,
						'test_connection',
						{},
						i,
					);

					// `test_connection` swallows the driver exception and returns `True` or, on
					// failure, `None` — which Frappe omits from the response altogether. Anything
					// that is not a literal `true` therefore means the connection did not open.
					returnData.push({
						json: { name: documentId, success: result === true },
						pairedItem: { item: i },
					});
				} else if (operation === 'getAll') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const options = this.getNodeParameter('options', i, {}) as IDataObject;

					const qs: IDataObject = {};

					// Without `fields`, Frappe returns the `name` column only.
					qs.fields =
						typeof options.fields === 'string' && options.fields.trim() !== ''
							? parseFieldList(options.fields)
							: ['*'];

					const filters = parseJsonParameter(this, options.filters, 'Filters (JSON)', i);
					if (filters !== undefined) qs.filters = filters;

					const orFilters = parseJsonParameter(this, options.orFilters, 'Or Filters (JSON)', i);
					if (orFilters !== undefined) qs.or_filters = orFilters;

					if (typeof options.sortField === 'string' && options.sortField.trim() !== '') {
						qs.order_by = buildOrderBy(
							doctype,
							options.sortField,
							(options.sortOrder as string) ?? 'desc',
						);
					}

					let records: IDataObject[];
					if (returnAll) {
						records = await frappeApiRequestAllItems.call(this, basePath, qs, i);
					} else {
						qs.limit_page_length = this.getNodeParameter('limit', i) as number;
						qs.limit_start = (options.offset as number) ?? 0;
						records = await frappeApiRequest.call<
							IExecuteFunctions,
							Parameters<typeof frappeApiRequest>,
							Promise<IDataObject[]>
						>(this, 'GET', basePath, {}, qs, i);
					}

					for (const record of records) {
						returnData.push({ json: record, pairedItem: { item: i } });
					}
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				// frappeApiRequest already throws a NodeApiError carrying the Frappe message;
				// only unexpected errors get wrapped here.
				const nodeError =
					error instanceof NodeApiError || error instanceof NodeOperationError
						? error
						: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });

				if (this.continueOnFail()) {
					returnData.push({
						json: { error: nodeError.message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw nodeError;
			}
		}

		return [returnData];
	}
}
