const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { displayKeepAwake, applySecondLaunch } = require('../../lib/launch-flags');

function fakeBlocker() {
    const started = new Set(); let next = 1; const calls = [];
    return { calls, started, start(type) { calls.push(['start', type]); const id = next++; started.add(id); return id; }, stop(id) { calls.push(['stop', id]); started.delete(id); }, isStarted: id => started.has(id) };
}

test('keep-awake starts at most one blocker and stops it on quit', () => {
    const blocker = fakeBlocker(), app = new EventEmitter();
    const keepAwake = displayKeepAwake(blocker, app);
    const id = keepAwake();
    assert.equal(keepAwake(), id);
    assert.deepEqual(blocker.calls, [['start', 'prevent-display-sleep']]);
    app.emit('will-quit');
    assert.deepEqual(blocker.calls.at(-1), ['stop', id]);
    assert.equal(blocker.started.size, 0);
});

test('keep-awake restarts if the blocker was stopped elsewhere', () => {
    const blocker = fakeBlocker(), app = new EventEmitter();
    const keepAwake = displayKeepAwake(blocker, app);
    const first = keepAwake(); blocker.stop(first);
    assert.notEqual(keepAwake(), first);
    assert.equal(blocker.started.size, 1);
});

function fakeWindow() {
    const calls = [];
    return { calls, isDestroyed: () => false, isMinimized: () => true, restore: () => calls.push('restore'), show: () => calls.push('show'), focus: () => calls.push('focus') };
}
test('forwarded fullscreen requests a restart without changing a compact window', () => {
    const window = fakeWindow(), notices = []; let awake = 0;
    applySecondLaunch(['nodie', '--fullscreen', '--keep-awake'], { window, tvMode: false, keepAwake: () => awake++, notify: message => notices.push(message) });
    assert.deepEqual(window.calls, ['restore', 'show', 'focus']);
    assert.deepEqual(notices, ['Restart Nod.ie with --fullscreen to use TV mode']);
    assert.equal(awake, 1);
});

test('plain launches and fullscreen forwarded to TV mode just show and focus', () => {
    for (const [argv, tvMode] of [[['nodie'], false], [['nodie'], true], [['nodie', '--fullscreen'], true]]) {
        const window = fakeWindow(); let awake = 0;
        applySecondLaunch(argv, { window, tvMode, keepAwake: () => awake++, notify: () => assert.fail('Unexpected notice') });
        assert.deepEqual(window.calls, ['restore', 'show', 'focus']);
        assert.equal(awake, 0);
    }
});

test('keep-awake still applies before the window exists', () => {
    let awake = 0;
    applySecondLaunch(['nodie', '--keep-awake'], { window: null, keepAwake: () => awake++ });
    assert.equal(awake, 1);
});
