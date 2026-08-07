import type { INodeProperties } from 'n8n-workflow';

import {
	documentIdField,
	getManyFields,
	omitFields,
	queryOperationsFor,
} from './CommonDescription';

/** `Insights Query v3` fields offered on create as well as update. */
const queryFields: INodeProperties[] = [
	{
		displayName: 'Folder',
		name: 'folder',
		type: 'string',
		default: '',
		description: 'The "name" field of the Insights Folder record filing the query',
	},
	{
		displayName: 'Is Builder Query',
		name: 'is_builder_query',
		type: 'boolean',
		default: false,
		description: 'Whether the query was assembled in the visual builder',
	},
	{
		displayName: 'Is Native Query',
		name: 'is_native_query',
		type: 'boolean',
		default: false,
		description: 'Whether the query is written directly in SQL',
	},
	{
		displayName: 'Is Script Query',
		name: 'is_script_query',
		type: 'boolean',
		default: false,
		description: 'Whether the query is produced by a Python script',
	},
	{
		displayName: 'Operations (JSON)',
		name: 'operations',
		type: 'json',
		default: '',
		placeholder: '[{"type":"source","table":{"data_source":"site_db","table_name":"tabUser"}}]',
		description:
			'Insights transformation pipeline, from the source table to the filters and aggregations. This field is what defines what the query computes.',
	},
	{
		displayName: 'Sort Order',
		name: 'sort_order',
		type: 'number',
		default: 0,
		description: 'Rank of the query in the workbook sidebar',
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		description: 'Name of the query, as shown in the workbook',
	},
	{
		displayName: 'Use Live Connection',
		name: 'use_live_connection',
		type: 'boolean',
		default: false,
		description:
			'Whether to run against the source database instead of the tables imported into the data store',
	},
];

/**
 * Fields exposed at the top level on create, outside the collection.
 *
 * The node imports this list to know which parameters to read there, so the fields
 * drawn here and the fields sent cannot drift apart.
 */
export const QUERY_REQUIRED_ON_CREATE = ['workbook'];

/**
 * `Insights Query v3` is the only resource that does something other than CRUD: `execute`
 * runs the pipeline and returns rows, which is what a workflow usually wants from a BI
 * tool. Both extra operations are document methods, reached through `frappeRunDocMethod`.
 */
export const queryDescription: INodeProperties[] = [
	queryOperationsFor('query', 'query', 'queries'),
	{
		displayName: 'Workbook',
		name: 'workbook',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: { show: { resource: ['query'], operation: ['create'] } },
		description:
			'The "name" field of the workbook holding the query, e.g. 12. The doctype declares it mandatory: a query does not live outside a workbook.',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchInsightsWorkbook',
					searchable: true,
					searchFilterRequired: false,
				},
			},
			{
				displayName: 'By Name',
				name: 'name',
				type: 'string',
				placeholder: '12',
			},
		],
	},
	documentIdField(
		'query',
		'The Frappe record\'s "name" field, e.g. abc123de45. Visible in the URL of the Insights workbook.',
		['get', 'update', 'delete', 'execute', 'getCount'],
		'abc123de45',
	),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: ['query'], operation: ['create'] } },
		options: omitFields(queryFields, QUERY_REQUIRED_ON_CREATE),
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: ['query'], operation: ['update'] } },
		options: queryFields,
	},
	{
		displayName: 'Execute Options',
		name: 'executeOptions',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['query'], operation: ['execute'] } },
		options: [
			{
				displayName: 'Active Operation Index',
				name: 'active_operation_idx',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description:
					'Stops the pipeline after the nth operation, to inspect an intermediate result. The whole query runs by default.',
			},
			{
				displayName: 'Adhoc Filters (JSON)',
				name: 'adhoc_filters',
				type: 'json',
				default: '',
				placeholder: '[{"column": {"column_name": "status"}, "operator": "=", "value": "Open"}]',
				description:
					'Filters applied to this run only, leaving the saved query untouched. An array of {"column": {"column_name": …}, "operator": …, "value": …} rules combined with AND.',
			},
			{
				displayName: 'Force Refresh',
				name: 'force',
				type: 'boolean',
				default: false,
				description: 'Whether to bypass the result cache, which Insights keeps for ten minutes',
			},
			{
				displayName: 'Page',
				name: 'page',
				type: 'number',
				default: 1,
				typeOptions: { minValue: 1 },
				description: 'Page number of the results, starting at 1',
			},
			{
				displayName: 'Page Size',
				name: 'page_size',
				type: 'number',
				default: 100,
				typeOptions: { minValue: 1 },
				description: 'Number of rows per page',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'countOptions',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['query'], operation: ['getCount'] } },
		options: [
			{
				displayName: 'Active Operation Index',
				name: 'active_operation_idx',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'Stops the pipeline after the nth operation before counting the rows',
			},
			{
				displayName: 'Adhoc Filters (JSON)',
				name: 'adhoc_filters',
				type: 'json',
				default: '',
				placeholder: '[{"column": {"column_name": "status"}, "operator": "=", "value": "Open"}]',
				description:
					'Filters applied to this count only, leaving the saved query untouched. An array of {"column": {"column_name": …}, "operator": …, "value": …} rules combined with AND.',
			},
		],
	},
	{
		displayName: 'Split Rows Into Items',
		name: 'splitRows',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['query'], operation: ['execute'] } },
		description:
			'Whether to emit one n8n item per result row. Turn off to get a single item holding the rows, the column metadata and the generated SQL.',
	},
	...getManyFields('query'),
];
