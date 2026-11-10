/**
 * Directional remote navigation for the avatar window (arrows, OK/Enter, Back/Escape).
 * Every visible, enabled button is reachable: an arrow moves to the nearest control in that
 * direction (modules/spatial-nav.js). Entering a [role="group"] from outside lands on its first
 * control, and pressing the opposite arrow straight away returns to where focus came from, so
 * Up from the device controls reaches Debug and Down comes back to the same control.
 * Scrollable regions marked [data-remote-scroll] (the debug log) take focus and scroll with
 * Up/Down until their edge, then focus moves on.
 */
(() => {
    const nav = window.NodieSpatialNav;
    const editing = target => target?.closest?.('input, textarea, select, [contenteditable="true"]');
    const usable = el => !el.hidden && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.getClientRects().length > 0 && !el.closest?.('[hidden],[inert]');
    const scrollable = el => el.matches?.('[data-remote-scroll]');
    const candidates = () => [...document.querySelectorAll('button, [data-remote-scroll]')]
        .filter(el => usable(el) && (!scrollable(el) || el.scrollHeight > el.clientHeight + 1));
    const group = el => el?.closest?.('[role="group"]') || null;
    const rect = el => el.getBoundingClientRect();
    let memory = null; // { from, to, key }: the last move, so its opposite can undo it.

    function move(key) {
        const list = candidates();
        if (!list.length) return false;
        const current = document.activeElement;
        if (!list.includes(current)) {
            (list.find(el => group(el)?.id === 'avatar-controls') || list[0]).focus();
            memory = null;
            return true;
        }
        if (scrollable(current) && (key === 'ArrowUp' || key === 'ArrowDown')) {
            const down = key === 'ArrowDown';
            const room = down ? current.scrollHeight - current.clientHeight - current.scrollTop : current.scrollTop;
            if (room > 1) { current.scrollBy({ top: (down ? 1 : -1) * Math.max(40, current.clientHeight * 0.8) }); return true; }
        }
        let next = null;
        if (memory && memory.to === current && nav.opposite(memory.key) === key && list.includes(memory.from)) next = memory.from;
        else {
            // Sideways moves never land on a scroll region that contains the current control.
            const sideways = key === 'ArrowLeft' || key === 'ArrowRight';
            const others = list.filter(el => el !== current && !(sideways && el.contains?.(current)));
            next = nav.nearest(rect(current), others.map(el => ({ el, rect: rect(el) })), key)?.el || null;
            const target = group(next);
            if (next && target && target !== group(current)) next = list.find(el => group(el) === target) || next;
        }
        if (!next) return true;
        memory = { from: current, to: next, key };
        next.focus({ preventScroll: true });
        return true;
    }

    document.addEventListener('keydown', event => {
        // Sofa's app controls are local to this focused window, never global.
        const action = event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey &&
            ({ c: 'control-camera', m: 'control-mic', s: 'control-speaker' })[event.key.toLowerCase()];
        if (action && !event.defaultPrevented && !editing(event.target)) {
            const button = document.getElementById(action);
            if (button && !button.hidden && !button.disabled && button.getClientRects().length) {
                event.preventDefault();
                button.focus();
                if (!event.repeat) button.click();
            }
            return;
        }
        if (event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented) return;
        if (editing(event.target)) return;
        const current = document.activeElement;
        if (event.key === 'Escape') {
            // Back leaves the debug view: switch it off and return focus to its button.
            const debug = document.getElementById('control-debug');
            if (debug?.getAttribute('aria-pressed') === 'true' && (current === debug || current?.closest?.('#debug-stream'))) {
                event.preventDefault();
                if (!event.repeat) debug.click();
                debug.focus();
                memory = null;
            }
            return;
        }
        if (nav.DIRECTIONS[event.key]) { if (move(event.key)) event.preventDefault(); return; }
        if (event.key === 'Enter' || event.key === ' ') {
            if (!current?.matches?.('button') || !candidates().includes(current)) return;
            event.preventDefault();
            if (!event.repeat) current.click();
        }
    });
})();
