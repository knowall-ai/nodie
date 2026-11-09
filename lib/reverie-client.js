/**
 * MCP client transport to lib/reverie-host.js. The desktop uses an Electron utility
 * process, so the packaged binary never needs ELECTRON_RUN_AS_NODE (disabled by its
 * fuses); plain Node (web mode, tests) uses child_process.fork.
 */
const path = require('node:path');

function reverieTransport(env, { readyTimeoutMs = 10000, fork } = {}) {
    const script = path.join(__dirname, 'reverie-host.js');
    const child = fork ? fork(script, env) : spawnChild(script, env);
    let settle;
    const ready = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    const timer = setTimeout(() => settle.reject(new Error('Reverie did not start')), readyTimeoutMs);
    timer.unref?.();
    let closed = false;
    const transport = {
        start() { return ready; },
        async send(message) { if (closed) throw new Error('Reverie is closed'); child.post(message); },
        async close() { if (!closed) child.kill(); },
    };
    child.onMessage(message => {
        if (message && message.nodie === 'ready') { clearTimeout(timer); settle.resolve(); return; }
        transport.onmessage?.(message);
    });
    child.onExit(() => {
        closed = true; clearTimeout(timer);
        settle.reject(new Error('Reverie exited'));
        transport.onclose?.();
    });
    return transport;
}

function spawnChild(script, env) {
    if (process.versions.electron && process.type === 'browser') {
        const child = require('electron').utilityProcess.fork(script, [], { env, stdio: 'ignore', serviceName: 'Nod.ie memory' });
        return { post: m => child.postMessage(m), onMessage: cb => child.on('message', cb), onExit: cb => child.once('exit', cb), kill: () => child.kill() };
    }
    const child = require('node:child_process').fork(script, [], { env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    return { post: m => child.send(m), onMessage: cb => child.on('message', cb), onExit: cb => child.once('exit', cb), kill: () => child.kill() };
}

module.exports = { reverieTransport };
