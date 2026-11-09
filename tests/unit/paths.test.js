const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { configDir, envFile, eventsDir, isPackaged, unpacked } = require('../../lib/paths');

const home = path.join(os.homedir(), '.config', 'nodie');

test('config directory follows XDG_CONFIG_HOME only when absolute', () => {
    assert.equal(configDir({}), home);
    assert.equal(configDir({ XDG_CONFIG_HOME: '/srv/cfg' }), path.join('/srv/cfg', 'nodie'));
    assert.equal(configDir({ XDG_CONFIG_HOME: 'relative' }), home);
});

test('development keeps the checkout .env when it exists', () => {
    const appDir = '/work/nodie';
    assert.equal(envFile({ appDir, env: {}, exists: () => true }), path.join(appDir, '.env'));
    assert.equal(envFile({ appDir, env: {}, exists: () => false }), path.join(home, '.env'));
});

test('packaged builds read only the per-user .env', () => {
    const appDir = '/opt/nodie/resources/app.asar';
    assert.equal(envFile({ appDir, env: {}, exists: () => true }), path.join(home, '.env'));
    assert.equal(envFile({ appDir, env: { NODIE_ENV_FILE: '/etc/nodie.env' }, exists: () => true }), '/etc/nodie.env');
});

test('events directory defaults to the user config and rejects relative overrides', () => {
    assert.equal(eventsDir(undefined, {}), path.join(home, 'events'));
    assert.equal(eventsDir('/var/lib/nodie/events/'), path.normalize('/var/lib/nodie/events/'));
    assert.throws(() => eventsDir('var/lib/nodie'), /absolute/);
});

test('asar paths are mapped to the unpacked directory for external interpreters', () => {
    assert.equal(isPackaged('/x/resources/app.asar/lib'), true);
    assert.equal(isPackaged('/x/nodie/lib'), false);
    assert.equal(unpacked('/x/resources/app.asar/scripts/a.py'), '/x/resources/app.asar.unpacked/scripts/a.py');
    assert.equal(unpacked('/x/resources/app.asar'), '/x/resources/app.asar.unpacked');
    assert.equal(unpacked('/x/nodie/scripts/a.py'), '/x/nodie/scripts/a.py');
});
