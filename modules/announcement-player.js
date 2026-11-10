/** Output-only playback: never starts capture, reconnects voice, or resumes listening. */
class AnnouncementPlayer {
    constructor(renderer) { this.renderer = renderer; this.active = false; this.disposed = false; }
    busy() {
        const r = this.renderer, local = r.localVoice, playback = r.state.audioPlayback, lips = r.streamingLips;
        return r.state.isLoading || r.announcementUserSpeaking || r.isAssistantSpeaking ||
            (local && local.state !== 'idle') || Boolean(lips?.sources.size || lips?.jobs.length || lips?.ready.length) ||
            Boolean(playback?.announcementBusy?.());
    }
    start() { this.timer = setInterval(() => { void this.tick(); }, 100); }
    async tick() {
        if (this.pulling || this.active || this.disposed) return;
        this.pulling = true;
        try {
            if (!this.item && !await window.nodie.announcementPending()) return;
            if (this.disposed) return;
            if (this.item && (Date.now() >= this.item.deadline || window.CONFIG?.ANNOUNCEMENTS_ENABLED === false)) { this.item = null; return; }
            if (this.busy() || Date.now() - (this.lastStarted ?? -Infinity) < 5000) { await window.nodie.takeAnnouncement(true); return; }
            // Reserve only a real announcement, so empty polls cannot stop auto-listening.
            this.active = true;
            const item = this.item || await window.nodie.takeAnnouncement(false);
            if (!item || this.disposed) return;
            if (item.unavailable) { this.renderer.showNotification('Announcement unavailable: speech backend could not be reached.', 'error'); return; }
            if (Date.now() >= item.deadline || window.CONFIG?.ANNOUNCEMENTS_ENABLED === false) { this.item = null; return; }
            if (this.busy()) { this.item = item; return; }
            this.item = null;
            this.url = URL.createObjectURL(new Blob([item.audio], { type: 'audio/wav' }));
            this.lastStarted = Date.now();
            const player = this.player = new Audio(this.url);
            player.muted = Boolean(this.renderer.state.speakerMuted);
            await new Promise((resolve, reject) => {
                this.complete = resolve;
                player.onended = resolve;
                player.onerror = () => reject(Error('Playback failed'));
                this.playbackTimer = setTimeout(() => reject(Error('Playback timed out')), 30000);
                Promise.resolve(player.play()).catch(reject);
            });
        } catch { if (!this.disposed) this.renderer.showNotification('Announcement unavailable: speech playback failed.', 'error'); }
        finally { this.release(); this.active = false; this.pulling = false; }
    }
    release() {
        clearTimeout(this.playbackTimer);
        if (this.player) { this.player.onended = null; this.player.onerror = null; this.player.pause(); this.player.removeAttribute('src'); this.player.load(); this.player = null; }
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = null; this.complete?.(); this.complete = null;
    }
    dispose() { this.disposed = true; clearInterval(this.timer); this.item = null; this.release(); }
}
window.AnnouncementPlayer = AnnouncementPlayer;
