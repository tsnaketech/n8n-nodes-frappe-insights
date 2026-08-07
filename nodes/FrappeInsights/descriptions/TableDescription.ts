import type { INodeProperties } from 'n8n-workflow';

import { documentIdField, getManyFields, readOperationsFor } from './CommonDescription';

/**
 * `Insights Table v3` is exposed read-only.
 *
 * The doctype is a *catalogue entry*, not a table: Insights creates one row per table it
 * discovers when it syncs a data source (`insights.api.data_sources.update_data_source_tables`,
 * which calls `update_table_list` on the source). Creating one over REST would describe a
 * table that may not exist in the source database, and the next sync would overwrite it
 * anyway.
 *
 * Reading them is useful, though: this is how a workflow discovers what a data source
 * exposes, and `last_synced_on` tells it whether the import is fresh.
 */
export const tableDescription: INodeProperties[] = [
	readOperationsFor('table', 'table'),
	documentIdField(
		'table',
		'The Frappe record\'s "name" field. Insights generates it when syncing; the real table name lives in the "table" field.',
		['get'],
		'abc123de45',
	),
	...getManyFields('table'),
];
