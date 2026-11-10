/**
 * Read-only bridge to Sofa Launcher's appearance settings, used only in --tv mode.
 *
 * Sofa Launcher is the source of truth. SOFA_BACKGROUNDS mirrors BACKGROUNDS in
 * sofa-launcher/src/shared/backgrounds.ts and the rules in sofa-backdrops.css mirror
 * sofa-launcher/src/renderer/src/app.css; keep all three in step when Sofa adds,
 * removes or restyles a background (tests/unit/sofa-appearance.test.js checks the CSS
 * and pictures against this list). This is the only list of ids in Nod.ie.
 *
 * Nod.ie never writes Sofa's config file.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SOFA_BACKGROUNDS = Object.freeze(['midnight', 'corner-glow', 'horizon-glow', 'brand-wash', 'dot-grid', 'near-black', 'horizon', 'ribbons', 'smoke-left', 'smoke-right', 'nebula', 'planet']);
// Backgrounds that are pictures in assets/backgrounds/<id>.jpg (copied from Sofa Launcher).
const SOFA_PICTURES = Object.freeze(['horizon', 'ribbons', 'smoke-left', 'smoke-right', 'nebula', 'planet']);
const SOFA_THEMES = Object.freeze(['knowall', 'nodie']);
const NONE = Object.freeze({ theme: null, background: null });
const MAX_BYTES = 256 * 1024;

function sofaConfigPath(env = process.env, home = os.homedir()) {
    const base = env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.join(home, '.config');
    return path.join(base, 'sofa-launcher', 'config.toml');
}

// TOML basic ("…") or literal ('…') string, optionally followed by a comment.
const STRING_VALUE = /^\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*(?:#.*)?$/;
const TABLE_HEADER = /^\s*\[\[?\s*([^\]]*?)\s*\]\]?\s*(?:#.*)?$/;

/**
 * A deliberately small, tolerant reader: only the string keys theme and background in the
 * top-level [ui] table. Anything it does not understand is ignored rather than guessed.
 */
function parseSofaUi(text) {
    if (typeof text !== 'string') return { ...NONE };
    const found = {};
    let table = '';
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/^﻿/, '');
        if (/^\s*(#|$)/.test(line)) continue;
        const header = line.match(TABLE_HEADER);
        if (header) { table = line.trim().startsWith('[[') ? `[[${header[1]}]]` : header[1].replace(/\s+/g, ''); continue; }
        if (table !== 'ui') continue;
        const key = line.match(/^\s*("?)(theme|background)\1(.*)$/);
        if (!key || key[2] in found) continue;
        const value = key[3].match(STRING_VALUE);
        if (value) found[key[2]] = value[1] ?? value[2];
    }
    return {
        theme: SOFA_THEMES.includes(found.theme) ? found.theme : null,
        background: SOFA_BACKGROUNDS.includes(found.background) ? found.background : null
    };
}

async function readSofaAppearance(file, { fs: fsp = fs.promises } = {}) {
    try {
        const stat = await fsp.stat(file);
        if (!stat.isFile() || stat.size > MAX_BYTES) return { ...NONE };
        return parseSofaUi(await fsp.readFile(file, 'utf8'));
    } catch {
        return { ...NONE };
    }
}

/**
 * Report the appearance now and whenever it changes. Sofa saves by writing a temporary file
 * and renaming it over config.toml, so the directory is watched (not the file's inode), with
 * a slow re-stat poll as a fallback for a missing directory or a failed watcher.
 */
function watchSofaAppearance(file, onChange, { debounceMs = 150, pollMs = 2000, fs: fsm = fs } = {}) {
    let last, timer = null, watcher = null, closed = false;
    const emit = async () => {
        timer = null;
        const next = await readSofaAppearance(file, { fs: fsm.promises });
        if (closed) return;
        const key = JSON.stringify(next);
        if (key === last) return;
        last = key;
        onChange(next);
    };
    const schedule = () => { if (closed) return; clearTimeout(timer); timer = setTimeout(emit, debounceMs); };
    const watchDirectory = () => {
        if (watcher || closed) return;
        try {
            watcher = fsm.watch(path.dirname(file), { persistent: false }, (_type, name) => {
                if (!name || String(name) === path.basename(file)) schedule();
            });
            watcher.on('error', () => { watcher?.close(); watcher = null; schedule(); });
        } catch { watcher = null; }
    };
    // The file appeared, vanished or changed: re-open the directory watcher (it may be new).
    const poll = () => { watcher?.close(); watcher = null; watchDirectory(); schedule(); };
    watchDirectory();
    fsm.watchFile(file, { persistent: false, interval: pollMs }, poll);
    void emit();
    return {
        close() {
            closed = true; clearTimeout(timer);
            watcher?.close(); watcher = null;
            fsm.unwatchFile(file, poll);
        }
    };
}

module.exports = { SOFA_BACKGROUNDS, SOFA_PICTURES, SOFA_THEMES, sofaConfigPath, parseSofaUi, readSofaAppearance, watchSofaAppearance };
