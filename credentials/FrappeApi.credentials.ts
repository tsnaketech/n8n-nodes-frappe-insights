import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * Frappe application paths mounted as single-page apps. Mirror of `SPA_MOUNT_PATHS` in this
 * package's `GenericFunctions.ts`, duplicated on purpose: a credential is loaded without the
 * node and cannot import the transport, so this file has to stay self-contained — which is
 * also what lets it be copied verbatim into the sibling Frappe packages.
 *
 * `desk` is the Frappe v16 mount for the Desk, which lived at `app` up to v15. Both are
 * listed so the same credential works against either major version.
 *
 * Keep the two lists in sync — this one is an array, the expression below turns it into a
 * regex alternation.
 */
const SPA_MOUNT_PATHS = [
	'desk',
	'app',
	'crm',
	'helpdesk',
	'hrms',
	'hr',
	'roster',
	'lms',
	'insights',
	'builder',
];

/**
 * Site URL as the test request should use it: trailing slashes removed, and the application
 * path dropped from the first SPA mount onwards when the user pasted the URL their browser
 * displays (`https://site/desk/hrms`).
 *
 * Dropping it is not cosmetic. `/api/...` only exists at the site root; under an SPA mount
 * the request is caught by the front-end router, which answers **200 with the application's
 * HTML page** instead of an error (verified on Frappe 16.29.0). The `Guest` rule below then
 * finds no `message` key to compare, so the credential would be reported as valid — even
 * with completely wrong keys, and every subsequent request would fail. An *unknown* path is
 * harmless by comparison: it 404s.
 *
 * Truncating from the mount onwards, instead of stripping a single trailing segment, is what
 * makes v16 URLs work: the browser shows `https://site/desk/hrms`, and a document sits deeper
 * still at `https://site/desk/employee/HR-EMP-00001`.
 */
const SITE_URL_EXPRESSION =
	'={{$credentials.siteUrl.trim().replace(new RegExp("/+$"), "")' +
	`.replace(new RegExp("/(?:${SPA_MOUNT_PATHS.join('|')})(?:/.*)?$", "i"), "")}}`;

/**
 * Generic Frappe credential.
 *
 * Deliberately free of any product-specific notion: it targets a Frappe *site*, not an
 * application. The Frappe CRM, Helpdesk, HRMS, Insights, Learning and Lending nodes all
 * declare `{ name: 'frappeApi', required: true }` and share the same credential instance.
 * See docs/CREDENTIALS.md.
 *
 * The internal name `frappeApi` and the field names are identical to the ones shipped by the
 * `n8n-nodes-frappe-crm`, `-helpdesk`, `-hrms`, `-insights`, `-learning` and `-lending`
 * packages, on purpose: a user running several of them sees a single "Frappe API" credential
 * type and configures their site once. This whole file is duplicated verbatim across the six
 * packages — any change here has to be mirrored in all of them.
 */
export class FrappeApi implements ICredentialType {
	name = 'frappeApi';

	displayName = 'Frappe API';

	icon = { light: 'file:../icons/frappe.svg', dark: 'file:../icons/frappe.dark.svg' } as const;

	documentationUrl = 'https://docs.frappe.io/framework/user/en/api/rest';

	properties: INodeProperties[] = [
		{
			displayName: 'Site URL',
			name: 'siteUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://my-site.frappe.cloud',
			description:
				'Root URL of the Frappe site. The node appends /api/resource or /api/method itself. Pasting the URL the browser displays works too: the application path (/desk/hrms on v16, /app on v15, /crm, /helpdesk, /lms…) and the trailing slash are stripped.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			default: '',
			required: true,
			description:
				'Key generated from the Frappe user profile: Settings > API Access > Generate Keys',
			typeOptions: { password: true },
		},
		{
			displayName: 'API Secret',
			name: 'apiSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Secret shown only once, when the keys are generated',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=token {{$credentials.apiKey}}:{{$credentials.apiSecret}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: SITE_URL_EXPRESSION,
			url: '/api/method/frappe.auth.get_logged_user',
			method: 'GET',
			headers: { Accept: 'application/json' },
		},
		rules: [
			{
				// Frappe 15 answers 200 {"message":"Guest"} to an unauthenticated call. Frappe 16
				// raises a PermissionError (403) and therefore never reaches this rule; it is kept
				// for sites still on 15.
				type: 'responseSuccessBody',
				properties: {
					key: 'message',
					value: 'Guest',
					message:
						'Anonymous connection: the site answered but did not recognise the keys. Check the API Key and the API Secret.',
				},
			},
		],
	};
}
