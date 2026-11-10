/** Local command input and a single bounded announcement slot. No conversation APIs. */
function validateSay(value) {
    if (typeof value !== 'string') throw new Error('--say text must be a string');
    const text = value.replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
    if (!text || [...text].length > 200) throw new Error('--say requires 1–200 characters after cleaning');
    return text;
}
function parseSay(argv = [], additionalData) {
    if (additionalData && Object.hasOwn(additionalData, 'say')) return { say: validateSay(additionalData.say) };
    const flags = argv.map((arg, index) => ({ arg, index })).filter(({ arg }) => arg === '--say' || (typeof arg === 'string' && arg.startsWith('--say=')));
    if (!flags.length) return null;
    if (flags.length !== 1) throw new Error('--say may only be supplied once');
    const { arg, index } = flags[0];
    const value = arg === '--say' ? argv[index + 1] : arg.slice(6);
    if (arg === '--say' && typeof value === 'string' && value.startsWith('--')) throw new Error('--say requires text');
    return { say: validateSay(value) };
}
function launch(app, argv, start, error = console.error) {
    let command;
    try { command = parseSay(argv); }
    catch (err) { error(err.message); app.exit(2); return; }
    if (!app.requestSingleInstanceLock(command || {})) { app.quit(); return; }
    if (command) { app.releaseSingleInstanceLock(); error('Nod.ie is not running. Start Nod.ie normally before using --say.'); app.exit(1); return; }
    start();
}
class Announcements {
    constructor({ enabled, synthesize, log = () => {}, now = Date.now }) {
        Object.assign(this, { enabled, synthesize, log, now });
        this.last = -Infinity;
    }
    offer(value) {
        const text = validateSay(value);
        if (!this.enabled()) { this.log('disabled'); return false; }
        if (this.now() - this.last < 5000) { this.log('rate-limited'); return false; }
        this.last = this.now();
        if (this.pending && this.now() >= this.pending.deadline) this.pending = null;
        if (this.pending || this.working) { this.log('queue-full'); return false; }
        this.pending = { text, deadline: this.now() + 10000 };
        return true;
    }
    hasPending() {
        if (!this.pending || this.working) return false;
        if (!this.enabled() || this.now() >= this.pending.deadline) {
            this.log(this.enabled() ? 'expired' : 'disabled'); this.pending = null; return false;
        }
        return true;
    }
    async take(busy) {
        if (!this.hasPending()) return null;
        if (busy !== false) return null;
        const item = this.pending; this.pending = null; this.working = true;
        try {
            const audio = await this.synthesize(item.text, item.deadline - this.now());
            if (!this.enabled() || this.now() >= item.deadline) { this.log(this.enabled() ? 'expired' : 'disabled'); return null; }
            return { audio, deadline: item.deadline };
        } catch { this.log('unavailable'); return { unavailable: true }; }
        finally { this.working = false; }
    }
}
module.exports = { validateSay, parseSay, launch, Announcements };
