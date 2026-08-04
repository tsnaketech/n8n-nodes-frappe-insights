import type { INodeProperties } from 'n8n-workflow';

import { documentIdField, getManyFields, operationsFor } from './CommonDescription';

/**
 * `Insights Team` groups users and the resources they may reach. Its two interesting
 * columns, `team_members` and `team_permissions`, are child tables (`Insights Team Member`
 * and `Insights Resource Permission`), not scalar fields.
 *
 * The node exposes the team itself and reads the tables back on Get — a `GET` on the
 * document returns them inline — but does not offer to write them: replacing a permission
 * table wholesale from a workflow is how a team silently loses its access. Membership is
 * managed from the Insights UI, or with an HTTP Request node against the same document if
 * a workflow really has to.
 */
export const teamDescription: INodeProperties[] = [
	operationsFor('team', 'team'),
	{
		displayName: 'Team Name',
		name: 'team_name',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: { resource: ['team'], operation: ['create'] } },
		description:
			'Name of the team. The doctype uses autoname field:team_name, so this name becomes the document identifier.',
	},
	documentIdField(
		'team',
		'The Frappe record\'s "name" field, which is the team name itself.',
	),
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { resource: ['team'], operation: ['update'] } },
		options: [
			{
				displayName: 'Team Name',
				name: 'team_name',
				type: 'string',
				default: '',
				description:
					'Rename the team. Frappe renames the document along with it, since the name derives from it.',
			},
		],
	},
	...getManyFields('team'),
];
