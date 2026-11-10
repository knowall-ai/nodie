/**
 * Remote key routing for the TV settings screen (arrows, OK/Enter, Back/Escape only).
 * Pure: given where focus is, return what to do. modules/settings-tv.js performs it.
 *
 * Levels: 'list' (section names on the left), 'pane' (controls of one section),
 * 'chooser' (options of a select), 'dialog' (a confirmation).
 * Control kinds in the pane: 'button', 'switch', 'select', 'text', 'scroll'.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.NodieTvSettingsNav = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
    const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const BACK = ['Escape', 'Backspace', 'BrowserBack', 'GoBack'];
    const OK = ['Enter', ' '];
    /**
     * @param {string} key KeyboardEvent.key
     * @param {object} s
     *   level, kind,
     *   caret: 'start'|'end'|'middle'|'empty' for text fields,
     *   dirty: text value differs from the saved one,
     *   canScroll: { up, down } for scroll blocks,
     *   hasNeighbour: (arrowKey) => boolean, a control in that direction within the pane
     * @returns {{type: string, [k: string]: any}}
     */
    function route(key, s) {
        const back = BACK.includes(key), ok = OK.includes(key), arrow = ARROWS.includes(key);
        if (s.level === 'dialog' || s.level === 'chooser') {
            if (back) return { type: 'cancel' };
            if (ok) return { type: 'choose' };
            if (arrow) return { type: 'step', delta: key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1 };
            return { type: 'ignore' };
        }
        if (s.level === 'list') {
            if (back) return { type: 'close' };
            if (key === 'ArrowUp' || key === 'ArrowDown') return { type: 'list-move', delta: key === 'ArrowUp' ? -1 : 1 };
            if (key === 'ArrowRight' || ok) return { type: 'enter-section' };
            if (key === 'ArrowLeft') return { type: 'ignore' };
            return { type: 'native' };
        }
        // Pane.
        if (s.kind === 'text') {
            // Typing (including Sofa's on-screen keyboard, which sends real key presses) is native.
            if (key === 'Backspace') return { type: 'native' };
            if (back) return s.dirty ? { type: 'revert-text' } : { type: 'to-list' };
            if (key === 'Enter') return { type: 'save-text' };
            if (key === 'ArrowLeft' && !['start', 'empty'].includes(s.caret)) return { type: 'native' };
            if (key === 'ArrowRight' && !['end', 'empty'].includes(s.caret)) return { type: 'native' };
            if (!arrow) return { type: 'native' };
        }
        if (back) return { type: 'to-list' };
        if (ok) return s.kind === 'select' ? { type: 'open-chooser' } : s.kind === 'scroll' || s.kind === 'text' ? { type: 'ignore' } : { type: 'activate' };
        if (!arrow) return { type: 'native' };
        if (s.kind === 'scroll' && (key === 'ArrowUp' || key === 'ArrowDown') && s.canScroll?.[key === 'ArrowUp' ? 'up' : 'down']) return { type: 'scroll', delta: key === 'ArrowUp' ? -1 : 1 };
        if (s.hasNeighbour?.(key)) return { type: 'move', key };
        if (key === 'ArrowLeft') return { type: 'to-list' };
        return { type: 'ignore' };
    }
    /** Clamp a list index, without wrapping (a TV list stops at its ends). */
    const step = (index, delta, length) => Math.max(0, Math.min(length - 1, index + delta));
    return { route, step };
});
