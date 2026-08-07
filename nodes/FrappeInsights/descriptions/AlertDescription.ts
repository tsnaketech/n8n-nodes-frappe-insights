import type { INodeProperties } from 'n8n-workflow';

import { documentIdField, getManyFields, omitFields, operationsFor } from './CommonDescription';

/** `Insights Alert` fields offered on create as well as update. */
const alertFields: INodeProperties[] = [
	{
		displayName: 'Channel',
		name: 'channel',
		type: 'options',
		options: [
			{ name: 'Email', value: 'Email' },
			{ name: 'Telegram', value: 'Telegram' },
		],
		default: 'Email',
		description: 'Channel used to send the notification',
	},
	{
		displayName: 'Condition',
		name: 'condition',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		placeholder: 'len(results) > 0',
		description:
			'Python expression evaluated against the query result. The alert fires when it is true.',
	},
	{
		displayName: 'Cron Format',
		name: 'cron_format',
		type: 'string',
		default: '',
		placeholder: '0 8 * * 1',
		description: 'Cron expression, used when Frequency is Cron',
	},
	{
		displayName: 'Custom Condition',
		name: 'custom_condition',
		type: 'boolean',
		default: false,
		description: 'Whether the condition is a hand-written expression rather than a preset',
	},
	{
		displayName: 'Disabled',
		name: 'disabled',
		type: 'boolean',
		default: false,
		description: 'Whether the alert is paused',
	},
	{
		displayName: 'Frequency',
		name: 'frequency',
		type: 'options',
		options: [
			{ name: 'Cron', value: 'Cron' },
			{ name: 'Daily', value: 'Daily' },
			{ name: 'Hourly', value: 'Hourly' },
			{ name: 'Monthly', value: 'Monthly' },
			{ name: 'Weekly', value: 'Weekly' },
		],
		default: 'Daily',
		description: 'How often Insights re-evaluates the condition',
	},
	{
		displayName: 'Message',
		name: 'message',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		description: 'Body of the notification, in Markdown',
	},
	{
		displayName: 'Recipients',
		name: 'recipients',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		placeholder: 'team@acme.io, board@acme.io',
		description: 'Recipients, when the channel is Email',
	},
	{
		displayName: 'Telegram Chat ID',
		name: 'telegram_chat_id',
		type: 'string',
		default: '',
		description: 'Chat identifier, when the channel is Telegram',
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		description: 'Name of the alert',
	},
];

/**
 * Fields exposed at the top level on create, outside the collection.
 *
 * The node imports this list to know which parameters to read there, so the fields
 * drawn here and the fields sent cannot drift apart.
 */
export const ALERT_REQUIRED_ON_CREATE = ['title', 'query', 'condition'];

/**
 * `Insights Alert` watches a query and notifies when its condition holds.
 *
 * Neither scheduling datetime is exposed. `last_execution` is stamped by Insights after each
 * run, and `next_execution` — despite not being flagged read-only on the doctype — is
 * recomputed from `frequency` / `cron_format` on every save. Verified against a live site:
 * an alert created with `next_execution: "2026-09-01 08:30:00"` and `frequency: "Daily"`
 * comes back holding `2000-01-02 00:00:00`, the same value as one created without it.
 * Offering the field would only let a workflow set something that never takes effect.
 */
export const alertDescription: INodeProperties[] = [
	operationsFor('alert', 'alert'),
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['alert'], operation: ['create'] } },
		description: 'Name of the alert',
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: { show: { resource: ['alert'], operation: ['create'] } },
		description:
			'The watched Insights Query v3 record\'s "name" field. Deleting the query deletes its alerts.',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchInsightsQuery',
					searchable: true,
					searchFilterRequired: false,
				},
			},
			{
				displayName: 'By Name',
				name: 'name',
				type: 'string',
				placeholder: 'abc123de45',
			},
		],
	},
	{
		displayName: 'Condition',
		name: 'condition',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['alert'], operation: ['create'] } },
		placeholder: 'len(results) > 0',
		description:
			'Python expression evaluated against the query result. The alert fires when it is true.',
	},
	documentIdField(
		'alert',
		'The Frappe record\'s "name" field for this alert',
		undefined,
		'abc123de45',
	),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: ['alert'], operation: ['create'] } },
		options: omitFields(alertFields, ALERT_REQUIRED_ON_CREATE),
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: ['alert'], operation: ['update'] } },
		options: alertFields,
	},
	...getManyFields('alert'),
];
