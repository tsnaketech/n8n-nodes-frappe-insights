import { describe, expect, it } from 'vitest';

import { FrappeApi } from './FrappeApi.credentials';

describe('FrappeApi credential', () => {
	it('defines the shared Frappe API credential contract', () => {
		const credential = new FrappeApi();

		expect(credential.name).toBe('frappeApi');
		expect(credential.displayName).toBe('Frappe API');
		expect(credential.icon).toEqual({
			light: 'file:../icons/frappe.svg',
			dark: 'file:../icons/frappe.dark.svg',
		});
		expect(credential.authenticate.properties.headers).toEqual({
			Authorization: '=token {{$credentials.apiKey}}:{{$credentials.apiSecret}}',
		});
	});

	it('tests the Frappe API from the site root', () => {
		const credential = new FrappeApi();
		const { request } = credential.test;

		expect(request.url).toBe('/api/method/frappe.auth.get_logged_user');
		expect(request.baseURL).toContain('$credentials.siteUrl.trim()');
		expect(request.baseURL).toContain('helpdesk');
		expect(request.baseURL).toContain('desk');
	});
});
