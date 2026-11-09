/** Per-user and packaged-app paths shared by the desktop process and Node scripts. */
const os = require('node:os');
const path = require('node:path');

// Matches Electron's Linux appData (XDG config home) plus the fixed app name, so a
// packaged build keeps using the same settings, history and journal as a checkout.
function configDir(env = process.env) {
    const base = env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.join(os.homedir(), '.config');
    return path.join(base, 'nodie');
}

// Development keeps reading the checkout's .env; packaged builds never contain one,
// so they fall through to the per-user file. NODIE_ENV_FILE overrides both.
function envFile({ appDir, env = process.env, exists = require('node:fs').existsSync } = {}) {
    if (env.NODIE_ENV_FILE) return env.NODIE_ENV_FILE;
    const local = appDir && path.join(appDir, '.env');
    if (local && !isPackaged(appDir) && exists(local)) return local;
    return path.join(configDir(env), '.env');
}

// The backend container reads this directory read-only; a shared host can point it
// outside the desktop user's home (for example /var/lib/nodie/events).
function eventsDir(value, env = process.env) {
    if (!value) return path.join(configDir(env), 'events');
    if (!path.isAbsolute(value)) throw new Error('NODIE_EVENTS_DIR must be an absolute path');
    return path.normalize(value);
}

function isPackaged(dir) {
    return dir.split(/[\\/]/).includes('app.asar');
}

// External interpreters (python3) cannot read inside app.asar; electron-builder
// unpacks those scripts beside it.
function unpacked(file) {
    return file.replace(/([\\/])app\.asar(?=[\\/]|$)/, '$1app.asar.unpacked');
}

module.exports = { configDir, envFile, eventsDir, isPackaged, unpacked };
