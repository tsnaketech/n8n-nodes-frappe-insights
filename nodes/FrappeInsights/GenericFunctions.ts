import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

/**
 * Transport layer shared by every Frappe node.
 *
 * The shared part — `normalizeSiteUrl`, `parseFrappeError`, `serializeQuery`,
 * `frappeApiRequest` and `frappeApiRequestAllItems` — is identical in the seven packages of
 * the family, each carrying its own copy: an import never crosses an npm package boundary.
 * A fix there concerns all seven. See docs/CREDENTIALS.md, which tables what each copy adds
 * on top of it.
 *
 * Two helpers are appended below, so the shared part stays a verbatim copy:
 * `frappeMethodRequest` and `frappeRunDocMethod`, which posts to
 * `/api/method/frappe.handler.run_doc_method`. Read its own comment before reusing it
 * elsewhere — the Helpdesk package runs document methods through another route, on purpose.
 */

const CREDENTIALS_NAME = 'frappeApi';

/** Records requested per page when auto-paginating. */
const AUTO_PAGE_SIZE = 100;

/** Safety net: beyond this, pagination is assumed not to converge. */
const MAX_AUTO_PAGES = 1000;

/**
 * Frappe application paths mounted as SPAs. They are not part of the API — `/api/...`
 * always lives at the site root. Stripping them lets a user paste the URL their browser
 * displays (e.g. https://site/insights) instead of the bare site root.
 *
 * `desk` is the Frappe v16 mount for the Desk, which lived at `app` up to v15. Both are
 * listed so the same credential works against either major version. Since v16 the Desk URL
 * also carries the workspace — `/desk/hrms` for Frappe HR — hence the truncation below.
 *
 * Leaving the path in place does not fail loudly: Frappe serves the SPA's `index.html` with
 * **HTTP 200** for `/insights/api/method/...`, so the node would parse HTML as a document.
 * The same list is duplicated as a regex alternation in the credential's `test` request —
 * change both together.
 */
const SPA_MOUNT_PATHS = [
	'desk',
	'app',
	'crm',
	'helpdesk',
	'hrms',
	'hr',
	'roster',
	'lms',
	'insights',
	'builder',
];

/** Matches the first mount segment of a path, capturing everything before it. */
const SPA_MOUNT_PATTERN = new RegExp(`^(.*?)/(?:${SPA_MOUNT_PATHS.join('|')})(?:/|$)`, 'i');

/**
 * Normalizes the site URL entered in the credential: drops the trailing slash and, from the
 * first SPA mount onwards, the application path.
 *
 * Truncating instead of stripping a single trailing segment is what makes v16 URLs work:
 * the browser shows `https://site/desk/hrms`, and a document sits even deeper at
 * `https://site/desk/employee/HR-EMP-00001`. Only the path is inspected, never the host, so
 * a site served from `https://app.example.com` keeps its hostname.
 */
export function normalizeSiteUrl(siteUrl: string): string {
	const trimmed = (siteUrl ?? '').trim().replace(/\/+$/, '');

	const schemeEnd = trimmed.indexOf('://');
	const pathStart = trimmed.indexOf('/', schemeEnd === -1 ? 0 : schemeEnd + 3);
	if (pathStart === -1) return trimmed;

	const root = trimmed.slice(0, pathStart);
	const path = trimmed.slice(pathStart);
	const match = SPA_MOUNT_PATTERN.exec(path);

	// No mount matched: the path is kept, since the site may genuinely live under one.
	return `${root}${match ? match[1] : path}`.replace(/\/+$/, '');
}

/** Strips HTML tags and decodes the most common entities. */
function stripHtml(value: string): string {
	return value
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|li|h\d)>/gi, '\n')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * Extracts the messages from `_server_messages`, which Frappe encodes as JSON **inside**
 * JSON: a string holding an array of strings, each of which is itself a JSON object
 * `{"message": "...", "title": "..."}`.
 */
function parseServerMessages(raw: unknown): string[] {
	if (typeof raw !== 'string' || raw.length === 0) return [];

	let entries: unknown;
	try {
		entries = JSON.parse(raw);
	} catch {
		return [stripHtml(raw)];
	}

	if (!Array.isArray(entries)) return [];

	const messages: string[] = [];
	for (const entry of entries) {
		if (typeof entry !== 'string') continue;

		let message = entry;
		try {
			const parsed = JSON.parse(entry) as unknown;
			if (typeof parsed === 'string') {
				message = parsed;
			} else if (parsed !== null && typeof parsed === 'object') {
				const candidate = (parsed as IDataObject).message;
				if (typeof candidate === 'string') message = candidate;
			}
		} catch {
			// The entry was not nested JSON: keep it as-is.
		}

		const cleaned = stripHtml(message);
		if (cleaned.length > 0) messages.push(cleaned);
	}

	return messages;
}

/**
 * Strips the Python exception class prefix:
 * `frappe.exceptions.ValidationError: Status required` -> `Status required`.
 */
function cleanException(exception: string): string {
	const match = /^([A-Za-z_][\w.]*Error|[A-Za-z_][\w.]*Exception):\s*([\s\S]+)$/.exec(
		exception.trim(),
	);
	return stripHtml(match ? match[2] : exception);
}

/**
 * Builds a readable message from the error body Frappe returns, rather than settling for
 * the bare HTTP status code.
 */
export function parseFrappeError(body: unknown, statusCode: number): string {
	if (typeof body === 'string') {
		const cleaned = stripHtml(body);
		// A full HTML error page teaches the user nothing useful.
		if (cleaned.length > 0 && cleaned.length < 500) return cleaned;
		return `The Frappe request failed (HTTP ${statusCode})`;
	}

	if (body !== null && typeof body === 'object') {
		const payload = body as IDataObject;

		const serverMessages = parseServerMessages(payload._server_messages);
		if (serverMessages.length > 0) return serverMessages.join(' | ');

		if (typeof payload.exception === 'string' && payload.exception.length > 0) {
			return cleanException(payload.exception);
		}

		if (typeof payload.message === 'string' && payload.message.length > 0) {
			return stripHtml(payload.message);
		}

		if (typeof payload.exc_type === 'string' && payload.exc_type.length > 0) {
			return payload.exc_type;
		}
	}

	return `The Frappe request failed (HTTP ${statusCode})`;
}

/** Serializes the structured values (filters, fields, or_filters) Frappe expects as JSON. */
export function serializeQuery(qs: IDataObject): IDataObject {
	const serialized: IDataObject = {};

	for (const [key, value] of Object.entries(qs)) {
		if (value === undefined || value === null || value === '') continue;
		serialized[key] =
			typeof value === 'object' ? JSON.stringify(value) : (value as IDataObject[string]);
	}

	return serialized;
}

/**
 * Performs an authenticated request against the Frappe REST API and returns the contents
 * of the `{ "data": ... }` envelope.
 */
export async function frappeApiRequest<T = IDataObject>(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
	itemIndex = 0,
): Promise<T> {
	const credentials = await this.getCredentials(CREDENTIALS_NAME);
	const baseURL = normalizeSiteUrl(credentials.siteUrl as string);

	const options: IHttpRequestOptions = {
		method,
		baseURL,
		url: endpoint,
		headers: { Accept: 'application/json' },
		json: true,
		// We inspect the body ourselves to build the Frappe error message.
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};

	const serializedQs = serializeQuery(qs);
	if (Object.keys(serializedQs).length > 0) options.qs = serializedQs;
	if (Object.keys(body).length > 0) options.body = body;

	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		CREDENTIALS_NAME,
		options,
	)) as { statusCode: number; body: unknown };

	const statusCode = response.statusCode;

	if (statusCode >= 400) {
		const message = parseFrappeError(response.body, statusCode);
		const errorBody =
			response.body !== null && typeof response.body === 'object'
				? (response.body as JsonObject)
				: ({ body: response.body } as JsonObject);

		throw new NodeApiError(this.getNode(), errorBody, {
			message,
			httpCode: String(statusCode),
			itemIndex,
			description:
				statusCode === 401 || statusCode === 403
					? "Check the credential's API Key/Secret and the permissions its role has on this doctype."
					: undefined,
		});
	}

	const payload = response.body;
	if (payload !== null && typeof payload === 'object' && 'data' in (payload as IDataObject)) {
		return (payload as IDataObject).data as T;
	}

	return payload as T;
}

/**
 * Calls a whitelisted Frappe method under `/api/method/` and unwraps the `{ "message": ... }`
 * envelope those endpoints use — `/api/resource/` answers with `{ "data": ... }` instead.
 *
 * Needed for everything the REST resource API cannot express. In this node that is the
 * Insights app's own API (`insights.api.*`) and the document methods reached through
 * `frappeRunDocMethod` below.
 */
export async function frappeMethodRequest<T = IDataObject>(
	this: IExecuteFunctions,
	method: string,
	body: IDataObject = {},
	itemIndex = 0,
): Promise<T> {
	const response = await frappeApiRequest.call(
		this,
		'POST',
		`/api/method/${method}`,
		body,
		{},
		itemIndex,
	);

	if (response !== null && typeof response === 'object' && 'message' in response) {
		return (response as IDataObject).message as T;
	}

	return response as T;
}

/**
 * Runs a whitelisted **document** method — a method declared on the doctype's controller
 * class rather than at module level. Insights puts its most useful operations there:
 * `Insights Query v3.execute`, `.get_count`, `Insights Data Source v3.test_connection`.
 *
 * Two routes exist, and the choice between them is not cosmetic.
 *
 * 1. `POST /api/resource/{doctype}/{name}` with `run_method` in the body. Frappe mounts
 *    `execute_doc_method` there (`frappe/api/v1.py`), but it calls
 *    `doc.check_permission("write")` on POST — running a query would demand *write* access
 *    to it. For a BI tool that is backwards: reading a chart is the read-only case.
 *
 * 2. `POST /api/method/frappe.handler.run_doc_method` with `{ dt, dn, method, args }`, used
 *    here. It loads the document with `frappe.get_doc(dt, dn, check_permission=True)`, so it
 *    only requires **read** access, and `args` is parsed as JSON — `page_size: 100` stays an
 *    `int` instead of arriving as the string `"100"` and blowing up inside Ibis.
 *
 * The method **must** be named by its full dotted path. The bare `run_doc_method` also
 * resolves, but only through a shorthand that `frappe/handler.py` deprecates for removal:
 *
 * ```python
 * def get_attr(cmd):
 * 	if "." in cmd:
 * 		method = frappe.get_attr(cmd)
 * 	else:
 * 		deprecation_warning("unknown", "v17",
 * 			f"Calling shorthand for {cmd} is deprecated, please specify full path in RPC call.")
 * 		method = globals()[cmd]
 * ```
 *
 * The short form works on 15 and 16 but logs that warning on every single call, and is
 * announced to disappear in v17. The full path resolves to the same function object, so the
 * exemption below still applies.
 *
 * `run_doc_method` carries no `@frappe.whitelist()` decorator, which makes it look
 * unreachable, but `frappe/handler.py` exempts it by name:
 *
 * ```python
 * if method != run_doc_method:
 * 	is_whitelisted(method)
 * 	is_valid_http_method(method)
 * ```
 *
 * Verified present on the `version-15`, `version-16` and `develop` branches. Permissions
 * are not skipped: `run_doc_method` then calls `is_whitelisted(fn)` on the *document*
 * method it was asked to run.
 */
export async function frappeRunDocMethod<T = IDataObject>(
	this: IExecuteFunctions,
	doctype: string,
	documentName: string,
	method: string,
	args: IDataObject = {},
	itemIndex = 0,
): Promise<T> {
	return await frappeMethodRequest.call<
		IExecuteFunctions,
		[string, IDataObject, number],
		Promise<T>
	>(
		this,
		'frappe.handler.run_doc_method',
		{ dt: doctype, dn: documentName, method, args },
		itemIndex,
	);
}

/**
 * Walks every page of a doctype through `limit_start` / `limit_page_length` and returns
 * all the records.
 */
export async function frappeApiRequestAllItems(
	this: IExecuteFunctions,
	endpoint: string,
	qs: IDataObject = {},
	itemIndex = 0,
): Promise<IDataObject[]> {
	const returnData: IDataObject[] = [];
	let start = Number(qs.limit_start ?? 0);

	for (let page = 0; page < MAX_AUTO_PAGES; page++) {
		const batch = await frappeApiRequest.call<
			IExecuteFunctions,
			[IHttpRequestMethods, string, IDataObject, IDataObject, number],
			Promise<IDataObject[]>
		>(
			this,
			'GET',
			endpoint,
			{},
			{ ...qs, limit_start: start, limit_page_length: AUTO_PAGE_SIZE },
			itemIndex,
		);

		if (!Array.isArray(batch) || batch.length === 0) break;

		returnData.push(...batch);

		// A short page means this was the last one.
		if (batch.length < AUTO_PAGE_SIZE) break;

		start += AUTO_PAGE_SIZE;
	}

	return returnData;
}
