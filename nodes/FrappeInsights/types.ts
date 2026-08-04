/**
 * Mapping from n8n resource to Frappe doctype.
 *
 * Names verified against github.com/frappe/insights (branch `develop`),
 * `insights/insights/doctype/`.
 *
 * The ` v3` suffix is part of the doctype name, not a version of this node. Insights 3
 * rewrote its data model and kept the v2 doctypes alongside the new ones for migration, so
 * `Insights Query` and `Insights Query v3` are two different doctypes that can coexist on
 * the same site. This node targets **Insights 3 only** — on a site still running v2 every
 * request answers 404, which is the honest failure mode rather than silently reading stale
 * doctypes.
 *
 * `Insights Alert`, `Insights Workbook` and `Insights Team` carry no suffix: they were
 * introduced by (or survived into) v3 unchanged.
 */
export const DOCTYPE_BY_RESOURCE = {
	workbook: 'Insights Workbook',
	query: 'Insights Query v3',
	chart: 'Insights Chart v3',
	dashboard: 'Insights Dashboard v3',
	dataSource: 'Insights Data Source v3',
	table: 'Insights Table v3',
	alert: 'Insights Alert',
	team: 'Insights Team',
} as const;

export type FrappeInsightsResource = keyof typeof DOCTYPE_BY_RESOURCE;

export function getDoctype(resource: string): string {
	const doctype = DOCTYPE_BY_RESOURCE[resource as FrappeInsightsResource];
	if (doctype === undefined) {
		throw new Error(`Unknown resource: ${resource}`);
	}
	return doctype;
}
