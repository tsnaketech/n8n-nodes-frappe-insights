import type { INodeProperties } from 'n8n-workflow';

import { documentIdField, getManyFields, omitFields, operationsFor } from './CommonDescription';

/** `Insights Chart v3` fields offered on create as well as update. */
const chartFields: INodeProperties[] = [
	{
		displayName: 'Chart Type',
		name: 'chart_type',
		type: 'string',
		default: '',
		placeholder: 'Bar',
		description:
			'Kind of rendering, e.g. Bar, Line, Pie, Number, Table. A free-text field on the doctype: Insights reads it in the frontend, with no closed list.',
	},
	{
		displayName: 'Config (JSON)',
		name: 'config',
		type: 'json',
		default: '',
		placeholder: '{"x_axis":{"column_name":"month"},"y_axis":{"series":[{"measure":"total"}]}}',
		description:
			'Rendering configuration: axes, series, colours, number format. Its shape depends on chart_type.',
	},
	{
		displayName: 'Folder',
		name: 'folder',
		type: 'string',
		default: '',
		description: 'The "name" field of the Insights Folder record filing the chart',
	},
	{
		displayName: 'Is Public',
		name: 'is_public',
		type: 'boolean',
		default: false,
		description: 'Whether the chart can be viewed without logging in',
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		default: '',
		description: 'The "name" field of the Insights Query v3 record feeding the chart',
	},
	{
		displayName: 'Sort Order',
		name: 'sort_order',
		type: 'number',
		default: 0,
		description: 'Rank of the chart in the workbook sidebar',
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		description: 'Name of the chart, as shown in the workbook',
	},
];

const REQUIRED_ON_CREATE = ['workbook'];

/**
 * `Insights Chart v3` is a presentation layer over a query: it holds no data of its own.
 * To read the numbers behind a chart, execute the query its `query` field points at.
 *
 * `data_query` is not exposed — Insights writes it itself, as the derived query that
 * applies the chart's own aggregation on top of the source query.
 */
export const chartDescription: INodeProperties[] = [
	operationsFor('chart', 'chart'),
	{
		displayName: 'Workbook',
		name: 'workbook',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['chart'], operation: ['create'] } },
		description: 'The "name" field of the workbook holding the chart, e.g. 12',
	},
	documentIdField(
		'chart',
		'The Frappe record\'s "name" field, e.g. abc123de45. Visible in the URL of the Insights workbook.',
	),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: ['chart'], operation: ['create'] } },
		options: omitFields(chartFields, REQUIRED_ON_CREATE),
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: ['chart'], operation: ['update'] } },
		options: chartFields,
	},
	...getManyFields('chart'),
];
