# n8n-nodes-frappe-insights

Package de nœuds communautaires n8n pour [Frappe Insights](https://frappe.io/insights) (l'app `insights`). Il permet d'**exécuter des requêtes Insights et d'en récupérer les lignes**, et de gérer classeurs, graphiques, tableaux de bord, sources de données, alertes et équipes depuis vos workflows n8n.

[n8n](https://n8n.io/) est une plateforme d'automatisation de workflows sous [licence fair-code](https://docs.n8n.io/reference/license/).

Autres langues : [English](README.md) · [Español](README.es.md) · [Deutsch](README.de.md)

[Installation](#installation)
[Credentials](#credentials)
[Opérations](#opérations)
[Utilisation](#utilisation)
[Compatibilité](#compatibilité)
[Ressources](#ressources)
[Historique des versions](#historique-des-versions)
[Développement](#développement)

## Installation

Suivez le [guide d'installation](https://docs.n8n.io/integrations/community-nodes/installation/) de la documentation n8n, avec `n8n-nodes-frappe-insights` comme nom de package.

**Auto-hébergé, via l'interface n8n** — allez dans **Settings > Community nodes > Install**, saisissez `n8n-nodes-frappe-insights` et validez.

**Auto-hébergé, manuellement :**

```bash
cd ~/.n8n/custom
npm install n8n-nodes-frappe-insights
```

Redémarrez n8n, puis cherchez « Frappe Insights » dans le panneau des nœuds.

## Credentials

Ce package utilise un seul type de credential, **Frappe API** (`frappeApi`) — le *même* que celui des nœuds Frappe CRM, Frappe Helpdesk et Frappe HR. S'il est déjà configuré, le nœud Frappe Insights peut le sélectionner directement.

### Générer les clés d'API dans Frappe

1. Sur votre site Frappe, ouvrez l'utilisateur au nom duquel n8n doit agir (`/app/user`).
2. Descendez jusqu'à **Settings > API Access** et cliquez sur **Generate Keys**.
3. Copiez l'**API Secret** — il n'est affiché qu'une fois — ainsi que l'**API Key** visible sur la fiche utilisateur.

Le nœud agit en tant que cet utilisateur : il hérite de ses rôles et de ses permissions. Si un appel échoue sur une erreur de permission, vérifiez les rôles plutôt que le credential.

### Remplir le credential

| Champ      | Exemple                        | Remarques                                                                |
| ---------- | ------------------------------ | ------------------------------------------------------------------------ |
| Site URL   | `https://mon-site.frappe.cloud` | Racine du site. Un `/insights` ou un `/` final est retiré automatiquement |
| API Key    | `a1b2c3d4e5f6g7h`              |                                                                          |
| API Secret | `s1e2c3r4e5t6`                 | Stocké chiffré par n8n                                                   |

Les requêtes sont authentifiées par l'en-tête `Authorization: token {apiKey}:{apiSecret}`. Utilisez **Test** pour valider la connexion : l'appel vise `/api/method/frappe.auth.get_logged_user` et échoue si le site répond `Guest`, ce que renvoie Frappe quand les clés ne sont pas reconnues. **Test** retire le chemin de l'application exactement comme le nœud, donc une URL collée depuis le navigateur est vérifiée sur la même racine que celle qu'utilisera le nœud.

> Laisser le chemin de l'application dans l'URL n'était pas une erreur franche mais une erreur invisible : Frappe répond à `/insights/api/method/...` par **HTTP 200 et la page HTML d'Insights**. Le nœud comme le test du credential le retirent désormais.

### Rôles nécessaires

Insights ajoute ses propres permissions par-dessus celles de Frappe :

- **`Insights User`** est le minimum. Chaque méthode exposée par l'app est décorée `@insights_whitelist()`, qui vérifie ce rôle avant toute chose.
- **`Insights Admin`** est requis pour créer ou modifier une **source de données** : c'est un accès à des identifiants de base, pas à un rapport.
- Au-delà des rôles, Insights filtre par ressource via `Insights Team`. Un utilisateur ne voit que les classeurs partagés avec lui ou avec l'une de ses équipes — une `403` vient donc généralement du partage, pas du credential.

### Un seul credential pour tous les nœuds Frappe

`frappeApi` n'est délibérément **pas** spécifique à Insights. Frappe authentifie un *utilisateur sur un site*, pas une application : la même clé fonctionne pour Frappe Insights, Frappe CRM, Frappe Helpdesk et Frappe HR, qui vivent sur le même site et partagent le même endpoint `/api`.

Créez une instance de credential par *site* (« Frappe – prod », « Frappe – recette »), pas par application. Voir [docs/CREDENTIALS.md](docs/CREDENTIALS.md) pour l'architecture complète, la liste des nœuds consommateurs et les rôles Frappe nécessaires à chaque opération.

## Opérations

| Resource    | Doctype Frappe            | Opérations                                                       |
| ----------- | ------------------------- | ---------------------------------------------------------------- |
| Workbook    | `Insights Workbook`       | Create, Get, Get Many, Update, Delete, **Duplicate**              |
| Query       | `Insights Query v3`       | Create, Get, Get Many, Update, Delete, **Execute**, **Get Count** |
| Chart       | `Insights Chart v3`       | Create, Get, Get Many, Update, Delete                             |
| Dashboard   | `Insights Dashboard v3`   | Create, Get, Get Many, Update, Delete                             |
| Data Source | `Insights Data Source v3` | Create, Get, Get Many, Update, Delete, **Test Connection**        |
| Table       | `Insights Table v3`       | Get, Get Many — lecture seule                                     |
| Alert       | `Insights Alert`          | Create, Get, Get Many, Update, Delete                             |
| Team        | `Insights Team`           | Create, Get, Get Many, Update, Delete                             |

Le CRUD passe par l'API REST standard de Frappe, `/api/resource/{doctype}`. Les quatre opérations en gras sont des **méthodes de document** et passent par `/api/method/frappe.handler.run_doc_method` — voir [Exécuter une requête](#exécuter-une-requête).

Les noms de doctypes ont été vérifiés contre [github.com/frappe/insights](https://github.com/frappe/insights) (`insights/insights/doctype/`).

> **Ce nœud ne vise qu'Insights 3.**
> Le suffixe ` v3` fait partie du *nom du doctype*, ce n'est pas une version du nœud. Insights 3 a réécrit son modèle de données et conserve les doctypes v2 à côté des nouveaux pour la migration : `Insights Query` et `Insights Query v3` sont deux doctypes distincts qui coexistent sur un même site. Sur un site encore en Insights 2, chaque requête répond `404` — l'échec honnête, plutôt que la lecture silencieuse de doctypes périmés.

> **Tout dépend d'un classeur.**
> `Insights Query v3`, `Insights Chart v3` et `Insights Dashboard v3` déclarent tous `workbook` en Link obligatoire. Rien ne se crée hors d'un classeur : en créer un est donc le premier appel de tout workflow Insights.

### Exécuter une requête

**Execute** est ce qui justifie le nœud : l'opération exécute le pipeline de la requête contre la source de données et retourne les lignes.

Par défaut le nœud émet **un item n8n par ligne de résultat**, pour que le nœud suivant itère sur des données et non sur des métadonnées. Désactivez **Split Rows Into Items** pour obtenir un item unique contenant l'enveloppe complète :

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

Options d'`Execute` :

| Option                 | Correspond à           | Remarques                                                                        |
| ---------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| Page / Page Size       | `page`, `page_size`    | Insights pagine côté serveur ; par défaut page 1, 100 lignes                      |
| Force Refresh          | `force`                | Contourne le cache de résultats, qu'Insights conserve dix minutes                 |
| Adhoc Filters (JSON)   | `adhoc_filters`        | Règles appliquées à cette exécution seulement, sans modifier la requête enregistrée — voir plus bas |
| Active Operation Index | `active_operation_idx` | Arrête le pipeline après la *n*-ième étape, pour inspecter un résultat intermédiaire |

**Get Count** retourne le nombre de lignes que la requête *retournerait*, sans les rapatrier — la façon économique de tester « y a-t-il quelque chose à signaler ? » avant de tirer les données.

> **Pourquoi la permission `read` suffit**
> On peut atteindre une méthode de document de deux façons. `POST /api/resource/{doctype}/{name}` avec `run_method` dans le corps est la plus évidente, mais Frappe y appelle `doc.check_permission("write")` : exécuter une requête exigerait un accès en *écriture*, ce qui est à l'envers pour un outil de BI. Ce nœud utilise donc `POST /api/method/frappe.handler.run_doc_method`, qui charge le document avec `check_permission=True` — la permission **read** suffit — et parse `args` en JSON, si bien que `page_size: 100` reste un entier au lieu d'arriver sous la forme de la chaîne `"100"`.

### Options de « Get Many »

| Option             | Correspond à                    | Remarques                                                     |
| ------------------ | ------------------------------- | ------------------------------------------------------------- |
| Return All         | pagination auto de `limit_start` | Récupère 100 enregistrements par requête jusqu'à la dernière page |
| Limit              | `limit_page_length`             | Utilisé quand Return All est désactivé                        |
| Offset             | `limit_start`                   | Ignoré quand Return All est actif                             |
| Fields             | `fields`                        | Séparés par des virgules, ou tableau JSON. Par défaut `["*"]` |
| Filters (JSON)     | `filters`                       | Syntaxe de filtres Frappe                                     |
| Or Filters (JSON)  | `or_filters`                    | Même syntaxe, combinée en OU                                  |
| Sort Field / Order | `order_by`                      | par ex. `modified desc`                                       |

Frappe ne renvoie que la colonne `name` si `fields` n'est pas précisé : le nœud utilise donc `["*"]` par défaut pour vous rendre le document complet.

Les filtres acceptent les deux formes Frappe — un objet pour l'égalité simple, ou un tableau de triplets pour les opérateurs :

```json
{ "workbook": "12" }
```

```json
[
	["modified", ">=", "2026-01-01"],
	["title", "like", "%chiffre%"]
]
```

### Champs JSON

Plusieurs champs Insights sont déclarés `JSON` sur le doctype : `operations` (Query), `config` (Chart), `items` (Dashboard), `http_headers`, `api_custom_headers` et `bigquery_service_account_key` (Data Source).

Le nœud les envoie sous forme de **chaînes**, ce que la colonne contient de toute façon. Il les parse d'abord à titre de contrôle : une faute de frappe devient une erreur du nœud nommant le champ, plutôt qu'un document qui s'enregistre sans broncher et casse à la prochaine lecture par Insights. Si une expression fournit un objet, il est sérialisé pour vous.

### Champs en lecture seule

Insights écrit certains champs lui-même ; le nœud ne les propose donc pas : `data_query` (Chart), `linked_charts` (Dashboard), `data_backup` et `imported_*` (Workbook), `is_site_db` / `is_frappe_db` (Data Source), `last_execution` (Alert), `last_synced_on` et `stored` (Table).

`Insights Table v3` est en lecture seule dans son ensemble : c'est un *catalogue* qu'Insights remplit à la synchronisation d'une source. En créer une entrée à la main décrirait une table qui peut ne pas exister, et la synchro suivante l'écraserait. Les lire est en revanche la façon dont un workflow découvre ce qu'expose une source.

L'appartenance aux équipes (`team_members`) et les droits par ressource (`team_permissions`) sont des tables enfants. **Get** les retourne telles quelles, mais le nœud ne propose pas de les écrire — remplacer en bloc une table de permissions depuis un workflow est le meilleur moyen de faire perdre silencieusement ses accès à une équipe.

### Dates

Frappe stocke des datetimes **naïfs**, interprétés dans le fuseau du site (**Settings > System Settings > Time Zone**). Le nœud convertit les valeurs porteuses d'un fuseau — ce que produit le sélecteur de date n8n, par ex. `2026-08-15T09:00:00+02:00` ou `...Z` — vers le **fuseau du workflow n8n**, et laisse passer telles quelles les valeurs déjà naïves.

Aucun champ n'utilise cette conversion aujourd'hui : aucun champ Insights v3 modifiable n'est une date. `Insights Alert.next_execution` en avait l'air, mais Insights le recalcule à partir de **Frequency** à chaque enregistrement — une alerte créée avec `next_execution` revient avec la valeur recalculée — donc le nœud ne l'expose pas. La conversion reste en place pour le jour où un champ date apparaîtra.

### Gestion des erreurs

Frappe rapporte ses erreurs dans un champ `_server_messages` qui contient du JSON encodé *dans* du JSON, souvent avec du HTML. Le nœud le déballe et remonte le vrai message : vous obtenez `Value missing for Insights Query v3: Workbook` plutôt que `Request failed with status code 417`. À défaut, il se rabat sur le champ `exception`, puis sur le statut HTTP.

Les réponses `401` et `403` portent une indication supplémentaire orientant vers le rôle Frappe plutôt que vers le credential, parce que c'est presque toujours la cause.

## Utilisation

Chaque exemple ci-dessous est un nœud à coller dans un workflow n8n. Remplacez le bloc `credentials` par le vôtre.

### Champs Link

Les champs qui pointent vers un autre enregistrement Frappe sont des sélecteurs, plus du texte
libre. Ils prennent ici une forme unique :

- **Une liste cherchable** pour tout ce que l'activité alimente — requêtes, classeurs. Le filtrage
  se fait côté Frappe, par pages de 50, et la liste affiche un libellé lisible à côté de
  l'identifiant : `1 — Order Analysis`. Chacun garde un onglet **By Name** pour une valeur littérale
  ou une expression.

Tous les Link de ce nœud pointent vers une requête ou un classeur, tous deux alimentés par
l'utilisateur : il n'y a donc pas de liste déroulante ici, uniquement des recherches.

Un sélecteur ne bloque jamais : si la liste ne peut pas être lue, le mode manuel accepte toujours
l'identifiant. À noter, un champ cherchable est stocké sous la forme
`{ "__rl": true, "mode": …, "value": … }`, d'où son écriture complète dans les exemples.


### Workbook — création

```json
{
	"parameters": {
		"resource": "workbook",
		"operation": "create",
		"title": "Reporting chiffre d'affaires"
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Create Workbook",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

`Insights Workbook` est nommé en `autoincrement` : le `name` retourné est un entier, par ex. `12`. C'est cette valeur qu'attendent toutes les autres resources dans leur champ **Workbook**.

### Query — exécution

L'opération que vous utiliserez le plus. Elle sort un item par ligne :

```json
{
	"parameters": {
		"resource": "query",
		"operation": "execute",
		"documentId": {
			"__rl": true,
			"mode": "name",
			"value": "abc123de45"
		},
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

Le document ID est le `name` de la requête, visible dans l'URL du classeur dans Insights. **Force Refresh** court-circuite le cache de dix minutes : laissez-le désactivé pour un tableau de bord rafraîchi périodiquement, activez-le quand le workflow doit voir les toutes dernières lignes.

### Query — exécution avec filtres ponctuels

Filtrer une exécution sans toucher à la requête enregistrée :

```json
{
	"parameters": {
		"resource": "query",
		"operation": "execute",
		"documentId": {
			"__rl": true,
			"mode": "name",
			"value": "abc123de45"
		},
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

Chaque règle s'écrit `{"column": {"column_name": …}, "operator": …, "value": …}`, et les règles sont combinées en **ET**. En interne, Insights attend ces filtres indexés par nom de requête ; le nœud ajoute cette clé pour vous à partir de **Document ID**. La forme indexée reste acceptée telle quelle — `{"<nom de la requête>": {"type": "filter_group", …}}` — et c'est ainsi qu'on filtre une requête *imbriquée* dans celle qu'on exécute.

> Un filtre qu'Insights ne reconnaît pas est **ignoré silencieusement** : la requête s'exécute et renvoie toutes les lignes. Si une exécution rend plus de lignes que prévu, vérifiez d'abord la forme des règles.

Avec `splitRows` désactivé, vous obtenez un item unique contenant `rows`, `columns`, le `sql` généré et `time_taken` — utile quand le workflow veut les métadonnées de colonnes, ou veut journaliser le SQL produit par Insights.

### Query — comptage

```json
{
	"parameters": {
		"resource": "query",
		"operation": "getCount",
		"documentId": {
			"__rl": true,
			"mode": "name",
			"value": "abc123de45"
		}
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Count Rows",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

Sortie : `{ "name": "abc123de45", "count": 42 }`. Placez un nœud **If** derrière pour sauter la branche coûteuse quand le compte est nul.

### Query — création

```json
{
	"parameters": {
		"resource": "query",
		"operation": "create",
		"workbook": {
			"__rl": true,
			"mode": "name",
			"value": "12"
		},
		"additionalFields": {
			"title": "Tâches ouvertes par statut",
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

`operations` est le pipeline qui définit ce que calcule la requête — une table source, puis filtres, jointures et agrégations, ou une unique étape `sql` pour une requête native. Le plus simple pour obtenir une valeur valide est de construire la requête une fois dans l'interface Insights, puis de relire le champ avec **Get**.

### Chart — création

```json
{
	"parameters": {
		"resource": "chart",
		"operation": "create",
		"workbook": {
			"__rl": true,
			"mode": "name",
			"value": "12"
		},
		"additionalFields": {
			"title": "Tâches par statut",
			"query": {
				"__rl": true,
				"mode": "name",
				"value": "abc123de45"
			},
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

Un graphique ne contient aucune donnée propre : c'est un rendu de la requête référencée par son champ `query`. Pour lire les chiffres derrière un graphique, exécutez cette requête.

### Data Source — création puis test

```json
{
	"parameters": {
		"resource": "dataSource",
		"operation": "create",
		"title": "Ventes Prod",
		"type": "Database",
		"additionalFields": {
			"database_type": "PostgreSQL",
			"host": "db.acme.io",
			"port": 5432,
			"database_name": "ventes",
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

Frappe dérive le `name` du document depuis le titre via `scrub()` : « Ventes Prod » devient `ventes_prod`, et c'est cet ID qu'il faudra utiliser ensuite. Nécessite le rôle `Insights Admin`.

Les champs obligatoires dépendent de la branche que valide le doctype : `REST API` exige `api_base_url` ; `SQLite` et `DuckDB` exigent `database_name` (un chemin de fichier sur le serveur Frappe) ; `BigQuery` exige le projet, le dataset et la clé de compte de service ; toute autre base exige hôte, port, identifiant, mot de passe et nom de base — sauf si vous fournissez un `connection_string`, qui court-circuite le contrôle.

**Test Connection** indique ensuite si elle s'ouvre réellement :

```json
{
	"parameters": {
		"resource": "dataSource",
		"operation": "testConnection",
		"documentId": {
			"__rl": true,
			"mode": "name",
			"value": "ventes_prod"
		}
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Test Data Source",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

Sortie : `{ "name": "ventes_prod", "success": true }`. Insights avale l'exception du driver et signale l'échec par une réponse vide : tout ce qui n'est pas un succès explicite est donc rapporté en `false` plutôt que levé en erreur.

### Alert — création

```json
{
	"parameters": {
		"resource": "alert",
		"operation": "create",
		"title": "Incidents ouverts au-dessus du seuil",
		"query": {
			"__rl": true,
			"mode": "name",
			"value": "abc123de45"
		},
		"condition": "len(results) > 10",
		"additionalFields": {
			"frequency": "Hourly",
			"channel": "Email",
			"recipients": "ops@acme.io",
			"message": "**Trop d'incidents ouverts** — voir le tableau de bord."
		}
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Create Alert",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

`condition` est une expression Python évaluée sur le résultat de la requête ; l'alerte part quand elle est vraie. Supprimer la requête supprime ses alertes — `Insights Query v3.on_trash` s'en charge explicitement.

### Table — découvrir ce qu'expose une source

```json
{
	"parameters": {
		"resource": "table",
		"operation": "getAll",
		"returnAll": true,
		"options": {
			"fields": "name,table,label,data_source,last_synced_on,row_limit",
			"filters": "{\"data_source\": \"ventes_prod\"}",
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

`last_synced_on` indique si le catalogue est à jour. La synchronisation elle-même se déclenche depuis l'interface Insights.

### Workbook — duplication

```json
{
	"parameters": {
		"resource": "workbook",
		"operation": "duplicate",
		"documentId": {
			"__rl": true,
			"mode": "name",
			"value": "12"
		}
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Duplicate Workbook",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

Copie le classeur avec ses requêtes, graphiques et tableaux de bord — Insights l'exporte puis le réimporte sous un nouveau nom. Pratique pour modéliser un reporting mensuel.

Insights ne répond que le **nom** du nouveau classeur, un nombre puisque `Insights Workbook` est auto-incrémenté. Le nœud le relit et renvoie le document complet, pour que la sortie ait la même forme que celle de Create.

### Suppression

N'importe quelle resource inscriptible, à partir de son document ID :

```json
{
	"parameters": {
		"resource": "chart",
		"operation": "delete",
		"documentId": {
			"__rl": true,
			"mode": "name",
			"value": "abc123de45"
		}
	},
	"type": "n8n-nodes-frappe-insights.frappeInsights",
	"typeVersion": 1,
	"name": "Delete Chart",
	"position": [0, 0],
	"credentials": { "frappeApi": { "id": "1", "name": "Frappe account" } }
}
```

Le nœud sort `{ "success": true, "doctype": "Insights Chart v3", "name": "abc123de45" }`. Frappe refuse de supprimer un document référencé par un autre : supprimez le graphique avant la requête qu'il lit, et le tableau de bord avant le graphique.

## Compatibilité

Validé de bout en bout contre un site réel en **Frappe Framework 16.29.0**, Insights 3.3.1 et MariaDB, sous **n8n 2.32.7** — chaque opération décrite ici y a été exécutée, pas seulement compilée, et le paquet a été chargé par le chargeur de ce n8n. Il avait été validé de la même façon en Frappe Framework 15.116.1. Le nœud n'utilise que les endpoints REST standard `/api/resource` et `/api/method/frappe.handler.run_doc_method`, deux fonctionnalités de Frappe Framework présentes sur les branches `version-15`, `version-16` et `develop`.

Frappe 16 a réécrit `db_query` sur pypika, ce qui change la forme d'`order_by` acceptée. Le nœud produit la seule forme que les deux versions analysent : **Sort Field** fonctionne à l'identique en 15 et en 16.

**Insights 3 est requis.** Les noms de doctypes portent un suffixe ` v3` qui n'existe pas sur un site Insights 2.

## Ressources

- [Documentation des nœuds communautaires n8n](https://docs.n8n.io/integrations/#community-nodes)
- [Documentation de l'API REST Frappe](https://docs.frappe.io/framework/user/en/api/rest)
- [Documentation Frappe Insights](https://docs.frappe.io/insights)
- [Sources de Frappe Insights](https://github.com/frappe/insights)
- [Architecture du credential partagé](docs/CREDENTIALS.md)

## Historique des versions

### 0.1.0

Version initiale. Nœud Frappe Insights avec les resources Workbook, Query, Chart, Dashboard, Data Source, Table, Alert et Team, les méthodes de document Execute / Get Count / Duplicate / Test Connection, et le credential partagé `frappeApi`.

## Développement

```bash
npm install
npm run build     # compile vers dist/ et copie les icônes
npm run dev       # boucle de développement avec un n8n local
npm run lint      # même commande que la CI
npm run lint:fix
```

Il n'y a aucun runner de test dans ce dépôt. Vérifiez vos changements avec `npm run build` puis un chargement réel dans n8n.

Voir [AGENTS.md](AGENTS.md) pour le guide complet du contributeur.
