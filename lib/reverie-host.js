/**
 * Reverie memory server in an isolated child process: an Electron utility process
 * (desktop) or a Node fork (web mode). Messages are MCP JSON-RPC objects; stdio is
 * discarded by the parent so server logs, credentials and memory contents stay here.
 */
const port = process.parentPort;
const post = message => (port ? port.postMessage(message) : process.send(message));
const listen = callback => (port ? port.on('message', event => callback(event.data)) : process.on('message', callback));

(async () => {
    const { createMcpServer } = await import('@knowall-ai/reverie/build/server.js');
    const { Neo4jClient } = await import('@knowall-ai/reverie/build/neo4j-client.js');
    const { NEO4J_URI: uri, NEO4J_USERNAME: username, NEO4J_PASSWORD: password, NEO4J_DATABASE: database } = process.env;
    const neo4j = uri && username && typeof password === 'string' && password !== '' ? new Neo4jClient(uri.trim(), username.trim(), password, database?.trim() || undefined) : null;
    // Embeddings stay off (keyword search), matching the previous REVERIE_EMBEDDINGS=none.
    const server = createMcpServer(neo4j, null);
    server.onerror = () => {};
    const transport = {
        async start() {},
        async send(message) { post(message); },
        async close() { await neo4j?.close().catch(() => {}); process.exit(0); },
    };
    listen(message => transport.onmessage?.(message));
    await server.connect(transport);
    post({ nodie: 'ready' });
})().catch(() => process.exit(1));
