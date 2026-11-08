const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { normalize } = require('./lib/config-schema');
// Checkout .env in development; ~/.config/nodie/.env for packaged builds (see lib/paths.js).
const envPath = require('./lib/paths').envFile({ appDir: __dirname });
const env = { ...(fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {}), ...process.env };
const getConfig = (key, defaultValue = null) => env[key] || defaultValue;
const config = normalize(env);
for (const key of ['UNMUTE_BACKEND_HOST', 'UNMUTE_MCP_BACKEND_HOST', 'MUSETALK_HOST', 'UNMUTE_BACKEND_PORT', 'UNMUTE_MCP_BACKEND_PORT', 'MUSETALK_PORT', 'UNMUTE_MCP_BACKEND_URL', 'MUSETALK_URL', 'UNMUTE_BACKEND_HTTP', 'UNMUTE_MCP_BACKEND_HTTP', 'AVATAR_VIDEO_PATH']) config[key] = getConfig(key);
module.exports = { ...config, getConfig };
