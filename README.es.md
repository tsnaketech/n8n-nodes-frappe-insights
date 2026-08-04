# n8n-nodes-frappe-insights

Paquete de nodos comunitarios de n8n para [Frappe Insights](https://frappe.io/insights) (la app `insights`). Permite **ejecutar consultas de Insights y recuperar sus filas**, y gestionar libros de trabajo, gráficos, paneles, fuentes de datos, alertas y equipos desde tus flujos de n8n.

[n8n](https://n8n.io/) es una plataforma de automatización de flujos de trabajo con [licencia fair-code](https://docs.n8n.io/reference/license/).

Otros idiomas: [English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

[Instalación](#instalación)
[Credenciales](#credenciales)
[Operaciones](#operaciones)
[Uso](#uso)
[Compatibilidad](#compatibilidad)
[Recursos](#recursos)
[Historial de versiones](#historial-de-versiones)
[Desarrollo](#desarrollo)

## Instalación

Sigue la [guía de instalación](https://docs.n8n.io/integrations/community-nodes/installation/) de la documentación de nodos comunitarios de n8n, usando `n8n-nodes-frappe-insights` como nombre del paquete.

**Autoalojado, desde la interfaz de n8n** — ve a **Settings > Community nodes > Install**, introduce `n8n-nodes-frappe-insights` y confirma.

**Autoalojado, manualmente:**

```bash
cd ~/.n8n/custom
npm install n8n-nodes-frappe-insights
```

Reinicia n8n y busca «Frappe Insights» en el panel de nodos.

## Credenciales

Este paquete usa un único tipo de credencial, **Frappe API** (`frappeApi`) — el *mismo* que los nodos de Frappe CRM, Frappe Helpdesk y Frappe HRMS. Si ya la tienes configurada, el nodo Frappe Insights puede seleccionarla directamente.

### Generar las claves de API en Frappe

1. En tu sitio Frappe, abre el usuario en cuyo nombre debe actuar n8n (`/app/user`).
2. Baja hasta **Settings > API Access** y pulsa **Generate Keys**.
3. Copia el **API Secret** — solo se muestra una vez — y la **API Key** visible en la ficha del usuario.

El nodo actúa como ese usuario, así que hereda sus roles y permisos. Si una llamada falla por permisos, revisa los roles antes que la credencial.

### Rellenar la credencial

| Campo      | Ejemplo                        | Notas                                                              |
| ---------- | ------------------------------ | ------------------------------------------------------------------ |
| Site URL   | `https://mi-sitio.frappe.cloud` | Raíz del sitio. Un `/insights` o `/` final se elimina automáticamente |
| API Key    | `a1b2c3d4e5f6g7h`              |                                                                    |
| API Secret | `s1e2c3r4e5t6`                 | n8n lo almacena cifrado                                            |

Las peticiones se autentican con la cabecera `Authorization: token {apiKey}:{apiSecret}`. Usa **Test** para validar la conexión: llama a `/api/method/frappe.auth.get_logged_user` y falla si el sitio responde como `Guest`, que es lo que devuelve Frappe cuando no reconoce las claves. **Test** elimina la ruta de la aplicación igual que el nodo, así que una URL pegada desde el navegador se comprueba contra la misma raíz que usará el nodo.

> Dejar la ruta de la aplicación en la URL no fallaba de forma clara, sino invisible: Frappe responde a `/insights/api/method/...` con **HTTP 200 y la página HTML de Insights**. Tanto el nodo como la prueba de la credencial la eliminan ahora.

### Roles necesarios

Insights añade sus propios permisos por encima de los de Frappe:

- **`Insights User`** es el mínimo. Cada método que expone la app lleva el decorador `@insights_whitelist()`, que comprueba ese rol antes que nada.
- **`Insights Admin`** es necesario para crear o editar una **fuente de datos**: eso es acceso a credenciales de base de datos, no a un informe.
- Además de los roles, Insights filtra por recurso mediante `Insights Team`. Un usuario solo ve los libros compartidos con él o con alguno de sus equipos, así que un `403` suele venir del reparto, no de la credencial.

### Una sola credencial para todos los nodos Frappe

`frappeApi` deliberadamente **no** es específica de Insights. Frappe autentica a un *usuario en un sitio*, no a una aplicación: la misma clave sirve para Frappe Insights, Frappe CRM, Frappe Helpdesk y Frappe HR, que viven en el mismo sitio y comparten el endpoint `/api`.

Crea una credencial por *sitio* («Frappe – prod», «Frappe – pruebas»), no por aplicación. Consulta [docs/CREDENTIALS.md](docs/CREDENTIALS.md) para la arquitectura completa, la lista de nodos consumidores y los roles de Frappe que necesita cada operación.

## Operaciones

| Recurso     | Doctype de Frappe         | Operaciones                                                      |
| ----------- | ------------------------- | ---------------------------------------------------------------- |
| Workbook    | `Insights Workbook`       | Create, Get, Get Many, Update, Delete, **Duplicate**              |
| Query       | `Insights Query v3`       | Create, Get, Get Many, Update, Delete, **Execute**, **Get Count** |
| Chart       | `Insights Chart v3`       | Create, Get, Get Many, Update, Delete                             |
| Dashboard   | `Insights Dashboard v3`   | Create, Get, Get Many, Update, Delete                             |
| Data Source | `Insights Data Source v3` | Create, Get, Get Many, Update, Delete, **Test Connection**        |
| Table       | `Insights Table v3`       | Get, Get Many — solo lectura                                      |
| Alert       | `Insights Alert`          | Create, Get, Get Many, Update, Delete                             |
| Team        | `Insights Team`           | Create, Get, Get Many, Update, Delete                             |

El CRUD pasa por la API REST estándar de Frappe, `/api/resource/{doctype}`. Las cuatro operaciones en negrita son **métodos de documento** y pasan por `/api/method/frappe.handler.run_doc_method` — ver [Ejecutar una consulta](#ejecutar-una-consulta).

Los nombres de doctype se verificaron contra [github.com/frappe/insights](https://github.com/frappe/insights) (`insights/insights/doctype/`).

> **Este nodo solo funciona con Insights 3.**
> El sufijo ` v3` forma parte del *nombre del doctype*, no es una versión del nodo. Insights 3 reescribió su modelo de datos y mantiene los doctypes v2 junto a los nuevos para la migración: `Insights Query` e `Insights Query v3` son dos doctypes distintos que pueden coexistir en un mismo sitio. En un sitio que aún use Insights 2, cada petición responde `404` — el fallo honesto, en lugar de leer en silencio doctypes obsoletos.

> **Todo cuelga de un libro de trabajo.**
> `Insights Query v3`, `Insights Chart v3` e `Insights Dashboard v3` declaran `workbook` como Link obligatorio. Nada se crea fuera de un libro, así que crear uno es la primera llamada de cualquier flujo con Insights.

### Ejecutar una consulta

**Execute** es lo que justifica este nodo: ejecuta el pipeline de la consulta contra la fuente de datos y devuelve las filas.

Por defecto el nodo emite **un ítem de n8n por fila de resultado**, para que el nodo siguiente itere sobre datos y no sobre metadatos. Desactiva **Split Rows Into Items** para obtener un único ítem con el sobre completo:

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

Opciones de `Execute`:

| Opción                 | Corresponde a          | Notas                                                                  |
| ---------------------- | ---------------------- | ---------------------------------------------------------------------- |
| Page / Page Size       | `page`, `page_size`    | Insights pagina en el servidor; por defecto página 1, 100 filas        |
| Force Refresh          | `force`                | Ignora la caché de resultados, que Insights guarda diez minutos        |
| Adhoc Filters (JSON)   | `adhoc_filters`        | Reglas aplicadas solo a esta ejecución, sin modificar la consulta guardada — ver abajo |
| Active Operation Index | `active_operation_idx` | Detiene el pipeline tras el paso *n*, para inspeccionar un resultado intermedio |

**Get Count** devuelve cuántas filas *devolvería* la consulta, sin transferirlas — la forma barata de decidir «¿hay algo que informar?» antes de traer los datos.

> **Por qué basta con permiso de `read`**
> A un método de documento se llega de dos maneras. `POST /api/resource/{doctype}/{name}` con `run_method` en el cuerpo es la obvia, pero Frappe llama ahí a `doc.check_permission("write")`: ejecutar una consulta exigiría acceso de *escritura*, lo cual es al revés para una herramienta de BI. Este nodo usa `POST /api/method/frappe.handler.run_doc_method`, que carga el documento con `check_permission=True` — basta el permiso **read** — y parsea `args` como JSON, de modo que `page_size: 100` sigue siendo un entero en vez de llegar como la cadena `"100"`.

### Opciones de «Get Many»

| Opción             | Corresponde a                     | Notas                                                       |
| ------------------ | --------------------------------- | ----------------------------------------------------------- |
| Return All         | pagina `limit_start` automáticamente | Trae 100 registros por petición hasta la última página     |
| Limit              | `limit_page_length`               | Se usa cuando Return All está desactivado                   |
| Offset             | `limit_start`                     | Se ignora cuando Return All está activo                     |
| Fields             | `fields`                          | Separados por comas o un array JSON. Por defecto `["*"]`    |
| Filters (JSON)     | `filters`                         | Sintaxis de filtros de Frappe                               |
| Or Filters (JSON)  | `or_filters`                      | Misma sintaxis, combinada con OR                            |
| Sort Field / Order | `order_by`                        | p. ej. `modified desc`                                      |

Frappe solo devuelve la columna `name` si no se indica `fields`, así que el nodo usa `["*"]` por defecto para darte el documento completo.

Los filtros aceptan las dos formas de Frappe — un objeto para igualdad simple, o un array de tripletas para operadores:

```json
{ "workbook": "12" }
```

```json
[
	["modified", ">=", "2026-01-01"],
	["title", "like", "%ingresos%"]
]
```

### Campos JSON

Varios campos de Insights se declaran `JSON` en el doctype: `operations` (Query), `config` (Chart), `items` (Dashboard), `http_headers`, `api_custom_headers` y `bigquery_service_account_key` (Data Source).

El nodo los envía como **cadenas**, que es lo que la columna contiene. Antes los parsea como comprobación: así una errata se convierte en un error del nodo que nombra el campo, en lugar de un documento que se guarda sin problema y falla la próxima vez que Insights lo lea. Si una expresión entrega un objeto, se serializa por ti.

### Campos de solo lectura

Insights escribe algunos campos por su cuenta, así que el nodo no los ofrece: `data_query` (Chart), `linked_charts` (Dashboard), `data_backup` e `imported_*` (Workbook), `is_site_db` / `is_frappe_db` (Data Source), `last_execution` (Alert), `last_synced_on` y `stored` (Table).

`Insights Table v3` es de solo lectura en su totalidad: es un *catálogo* que Insights rellena al sincronizar una fuente de datos. Crear una entrada a mano describiría una tabla que puede no existir, y la siguiente sincronización la sobrescribiría. Leerlas, en cambio, es como un flujo descubre qué expone una fuente.

La pertenencia a equipos (`team_members`) y los permisos por recurso (`team_permissions`) son tablas hijas. **Get** las devuelve tal cual, pero el nodo no ofrece escribirlas — reemplazar en bloque una tabla de permisos desde un flujo es la forma de que un equipo pierda sus accesos en silencio.

### Fechas

Frappe almacena datetimes **ingenuos**, interpretados en la zona horaria del sitio (**Settings > System Settings > Time Zone**). El nodo convierte los valores que llevan zona horaria — lo que produce el selector de fecha de n8n, como `2026-08-15T09:00:00+02:00` o `...Z` — a la **zona horaria del flujo de n8n**, y deja pasar sin tocar los que ya son ingenuos.

Hoy ningún campo usa esta conversión: ningún campo escribible de Insights v3 es una fecha. `Insights Alert.next_execution` lo parecía, pero Insights lo recalcula a partir de **Frequency** en cada guardado — una alerta creada con `next_execution` vuelve con el valor recalculado — así que el nodo no lo expone. La conversión se mantiene para cuando aparezca un campo de fecha.

### Gestión de errores

Frappe reporta los errores en un campo `_server_messages` que contiene JSON codificado *dentro* de JSON, a menudo con HTML. El nodo lo desenvuelve y muestra el mensaje real: obtienes `Value missing for Insights Query v3: Workbook` en vez de `Request failed with status code 417`. Si no, recurre al campo `exception` y luego al estado HTTP.

Las respuestas `401` y `403` llevan una pista adicional que apunta al rol de Frappe en vez de a la credencial, porque casi siempre es la causa.

## Uso

Cada ejemplo es un nodo que puedes pegar en un flujo de n8n. Sustituye el bloque `credentials` por el tuyo.

### Workbook — crear

```json
{
	"parameters": {
		"resource": "workbook",
		"operation": "create",
		"title": "Informe de ingresos"
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Create Workbook",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

`Insights Workbook` usa nombrado `autoincrement`, así que el `name` devuelto es un entero como `12`. Ese es el valor que esperan todos los demás recursos en su campo **Workbook**.

### Query — ejecutar

La operación que más usarás. Sale un ítem por fila:

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

El document ID es el `name` de la consulta, visible en la URL del libro en Insights. **Force Refresh** salta la caché de diez minutos: déjalo desactivado para paneles que se refrescan periódicamente, actívalo cuando el flujo deba ver las filas más recientes.

### Query — ejecutar con filtros puntuales

Filtrar una ejecución sin tocar la consulta guardada:

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

Cada regla se escribe `{"column": {"column_name": …}, "operator": …, "value": …}`, y las reglas se combinan con **Y**. Internamente Insights espera estos filtros indexados por nombre de consulta; el nodo añade esa clave por ti a partir de **Document ID**. La forma indexada sigue aceptándose tal cual — `{"<nombre de la consulta>": {"type": "filter_group", …}}` — y es así como se filtra una consulta *anidada* dentro de la que se ejecuta.

> Un filtro que Insights no reconoce se **ignora en silencio**: la consulta se ejecuta y devuelve todas las filas. Si una ejecución devuelve más filas de las previstas, revisa primero la forma de las reglas.

Con `splitRows` desactivado obtienes un único ítem con `rows`, `columns`, el `sql` generado y `time_taken` — útil cuando el flujo quiere los metadatos de columnas, o quiere registrar el SQL que produjo Insights.

### Query — contar filas

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

Devuelve `{ "name": "abc123de45", "count": 42 }`. Pon un nodo **If** detrás para saltarte la rama costosa cuando el recuento sea cero.

### Query — crear

```json
{
	"parameters": {
		"resource": "query",
		"operation": "create",
		"workbook": "12",
		"additionalFields": {
			"title": "Tareas abiertas por estado",
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

`operations` es el pipeline que define qué calcula la consulta — una tabla origen y después filtros, uniones y agregaciones, o un único paso `sql` para una consulta nativa. Lo más sencillo para obtener un valor válido es construir la consulta una vez en la interfaz de Insights y releer el campo con **Get**.

### Chart — crear

```json
{
	"parameters": {
		"resource": "chart",
		"operation": "create",
		"workbook": "12",
		"additionalFields": {
			"title": "Tareas por estado",
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

Un gráfico no contiene datos propios: es una representación de la consulta a la que apunta su campo `query`. Para leer las cifras detrás de un gráfico, ejecuta esa consulta.

### Data Source — crear y probar

```json
{
	"parameters": {
		"resource": "dataSource",
		"operation": "create",
		"title": "Ventas Prod",
		"type": "Database",
		"additionalFields": {
			"database_type": "PostgreSQL",
			"host": "db.acme.io",
			"port": 5432,
			"database_name": "ventas",
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

Frappe deriva el `name` del documento del título con `scrub()`, así que «Ventas Prod» se convierte en `ventas_prod` — ese es el ID a usar después. Requiere el rol `Insights Admin`.

Los campos obligatorios dependen de la rama que valida el doctype: `REST API` necesita `api_base_url`; `SQLite` y `DuckDB` necesitan `database_name` (una ruta de archivo en el servidor Frappe); `BigQuery` necesita proyecto, dataset y clave de cuenta de servicio; cualquier otra base necesita host, puerto, usuario, contraseña y nombre de base — salvo que indiques un `connection_string`, que cortocircuita la comprobación.

**Test Connection** indica luego si realmente abre:

```json
{
	"parameters": {
		"resource": "dataSource",
		"operation": "testConnection",
		"documentId": "ventas_prod"
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Test Data Source",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

Devuelve `{ "name": "ventas_prod", "success": true }`. Insights se traga la excepción del driver y señala el fallo con una respuesta vacía, así que todo lo que no sea un éxito explícito se reporta como `false` en vez de lanzarse como error.

### Alert — crear

```json
{
	"parameters": {
		"resource": "alert",
		"operation": "create",
		"title": "Incidencias abiertas por encima del umbral",
		"query": "abc123de45",
		"condition": "len(results) > 10",
		"additionalFields": {
			"frequency": "Hourly",
			"channel": "Email",
			"recipients": "ops@acme.io",
			"message": "**Demasiadas incidencias abiertas** — consulta el panel."
		}
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Create Alert",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

`condition` es una expresión Python evaluada sobre el resultado de la consulta; la alerta se dispara cuando es verdadera. Borrar la consulta borra sus alertas — `Insights Query v3.on_trash` lo hace explícitamente.

### Table — descubrir qué expone una fuente

```json
{
	"parameters": {
		"resource": "table",
		"operation": "getAll",
		"returnAll": true,
		"options": {
			"fields": "name,table,label,data_source,last_synced_on,row_limit",
			"filters": "{\"data_source\": \"ventas_prod\"}",
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

`last_synced_on` indica si el catálogo está al día. La sincronización se lanza desde la interfaz de Insights.

### Workbook — duplicar

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

Copia el libro con sus consultas, gráficos y paneles — Insights lo exporta y lo reimporta con un nombre nuevo. Práctico para plantillas de informes mensuales.

Insights solo responde el **nombre** del nuevo libro, un número porque `Insights Workbook` es autoincremental. El nodo lo relee y devuelve el documento completo, para que la salida tenga la misma forma que la de Create.

### Eliminar

Cualquier recurso escribible, a partir de su document ID:

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

El nodo devuelve `{ "success": true, "doctype": "Insights Chart v3", "name": "abc123de45" }`. Frappe se niega a borrar un documento al que otro registro enlaza: borra el gráfico antes que la consulta que lee, y el panel antes que el gráfico.

## Compatibilidad

Validado de extremo a extremo contra un sitio real con **Frappe Framework 16.29.0**, Insights 3.3.1 y MariaDB, sobre **n8n 2.32.7** — cada operación descrita aquí se ejecutó allí, no solo se compiló, y el paquete fue cargado por el propio cargador de ese n8n. Antes se validó igual sobre Frappe Framework 15.116.1. El nodo solo usa los endpoints REST estándar `/api/resource` y `/api/method/frappe.handler.run_doc_method`, ambos funcionalidades de Frappe Framework presentes en las ramas `version-15`, `version-16` y `develop`.

Frappe 16 reescribió `db_query` sobre pypika, lo que cambia la forma de `order_by` aceptada. El nodo genera la única forma que ambas versiones analizan: **Sort Field** funciona igual en 15 y en 16.

**Insights 3 es obligatorio.** Los nombres de doctype llevan un sufijo ` v3` que no existe en un sitio con Insights 2.

## Recursos

- [Documentación de nodos comunitarios de n8n](https://docs.n8n.io/integrations/#community-nodes)
- [Documentación de la API REST de Frappe](https://docs.frappe.io/framework/user/en/api/rest)
- [Documentación de Frappe Insights](https://docs.frappe.io/insights)
- [Código fuente de Frappe Insights](https://github.com/frappe/insights)
- [Arquitectura de la credencial compartida](docs/CREDENTIALS.md)

## Historial de versiones

### 0.1.0

Versión inicial. Nodo Frappe Insights con los recursos Workbook, Query, Chart, Dashboard, Data Source, Table, Alert y Team, los métodos de documento Execute / Get Count / Duplicate / Test Connection, y la credencial compartida `frappeApi`.

## Desarrollo

```bash
npm install
npm run build     # compila a dist/ y copia los iconos
npm run dev       # bucle de desarrollo contra un n8n local
npm run lint      # el mismo comando que ejecuta la CI
npm run lint:fix
```

No hay ningún runner de tests en este repositorio. Verifica los cambios con `npm run build` seguido de una carga real en n8n.

Consulta [AGENTS.md](AGENTS.md) para la guía completa del contribuidor.
