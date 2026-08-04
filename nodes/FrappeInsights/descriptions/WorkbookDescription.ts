import type { INodeProperties } from 'n8n-workflow';

import { documentIdField, getManyFields, workbookOperationsFor } from './CommonDescription';

/**
 * `Insights Workbook` is the container every other v3 object hangs from: a query, a chart
 * and a dashboard all declare a `workbook` Link and none of them can be created without
 * one. Creating the workbook is therefore the first call of any Insights workflow.
 *
 * Only `title` is writable. `data_backup`, `from_template`, `imported_version` and
 * `imported_checksum` are marked read-only on the doctype — Insights fills them during
 * import and template instantiation — so the node does not expose them.
 */
export const workbookDescription: INodeProperties[] = [
	workbookOperationsFor('workbook', 'workbook'),
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['workbook'], operation: ['create'] } },
		description: 'Name of the workbook, as shown in the Insights workbook list',
	},
	documentIdField(
		'workbook',
		'The Frappe record\'s "name" field. The doctype is autoincrement, so it is an integer, e.g. 12.',
		['get', 'update', 'delete', 'duplicate'],
	),
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: ['workbook'], operation: ['update'] } },
		options: [
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description: 'Name of the workbook, as shown in the Insights workbook list',
			},
		],
	},
	...getManyFields('workbook'),
];
