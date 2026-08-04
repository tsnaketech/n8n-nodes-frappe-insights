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

/** The five CRUD operations, specialised for a given resource. */
export function operationsFor(resource: string, singular: string): INodeProperties {
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
				description: `Create a ${singular}`,
				action: `Create a ${singular}`,
			},
			{
				name: 'Delete',
				value: 'delete',
				description: `Delete a ${singular}`,
				action: `Delete a ${singular}`,
			},
			{
				name: 'Get',
				value: 'get',
				description: `Retrieve a ${singular}`,
				action: `Get a ${singular}`,
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: `Retrieve many ${singular}s`,
				action: `Get many ${singular}s`,
			},
			{
				name: 'Update',
				value: 'update',
				description: `Update a ${singular}`,
				action: `Update a ${singular}`,
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
export function queryOperationsFor(resource: string, singular: string): INodeProperties {
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
				description: `Create a ${singular}`,
				action: `Create a ${singular}`,
			},
			{
				name: 'Delete',
				value: 'delete',
				description: `Delete a ${singular}`,
				action: `Delete a ${singular}`,
			},
			{
				name: 'Execute',
				value: 'execute',
				description: 'Run the query and return its result rows',
				action: `Execute a ${singular}`,
			},
			{
				name: 'Get',
				value: 'get',
				description: `Retrieve a ${singular}`,
				action: `Get a ${singular}`,
			},
			{
				name: 'Get Count',
				value: 'getCount',
				description: 'Count the rows the query would return, without fetching them',
				action: `Get the row count of a ${singular}`,
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: `Retrieve many ${singular}s`,
				action: `Get many ${singular}s`,
			},
			{
				name: 'Update',
				value: 'update',
				description: `Update a ${singular}`,
				action: `Update a ${singular}`,
			},
		],
		default: 'execute',
	};
}

/** CRUD plus `duplicate`, the one workbook-level method worth exposing. */
export function workbookOperationsFor(resource: string, singular: string): INodeProperties {
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
				description: `Create a ${singular}`,
				action: `Create a ${singular}`,
			},
			{
				name: 'Delete',
				value: 'delete',
				description: `Delete a ${singular}`,
				action: `Delete a ${singular}`,
			},
			{
				name: 'Duplicate',
				value: 'duplicate',
				description: 'Copy the workbook along with its queries, charts and dashboards',
				action: `Duplicate a ${singular}`,
			},
			{
				name: 'Get',
				value: 'get',
				description: `Retrieve a ${singular}`,
				action: `Get a ${singular}`,
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: `Retrieve many ${singular}s`,
				action: `Get many ${singular}s`,
			},
			{
				name: 'Update',
				value: 'update',
				description: `Update a ${singular}`,
				action: `Update a ${singular}`,
			},
		],
		default: 'getAll',
	};
}

/** CRUD plus `test_connection`, which is the only way to know a data source actually works. */
export function dataSourceOperationsFor(resource: string, singular: string): INodeProperties {
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
				description: `Create a ${singular}`,
				action: `Create a ${singular}`,
			},
			{
				name: 'Delete',
				value: 'delete',
				description: `Delete a ${singular}`,
				action: `Delete a ${singular}`,
			},
			{
				name: 'Get',
				value: 'get',
				description: `Retrieve a ${singular}`,
				action: `Get a ${singular}`,
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: `Retrieve many ${singular}s`,
				action: `Get many ${singular}s`,
			},
			{
				name: 'Test Connection',
				value: 'testConnection',
				description: 'Test the connection to the database or the remote API',
				action: `Test the connection of a ${singular}`,
			},
			{
				name: 'Update',
				value: 'update',
				description: `Update a ${singular}`,
				action: `Update a ${singular}`,
			},
		],
		default: 'getAll',
	};
}

/**
 * Read-only resources. `Insights Table v3` is metadata Insights writes itself when it syncs
 * a data source: creating one by hand describes a table that may not exist.
 */
export function readOperationsFor(resource: string, singular: string): INodeProperties {
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
				description: `Retrieve a ${singular}`,
				action: `Get a ${singular}`,
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: `Retrieve many ${singular}s`,
				action: `Get many ${singular}s`,
			},
		],
		default: 'getAll',
	};
}

/**
 * Document identifier (Frappe's `name` field), required by every operation that targets a
 * single record.
 */
export function documentIdField(
	resource: string,
	description: string,
	operations: string[] = DOCUMENT_OPERATIONS,
): INodeProperties {
	return {
		displayName: 'Document ID',
		name: 'documentId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: [resource], operation: operations } },
		description,
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
					description:
						'Number of records to skip (limit_start). Ignored while "Return All" is on.',
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
