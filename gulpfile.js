const { dest, parallel, src } = require('gulp');

function copyNodeIcons() {
	return src('nodes/**/*.{png,svg}').pipe(dest('dist/nodes'));
}

function copyCredentialAssets() {
	return src('credentials/**/*.{png,svg}', { base: 'credentials', allowEmpty: true }).pipe(
		dest('dist/credentials'),
	);
}

function copyIcons() {
	return src('icons/**/*.{png,svg}', { base: 'icons' }).pipe(dest('dist/icons'));
}

exports['build:icons'] = parallel(copyNodeIcons, copyCredentialAssets, copyIcons);
