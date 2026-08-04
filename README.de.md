# n8n-nodes-frappe-insights

Dies ist ein n8n-Community-Node-Paket für [Frappe Insights](https://frappe.io/insights) (die App `insights`). Es erlaubt, **Insights-Abfragen auszuführen und deren Zeilen zurückzuerhalten**, sowie Arbeitsmappen, Diagramme, Dashboards, Datenquellen, Benachrichtigungen und Teams aus n8n-Workflows heraus zu verwalten.

[n8n](https://n8n.io/) ist eine Workflow-Automatisierungsplattform unter [fair-code-Lizenz](https://docs.n8n.io/reference/license/).

Weitere Sprachen: [English](README.md) · [Français](README.fr.md) · [Español](README.es.md)

[Installation](#installation)
[Zugangsdaten](#zugangsdaten)
[Operationen](#operationen)
[Verwendung](#verwendung)
[Kompatibilität](#kompatibilität)
[Ressourcen](#ressourcen)
[Versionsverlauf](#versionsverlauf)
[Entwicklung](#entwicklung)

## Installation

Folge der [Installationsanleitung](https://docs.n8n.io/integrations/community-nodes/installation/) in der n8n-Dokumentation zu Community-Nodes und verwende `n8n-nodes-frappe-insights` als Paketnamen.

**Self-hosted, über die n8n-Oberfläche** — gehe zu **Settings > Community nodes > Install**, gib `n8n-nodes-frappe-insights` ein und bestätige.

**Self-hosted, manuell:**

```bash
cd ~/.n8n/custom
npm install n8n-nodes-frappe-insights
```

Starte n8n neu und suche im Node-Panel nach „Frappe Insights".

## Zugangsdaten

Dieses Paket verwendet einen einzigen Zugangsdatentyp, **Frappe API** (`frappeApi`) — denselben wie die Nodes für Frappe CRM, Frappe Helpdesk und Frappe HRMS. Ist er bereits eingerichtet, kann der Frappe-Insights-Node ihn direkt auswählen.

### API-Schlüssel in Frappe erzeugen

1. Öffne auf deiner Frappe-Site den Benutzer, in dessen Namen n8n handeln soll (`/app/user`).
2. Scrolle zu **Settings > API Access** und klicke auf **Generate Keys**.
3. Kopiere das **API Secret** — es wird nur einmal angezeigt — und den **API Key** auf dem Benutzerdokument.

Der Node handelt als dieser Benutzer und erbt dessen Rollen und Berechtigungen. Schlägt ein Aufruf mit einem Berechtigungsfehler fehl, prüfe zuerst die Rollen, nicht die Zugangsdaten.

### Zugangsdaten ausfüllen

| Feld       | Beispiel                        | Hinweise                                                            |
| ---------- | ------------------------------- | ------------------------------------------------------------------- |
| Site URL   | `https://meine-site.frappe.cloud` | Site-Wurzel. Ein abschließendes `/insights` oder `/` wird entfernt |
| API Key    | `a1b2c3d4e5f6g7h`               |                                                                     |
| API Secret | `s1e2c3r4e5t6`                  | Wird von n8n verschlüsselt gespeichert                              |

Anfragen werden über den Header `Authorization: token {apiKey}:{apiSecret}` authentifiziert. Mit **Test** prüfst du die Verbindung: der Aufruf geht an `/api/method/frappe.auth.get_logged_user` und schlägt fehl, wenn die Site als `Guest` antwortet — genau das liefert Frappe, wenn die Schlüssel nicht erkannt werden. **Test** entfernt den App-Pfad genauso wie der Node, eine aus dem Browser kopierte URL wird also gegen dieselbe Site-Wurzel geprüft, die der Node verwendet.

> Den App-Pfad in der URL stehen zu lassen war kein klarer, sondern ein unsichtbarer Fehler: Frappe beantwortet `/insights/api/method/...` mit **HTTP 200 und der HTML-Seite von Insights**. Node und Credential-Test entfernen ihn nun beide.

### Benötigte Rollen

Insights legt eigene Berechtigungen über die von Frappe:

- **`Insights User`** ist das Minimum. Jede von der App freigegebene Methode trägt den Dekorator `@insights_whitelist()`, der diese Rolle zuerst prüft.
- **`Insights Admin`** wird zum Anlegen oder Ändern einer **Datenquelle** benötigt — das ist Zugriff auf Datenbank-Zugangsdaten, nicht auf einen Bericht.
- Zusätzlich zu den Rollen filtert Insights pro Ressource über `Insights Team`. Ein Benutzer sieht nur die Arbeitsmappen, die mit ihm oder einem seiner Teams geteilt wurden — ein `403` kommt daher meist von der Freigabe, nicht von den Zugangsdaten.

### Ein Zugangsdatensatz für alle Frappe-Nodes

`frappeApi` ist bewusst **nicht** Insights-spezifisch. Frappe authentifiziert einen *Benutzer auf einer Site*, nicht eine Anwendung: derselbe API-Schlüssel funktioniert für Frappe Insights, Frappe CRM, Frappe Helpdesk und Frappe HR, die alle auf derselben Site liegen und denselben `/api`-Endpunkt teilen.

Lege einen Zugangsdatensatz pro *Site* an („Frappe – prod", „Frappe – Test"), nicht pro Anwendung. Siehe [docs/CREDENTIALS.md](docs/CREDENTIALS.md) für die vollständige Architektur, die Liste der nutzenden Nodes und die Frappe-Rollen, die jede Operation braucht.

## Operationen

| Ressource   | Frappe-Doctype            | Operationen                                                      |
| ----------- | ------------------------- | ---------------------------------------------------------------- |
| Workbook    | `Insights Workbook`       | Create, Get, Get Many, Update, Delete, **Duplicate**              |
| Query       | `Insights Query v3`       | Create, Get, Get Many, Update, Delete, **Execute**, **Get Count** |
| Chart       | `Insights Chart v3`       | Create, Get, Get Many, Update, Delete                             |
| Dashboard   | `Insights Dashboard v3`   | Create, Get, Get Many, Update, Delete                             |
| Data Source | `Insights Data Source v3` | Create, Get, Get Many, Update, Delete, **Test Connection**        |
| Table       | `Insights Table v3`       | Get, Get Many — nur lesend                                        |
| Alert       | `Insights Alert`          | Create, Get, Get Many, Update, Delete                             |
| Team        | `Insights Team`           | Create, Get, Get Many, Update, Delete                             |

CRUD läuft über die Standard-REST-API von Frappe unter `/api/resource/{doctype}`. Die vier fett gesetzten Operationen sind **Dokumentmethoden** und laufen über `/api/method/frappe.handler.run_doc_method` — siehe [Eine Abfrage ausführen](#eine-abfrage-ausführen).

Die Doctype-Namen wurden gegen [github.com/frappe/insights](https://github.com/frappe/insights) geprüft (`insights/insights/doctype/`).

> **Dieser Node zielt ausschließlich auf Insights 3.**
> Das Suffix ` v3` gehört zum *Doctype-Namen*, es ist keine Version dieses Nodes. Insights 3 hat das Datenmodell neu geschrieben und behält die v2-Doctypes für die Migration daneben: `Insights Query` und `Insights Query v3` sind zwei verschiedene Doctypes, die auf einer Site koexistieren können. Auf einer Site mit Insights 2 antwortet jede Anfrage mit `404` — das ehrliche Scheitern, statt still veraltete Doctypes zu lesen.

> **Alles hängt an einer Arbeitsmappe.**
> `Insights Query v3`, `Insights Chart v3` und `Insights Dashboard v3` deklarieren `workbook` als Pflicht-Link. Außerhalb einer Arbeitsmappe lässt sich nichts anlegen — eine anzulegen ist daher der erste Aufruf jedes Insights-Workflows.

### Eine Abfrage ausführen

**Execute** ist der eigentliche Grund für diesen Node: die Operation führt die Pipeline der Abfrage gegen die Datenquelle aus und liefert die Zeilen zurück.

Standardmäßig gibt der Node **ein n8n-Item pro Ergebniszeile** aus, damit der nächste Node über Daten iteriert und nicht über Metadaten. Schalte **Split Rows Into Items** ab, um stattdessen ein einzelnes Item mit der vollständigen Hülle zu erhalten:

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

Optionen von `Execute`:

| Option                 | Entspricht             | Hinweise                                                                  |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------- |
| Page / Page Size       | `page`, `page_size`    | Insights paginiert serverseitig; Standard ist Seite 1, 100 Zeilen         |
| Force Refresh          | `force`                | Umgeht den Ergebnis-Cache, den Insights zehn Minuten hält                 |
| Adhoc Filters (JSON)   | `adhoc_filters`        | Regeln, die nur für diesen Lauf gelten, ohne die gespeicherte Abfrage zu ändern — siehe unten |
| Active Operation Index | `active_operation_idx` | Stoppt die Pipeline nach dem *n*-ten Schritt, um ein Zwischenergebnis zu prüfen |

**Get Count** liefert die Anzahl der Zeilen, die die Abfrage liefern *würde*, ohne sie zu übertragen — der günstige Weg, vor dem Datenabruf auf „gibt es überhaupt etwas zu melden?" zu verzweigen.

> **Warum die `read`-Berechtigung genügt**
> Eine Dokumentmethode lässt sich auf zwei Wegen erreichen. `POST /api/resource/{doctype}/{name}` mit `run_method` im Body ist der naheliegende, aber Frappe ruft dort `doc.check_permission("write")` auf — eine Abfrage auszuführen würde also *Schreib*zugriff verlangen, was für ein BI-Werkzeug verkehrt herum ist. Dieser Node nutzt daher `POST /api/method/frappe.handler.run_doc_method`: dort wird das Dokument mit `check_permission=True` geladen, **read** genügt also, und `args` wird als JSON geparst, sodass `page_size: 100` eine Ganzzahl bleibt und nicht als Zeichenkette `"100"` ankommt.

### Optionen von „Get Many"

| Option             | Entspricht                      | Hinweise                                                     |
| ------------------ | ------------------------------- | ------------------------------------------------------------ |
| Return All         | paginiert `limit_start` automatisch | Holt 100 Datensätze pro Anfrage bis zur letzten Seite      |
| Limit              | `limit_page_length`             | Wird verwendet, wenn Return All aus ist                      |
| Offset             | `limit_start`                   | Wird ignoriert, wenn Return All an ist                       |
| Fields             | `fields`                        | Kommagetrennt oder als JSON-Array. Standard `["*"]`          |
| Filters (JSON)     | `filters`                       | Frappe-Filtersyntax                                          |
| Or Filters (JSON)  | `or_filters`                    | Gleiche Syntax, mit ODER verknüpft                           |
| Sort Field / Order | `order_by`                      | z. B. `modified desc`                                        |

Frappe liefert nur die Spalte `name`, wenn `fields` nicht angegeben ist — der Node setzt daher standardmäßig `["*"]`, um das vollständige Dokument zurückzugeben.

Filter akzeptieren beide Frappe-Formen — ein Objekt für einfache Gleichheit oder ein Array aus Tripeln für Operatoren:

```json
{ "workbook": "12" }
```

```json
[
	["modified", ">=", "2026-01-01"],
	["title", "like", "%Umsatz%"]
]
```

### JSON-Felder

Mehrere Insights-Felder sind im Doctype als `JSON` deklariert: `operations` (Query), `config` (Chart), `items` (Dashboard), `http_headers`, `api_custom_headers` und `bigquery_service_account_key` (Data Source).

Der Node sendet sie als **Zeichenketten** — das ist, was die Spalte ohnehin enthält. Er parst sie vorher zur Kontrolle: ein Tippfehler wird so zu einem Node-Fehler, der das Feld benennt, statt zu einem Dokument, das problemlos speichert und beim nächsten Lesen durch Insights bricht. Liefert ein Ausdruck ein Objekt, wird es für dich serialisiert.

### Nur lesbare Felder

Einige Felder schreibt Insights selbst, der Node bietet sie daher nicht an: `data_query` (Chart), `linked_charts` (Dashboard), `data_backup` und `imported_*` (Workbook), `is_site_db` / `is_frappe_db` (Data Source), `last_execution` (Alert), `last_synced_on` und `stored` (Table).

`Insights Table v3` ist als Ganzes nur lesbar: es ist ein *Katalog*, den Insights beim Synchronisieren einer Datenquelle füllt. Einen Eintrag von Hand anzulegen würde eine Tabelle beschreiben, die es womöglich nicht gibt, und die nächste Synchronisation würde ihn überschreiben. Sie zu lesen ist dagegen der Weg, auf dem ein Workflow erfährt, was eine Datenquelle anbietet.

Teamzugehörigkeit (`team_members`) und Berechtigungen pro Ressource (`team_permissions`) sind Kindtabellen. **Get** liefert sie mit, der Node bietet aber nicht an, sie zu schreiben — eine Berechtigungstabelle aus einem Workflow heraus komplett zu ersetzen ist der Weg, auf dem ein Team still seine Zugriffe verliert.

### Datumsangaben

Frappe speichert **naive** Zeitstempel, interpretiert in der Zeitzone der Site (**Settings > System Settings > Time Zone**). Der Node wandelt Werte mit Zeitzone — was der n8n-Datumswähler erzeugt, etwa `2026-08-15T09:00:00+02:00` oder `...Z` — in die **Zeitzone des n8n-Workflows** um und lässt bereits naive Werte unverändert durch.

Derzeit nutzt kein Feld diese Umrechnung: Keines der beschreibbaren Insights-v3-Felder ist ein Datum. `Insights Alert.next_execution` sah danach aus, doch Insights berechnet es bei jedem Speichern aus **Frequency** neu — eine mit `next_execution` angelegte Benachrichtigung kommt mit dem neu berechneten Wert zurück — deshalb bietet die Node es nicht an. Die Umrechnung bleibt bestehen für den Tag, an dem ein Datumsfeld auftaucht.

### Fehlerbehandlung

Frappe meldet Fehler in einem Feld `_server_messages`, das JSON *innerhalb* von JSON enthält, oft mit HTML-Markup. Der Node packt das aus und zeigt die eigentliche Meldung: du bekommst `Value missing for Insights Query v3: Workbook` statt `Request failed with status code 417`. Ersatzweise greift er auf das Feld `exception` zurück, dann auf den HTTP-Status.

`401`- und `403`-Antworten tragen einen zusätzlichen Hinweis auf die Frappe-Rolle statt auf die Zugangsdaten, weil das fast immer die Ursache ist.

## Verwendung

Jedes Beispiel unten ist ein Node, den du in einen n8n-Workflow einfügen kannst. Ersetze den `credentials`-Block durch deinen eigenen.

### Workbook — anlegen

```json
{
	"parameters": {
		"resource": "workbook",
		"operation": "create",
		"title": "Umsatzreporting"
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Create Workbook",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

`Insights Workbook` verwendet `autoincrement`-Benennung, der zurückgegebene `name` ist also eine Ganzzahl wie `12`. Genau diesen Wert erwarten alle anderen Ressourcen in ihrem Feld **Workbook**.

### Query — ausführen

Die Operation, die du am häufigsten nutzen wirst. Sie gibt ein Item pro Zeile aus:

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

Die Document ID ist der `name` der Abfrage, sichtbar in der URL der Arbeitsmappe in Insights. **Force Refresh** überspringt den Zehn-Minuten-Cache: lass es aus für Dashboards, die planmäßig aktualisiert werden, und schalte es ein, wenn der Workflow die allerneuesten Zeilen sehen muss.

### Query — mit Ad-hoc-Filtern ausführen

Einen Lauf filtern, ohne die gespeicherte Abfrage anzufassen:

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

Jede Regel lautet `{"column": {"column_name": …}, "operator": …, "value": …}`, und die Regeln werden mit **Und** verknüpft. Intern erwartet Insights diese Filter nach Abfragenamen indiziert; die Node ergänzt diesen Schlüssel für dich aus **Document ID**. Die indizierte Form wird weiterhin unverändert akzeptiert — `{"<Name der Abfrage>": {"type": "filter_group", …}}` — und so filtert man eine *verschachtelte* Abfrage innerhalb der ausgeführten.

> Ein Filter, den Insights nicht erkennt, wird **stillschweigend ignoriert**: Die Abfrage läuft und liefert alle Zeilen. Kommen mehr Zeilen zurück als erwartet, prüfe zuerst die Form der Regeln.

Mit abgeschaltetem `splitRows` erhältst du ein einzelnes Item mit `rows`, `columns`, dem erzeugten `sql` und `time_taken` — nützlich, wenn der Workflow die Spaltenmetadaten braucht oder das von Insights erzeugte SQL protokollieren soll.

### Query — Zeilen zählen

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

Ergibt `{ "name": "abc123de45", "count": 42 }`. Setze einen **If**-Node dahinter, um den teuren Zweig zu überspringen, wenn die Zahl null ist.

### Query — anlegen

```json
{
	"parameters": {
		"resource": "query",
		"operation": "create",
		"workbook": "12",
		"additionalFields": {
			"title": "Offene Aufgaben nach Status",
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

`operations` ist die Pipeline, die festlegt, was die Abfrage berechnet — eine Quelltabelle, dann Filter, Joins und Aggregationen, oder ein einzelner `sql`-Schritt für eine native Abfrage. Am einfachsten kommst du an einen gültigen Wert, indem du die Abfrage einmal in der Insights-Oberfläche baust und das Feld mit **Get** zurückliest.

### Chart — anlegen

```json
{
	"parameters": {
		"resource": "chart",
		"operation": "create",
		"workbook": "12",
		"additionalFields": {
			"title": "Aufgaben nach Status",
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

Ein Diagramm enthält keine eigenen Daten — es ist eine Darstellung der Abfrage, auf die sein Feld `query` zeigt. Um die Zahlen hinter einem Diagramm zu lesen, führe diese Abfrage aus.

### Data Source — anlegen und testen

```json
{
	"parameters": {
		"resource": "dataSource",
		"operation": "create",
		"title": "Vertrieb Prod",
		"type": "Database",
		"additionalFields": {
			"database_type": "PostgreSQL",
			"host": "db.acme.io",
			"port": 5432,
			"database_name": "vertrieb",
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

Frappe leitet den `name` des Dokuments mit `scrub()` aus dem Titel ab, aus „Vertrieb Prod" wird also `vertrieb_prod` — das ist die ID, die du danach verwendest. Erfordert die Rolle `Insights Admin`.

Welche Felder Pflicht sind, hängt vom Zweig ab, den der Doctype validiert: `REST API` braucht `api_base_url`; `SQLite` und `DuckDB` brauchen `database_name` (einen Dateipfad auf dem Frappe-Server); `BigQuery` braucht Projekt, Dataset und Service-Account-Schlüssel; jede andere Datenbank braucht Host, Port, Benutzer, Passwort und Datenbanknamen — außer du gibst einen `connection_string` an, der die Prüfung überspringt.

**Test Connection** sagt dir dann, ob sie tatsächlich zustande kommt:

```json
{
	"parameters": {
		"resource": "dataSource",
		"operation": "testConnection",
		"documentId": "vertrieb_prod"
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Test Data Source",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

Ergibt `{ "name": "vertrieb_prod", "success": true }`. Insights verschluckt die Treiber-Ausnahme und meldet den Fehlschlag als leere Antwort — alles außer einem ausdrücklichen Erfolg wird daher als `false` gemeldet und nicht als Fehler geworfen.

### Alert — anlegen

```json
{
	"parameters": {
		"resource": "alert",
		"operation": "create",
		"title": "Offene Vorfälle über Schwellwert",
		"query": "abc123de45",
		"condition": "len(results) > 10",
		"additionalFields": {
			"frequency": "Hourly",
			"channel": "Email",
			"recipients": "ops@acme.io",
			"message": "**Zu viele offene Vorfälle** — siehe Dashboard."
		}
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Create Alert",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

`condition` ist ein Python-Ausdruck, der auf das Abfrageergebnis angewendet wird; die Benachrichtigung geht raus, wenn er wahr ist. Die Abfrage zu löschen löscht ihre Benachrichtigungen — `Insights Query v3.on_trash` erledigt das ausdrücklich.

### Table — herausfinden, was eine Datenquelle anbietet

```json
{
	"parameters": {
		"resource": "table",
		"operation": "getAll",
		"returnAll": true,
		"options": {
			"fields": "name,table,label,data_source,last_synced_on,row_limit",
			"filters": "{\"data_source\": \"vertrieb_prod\"}",
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

`last_synced_on` sagt dir, ob der Katalog aktuell ist. Die Synchronisation selbst wird aus der Insights-Oberfläche angestoßen.

### Workbook — duplizieren

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

Kopiert die Arbeitsmappe samt Abfragen, Diagrammen und Dashboards — Insights exportiert sie und importiert sie unter neuem Namen wieder. Praktisch als Vorlage für ein monatliches Reporting.

Insights antwortet nur mit dem **Namen** der neuen Arbeitsmappe, einer Zahl, da `Insights Workbook` automatisch hochgezählt wird. Die Node liest ihn nach und gibt das vollständige Dokument zurück, damit die Ausgabe dieselbe Form hat wie bei Create.

### Löschen

Jede beschreibbare Ressource, anhand ihrer Document ID:

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

Der Node gibt `{ "success": true, "doctype": "Insights Chart v3", "name": "abc123de45" }` aus. Frappe weigert sich, ein Dokument zu löschen, auf das ein anderer Datensatz verweist: lösche das Diagramm vor der Abfrage, die es liest, und das Dashboard vor dem Diagramm.

## Kompatibilität

Ende-zu-Ende gegen eine echte Site mit **Frappe Framework 16.29.0**, Insights 3.3.1 und MariaDB unter **n8n 2.32.7** validiert — jede hier beschriebene Operation wurde dort ausgeführt, nicht nur kompiliert, und das Paket wurde vom Loader eben dieses n8n geladen. Zuvor wurde es genauso auf Frappe Framework 15.116.1 validiert. Der Node nutzt nur die Standard-REST-Endpunkte `/api/resource` sowie `/api/method/frappe.handler.run_doc_method` — beides Funktionen des Frappe Framework, die auf den Branches `version-15`, `version-16` und `develop` vorhanden sind.

Frappe 16 hat `db_query` auf pypika umgestellt, wodurch sich die akzeptierte `order_by`-Form ändert. Der Node erzeugt die eine Form, die beide Versionen parsen: **Sort Field** verhält sich unter 15 und 16 gleich.

**Insights 3 ist erforderlich.** Die Doctype-Namen tragen ein Suffix ` v3`, das es auf einer Insights-2-Site nicht gibt.

## Ressourcen

- [Dokumentation zu n8n-Community-Nodes](https://docs.n8n.io/integrations/#community-nodes)
- [Dokumentation der Frappe-REST-API](https://docs.frappe.io/framework/user/en/api/rest)
- [Frappe-Insights-Dokumentation](https://docs.frappe.io/insights)
- [Quellcode von Frappe Insights](https://github.com/frappe/insights)
- [Architektur der gemeinsamen Zugangsdaten](docs/CREDENTIALS.md)

## Versionsverlauf

### 0.1.0

Erste Veröffentlichung. Frappe-Insights-Node mit den Ressourcen Workbook, Query, Chart, Dashboard, Data Source, Table, Alert und Team, den Dokumentmethoden Execute / Get Count / Duplicate / Test Connection und den gemeinsamen `frappeApi`-Zugangsdaten.

## Entwicklung

```bash
npm install
npm run build     # kompiliert nach dist/ und kopiert die Icons
npm run dev       # Entwicklungsschleife gegen ein lokales n8n
npm run lint      # derselbe Befehl, den die CI ausführt
npm run lint:fix
```

In diesem Repository gibt es keinen Test-Runner. Prüfe Änderungen mit `npm run build` und anschließendem echten Laden in n8n.

Siehe [AGENTS.md](AGENTS.md) für den vollständigen Beitragsleitfaden.
