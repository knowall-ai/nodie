const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SOFA_BACKGROUNDS, SOFA_PICTURES, sofaConfigPath, parseSofaUi, readSofaAppearance, watchSofaAppearance } = require('../../lib/sofa-appearance');

const NONE = { theme: null, background: null };
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nodie-sofa-'));

test('config path follows XDG_CONFIG_HOME, else ~/.config', () => {
    assert.equal(sofaConfigPath({ XDG_CONFIG_HOME: '/x/conf' }, '/home/u'), '/x/conf/sofa-launcher/config.toml');
    assert.equal(sofaConfigPath({}, '/home/u'), '/home/u/.config/sofa-launcher/config.toml');
    assert.equal(sofaConfigPath({ XDG_CONFIG_HOME: 'relative' }, '/home/u'), '/home/u/.config/sofa-launcher/config.toml', 'a relative XDG path is ignored, as the spec requires');
});

test('reads both themes and a picture or gradient background from [ui]', () => {
    assert.deepEqual(parseSofaUi('[ui]\ntheme = "knowall"\nbackground = "planet"\n'), { theme: 'knowall', background: 'planet' });
    assert.deepEqual(parseSofaUi('[ui]\r\nbackground = \'smoke-right\'  # picked on the TV\r\ntheme="nodie"\r\n'), { theme: 'nodie', background: 'smoke-right' });
    // Sofa's seeded file: comments, other keys and tables around [ui].
    const seeded = '# Sofa\n\n[ui]\ndefaultBrowser = "edge"\n# Appearance\ntheme = "nodie"\nbackground = "dot-grid"\n\n[[apps]]\nid = "x"\ntheme = "knowall"\nbackground = "nebula"\n\n[buttons]\nbackground = "planet"\n';
    assert.deepEqual(parseSofaUi(seeded), { theme: 'nodie', background: 'dot-grid' });
});

test('keys outside [ui], missing keys and unknown ids fall back to Nod.ie\'s own look', () => {
    assert.deepEqual(parseSofaUi('theme = "nodie"\nbackground = "planet"\n'), NONE);
    assert.deepEqual(parseSofaUi('[ui]\ndefaultBrowser = "edge"\n'), NONE);
    assert.deepEqual(parseSofaUi('[ui]\ntheme = "purple"\nbackground = "planet"\n'), { theme: null, background: 'planet' });
    assert.deepEqual(parseSofaUi('[ui]\ntheme = "nodie"\nbackground = "aurora"\n'), { theme: 'nodie', background: null });
    assert.deepEqual(parseSofaUi('[ui]\nbackground = "PLANET"\n'), NONE, 'ids are exact');
});

test('malformed text never throws and yields only values it is sure of', () => {
    for (const text of ['', '\u0000\u0001garbage', '[ui\ntheme = "nodie"', '[ui]\ntheme = nodie\nbackground = "planet', '[ui]\nbackground = "planet" trailing\n', '[ui]\ntheme = ["nodie"]\n', null, 42]) {
        assert.doesNotThrow(() => parseSofaUi(text));
        assert.deepEqual(parseSofaUi(text), NONE, String(text));
    }
});

test('reading: present, absent, unreadable or oversized files', async () => {
    const dir = temp(), file = path.join(dir, 'config.toml');
    assert.deepEqual(await readSofaAppearance(file), NONE, 'absent');
    fs.writeFileSync(file, '[ui]\ntheme = "knowall"\nbackground = "horizon"\n');
    assert.deepEqual(await readSofaAppearance(file), { theme: 'knowall', background: 'horizon' });
    fs.rmSync(file); fs.mkdirSync(file);
    assert.deepEqual(await readSofaAppearance(file), NONE, 'a directory is not a config file');
    fs.rmdirSync(file); fs.writeFileSync(file, '[ui]\nbackground = "planet"\n' + '#'.repeat(300 * 1024));
    assert.deepEqual(await readSofaAppearance(file), NONE, 'oversized');
});

test('watching follows Sofa\'s atomic rename, deletion and a directory created later', async () => {
    const root = temp(), dir = path.join(root, 'sofa-launcher'), file = path.join(dir, 'config.toml');
    const seen = [];
    let wake;
    const next = () => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error(`timed out after ${JSON.stringify(seen)}`)), 4000); wake = value => { clearTimeout(timer); resolve(value); }; });
    const save = text => { fs.writeFileSync(path.join(dir, '.config.toml.tmp'), text); fs.renameSync(path.join(dir, '.config.toml.tmp'), file); };
    let pending = next();
    const watcher = watchSofaAppearance(file, value => { seen.push(value); wake?.(value); }, { debounceMs: 20, pollMs: 100 });
    try {
        assert.deepEqual(await pending, NONE, 'initial value without a directory');
        pending = next(); fs.mkdirSync(dir); save('[ui]\ntheme = "knowall"\nbackground = "planet"\n');
        assert.deepEqual(await pending, { theme: 'knowall', background: 'planet' });
        pending = next(); save('[ui]\ntheme = "nodie"\nbackground = "smoke-right"\n');
        assert.deepEqual(await pending, { theme: 'nodie', background: 'smoke-right' });
        const before = seen.length;
        save('[ui]\ntheme = "nodie"\nbackground = "smoke-right"\n# comment only\n');
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.equal(seen.length, before, 'an unchanged appearance is not re-sent');
        pending = next(); fs.rmSync(file);
        assert.deepEqual(await pending, NONE);
    } finally { watcher.close(); }
});

test('the id list, ported CSS rules and copied pictures are in step', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../sofa-backdrops.css'), 'utf8');
    const ruled = [...css.matchAll(/\[data-sofa-background="([^"]+)"\]/g)].map(match => match[1]);
    assert.deepEqual([...new Set(ruled)], [...SOFA_BACKGROUNDS]);
    assert.equal(SOFA_BACKGROUNDS.length, 12);
    const pictures = [...css.matchAll(/url\('assets\/backgrounds\/([a-z-]+)\.jpg'\)/g)].map(match => match[1]);
    assert.deepEqual(pictures, [...SOFA_PICTURES]);
    for (const id of SOFA_PICTURES) assert.ok(fs.statSync(path.join(__dirname, `../../assets/backgrounds/${id}.jpg`)).size > 10000, id);
    assert.deepEqual(fs.readdirSync(path.join(__dirname, '../../assets/backgrounds')).sort(), SOFA_PICTURES.map(id => `${id}.jpg`).sort());
});
