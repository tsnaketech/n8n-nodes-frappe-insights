# n8n-nodes-frappe-insights

This is an n8n community node package for [Frappe Insights](https://frappe.io/insights) (the `insights` app). It lets you **run Insights queries and get their rows back**, and manage workbooks, charts, dashboards, data sources, alerts and teams from your n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

Other languages: [Français](README.fr.md) · [Español](README.es.md) · [Deutsch](README.de.md)

[Installation](#installation)
[Credentials](#credentials)
[Operations](#operations)
[Usage](#usage)
[Compatibility](#compatibility)
[Resources](#resources)
[Version history](#version-history)
[Development](#development)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation, using `n8n-nodes-frappe-insights` as the package name.

**Self-hosted, via the n8n UI** — go to **Settings > Community nodes > Install**, enter `n8n-nodes-frappe-insights` and confirm.

**Self-hosted, manually:**

```bash
cd ~/.n8n/custom
npm install n8n-nodes-frappe-insights
```

Restart n8n, then search for "Frappe Insights" in the node panel.

## Credentials

This package uses a single credential type, **Frappe API** (`frappeApi`) — the *same* credential type as the Frappe CRM, Frappe Helpdesk and Frappe HRMS nodes. If you already have it configured, the Frappe Insights node can select it directly.

### Generating API keys in Frappe

1. In your Frappe site, open the user you want n8n to act as (`/app/user`).
2. Scroll to **Settings > API Access** and click **Generate Keys**.
3. Copy the **API Secret** — it is shown only once — and the **API Key** displayed on the user document.

The n8n node acts as that user, so it inherits that user's roles and permissions. If a call fails with a permission error, check the roles rather than the credential.

### Filling in the credential

| Field      | Example                        | Notes                                                             |
| ---------- | ------------------------------ | ----------------------------------------------------------------- |
| Site URL   | `https://my-site.frappe.cloud` | Site root. A trailing `/insights` or `/` is stripped automatically |
| API Key    | `a1b2c3d4e5f6g7h`              |                                                                   |
| API Secret | `s1e2c3r4e5t6`                 | Stored encrypted by n8n                                           |

Requests are authenticated with the header `Authorization: token {apiKey}:{apiSecret}`. Use **Test** to validate the connection — it calls `/api/method/frappe.auth.get_logged_user` and fails if the site answers as `Guest`, which is what Frappe returns when the keys are not recognised. **Test** strips the app path exactly like the node does, so a URL pasted from the browser is checked against the same site root the node will use.

> Leaving the app path in the URL used to be invisible rather than fatal: Frappe answers `/insights/api/method/...` with **HTTP 200 and the Insights HTML page**, so nothing errors out. Both the node and the credential test now strip it.

### Roles you need

Insights layers its own permissions on top of Frappe's:

- **`Insights User`** is the minimum. Every method the app whitelists is decorated `@insights_whitelist()`, which checks that role before anything else.
- **`Insights Admin`** is required to create or edit a **data source** — that is access to database credentials, not to a report.
- On top of roles, Insights filters per resource through `Insights Team`. A user only sees the workbooks shared with them or with one of their teams, so a `403` usually means sharing, not the credential.

### One credential for every Frappe node

`frappeApi` is deliberately **not** Insights-specific. Frappe authenticates a *user on a site*, not an application: the same API key works for Frappe Insights, Frappe CRM, Frappe Helpdesk and Frappe HR, which all live on the same site and share the same `/api` endpoint.

Create one credential per *site* (`Frappe – prod`, `Frappe – staging`), not per application. See [docs/CREDENTIALS.md](docs/CREDENTIALS.md) for the full architecture, the list of consuming nodes, and the Frappe roles each operation needs.

## Operations

| Resource    | Frappe doctype            | Operations                                                       |
| ----------- | ------------------------- | ---------------------------------------------------------------- |
| Workbook    | `Insights Workbook`       | Create, Get, Get Many, Update, Delete, **Duplicate**              |
| Query       | `Insights Query v3`       | Create, Get, Get Many, Update, Delete, **Execute**, **Get Count** |
| Chart       | `Insights Chart v3`       | Create, Get, Get Many, Update, Delete                             |
| Dashboard   | `Insights Dashboard v3`   | Create, Get, Get Many, Update, Delete                             |
| Data Source | `Insights Data Source v3` | Create, Get, Get Many, Update, Delete, **Test Connection**        |
| Table       | `Insights Table v3`       | Get, Get Many — read-only                                         |
| Alert       | `Insights Alert`          | Create, Get, Get Many, Update, Delete                             |
| Team        | `Insights Team`           | Create, Get, Get Many, Update, Delete                             |

CRUD goes through the standard Frappe REST API at `/api/resource/{doctype}`. The four operations in bold are **document methods** and go through `/api/method/frappe.handler.run_doc_method` — see [Executing a query](#executing-a-query).

Doctype names were verified against [github.com/frappe/insights](https://github.com/frappe/insights) (`insights/insights/doctype/`).

> **This node targets Insights 3 only.**
> The ` v3` suffix is part of the *doctype name*, not a version of this node. Insights 3 rewrote the data model and kept the v2 doctypes alongside the new ones for migration, so `Insights Query` and `Insights Query v3` are two different doctypes that can coexist on one site. On a site still running Insights 2 every request answers `404` — the honest failure, rather than silently reading stale doctypes.

> **Everything hangs off a workbook.**
> `Insights Query v3`, `Insights Chart v3` and `Insights Dashboard v3` all declare `workbook` as a required Link. Nothing can be created outside a workbook, so creating one is the first call of any Insights workflow.

### Executing a query

**Execute** is what makes this node worth wiring up: it runs the query's pipeline against the data source and returns the rows.

By default the node emits **one n8n item per result row**, so the next node in your workflow iterates over data, not over metadata. Turn **Split Rows Into Items** off to get a single item holding the whole envelope instead:

```json
{
	"sql": "SELECT `status`, COUNT(*) AS `total` FROM `tabTask` GROUP BY `status`",
	"columns": [
		{ "name": "status", "type": "String" },
		{ "name": "total", "type": "Integer" }
	],
	"rows": [{ "status": "Open", "total": 42 }],
	"time_taken": 0.031,
	"is_aggregated_sql": true
}
```

`Execute` options:

| Option                 | Maps to                | Notes                                                                       |
| ---------------------- | ---------------------- | --------------------------------------------------------------------------- |
| Page / Page Size       | `page`, `page_size`    | Insights paginates server-side; default is page 1, 100 rows                 |
| Force Refresh          | `force`                | Bypasses the result cache, which Insights keeps for ten minutes             |
| Adhoc Filters (JSON)   | `adhoc_filters`        | Rules applied to this run only, without modifying the saved query — see below |
| Active Operation Index | `active_operation_idx` | Stops the pipeline after the *n*-th step, to inspect an intermediate result |

**Get Count** returns the number of rows the query *would* return, without transferring them — the cheap way to branch on "is there anything to report?" before pulling data.

> **Why `read` permission is enough**
> Document methods can be reached two ways. `POST /api/resource/{doctype}/{name}` with `run_method` in the body is the obvious one, but Frappe calls `doc.check_permission("write")` on that route — running a query would demand *write* access to it, which is backwards for a BI tool. This node uses `POST /api/method/frappe.handler.run_doc_method` instead: it loads the document with `check_permission=True`, so **read** access is enough, and `args` is parsed as JSON so `page_size: 100` stays an integer instead of arriving as the string `"100"`.

### Get Many options

| Option             | Maps to                      | Notes                                                |
| ------------------ | ---------------------------- | ---------------------------------------------------- |
| Return All         | auto-paginates `limit_start` | Fetches 100 records per request until the last page  |
| Limit              | `limit_page_length`          | Used when Return All is off                          |
| Offset             | `limit_start`                | Ignored when Return All is on                        |
| Fields             | `fields`                     | Comma-separated or a JSON array. Defaults to `["*"]` |
| Filters (JSON)     | `filters`                    | Frappe filter syntax                                 |
| Or Filters (JSON)  | `or_filters`                 | Same syntax, combined with OR                        |
| Sort Field / Order | `order_by`                   | e.g. `modified desc`                                 |

Frappe returns only the `name` column when `fields` is not specified, so the node defaults to `["*"]` to give you the full document.

Filters accept both Frappe forms — an object for simple equality, or an array of triples for operators:

```json
{ "workbook": "12" }
```

```json
[
	["modified", ">=", "2026-01-01"],
	["title", "like", "%revenue%"]
]
```

### JSON fields

Several Insights fields are declared `JSON` on the doctype: `operations` (Query), `config` (Chart), `items` (Dashboard), `http_headers`, `api_custom_headers` and `bigquery_service_account_key` (Data Source).

The node sends them as **strings**, which is what the column holds. It parses them first as a check, so a typo becomes a node error naming the field rather than a document that saves fine and breaks the next time Insights reads it. If an expression hands the node an object, it is serialised for you.

### Read-only fields

Insights writes some fields itself, so the node does not offer them: `data_query` (Chart), `linked_charts` (Dashboard), `data_backup` and `imported_*` (Workbook), `is_site_db` / `is_frappe_db` (Data Source), `last_execution` (Alert), `last_synced_on` and `stored` (Table).

`Insights Table v3` is read-only as a whole: it is a *catalogue* Insights fills when it syncs a data source. Creating an entry by hand would describe a table that may not exist, and the next sync would overwrite it. Reading them is how a workflow discovers what a data source exposes.

Team membership (`team_members`) and per-resource grants (`team_permissions`) are child tables. **Get** returns them inline, but the node does not offer to write them — replacing a permission table wholesale from a workflow is how a team silently loses its access.

### Dates

Frappe stores **naive** datetimes, interpreted in the site's timezone (**Settings > System Settings > Time Zone**). The node converts values that carry a timezone — what the n8n date picker produces, such as `2026-08-15T09:00:00+02:00` or `...Z` — into the **n8n workflow timezone**, and passes values that already have no timezone through unchanged.

No field currently exercises this conversion: none of the writable Insights v3 fields is a date. `Insights Alert.next_execution` looked like one, but Insights recomputes it from **Frequency** on every save — an alert created with `next_execution` set comes back holding the recomputed value — so the node does not offer it. The conversion stays in place for the day a date field appears.

### Error handling

Frappe reports errors in a `_server_messages` field that contains JSON encoded *inside* JSON, often with HTML markup. The node unwraps it and surfaces the actual message — you get `Value missing for Insights Query v3: Workbook` rather than `Request failed with status code 417`. It falls back to the `exception` field, then to the HTTP status.

`401` and `403` responses carry an extra hint pointing at the Frappe role rather than the credential, because that is nearly always the cause.

## Usage

Each example below is a node you can paste into an n8n workflow. Replace the `credentials` block with your own credential.

### Workbook — create

```json
{
	"parameters": {
		"resource": "workbook",
		"operation": "create",
		"title": "Revenue reporting"
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Create Workbook",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

`Insights Workbook` uses `autoincrement` naming, so the `name` you get back is an integer such as `12`. That is the value every other resource expects in its **Workbook** field.

### Query — execute

The operation you will use most. One item per row comes out:

```json
{
	"parameters": {
		"resource": "query",
		"operation": "execute",
		"documentId": "abc123de45",
		"executeOptions": {
			"page": 1,
			"page_size": 500,
			"force": true
		}
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Run Query",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

The document ID is the query's `name`, visible in the workbook URL in Insights. **Force Refresh** skips the ten-minute result cache — leave it off for dashboards refreshed on a schedule, turn it on when the workflow must see the very latest rows.

### Query — execute with adhoc filters

Filter one run without touching the saved query:

```json
{
	"parameters": {
		"resource": "query",
		"operation": "execute",
		"documentId": "abc123de45",
		"executeOptions": {
			"adhoc_filters": "[{\"column\": {\"column_name\": \"status\"}, \"operator\": \"=\", \"value\": \"Open\"}]"
		},
		"splitRows": false
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Run Filtered Query",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

Each rule is `{"column": {"column_name": …}, "operator": …, "value": …}`, and the rules are combined with **And**. Under the hood Insights expects these filters keyed by query name; the node adds that key for you from **Document ID**. Passing the keyed form yourself — `{"<query name>": {"type": "filter_group", …}}` — still works, and is the way to filter a query *nested* inside the one being run.

> A filter Insights does not recognise is **silently ignored**: the query runs and returns every row. If a run comes back with more rows than expected, check the rule shape first.

With `splitRows` off you get a single item holding `rows`, `columns`, the generated `sql` and `time_taken` — useful when the workflow wants the column metadata, or wants to log the SQL Insights produced.

### Query — get count

```json
{
	"parameters": {
		"resource": "query",
		"operation": "getCount",
		"documentId": "abc123de45"
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Count Rows",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

Outputs `{ "name": "abc123de45", "count": 42 }`. Put an **If** node after it to skip the expensive branch when the count is zero.

### Query — create

```json
{
	"parameters": {
		"resource": "query",
		"operation": "create",
		"workbook": "12",
		"additionalFields": {
			"title": "Open tasks by status",
			"is_native_query": true,
			"operations": "[{\"type\":\"sql\",\"raw_sql\":\"SELECT status, COUNT(*) AS total FROM tabTask GROUP BY status\"}]"
		}
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Create Query",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

`operations` is the pipeline that defines what the query computes — a source table, then filters, joins and aggregations, or a single `sql` step for a native query. The easiest way to get a valid value is to build the query once in the Insights UI and read the field back with **Get**.

### Chart — create

```json
{
	"parameters": {
		"resource": "chart",
		"operation": "create",
		"workbook": "12",
		"additionalFields": {
			"title": "Tasks by status",
			"query": "abc123de45",
			"chart_type": "Bar",
			"config": "{\"x_axis\":{\"column_name\":\"status\"},\"y_axis\":{\"series\":[{\"measure\":\"total\"}]}}"
		}
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Create Chart",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

A chart holds no data of its own — it is a rendering of the query in its `query` field. To read the numbers behind a chart, execute that query.

### Data Source — create and test

```json
{
	"parameters": {
		"resource": "dataSource",
		"operation": "create",
		"title": "Sales Prod",
		"type": "Database",
		"additionalFields": {
			"database_type": "PostgreSQL",
			"host": "db.acme.io",
			"port": 5432,
			"database_name": "sales",
			"username": "insights_ro",
			"password": "s3cr3t",
			"use_ssl": true
		}
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Create Data Source",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

Frappe derives the document `name` from the title with `scrub()`, so "Sales Prod" becomes `sales_prod` — that is the ID to use afterwards. Requires the `Insights Admin` role.

Mandatory fields depend on the branch the doctype validates: `REST API` needs `api_base_url`; `SQLite` and `DuckDB` need `database_name` (a file path on the Frappe server); `BigQuery` needs the project, dataset and service account key; any other database needs host, port, username, password and database name — unless you supply a `connection_string`, which short-circuits the check.

**Test Connection** then tells you whether it actually opens:

```json
{
	"parameters": {
		"resource": "dataSource",
		"operation": "testConnection",
		"documentId": "sales_prod"
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Test Data Source",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

Outputs `{ "name": "sales_prod", "success": true }`. Insights swallows the driver exception and reports failure as an empty response, so anything other than an explicit success is reported as `false` rather than raised as an error.

### Alert — create

```json
{
	"parameters": {
		"resource": "alert",
		"operation": "create",
		"title": "Open incidents above threshold",
		"query": "abc123de45",
		"condition": "len(results) > 10",
		"additionalFields": {
			"frequency": "Hourly",
			"channel": "Email",
			"recipients": "ops@acme.io",
			"message": "**Too many open incidents** — see the dashboard."
		}
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Create Alert",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

`condition` is a Python expression evaluated against the query result; the alert fires when it is true. Deleting the query deletes its alerts — `Insights Query v3.on_trash` removes them explicitly.

### Table — discover what a data source exposes

```json
{
	"parameters": {
		"resource": "table",
		"operation": "getAll",
		"returnAll": true,
		"options": {
			"fields": "name,table,label,data_source,last_synced_on,row_limit",
			"filters": "{\"data_source\": \"sales_prod\"}",
			"sortField": "label",
			"sortOrder": "asc"
		}
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "List Tables",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

`last_synced_on` tells you whether the catalogue is fresh. The sync itself is triggered from the Insights UI.

### Workbook — duplicate

```json
{
	"parameters": {
		"resource": "workbook",
		"operation": "duplicate",
		"documentId": "12"
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Duplicate Workbook",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

Copies the workbook with its queries, charts and dashboards — Insights exports it and re-imports it under a new name. Handy for templating a monthly report.

Insights answers with the new workbook's **name** only, which is a number since `Insights Workbook` is auto-incremented. The node re-reads it and returns the full document, so the output has the same shape as Create.

### Delete

Any writable resource, given its document ID:

```json
{
	"parameters": {
		"resource": "chart",
		"operation": "delete",
		"documentId": "abc123de45"
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Delete Chart",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

The node outputs `{ "success": true, "doctype": "Insights Chart v3", "name": "abc123de45" }`. Frappe refuses to delete a document another record links to — delete the chart before the query it reads, and the dashboard before the chart.

## Compatibility

Validated end-to-end against a live site running **Frappe Framework 16.29.0**, Insights 3.3.1 and MariaDB, under **n8n 2.32.7** — every operation below was executed against it, not only compiled, and the package was loaded by that n8n's own loader. It was previously validated the same way on Frappe Framework 15.116.1. The node uses the standard `/api/resource` REST endpoints plus `/api/method/frappe.handler.run_doc_method`, both of which are Frappe Framework features present on the `version-15`, `version-16` and `develop` branches.

Frappe 16 rewrote `db_query` on top of pypika, which changed how `order_by` is accepted. The node builds the one form both versions parse, so **Sort Field** works unchanged on 15 and 16.

**Insights 3 is required.** The doctype names carry a ` v3` suffix that does not exist on an Insights 2 site.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Frappe REST API documentation](https://docs.frappe.io/framework/user/en/api/rest)
- [Frappe Insights documentation](https://docs.frappe.io/insights)
- [Frappe Insights source](https://github.com/frappe/insights)
- [Shared credential architecture](docs/CREDENTIALS.md)

## Version history

### 0.1.0

Initial release. Frappe Insights node with the Workbook, Query, Chart, Dashboard, Data Source, Table, Alert and Team resources, the Execute / Get Count / Duplicate / Test Connection document methods, and the shared `frappeApi` credential.

## Development

```bash
npm install
npm run build     # compiles to dist/ and copies icons
npm run dev       # development loop against a local n8n
npm run lint      # same command the CI runs
npm run lint:fix
```

There is no test runner in this repository. Verify changes with `npm run build` followed by a real load in n8n.

See [AGENTS.md](AGENTS.md) for the full contributor guide.
