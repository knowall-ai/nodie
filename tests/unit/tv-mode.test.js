const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');
const { applySecondLaunch, displayKeepAwake } = require('../../lib/launch-flags');

// Exercise the actual main-process factory without starting Electron or services.
function desktop(tvMode = false, platform = 'linux') {
    const windows = [], trackers = [], keys = new Map();
    const source = fs.readFileSync(require.resolve('../../main'), 'utf8');
    const factory = source.slice(source.indexOf('    function createMainWindow('), source.indexOf('    app.whenReady().then('));
    const screen = { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) };
    const settingsWindow = { setParentWindow(win) { this.parent = win; } };
    const context = vm.createContext({
        tvMode, mainWindow: null, pointerTracker: null, windowMode: null, settingsWindow,
        process: { platform, env: {} }, app: {}, logger: {}, dragTimer: null,
        stopDrag() {}, store: { get() {}, set() {} }, showSettings() {},
        globalShortcut: { register: (key, fn) => keys.set(key, fn), unregister: key => keys.delete(key) },
        Menu: { buildFromTemplate: items => ({ items, popup() {} }) },
        require(name) {
            if (name === 'electron') return { screen };
            if (name === './lib/window-controls') return require('../../lib/window-controls');
            if (name === './lib/window-hit-test') return { trackPointer() {
                const tracker = { stopped: false, stop() { this.stopped = true; }, setFullScreen() {} };
                trackers.push(tracker); return tracker;
            } };
            throw Error(name);
        },
        secureWindow(options) {
            const win = new EventEmitter();
            Object.assign(win, {
                options, bounds: { x: 0, y: 0, width: options.width, height: options.height },
                visible: true, destroyed: false, nativeFull: false,
                webContents: Object.assign(new EventEmitter(), { send() {} }),
                setAlwaysOnTop() {}, setResizable() {},
                getBounds() { return { ...this.bounds }; }, setBounds(bounds) { this.bounds = { ...bounds }; },
                setPosition(x, y) { Object.assign(this.bounds, { x, y }); },
                getPosition() { return [this.bounds.x, this.bounds.y]; },
                setFullScreen(value) { this.nativeFull = value; }, isFullScreen() { return this.nativeFull; },
                isVisible() { return this.visible; }, isDestroyed() { return this.destroyed; }, isMinimized() { return false; },
                show() { this.visible = true; this.emit('show'); }, hide() { this.visible = false; this.emit('hide'); }, focus() { this.focused = true; },
                destroy() { assert.fail('Mode changes must never destroy the window'); }
            });
            windows.push(win); return win;
        }
    });
    vm.runInContext(factory, context);
    return { context, windows, trackers, keys, create: () => context.createMainWindow() };
}

test('TV startup uses one normal window; Escape and all restore paths preserve it', () => {
    const d = desktop(true); d.create();
    const win = d.context.mainWindow;
    assert.equal(win.options.type, undefined);
    assert.equal(win.nativeFull, true);
    assert.equal(d.keys.has('Escape'), false);
    let prevented = false;
    win.webContents.emit('before-input-event', { preventDefault() { prevented = true; } }, { type: 'keyDown', key: 'Escape' });
    assert.equal(prevented, true);
    d.context.windowMode.action('restore');
    assert.equal(win.nativeFull, true);
    d.context.windowMode.action('tray');
    win.nativeFull = false;
    win.emit('leave-full-screen');
    assert.equal(win.nativeFull, true);
    assert.equal(win.isVisible(), false);
    assert.equal(d.context.windowMode.isFullscreen(), true);
    d.context.windowMode.action('show');
    assert.equal(win.isVisible(), true);
    assert.equal(d.context.mainWindow, win);
    assert.equal(d.windows.length, 1);
    assert.equal(d.trackers[0].stopped, false);
});

test('compact startup keeps existing dock and restores bounds without replacement', () => {
    const d = desktop(); d.create();
    const win = d.context.mainWindow;
    assert.equal(win.options.type, 'dock');
    win.setBounds({ x: -100, y: 70, width: 300, height: 300 });
    d.context.windowMode.action('fullscreen');
    assert.equal(win.options.type, 'dock');
    d.keys.get('Escape')();
    win.emit('leave-full-screen');
    assert.deepEqual(win.getBounds(), { x: -100, y: 70, width: 300, height: 300 });
    assert.equal(d.context.windowMode.isFullscreen(), false);
    assert.equal(d.windows.length, 1);
});

test('repeated second launches retain the renderer and a single blocker in either mode', () => {
    for (const tvMode of [false, true]) {
        const d = desktop(tvMode); d.create();
        const win = d.context.mainWindow;
        const notices = [];
        const app = new EventEmitter(); let starts = 0, stops = 0;
        const keepAwake = displayKeepAwake({ start() { return ++starts; }, isStarted: () => true, stop() { stops++; } }, app);
        win.hide();
        for (let i = 0; i < 2; i++) applySecondLaunch(['nodie', '--fullscreen', '--keep-awake'], {
            window: win, tvMode, keepAwake, notify: message => notices.push(message)
        });
        assert.equal(win.isVisible(), true);
        assert.equal(win.focused, true);
        assert.equal(win.nativeFull, tvMode);
        assert.equal(d.windows.length, 1);
        assert.equal(d.trackers[0].stopped, false);
        assert.equal(notices.length, tvMode ? 0 : 2);
        assert.equal(starts, 1);
        app.emit('will-quit'); assert.equal(stops, 1);
    }
});
