/**
 * Geometric remote navigation shared by the avatar window and the TV settings screen:
 * pick the nearest candidate whose centre lies in the pressed direction. Pure functions over
 * rectangles so they can be unit-tested without a DOM.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.NodieSpatialNav = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
    const DIRECTIONS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const centre = r => [r.x + r.width / 2, r.y + r.height / 2];
    /**
     * @param {{x,y,width,height}} from  rectangle of the focused element
     * @param {Array<{rect:{x,y,width,height}}>} candidates
     * @param {'ArrowLeft'|'ArrowRight'|'ArrowUp'|'ArrowDown'} key
     * @returns the best candidate or null. Off-axis distance costs twice as much as on-axis,
     * so a control straight ahead beats a closer one off to the side.
     */
    function nearest(from, candidates, key) {
        const direction = DIRECTIONS[key];
        if (!direction || !from) return null;
        const [fx, fy] = centre(from);
        let best = null, bestScore = Infinity;
        for (const candidate of candidates) {
            const [cx, cy] = centre(candidate.rect);
            const along = (cx - fx) * direction[0] + (cy - fy) * direction[1];
            if (along <= 4) continue;
            const cross = Math.abs(direction[0] ? cy - fy : cx - fx);
            const score = along + cross * 2;
            if (score < bestScore) { bestScore = score; best = candidate; }
        }
        return best;
    }
    const opposite = key => ({ ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft', ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp' })[key];
    return { DIRECTIONS, nearest, opposite };
});
