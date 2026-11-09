/** Directional remote navigation for the avatar's device controls. */
(() => {
    const controls = () => [...document.querySelectorAll('#avatar-controls button')]
        .filter(button => !button.hidden && !button.disabled && button.getAttribute('aria-disabled') !== 'true' && button.getClientRects().length);
    document.addEventListener('keydown', event => {
        if (event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented) return;
        if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
        const buttons = controls();
        if (!buttons.length) return;
        const index = buttons.indexOf(document.activeElement);
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
            const next = index < 0 ? 0 : Math.max(0, Math.min(buttons.length - 1, index + direction));
            buttons[next].focus();
        } else if (event.key === 'Enter' || event.key === ' ') {
            if (index < 0) return;
            event.preventDefault();
            if (!event.repeat) buttons[index].click();
        }
    });
})();
