#!/usr/bin/env node
/**
 * Fail if a built Linux package contains environment files, private keys or likely
 * credentials. Given a .deb, also check its name, /opt/nodie payload, AppArmor profile
 * and that nothing it ships is group- or world-writable.
 */
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

let root = path.resolve(process.argv[2] || 'dist/linux-unpacked');
const forbiddenName = /(^|\/)(\.env(\..+)?|mcp\.json|.*\.pem|.*\.key|id_(rsa|ed25519))$/i;
const allowedName = /(^|\/)\.env\.example$/;
const secret = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\b(?:NEO4J_PASSWORD|HF_TOKEN|HUGGING_FACE_HUB_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY)\s*=\s*['"]?[^\s'"$]{6,}/,
    /\bhf_[A-Za-z0-9]{30,}\b/,
    /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/,
    /\bnsec1[02-9ac-hj-np-z]{50,}\b/,
];
const textExt = /\.(js|cjs|mjs|json|md|txt|html|css|py|sh|yml|yaml|toml|cfg|ini)$/i;
const problems = [];

function check(name, read) {
    if (forbiddenName.test(name) && !allowedName.test(name)) problems.push(`forbidden file: ${name}`);
    // Third-party packages are scanned for files only; their docs contain example keys.
    if (!textExt.test(name) || name.includes('node_modules/')) return;
    const text = read();
    if (text.length > 4e6) return;
    for (const pattern of secret) if (pattern.test(text)) problems.push(`possible secret (${pattern.source.slice(0, 24)}…): ${name}`);
}

function checkDeb(deb) {
    const { execFileSync } = require('node:child_process');
    const run = (...args) => execFileSync('dpkg-deb', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (run('--field', deb, 'Package').trim() !== 'nodie') problems.push('package name is not nodie');
    const entries = run('--contents', deb).trim().split('\n').map(line => { const f = line.split(/\s+/); return { mode: f[0], name: f.slice(5).join(' ').replace(/ -> .*$/, '') }; });
    for (const required of ['./opt/nodie/nodie', './opt/nodie/resources/apparmor-profile', './opt/nodie/resources/app.asar'])
        if (!entries.some(e => e.name === required)) problems.push(`missing ${required}`);
    for (const e of entries) if (e.mode[0] !== 'l' && (e.mode[5] === 'w' || e.mode[8] === 'w')) problems.push(`group/world-writable: ${e.mode} ${e.name}`);
    const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'nodie-deb-'));
    process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
    execFileSync('dpkg-deb', ['-x', deb, dir]);
    return dir;
}

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name), rel = path.relative(root, full).split(path.sep).join('/');
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.asar')) {
            for (const file of asar.listPackage(full)) {
                const inner = file.replace(/^[\\/]/, '').split(path.sep).join('/');
                let stat; try { stat = asar.statFile(full, inner); } catch { continue; }
                if (stat.files || stat.link) continue;
                check(`${rel}/${inner}`, () => stat.unpacked ? fs.readFileSync(path.join(full + '.unpacked', inner), 'utf8') : asar.extractFile(full, inner).toString('utf8'));
            }
        } else check(rel, () => fs.readFileSync(full, 'utf8'));
    }
}

if (!fs.existsSync(root)) { console.error(`No build at ${root}; run npm run dist first.`); process.exit(2); }
if (root.endsWith('.deb')) root = checkDeb(root);
walk(root);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`OK: no environment files or likely credentials in ${root}`);
