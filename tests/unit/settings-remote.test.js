const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function setup(presentation = { layout: 'desktop' }, reject = false) {
    let keydown, closed = 0;
    const styles = [];
    const input = { matches: () => false, getBoundingClientRect: () => ({ x: 0, y: 0, width: 10, height: 10 }) };
    const document = {
        activeElement: input,
        addEventListener: (_name, handler) => { keydown = handler; },
        querySelectorAll: () => [],
        createElement: () => ({}), head: { append: style => styles.push(style) }
    };
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    vm.runInNewContext(fs.readFileSync('modules/settings-remote.js', 'utf8'), {
        document, window: { close: () => { closed++; }, nodie: { settingsPresentation: () => reject ? Promise.reject(Error('unavailable')) : pending } }
    });
    const press = key => {
        const event = { key, prevented: false, preventDefault() { this.prevented = true; } };
        keydown(event); return event;
    };
    assert.equal(press('Escape').prevented, false, 'wait for the presentation response');
    resolve(presentation);
    await new Promise(done => setImmediate(done));
    return { document, input, press, styles, closed: () => closed };
}

test('desktop settings leave Escape, arrows and Enter to native controls and retain focus rings', async () => {
    const s = await setup();
    for (const kind of ['select', 'input', 'textarea']) {
        s.input.matches = () => true;
        for (const key of ['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']) {
            assert.equal(s.press(key).prevented, false, `${kind}: ${key}`);
            assert.equal(s.document.activeElement, s.input);
        }
    }
    assert.equal(s.closed(), 0);
    assert.match(s.styles[0].textContent, /button:focus.*outline:4px/);
});

test('TV settings enable remote keys only for an explicit TV layout', async () => {
    const s = await setup({ layout: 'tv' });
    assert.equal(s.press('ArrowDown').prevented, true);
    assert.equal(s.press('Escape').prevented, true);
    assert.equal(s.closed(), 1);
    for (const presentation of [undefined, { layout: 'unknown' }]) {
        const other = await setup(presentation);
        assert.equal(other.press('Escape').prevented, false);
        assert.equal(other.closed(), 0);
    }
    const unavailable = await setup(null, true);
    assert.equal(unavailable.press('Escape').prevented, false);
});

test('settings presentation IPC restricts the sender and returns a whitelisted layout', () => {
    const source = fs.readFileSync('main.js', 'utf8');
    const dirname = path.resolve('.');
    const window = file => {
        const frame = { url: pathToFileURL(path.join(dirname, file)).href };
        return { isDestroyed: () => false, webContents: { mainFrame: frame } };
    };
    const settingsWindow = window('settings.html'), mainWindow = window('index.html');
    const sender = win => ({ sender: win.webContents, senderFrame: win.webContents.mainFrame });
    for (const launchMode of ['compact', 'fullscreen', 'tv']) {
        const handlers = new Map();
        const context = vm.createContext({ launchMode, settingsWindow, mainWindow, path, pathToFileURL, __dirname: dirname, ipcMain: { handle: (name, handler) => handlers.set(name, handler) } });
        vm.runInContext(source.slice(source.indexOf('    const isLocalFrame ='), source.indexOf('    function secureWindow(')), context);
        vm.runInContext(source.split('\n').find(line => line.includes("handle('settings-presentation'")), context);
        const handler = handlers.get('settings-presentation');
        const result = handler(sender(settingsWindow));
        assert.equal(result.layout, launchMode === 'compact' ? 'desktop' : 'tv');
        assert.throws(() => handler(sender(mainWindow)), /Untrusted IPC sender/);
        assert.throws(() => handler({ ...sender(settingsWindow), senderFrame: { url: 'https://example.com' } }), /Untrusted IPC sender/);
    }
});
