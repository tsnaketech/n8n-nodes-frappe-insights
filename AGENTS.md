# AGENTS.md

Guide pour les agents IA travaillant sur ce dépôt.

## Contexte du projet

Package de nœuds communautaires n8n, écrit en TypeScript, publié sous le nom
`n8n-nodes-frappe-insights`. Il expose **un nœud**, `Frappe Insights`, qui pilote
[Frappe Insights](https://github.com/frappe/insights) (l'app `insights`) via l'API REST
générique de Frappe.

Ce package fait partie d'une famille de sept : le nœud générique `n8n-nodes-frappe` et les
six nœuds applicatifs `n8n-nodes-frappe-crm`, `-helpdesk`, `-hrms`, `-insights`, `-learning`
et `-lending`. Tous partagent le **même credential** `frappeApi`
et la **même couche transport**, chacun dans sa propre copie — un import ne franchit pas la
frontière d'un package npm. Voir [docs/CREDENTIALS.md](docs/CREDENTIALS.md) — c'est le
document à lire avant de toucher au credential ou à `GenericFunctions.ts`.

Le dépôt est sous git, `origin` pointant sur
`github.com/tsnaketech/n8n-nodes-frappe-insights`. La CI et la publication npm se déclenchent
depuis GitHub — voir `.github/workflows/`.

## Structure

```
nodes/FrappeInsights/FrappeInsights.node.ts   Nœud : description + boucle execute()
nodes/FrappeInsights/GenericFunctions.ts      Transport Frappe (requête, pagination, erreurs)
nodes/FrappeInsights/types.ts                 Mapping resource n8n → doctype Frappe
nodes/FrappeInsights/descriptions/            Une description par resource + CommonDescription
credentials/FrappeApi.credentials.ts          Credential partagé (siteUrl + apiKey + apiSecret)
icons/frappe-insights.svg                     Icône du nœud
icons/frappe.svg, frappe.dark.svg             Icônes du credential (light/dark)
docs/CREDENTIALS.md                           Architecture du credential partagé
.github/workflows/ci.yml                      lint + build sur PR et push sur main
.github/workflows/publish.yml                 Publication npm avec provenance sur tag *.*.*
```

`tsconfig.json` compile `credentials/**` et `nodes/**` vers `dist/`. Les chemins déclarés
dans `package.json` → `n8n.nodes` / `n8n.credentials` pointent vers `dist/`, pas vers les
sources : **toute création ou renommage de nœud doit être répercuté dans ces deux tableaux**,
sinon n8n ne charge rien et il n'y a aucune erreur explicite.

## Commandes

```bash
npm install
npm run build        # n8n-node build → dist/ (JS compilé + icônes copiées)
npm run build:watch  # tsc --watch
npm run dev          # n8n-node dev (boucle de dev avec n8n)
npm run lint         # n8n-node lint — même commande que la CI
npm run lint:fix
npm run release      # release interactive : lint, build, bump, tag, push → déclenche publish.yml
```

La CI n'exécute que `npm ci`, `npm run lint`, `npm run build`. Il n'y a **aucun test**
dans le dépôt et aucun runner de test configuré ; ne pas inventer `npm test`. Si un
changement mérite d'être vérifié, le faire via `npm run build` puis un chargement réel
dans n8n (voir README, section « Development »).

### Vérifier contre un site réel

Le nœud a été validé de bout en bout le 01/08/2026 contre un site de test
(Frappe 15.116.1, Insights 3.3.1, MariaDB), puis le 02/08/2026 contre le même site passé en
**Frappe 16.29.0** (Insights 3.3.1, MariaDB), sous **n8n 2.32.7**. La méthode, à reproduire
hors du dépôt : instancier `dist/nodes/FrappeInsights/FrappeInsights.node.js` et appeler
`execute()` avec un faux `IExecuteFunctions` — six membres suffisent (`getInputData`,
`getNodeParameter`, `getNode`, `getTimezone`, `continueOnFail`, `getCredentials`) plus
`helpers.httpRequestWithAuthentication`, qu'on implémente avec `fetch` en ajoutant l'en-tête
`Authorization`. Cela exerce le vrai code du nœud, pas une réécriture.

Le site de test est décrit par les variables d'environnement `FRAPPE_URL`, `FRAPPE_API_KEY`
et `FRAPPE_API_SECRET`. Y passer l'URL **avec** son chemin de SPA (`$FRAPPE_URL/insights`)
plutôt que la racine : c'est le seul moyen d'exercer `normalizeSiteUrl()`.

Deux choses ne se testent pas avec ce faux contexte et méritent leur propre script :

- **le `test` du credential**, dont le `baseURL` est une expression : la résoudre avec le
  moteur du runtime (`workflow.expression.getSimpleParameterValue(node, valeur, 'internal',
  { $credentials }, undefined, '')`, ce que fait `CredentialsHelper.resolveValue` de n8n),
  pas en réimplémentant le `replace` à la main ;
- **le chargement du paquet par n8n**, via `PackageDirectoryLoader` de `n8n-core`, exécuté
  **dans le conteneur n8n** pour valider contre la version réellement en service. Le dossier
  `custom/` de l'hôte est monté sur `/home/node/.n8n/custom`, donc un
  `docker compose exec -T n8n node …` suffit. Ne pas redémarrer n8n pour tester : le
  chargeur s'instancie sans toucher au service.

Quatre constats de ces passages sont contre-intuitifs et ont chacun corrigé un bug — voir
« Spécificités Insights » : `adhoc_filters` indexé par requête, `next_execution` recalculé,
`order_by` selon la version de Frappe, et le chemin de SPA laissé dans l'URL du site, que
Frappe sert en **HTTP 200 avec du HTML** au lieu de renvoyer une erreur. Un test qui
« passe » ne suffit pas : il faut vérifier que le filtre a bien filtré et que la réponse est
bien du JSON, pas seulement que l'appel a répondu 200.

**Ne jamais écrire de clé d'API dans le dépôt** : les passer par variables d'environnement,
et créer/supprimer les documents de test dans la même exécution.

`npm run lint` sort en succès **sans warning**. Le seul qui apparaissait,
`icon-prefer-themed-variants`, est désactivé ligne à ligne dans le nœud, avec sa
justification en commentaire : l'icône est un fichier unique, et c'est délibéré — le badge
Frappe Insights porte son propre fond turquoise (`#18aeb7`) et tient le contraste sur les
deux thèmes. La règle vérifie seulement qu'`icon` n'est pas une chaîne littérale, sans jamais
comparer les deux fichiers : la forme `{ light, dark }` pointant deux fois le même chemin la
satisferait sans rien changer à l'écran. Ne pas réactiver la règle sans en discuter.

## Conventions de code

- **Tout le code est en anglais** : `description`, `placeholder`, messages d'erreur,
  commentaires. C'est la langue de n8n et celle de sa communauté — un `description` français
  s'afficherait tel quel dans une interface anglaise. Seuls restent en français `AGENTS.md`
  (langue de travail du projet, voir `CLAUDE.md`) et les READMEs traduits. Les guillemets
  français `« »` ne doivent pas apparaître dans les sources : utiliser `"` dans les chaînes
  et les commentaires.
- Prettier (`.prettierrc.js`) : **tabulations**, largeur 100, guillemets simples, points-virgules,
  virgules finales partout, fins de ligne LF.
- ESLint : config `@n8n/node-cli/eslint`, non personnalisée. Elle impose les règles n8n sur
  le nommage des paramètres, `displayName`, l'ordre **alphabétique** des options et des
  champs de collection, la ponctuation finale des `description` — ces erreurs de lint sont
  des vraies contraintes de la plateforme, ne pas les désactiver avec un commentaire sans
  raison. `npm run lint:fix` en corrige la majorité.
- TypeScript en `strict`, avec `noUnusedLocals` et `noImplicitReturns` : du code mort ou une
  branche sans `return` casse le build.
- Importer les types depuis `n8n-workflow` en `import type`, et les valeurs
  (`NodeConnectionTypes`, `NodeOperationError`) en import normal.
- Les commentaires expliquent **pourquoi**, pas quoi — en particulier les particularités de
  Frappe et d'Insights (champs `JSON`, méthodes de document, doctypes suffixés `v3`) qui ne
  se devinent pas à la lecture.

## Patterns n8n à respecter

- Requêtes HTTP : passer par `frappeApiRequest` / `frappeMethodRequest` /
  `frappeRunDocMethod` de `GenericFunctions.ts`, jamais par `fetch`/`axios` directement.
- Boucle sur les items : itérer `this.getInputData()`, renseigner `pairedItem: { item: i }` sur
  chaque sortie, et honorer `this.continueOnFail()` avant de relancer l'erreur.
- Erreurs : `NodeApiError` pour les échecs HTTP (déjà fait par `frappeApiRequest`, qui parse
  `_server_messages`), `NodeOperationError` pour les erreurs de configuration. Ne pas laisser
  remonter une `Error` brute.
- Le nœud expose `usableAsTool: true` (utilisable par les agents IA n8n) — garder les
  `description` et `action` des opérations lisibles, elles servent de doc à l'agent.
- **URL du site : retirer le chemin de la SPA avant d'appeler l'API.** L'utilisateur colle
  naturellement l'URL de son navigateur (`https://site/insights`). Laisser le chemin ne
  produit pas une erreur franche : Frappe répond **HTTP 200 avec l'`index.html` de la SPA**
  pour `/insights/api/method/...` (vérifié, `content-type: text/html`). `normalizeSiteUrl()`
  le retire dans `GenericFunctions.ts`, et la même liste est dupliquée en alternative regex
  dans le `test` du credential — **les deux doivent changer ensemble**. Sans le correctif
  côté credential, le bouton « Test » annonce un credential valide (aucune règle ne matche du
  HTML) et chaque requête ultérieure échoue.

## Spécificités Insights à connaître

- **Doctypes suffixés `v3`** : `Insights Query v3`, `Insights Chart v3`,
  `Insights Dashboard v3`, `Insights Data Source v3`, `Insights Table v3`. Le suffixe fait
  partie du **nom du doctype**, ce n'est pas une version du nœud. Insights 3 a réécrit son
  modèle de données et conserve les doctypes v2 à côté pour la migration : `Insights Query`
  et `Insights Query v3` coexistent. Ce nœud ne vise **que Insights 3**. Les noms exacts sont
  dans `types.ts`, vérifiés contre `github.com/frappe/insights`, dossier
  `insights/insights/doctype/`.
- **`workbook` obligatoire** : `Insights Query v3`, `Insights Chart v3` et
  `Insights Dashboard v3` déclarent tous `workbook` en `reqd`. Rien ne se crée hors d'un
  classeur — c'est pourquoi `Workbook` est la première resource du README.
- **Méthodes de document** : `execute`, `get_count`, `duplicate` et `test_connection` sont
  déclarées sur la classe du doctype, pas au niveau module. Elles passent par
  `frappeRunDocMethod`, qui appelle `/api/method/frappe.handler.run_doc_method`. Le long
  commentaire au-dessus de ce helper explique pourquoi cette route plutôt que
  `POST /api/resource/{doctype}/{name}` : cette dernière exige la permission **write**, ce qui
  est absurde pour lire un graphique. Ne pas « simplifier » vers la route resource.
- **Nommer la méthode par son chemin complet**, `frappe.handler.run_doc_method`. Le nom court
  `run_doc_method` se résout aussi, mais par un raccourci que `frappe/handler.py` déprécie
  explicitement : `get_attr()` n'accepte un `cmd` sans point qu'en émettant
  `deprecation_warning("unknown", "v17", "Calling shorthand … is deprecated, please specify
  full path in RPC call.")`. Le nœud utilisait ce nom court jusqu'au 04/08/2026 : il
  fonctionnait, en écrivant un avertissement dans le log du site à chaque appel, et aurait
  cassé en v17. Le chemin complet résout vers le même objet fonction, donc l'exemption
  ci-dessous continue de s'appliquer.
- **`run_doc_method` n'a pas de décorateur `@frappe.whitelist()`** et paraît donc
  injoignable ; `frappe/handler.py` l'exempte nommément (`if method != run_doc_method:`).
  Vérifié sur les branches `version-15`, `version-16` et `develop`. Le package Helpdesk
  affirmait le contraire dans un commentaire ; il a été rectifié le 30/07/2026. Son code
  garde volontairement la route `/api/resource/…`, dont les méthodes sont des écritures de
  toute façon.
- **Arguments des méthodes** : `run_doc_method` étale `args` en arguments nommés. Une clé en
  trop est un `TypeError` côté site, remonté en HTTP 417. `buildQueryMethodArgs()` ne laisse
  donc passer que les paramètres déclarés par la signature Python.
- **`adhoc_filters` est indexé par nom de requête**, et c'est le piège le plus coûteux du
  nœud. `set_adhoc_filters()` pose la valeur sur `frappe.local` sans appeler `parse_json` —
  d'où le parsing côté nœud — mais surtout `IbisQueryBuilder.set_operations()` la lit comme
  `adhoc_filters_by_query[self.doc.name]` et n'accepte à cette clé qu'une opération
  `filter_group`. Toute autre forme est **ignorée en silence** : la requête s'exécute et
  renvoie tout. Mesuré sur site réel, sur 1177 lignes : `{"istable": 1}` et un `filter_group`
  nu comptent 1177, la forme indexée compte 446. `wrapAdhocFilters()` enveloppe donc un
  tableau ou un `filter_group` sous le nom de la requête exécutée, et laisse passer tel quel
  ce qui est déjà indexé (nécessaire pour filtrer une requête imbriquée).
- **`Insights Workbook.duplicate` renvoie un nom, pas un document** — et un nombre, le
  doctype étant `autoincrement`. n8n exige un objet dans `json` : le nœud relit le document
  pour aligner la sortie sur celle de Create.
- **`order_by` : la forme naïve casse en 15, la forme backtickée casse en 16.** En Frappe 15
  la clause est insérée presque telle quelle dans le SQL : une colonne dont le nom est un mot
  réservé casse côté base, pas côté Frappe — `Insights Table v3.table` donne
  `ERROR 1064 … near 'table asc'` sur MariaDB, et les backticks règlent le problème. Frappe 16
  a réécrit `db_query` sur pypika (`frappe/database/query.py`) : `order_by` est désormais
  **analysé**, et `_validate_and_parse_field_for_clause` n'accepte un nom backtické que sous
  la forme à deux parties — un `` `table` `` seul lève
  `Order By has invalid backtick notation`. `buildOrderBy()` émet donc la forme qualifiée
  `` `tab{doctype}`.`{champ}` ``, la seule valide des deux côtés : Frappe 16 la parse, Frappe 15
  l'inline en SQL correct puisque `tab{doctype}` est la table même que `db_query` interroge.
  Vérifié en 16.29.0 sur les huit doctypes. Un champ que l'utilisateur a déjà qualifié ou
  backtické n'est pas retouché.
- **Champs `JSON`** (`operations`, `config`, `items`, `http_headers`, `api_custom_headers`,
  `bigquery_service_account_key`) : les envoyer en **chaîne**. `Document.get_valid_dict()` de
  base ne sérialise pas un dict écrit dans un champ JSON — `InsightsQueryv3` surcharge la
  méthode précisément pour encoder `operations` quand c'est une liste, ce qui prouve que la
  classe de base laisse la valeur telle quelle. `normalizeJsonFields()` valide et stringifie.
- **Champs read-only à ne pas exposer** : `data_query` (Chart), `linked_charts` (Dashboard),
  `old_name`, `data_backup`, `imported_*` (Workbook), `is_site_db` / `is_frappe_db`
  (Data Source), `last_execution` (Alert), `last_synced_on` / `stored` (Table). Insights les
  écrit lui-même.
- **`Insights Table v3` est en lecture seule** dans le nœud : c'est un catalogue qu'Insights
  remplit à la synchronisation d'une source. En créer un décrirait une table qui peut ne pas
  exister, et la synchro suivante l'écraserait.
- **Dates** : Frappe stocke des datetimes naïfs dans le fuseau du site. La conversion est
  faite par `normalizeDates()` dans le nœud, à partir des sets `DATE_FIELDS` et
  `DATETIME_FIELDS` — **tout nouveau champ date doit y être ajouté**, sinon il part au
  format ISO et Frappe le rejette ou le décale. Les deux sets sont **vides** aujourd'hui :
  le seul candidat, `Insights Alert.next_execution`, n'est pas marqué read-only sur le
  doctype mais est recalculé à chaque `save()` depuis `frequency` / `cron_format`. Vérifié
  sur site réel : une alerte créée avec `next_execution: "2026-09-01 08:30:00"` et
  `frequency: "Daily"` revient à `2000-01-02 00:00:00`, comme une alerte créée sans. Le champ
  n'est donc plus exposé. Ne pas le remettre sans avoir revérifié le contrôleur.
- **Rôles** : les méthodes décorées `@insights_whitelist()` exigent le rôle `Insights User`
  (ou `Insights Admin` pour certaines). Une 403 vient des rôles, pas du credential.

## Documentation

Quatre READMEs traduits (`README.md`, `.fr.md`, `.es.md`, `.de.md`). Un changement visible par
l'utilisateur (nouvelle opération, nouveau credential, prérequis) doit être répercuté dans
**les quatre**, sinon les traductions divergent silencieusement.

`docs/CREDENTIALS.md` est écrit pour toute la famille de nœuds Frappe : y ajouter un nœud
consommateur quand il arrive, et ne jamais y dupliquer le contenu du README.

## GitHub Actions

Les workflows GitHub Actions doivent toujours utiliser des versions existantes et stables
des actions officielles. **Ne jamais inventer ou supposer une version majeure.**

- Vérifier la dernière version disponible avant de modifier un workflow.
- Préférer un tag de version (`@v4`, `@v5`, etc.) ou, idéalement, un commit SHA lorsque la
  reproductibilité ou la sécurité est importante.
- Si la version n'est pas certaine, consulter le dépôt officiel de l'action plutôt que de
  la deviner.

Les workflows utilisent aujourd'hui `actions/checkout@v7` et `actions/setup-node@v7`,
versions vérifiées le 30/07/2026.

## Publication

`publish.yml` se déclenche sur un tag `*.*.*` et publie sur npm avec provenance
(exigence n8n depuis mai 2026). Nécessite `@n8n/node-cli` ≥ 0.23.0. Ne pas publier
manuellement (`npm publish`) : cela produit un package sans attestation de provenance,
que n8n refusera.
