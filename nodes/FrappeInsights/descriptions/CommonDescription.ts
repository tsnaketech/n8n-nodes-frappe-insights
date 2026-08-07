import type { INodeProperties } from 'n8n-workflow';

/**
 * Property factories shared by the eight resources: the CRUD operations are identical from
 * one doctype to the next, only the labels and the business fields differ.
 *
 * The option arrays are written out literally rather than composed at runtime — the n8n
 * ESLint rules read them statically and require them to be sorted alphabetically. That is
 * why the resources that add an operation (Query, Workbook, Data Source) get their own
 * factory instead of passing extras to `operationsFor`.
 */

/** Operations offered on a resource whose document ID must be supplied. */
export const DOCUMENT_OPERATIONS = ['get', 'update', 'delete'];

/**
 * Removes fields from a shared list. Used to build "Additional Fields" (create) out of
 * the full list, excluding the fields already exposed at the top level because they are
 * required.
 */
export function omitFields(fields: INodeProperties[], names: string[]): INodeProperties[] {
	return fields.filter((field) => !names.includes(field.name));
}

/**
 * Indefinite article for a resource label.
 *
 * Helpdesk, where this wording comes from, never needed it — ticket, team and customer all
 * start with a consonant. The other packages do: "a employee", "a alert" or "a assignment"
 * would be wrong, so the article is derived rather than written into the template.
 */
function articleFor(singular: string): string {
	return /^[aeiou]/i.test(singular) ? 'an' : 'a';
}

/**
 * The five CRUD operations, specialised for a given resource.
 *
 * Wording, `plural` and `articleFor` are aligned on the Helpdesk package, which is the
 * reference for the whole family: one verb per operation ("Get", never "Retrieve"), no
 * "new"/"existing" filler, and the plural passed in rather than derived — `${singular}s`
 * produces "querys".
 */
export function operationsFor(
	resource: string,
	singular: string,
	plural = `${singular}s`,
): INodeProperties {
	const article = articleFor(singular);

	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: `Create ${article} ${singular}`,
				action: `Create ${article} ${singular}`,
			},
			{
				name: 'Delete',
				value: 'delete',
				description: `Delete ${article} ${singular}`,
				action: `Delete ${article} ${singular}`,
			},
			{
				name: 'Get',
				value: 'get',
				description: `Get ${article} ${singular}`,
				action: `Get ${article} ${singular}`,
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: `Get many ${plural}`,
				action: `Get many ${plural}`,
			},
			{
				name: 'Update',
				value: 'update',
				description: `Update ${article} ${singular}`,
				action: `Update ${article} ${singular}`,
			},
		],
		default: 'getAll',
	};
}

/**
 * CRUD plus the two operations that make the node worth using: running a query and counting
 * its rows. Only `Insights Query v3` gets these — a chart or a dashboard is a presentation
 * layer over a query, and its data always comes from executing that query.
 */
export function queryOperationsFor(
	resource: string,
	singular: string,
	plural = `${singular}s`,
): INodeProperties {
	const article = articleFor(singular);

	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: `Create ${article} ${singular}`,
				action: `Create ${article} ${singular}`,
			},
			{
				name: 'Delete',
				value: 'delete',
				description: `Delete ${article} ${singular}`,
				action: `Delete ${article} ${singular}`,
			},
			{
				name: 'Execute',
				value: 'execute',
				description: 'Run the query and return its result rows',
				action: `Execute ${article} ${singular}`,
			},
			{
				name: 'Get',
				value: 'get',
				description: `Get ${article} ${singular}`,
				action: `Get ${article} ${singular}`,
			},
			{
				name: 'Get Count',
				value: 'getCount',
				description: 'Count the rows the query would return, without fetching them',
				action: `Get the row count of ${article} ${singular}`,
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: `Get many ${plural}`,
				action: `Get many ${plural}`,
			},
			{
				name: 'Update',
				value: 'update',
				description: `Update ${article} ${singular}`,
				action: `Update ${article} ${singular}`,
			},
		],
		default: 'execute',
	};
}

/** CRUD plus `duplicate`, the one workbook-level method worth exposing. */
export function workbookOperationsFor(
	resource: string,
	singular: string,
	plural = `${singular}s`,
): INodeProperties {
	const article = articleFor(singular);

	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: `Create ${article} ${singular}`,
				action: `Create ${article} ${singular}`,
			},
			{
				name: 'Delete',
				value: 'delete',
				description: `Delete ${article} ${singular}`,
				action: `Delete ${article} ${singular}`,
			},
			{
				name: 'Duplicate',
				value: 'duplicate',
				description: 'Copy the workbook along with its queries, charts and dashboards',
				action: `Duplicate ${article} ${singular}`,
			},
			{
				name: 'Get',
				value: 'get',
				description: `Get ${article} ${singular}`,
				action: `Get ${article} ${singular}`,
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: `Get many ${plural}`,
				action: `Get many ${plural}`,
			},
			{
				name: 'Update',
				value: 'update',
				description: `Update ${article} ${singular}`,
				action: `Update ${article} ${singular}`,
			},
		],
		default: 'getAll',
	};
}

/** CRUD plus `test_connection`, which is the only way to know a data source actually works. */
export function dataSourceOperationsFor(
	resource: string,
	singular: string,
	plural = `${singular}s`,
): INodeProperties {
	const article = articleFor(singular);

	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: `Create ${article} ${singular}`,
				action: `Create ${article} ${singular}`,
			},
			{
				name: 'Delete',
				value: 'delete',
				description: `Delete ${article} ${singular}`,
				action: `Delete ${article} ${singular}`,
			},
			{
				name: 'Get',
				value: 'get',
				description: `Get ${article} ${singular}`,
				action: `Get ${article} ${singular}`,
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: `Get many ${plural}`,
				action: `Get many ${plural}`,
			},
			{
				name: 'Test Connection',
				value: 'testConnection',
				description: 'Test the connection to the database or the remote API',
				action: `Test the connection of ${article} ${singular}`,
			},
			{
				name: 'Update',
				value: 'update',
				description: `Update ${article} ${singular}`,
				action: `Update ${article} ${singular}`,
			},
		],
		default: 'getAll',
	};
}

/**
 * Read-only resources. `Insights Table v3` is metadata Insights writes itself when it syncs
 * a data source: creating one by hand describes a table that may not exist.
 */
export function readOperationsFor(
	resource: string,
	singular: string,
	plural = `${singular}s`,
): INodeProperties {
	const article = articleFor(singular);

	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: `Get ${article} ${singular}`,
				action: `Get ${article} ${singular}`,
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: `Get many ${plural}`,
				action: `Get many ${plural}`,
			},
		],
		default: 'getAll',
	};
}

/**
 * Document targeted by every operation that acts on a single record, identified by Frappe's
 * `name` field.
 *
 * A `resourceLocator` rather than a plain string: `name` is rarely something a user knows by
 * heart — most doctypes here are autonamed with a series — so the list mode searches the site
 * through `searchDocuments`. The `name` mode is kept for expressions and for the case where
 * the search cannot run, so the locator is never a dead end.
 *
 * `extractValue: true` is mandatory when reading this parameter in `execute()`: the stored
 * value is `{ mode, value }`, not the identifier.
 */
export function documentIdField(
	resource: string,
	description: string,
	operations: string[] = DOCUMENT_OPERATIONS,
	placeholder?: string,
): INodeProperties {
	return {
		displayName: 'Document',
		name: 'documentId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: { show: { resource: [resource], operation: operations } },
		description,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchDocuments',
					searchable: true,
					searchFilterRequired: false,
				},
			},
			{
				displayName: 'By Name',
				name: 'name',
				type: 'string',
				placeholder,
			},
		],
	};
}

/**
 * Pagination and read options for "Get Many".
 *
 * `returnAll` triggers automatic pagination through `limit_start`; otherwise `limit` is
 * sent as-is in `limit_page_length`.
 */
export function getManyFields(resource: string): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			displayOptions: { show: { resource: [resource], operation: ['getAll'] } },
			description: 'Whether to return all results or only up to a given limit',
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			default: 50,
			typeOptions: { minValue: 1 },
			displayOptions: {
				show: { resource: [resource], operation: ['getAll'], returnAll: [false] },
			},
			description: 'Max number of results to return',
		},
		{
			displayName: 'Options',
			name: 'options',
			type: 'collection',
			placeholder: 'Add option',
			default: {},
			displayOptions: { show: { resource: [resource], operation: ['getAll'] } },
			options: [
				{
					displayName: 'Fields',
					name: 'fields',
					type: 'string',
					default: '',
					placeholder: 'name,title,workbook',
					description:
						'Comma-separated list of the fields to return. A JSON array is accepted too. Frappe returns the "name" column only by default.',
				},
				{
					displayName: 'Filters (JSON)',
					name: 'filters',
					type: 'json',
					default: '',
					placeholder: '{"workbook": "12"}',
					description:
						'Frappe-style filters: an object {"field": "value"} or an array [["field","operator","value"]], e.g. [["modified",">=","2026-01-01"]]',
				},
				{
					displayName: 'Offset',
					name: 'offset',
					type: 'number',
					default: 0,
					typeOptions: { minValue: 0 },
					description: 'Number of records to skip (limit_start). Ignored while "Return All" is on.',
				},
				{
					displayName: 'Or Filters (JSON)',
					name: 'orFilters',
					type: 'json',
					default: '',
					placeholder: '[["title","like","%sales%"],["title","like","%revenue%"]]',
					description: 'Filters combined with OR, in the same format as "Filters"',
				},
				{
					displayName: 'Sort Field',
					name: 'sortField',
					type: 'string',
					default: 'modified',
					description: 'Field to sort on (order_by)',
				},
				{
					displayName: 'Sort Order',
					name: 'sortOrder',
					type: 'options',
					options: [
						{ name: 'Ascending', value: 'asc' },
						{ name: 'Descending', value: 'desc' },
					],
					default: 'desc',
					description: 'Direction of the sort',
				},
			],
		},
	];
}
