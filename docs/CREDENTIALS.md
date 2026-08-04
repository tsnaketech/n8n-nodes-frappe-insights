# Architecture du credential partagé `frappeApi`

Ce package fait partie d'une suite de nœuds n8n pour Frappe : six nœuds applicatifs
(CRM, Helpdesk, HRMS, Insights, Learning, Lending) et un nœud **générique** qui pilote
n'importe quel doctype. Tous s'authentifient **de la même façon**, contre le même site. Le
credential `frappeApi` est donc défini une seule fois et partagé, plutôt que dupliqué par
produit.

## Pourquoi un seul credential

Frappe Framework n'authentifie pas « une application », il authentifie **un utilisateur
sur un site**. Une paire API Key / API Secret est émise pour un utilisateur Frappe et
vaut pour toutes les applications installées sur ce site — le CRM, le Helpdesk, Frappe HR
et Insights partagent la même base, les mêmes utilisateurs et le même endpoint `/api`.

Créer un `frappeCrmApi`, un `frappeHrmsApi` et un `frappeInsightsApi` reviendrait donc à
demander trois fois la même chose à l'utilisateur, avec trois fois le risque de la saisir
différemment. Un seul credential veut dire :

- une seule saisie d'URL, de clé et de secret, même si l'utilisateur installe les sept nœuds ;
- une rotation de clé à faire à un seul endroit ;
- un test de connexion qui vaut pour tous les nœuds.

## Nœuds consommateurs

| Nœud | Package npm | Doctypes visés | État |
| --- | --- | --- | --- |
| **Frappe** (générique) | `n8n-nodes-frappe` | tout doctype du site, choisi à l'exécution par recherche serveur (`resourceLocator`) — plus l'appel de méthodes whitelistées | livré |
| **Frappe CRM** | `n8n-nodes-frappe-crm` | `CRM Lead`, `CRM Deal`, `Contact`, `CRM Organization`, `CRM Task`, `FCRM Note` | livré |
| **Frappe Helpdesk** | `n8n-nodes-frappe-helpdesk` | `HD Ticket`, `HD Customer`, `HD Team`, `HD Ticket Priority`, `HD Ticket Type` (+ `HD Ticket Status` et `HD Agent` en lecture) | livré |
| **Frappe HRMS** | `n8n-nodes-frappe-hrms` | `Employee`, `Leave Application`, `Attendance`, `Expense Claim`, `Salary Slip`, `Job Opening`, `Job Applicant`, `Job Offer` | livré |
| **Frappe Insights** | `n8n-nodes-frappe-insights` | `Insights Workbook`, `Insights Query v3`, `Insights Chart v3`, `Insights Dashboard v3`, `Insights Data Source v3`, `Insights Table v3`, `Insights Alert`, `Insights Team` | livré (ce dépôt) |
| **Frappe Learning** | `n8n-nodes-frappe-learning` | `LMS Course`, `Course Chapter`, `Course Lesson`, `LMS Batch`, `LMS Enrollment`, `LMS Batch Enrollment`, `LMS Quiz`, `LMS Assignment`, `LMS Assignment Submission`, `LMS Certificate` (+ `LMS Quiz Submission` et `LMS Course Progress` en lecture) | livré |
| **Frappe Lending** | `n8n-nodes-frappe-lending` | `Loan Product`, `Loan Application`, `Loan`, `Loan Disbursement`, `Loan Repayment`, `Loan Write Off`, `Loan Security` (+ `Loan Repayment Schedule`, `Loan Interest Accrual` et `Loan Demand` en lecture) | livré |

Le nœud Insights **ne définit aucune variante** du credential : sa description déclare
`credentials: [{ name: 'frappeApi', required: true }]`, exactement comme les nœuds CRM,
Helpdesk et HRMS.

> Note d'empaquetage : n8n charge les credentials par package npm. Chaque package embarque
> donc son propre fichier `credentials/FrappeApi.credentials.ts`, mais tous exposent le
> **même** `name = 'frappeApi'` et les mêmes noms de champs. Un utilisateur qui installe
> Insights, HRMS, CRM et Helpdesk voit un seul type « Frappe API » et configure son site une
> fois. **Toute modification du fichier doit être répercutée à l'identique dans les autres
> packages** — il y en a quatre à garder synchronisées — sinon des définitions divergentes
> se disputent le même nom interne.

## Ce que le credential contient

| Champ      | Nom interne | Rôle                                                           |
| ---------- | ----------- | -------------------------------------------------------------- |
| Site URL   | `siteUrl`   | Racine du site Frappe, par ex. `https://mon-site.frappe.cloud`   |
| API Key    | `apiKey`    | Clé publique de la paire                                        |
| API Secret | `apiSecret` | Secret de la paire, stocké chiffré                              |

L'authentification est un header appliqué à toutes les requêtes :

```
Authorization: token {apiKey}:{apiSecret}
```

Le test de connexion appelle `GET /api/method/frappe.auth.get_logged_user`. Cet endpoint
est fourni par Frappe Framework lui-même, pas par une application : il fonctionne à
l'identique sur un site CRM, Helpdesk, HR ou Insights. Une règle supplémentaire traite la
réponse `{"message": "Guest"}` comme un échec — Frappe répond `200 OK` en tant qu'invité
quand les clés ne sont pas reconnues, ce qui donnerait sinon un faux positif.

## Ce que le credential ne contient pas, volontairement

Aucune notion de doctype, de resource ni de chemin d'application. Le credential ne connaît
que la racine du site ; c'est chaque nœud qui construit ses propres URL
(`/api/resource/Insights Query v3`, `/api/resource/CRM Lead`, …). C'est cette absence de
couplage qui le rend réutilisable tel quel.

Note pratique : `normalizeSiteUrl()` retire un éventuel chemin de SPA en fin d'URL
(`/insights`, `/crm`, `/helpdesk`, `/hr`, `/app`…) ainsi que le slash final. Coller
`http://insights.localhost:8000/insights`, l'URL affichée par le navigateur, fonctionne
donc aussi bien que la racine du site — l'API vit toujours à la racine.

## Permissions côté Frappe

Le nœud agit **en tant que l'utilisateur** qui a généré les clés : il hérite de ses rôles.
Pour Frappe Insights, cela veut dire concrètement :

- lire et exécuter des requêtes demande le rôle `Insights User` — les méthodes de l'app sont
  décorées `@insights_whitelist()`, qui vérifie ce rôle avant toute chose ;
- créer ou modifier une source de données demande `Insights Admin` : c'est un accès à des
  identifiants de base de données, pas à un rapport ;
- au-delà des rôles, Insights applique ses **propres** permissions par ressource, via
  `Insights Team` et le doctype `Insights Resource Permission`. Un utilisateur qui a le rôle
  `Insights User` ne voit que les classeurs partagés avec lui ou avec l'une de ses équipes ;
- exécuter une requête ne demande que la permission **read** sur elle, parce que le nœud passe
  par `/api/method/frappe.handler.run_doc_method` — voir le commentaire de `frappeRunDocMethod` dans
  `nodes/FrappeInsights/GenericFunctions.ts`. La route
  `POST /api/resource/{doctype}/{name}` aurait exigé **write**.

Une erreur 403 renvoyée par le nœud vient donc presque toujours des rôles ou du partage
d'équipe, pas du credential. Le message d'erreur Frappe est remonté tel quel pour permettre
de trancher.

## Comment un futur nœud le réutilise

### 1. Déclarer le credential dans la description du nœud

Rien à créer : il suffit de le référencer par son nom interne.

```ts
export class FrappeLms implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Frappe LMS',
		name: 'frappeLms',
		// ...
		credentials: [
			{
				name: 'frappeApi', // exactement le même que les nœuds Insights, HRMS, CRM et Helpdesk
				required: true,
			},
		],
	};
}
```

### 2. Réutiliser la couche transport

`nodes/FrappeInsights/GenericFunctions.ts` ne contient rien de spécifique à Insights :
`frappeApiRequest`, `frappeApiRequestAllItems`, `frappeMethodRequest`, `frappeRunDocMethod`
et `parseFrappeError` ne connaissent que le credential `frappeApi` et l'API générique de
Frappe. Un nœud LMS peut les importer directement :

```ts
import { frappeApiRequest } from '../FrappeInsights/GenericFunctions';

const courses = await frappeApiRequest.call(this, 'GET', '/api/resource/LMS Course');
```

Si un second nœud arrive dans **ce** package, il sera temps de déplacer ce fichier vers un
`nodes/shared/` commun. Tant qu'il n'y en a qu'un, l'import direct évite une indirection
prématurée — mais **le fichier ne doit rien apprendre d'Insights** : toute logique propre à
un doctype a sa place dans `FrappeInsights.node.ts`, pas ici.

Un import ne franchit en revanche **pas** la frontière d'un package npm : les six autres
packages ont leur propre copie du fichier. État à ce jour, à garder en tête avant de
reporter un correctif d'un package à l'autre :

| Package | Contenu de `GenericFunctions.ts` |
| --- | --- |
| Générique | base commune + `frappeMethodRequest` + `frappeRunDocMethod` (route `/api/resource/…`) + `frappeMethodCall` |
| CRM | base commune, sans `frappeMethodRequest` |
| Helpdesk | base commune + `frappeMethodRequest` + `frappeRunDocMethod` (route `/api/resource/…`) |
| HRMS | base commune + `frappeMethodRequest` (enveloppe `{ "message": … }` de `/api/method/`) |
| Insights | base commune + `frappeMethodRequest` + `frappeRunDocMethod` (route `/api/method/frappe.handler.run_doc_method`) |
| Learning | base commune + `frappeMethodRequest` |
| Lending | base commune + `frappeMethodRequest` |

La base commune — `normalizeSiteUrl`, `parseFrappeError`, `serializeQuery`,
`frappeApiRequest`, `frappeApiRequestAllItems` — est **identique dans les sept packages**,
vérifiée par empreinte le 04/08/2026. Un correctif qui la touche concerne donc les sept ; un
ajout de helper ne concerne que le nœud qui en a besoin.

Attention : les deux `frappeRunDocMethod` **ne sont pas interchangeables**. Celui du
Helpdesk — dont le nœud générique reprend la copie — poste sur
`/api/resource/{doctype}/{name}` avec `run_method` dans le corps, ce qui exige la permission
`write` sur le document ; celui d'Insights poste sur
`/api/method/frappe.handler.run_doc_method`, qui ne demande que `read` et préserve le typage
JSON des arguments. Les deux routes existent bel et bien : `run_doc_method` n'a pas de
décorateur `@frappe.whitelist()`, mais `frappe/handler.py` l'exempte nommément
(`if method != run_doc_method:`), sur les branches `version-15`, `version-16` et `develop`.
Le nommer par son **chemin complet** : le nom court passe par un raccourci que
`frappe/handler.py` déprécie à chaque appel et supprime en v17.


### 3. Déclarer le nœud dans `package.json`

Le credential reste déclaré une seule fois, quel que soit le nombre de nœuds du package :

```json
{
	"n8n": {
		"credentials": ["dist/credentials/FrappeApi.credentials.js"],
		"nodes": [
			"dist/nodes/FrappeInsights/FrappeInsights.node.js",
			"dist/nodes/FrappeLms/FrappeLms.node.js"
		]
	}
}
```

## Côté utilisateur

Dans n8n, une instance de credential « Frappe API » configurée pour un site est
sélectionnable depuis n'importe quel nœud Frappe. Un utilisateur qui gère plusieurs sites
crée une instance par site (« Frappe – prod », « Frappe – recette »), pas une par
application.

## Compatibilité à préserver

Le nom interne `frappeApi` et les noms de champs `siteUrl`, `apiKey`, `apiSecret` font
partie du contrat public : les workflows enregistrés y font référence. Les renommer
casserait les credentials déjà configurés chez les utilisateurs. Un champ **ajouté**
(par exemple un token alternatif) doit donc être optionnel et laisser le comportement
actuel inchangé par défaut.
