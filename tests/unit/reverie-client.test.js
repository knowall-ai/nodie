const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { reverieTransport } = require('../../lib/reverie-client');

function fakeChild() {
    const child = { sent: [], killed: false, env: null };
    child.fork = (script, env) => {
        child.script = script; child.env = env;
        return { post: m => child.sent.push(m), onMessage: cb => { child.message = cb; }, onExit: cb => { child.exit = cb; }, kill: () => { child.killed = true; child.exit(); } };
    };
    return child;
}

test('waits for the host ready signal, then relays MCP messages both ways', async () => {
    const child = fakeChild();
    const transport = reverieTransport({ NEO4J_URI: 'bolt://db' }, { fork: child.fork });
    assert.equal(child.script, path.join(__dirname, '../../lib/reverie-host.js'));
    assert.deepEqual(child.env, { NEO4J_URI: 'bolt://db' });
    const received = [];
    transport.onmessage = m => received.push(m);
    let started = false;
    const start = transport.start().then(() => { started = true; });
    await new Promise(r => setImmediate(r));
    assert.equal(started, false);
    child.message({ nodie: 'ready' });
    await start;
    await transport.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    child.message({ jsonrpc: '2.0', id: 1, result: { tools: [] } });
    assert.deepEqual(child.sent, [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]);
    assert.deepEqual(received, [{ jsonrpc: '2.0', id: 1, result: { tools: [] } }]);
});

test('a host that exits or never becomes ready fails start and closes', async () => {
    const child = fakeChild();
    const transport = reverieTransport({}, { fork: child.fork });
    let closed = false;
    transport.onclose = () => { closed = true; };
    child.exit();
    await assert.rejects(transport.start(), /exited/);
    assert.equal(closed, true);
    await assert.rejects(transport.send({}), /closed/);

    const slow = reverieTransport({}, { fork: fakeChild().fork, readyTimeoutMs: 5 });
    await assert.rejects(slow.start(), /did not start/);
});

test('close kills the child', async () => {
    const child = fakeChild();
    const transport = reverieTransport({}, { fork: child.fork });
    child.message({ nodie: 'ready' });
    await transport.start();
    await transport.close();
    assert.equal(child.killed, true);
});
