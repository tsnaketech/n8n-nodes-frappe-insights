import type { INodeProperties } from 'n8n-workflow';

import {
	dataSourceOperationsFor,
	documentIdField,
	getManyFields,
	omitFields,
} from './CommonDescription';

/**
 * `Insights Data Source v3` fields offered on create as well as update.
 *
 * The doctype covers two unrelated shapes behind one `type` Select: a database connection
 * and a REST API connection. Its `validate()` branches on `type`, then on `database_type`,
 * and each branch declares its own mandatory fields — which is why almost everything here
 * is optional at the node level and Frappe is left to reject the incoherent combinations.
 * Mandatory per branch, from `insights_data_source_v3.py`:
 *
 * - `REST API`            -> `api_base_url`, plus the credentials the auth type implies
 * - `SQLite` / `DuckDB`   -> `database_name`
 * - `BigQuery`            -> `bigquery_project_id`, `bigquery_dataset_id`, service account key
 * - any other database    -> `host`, `port`, `username`, `password`, `database_name`,
 *   unless `connection_string` is given, which short-circuits the check
 */
const dataSourceFields: INodeProperties[] = [
	{
		displayName: 'API Authentication Type',
		name: 'api_authentication_type',
		type: 'options',
		options: [
			{ name: 'API Key / Bearer Token', value: 'API Key / Bearer Token' },
			{ name: 'Basic Authentication', value: 'Basic Authentication' },
			{ name: 'None', value: 'None' },
		],
		default: 'None',
		description: 'Authentication scheme used by the REST API source',
	},
	{
		displayName: 'API Base URL',
		name: 'api_base_url',
		type: 'string',
		default: '',
		placeholder: 'https://api.example.com/v1',
		description: 'Root of the remote API. Mandatory when Type is REST API.',
	},
	{
		displayName: 'API Custom Headers (JSON)',
		name: 'api_custom_headers',
		type: 'json',
		default: '',
		placeholder: '{"X-Tenant": "acme"}',
		description: 'Headers added to every call to the remote API',
	},
	{
		displayName: 'API Password',
		name: 'api_password',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description: 'Password, when the authentication is Basic Authentication',
	},
	{
		displayName: 'API Token',
		name: 'api_token',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description: 'Token, when the authentication is API Key / Bearer Token',
	},
	{
		displayName: 'API Username',
		name: 'api_username',
		type: 'string',
		default: '',
		description: 'User name, when the authentication is Basic Authentication',
	},
	{
		displayName: 'BigQuery Dataset ID',
		name: 'bigquery_dataset_id',
		type: 'string',
		default: '',
		description: 'Identifier of the BigQuery dataset',
	},
	{
		displayName: 'BigQuery Project ID',
		name: 'bigquery_project_id',
		type: 'string',
		default: '',
		description: 'Identifier of the Google Cloud project',
	},
	{
		displayName: 'BigQuery Service Account Key (JSON)',
		name: 'bigquery_service_account_key',
		type: 'json',
		default: '',
		description: 'Service account key, as downloaded from Google Cloud',
	},
	{
		displayName: 'Connection String',
		name: 'connection_string',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		placeholder: 'postgresql://user:pass@host:5432/mydb',
		description:
			'Full DSN. When set, Frappe ignores Host, Port, Username, Password and Database Name.',
	},
	{
		displayName: 'Database Name',
		name: 'database_name',
		type: 'string',
		default: '',
		description:
			'Name of the database. For SQLite and DuckDB it is the path of the file on the Frappe server.',
	},
	{
		displayName: 'Database Type',
		name: 'database_type',
		type: 'options',
		options: [
			{ name: 'BigQuery', value: 'BigQuery' },
			{ name: 'ClickHouse', value: 'ClickHouse' },
			{ name: 'DuckDB', value: 'DuckDB' },
			{ name: 'MariaDB', value: 'MariaDB' },
			{ name: 'PostgreSQL', value: 'PostgreSQL' },
			{ name: 'SQLite', value: 'SQLite' },
		],
		default: 'MariaDB',
		description: 'Engine targeted when Type is Database',
	},
	{
		displayName: 'Enable Stored Procedure Execution',
		name: 'enable_stored_procedure_execution',
		type: 'boolean',
		default: false,
		description: 'Whether queries on this source may call stored procedures',
	},
	{
		displayName: 'HTTP Headers (JSON)',
		name: 'http_headers',
		type: 'json',
		default: '',
		description: 'Extra HTTP headers, for the engines queried over HTTP',
	},
	{
		displayName: 'Host',
		name: 'host',
		type: 'string',
		default: '',
		placeholder: 'db.example.com',
		description: 'Host name of the database server',
	},
	{
		displayName: 'Is DuckLake',
		name: 'is_ducklake',
		type: 'boolean',
		default: false,
		description: 'Whether the DuckDB source is a DuckLake catalog',
	},
	{
		displayName: 'Password',
		name: 'password',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description: 'Password of the database account',
	},
	{
		displayName: 'Port',
		name: 'port',
		type: 'number',
		default: 3306,
		description: 'Port of the database server, e.g. 3306 or 5432',
	},
	{
		displayName: 'Schema',
		name: 'schema',
		type: 'string',
		default: '',
		description: 'Default schema, for the engines that distinguish several',
	},
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		options: [
			{ name: 'Active', value: 'Active' },
			{ name: 'Inactive', value: 'Inactive' },
		],
		default: 'Inactive',
		description: 'State of the connection, updated by Insights after a test',
	},
	{
		displayName: 'Use SSL',
		name: 'use_ssl',
		type: 'boolean',
		default: false,
		description: 'Whether to open the database connection over SSL',
	},
	{
		displayName: 'Username',
		name: 'username',
		type: 'string',
		default: '',
		description: 'User name of the database account',
	},
];

/**
 * Fields exposed at the top level on create, outside the collection.
 *
 * The node imports this list to know which parameters to read there, so the fields
 * drawn here and the fields sent cannot drift apart.
 */
export const DATA_SOURCE_REQUIRED_ON_CREATE = ['title', 'type'];

/**
 * `is_site_db` and `is_frappe_db` are read-only: Insights sets them on the built-in source
 * pointing at the Frappe site's own database, and `before_insert` refuses a second one.
 * Neither is exposed.
 */
export const dataSourceDescription: INodeProperties[] = [
	dataSourceOperationsFor('dataSource', 'data source'),
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['dataSource'], operation: ['create'] } },
		description:
			'Name of the source. Frappe derives the "name" field from it through scrub(): "Prod Sales" becomes prod_sales.',
	},
	{
		displayName: 'Type',
		name: 'type',
		type: 'options',
		options: [
			{ name: 'Database', value: 'Database' },
			{ name: 'REST API', value: 'REST API' },
		],
		default: 'Database',
		required: true,
		displayOptions: { show: { resource: ['dataSource'], operation: ['create'] } },
		description: 'Nature of the source: a database or a REST API',
	},
	documentIdField(
		'dataSource',
		'The Frappe record\'s "name" field, derived from the title, e.g. prod_sales.',
		['get', 'update', 'delete', 'testConnection'],
		'prod_sales',
	),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: ['dataSource'], operation: ['create'] } },
		options: omitFields(dataSourceFields, DATA_SOURCE_REQUIRED_ON_CREATE),
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: ['dataSource'], operation: ['update'] } },
		options: dataSourceFields,
	},
	...getManyFields('dataSource'),
];
