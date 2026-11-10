const WebSocket = require('ws');
const { validateSay } = require('./announcements');

// The small subset of MessagePack used by moshi TTS: string maps and float arrays.
function packText(text) {
    const string = value => {
        const bytes = Buffer.from(value);
        if (bytes.length < 32) return Buffer.concat([Buffer.from([0xa0 | bytes.length]), bytes]);
        const header = Buffer.alloc(3); header[0] = 0xda; header.writeUInt16BE(bytes.length, 1);
        return Buffer.concat([header, bytes]);
    };
    return Buffer.concat([Buffer.from([0x82]), string('type'), string('Text'), string('text'), string(text)]);
}
function unpack(bytes) {
    let at = 0;
    function read(depth = 0) {
        if (depth > 4 || at >= bytes.length) throw Error('Invalid TTS packet');
        const tag = bytes[at++];
        const length = size => { const n = bytes.readUIntBE(at, size); at += size; return n; };
        const string = n => { if (at + n > bytes.length) throw Error('Invalid TTS string'); const s = bytes.toString('utf8', at, at + n); at += n; return s; };
        const array = n => { if (n > 240000 || n > bytes.length - at) throw Error('Invalid TTS array'); return Array.from({ length: n }, () => read(depth + 1)); };
        const map = n => { if (n > 16) throw Error('Invalid TTS map'); const result = Object.create(null); for (let i = 0; i < n; i++) { const key = read(depth + 1); if (typeof key !== 'string') throw Error('Invalid TTS key'); result[key] = read(depth + 1); } return result; };
        if (tag <= 0x7f) return tag;
        if (tag >= 0xe0) return tag - 256;
        if ((tag & 0xe0) === 0xa0) return string(tag & 31);
        if ((tag & 0xf0) === 0x80) return map(tag & 15);
        if ((tag & 0xf0) === 0x90) return array(tag & 15);
        if (tag === 0xd9) return string(length(1));
        if (tag === 0xda) return string(length(2));
        if (tag === 0xdb) return string(length(4));
        if (tag === 0xdc) return array(length(2));
        if (tag === 0xdd) return array(length(4));
        if (tag === 0xca || tag === 0xcb) { const n = tag === 0xca ? bytes.readFloatBE(at) : bytes.readDoubleBE(at); at += tag === 0xca ? 4 : 8; return n; }
        throw Error('Unsupported TTS packet');
    }
    const result = read();
    if (at !== bytes.length) throw Error('Trailing TTS bytes');
    return result;
}
function wav(pcm) {
    const out = Buffer.alloc(44 + pcm.length * 2);
    out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
    out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
    out.writeUInt32LE(24000, 24); out.writeUInt32LE(48000, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
    out.write('data', 36); out.writeUInt32LE(pcm.length * 2, 40);
    pcm.forEach((sample, i) => out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2));
    return out;
}
async function synthesize(text, timeoutMs, { config, fetchImpl = fetch, Socket = WebSocket }) {
    text = validateSay(text);
    if (config('VOICE_MODE') === 'local') {
        const url = new URL('/api/tts', config('LOCAL_TTS_URL'));
        const response = await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs))), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language: 'en', speaker: config('LOCAL_TTS_VOICE', 'af_heart'), speed: Number(config('LOCAL_TTS_SPEED', '1.06')) }) });
        if (!response.ok) throw Error('TTS unavailable');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length < 44 || bytes.length > 3 * 1024 * 1024 || bytes.toString('ascii', 0, 4) !== 'RIFF') throw Error('Invalid TTS audio');
        return bytes;
    }
    const url = new URL('/api/tts_streaming', config('KYUTAI_TTS_URL', 'ws://127.0.0.1:8089'));
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password) throw Error('Invalid TTS URL');
    url.searchParams.set('format', 'PcmMessagePack');
    url.searchParams.set('voice', config('VOICE_MODEL', 'unmute-prod-website/default_voice.wav'));
    return new Promise((resolve, reject) => {
        const socket = new Socket(url, { headers: { 'kyutai-api-key': 'public_token' }, maxPayload: 2 * 1024 * 1024 });
        const pcm = []; let ready = false, settled = false;
        const finish = error => { if (settled) return; settled = true; clearTimeout(timer); socket.terminate(); error ? reject(error) : resolve(wav(pcm)); };
        const timer = setTimeout(() => finish(Error('TTS timed out')), timeoutMs);
        socket.on('error', () => finish(Error('TTS unavailable')));
        socket.on('message', data => {
            try {
                const message = unpack(Buffer.from(data));
                if (message.type === 'Error') throw Error('TTS unavailable');
                if (message.type === 'Ready' && !ready) {
                    ready = true;
                    socket.send(packText(text));
                    socket.send(Buffer.from([0x81, 0xa4, 0x74, 0x79, 0x70, 0x65, 0xa3, 0x45, 0x6f, 0x73]));
                } else if (message.type === 'Audio' && ready) {
                    if (!Array.isArray(message.pcm) || message.pcm.some(x => typeof x !== 'number' || !Number.isFinite(x)) || pcm.length + message.pcm.length > 24000 * 30) throw Error('Invalid TTS audio');
                    for (const sample of message.pcm) pcm.push(sample);
                }
            } catch (error) { finish(error); }
        });
        socket.on('close', code => finish([1000, 1001, 1005].includes(code) && pcm.length ? null : Error('TTS unavailable')));
    });
}
module.exports = { synthesize, packText, unpack };
