/** TV settings navigation: real form controls retain their own editing keys. */
(() => {
    let editingChoice = null;
    const visible = element => !element.disabled && !element.closest('[hidden],[inert]') && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    document.addEventListener('keydown', event => {
        if (event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented) return;
        const current = document.activeElement;
        if (editingChoice && editingChoice !== current) editingChoice = null;
        if (editingChoice) {
            if (event.key === 'Enter' || event.key === 'Escape') editingChoice = null;
            return;
        }
        if (event.key === 'Escape') { event.preventDefault(); if (!event.repeat) window.close(); return; }
        if (event.key === 'Enter' && current?.matches('select')) { editingChoice = current; return; }
        if (event.key === 'Enter' && current?.matches('input[type="checkbox"],input[type="radio"]')) {
            event.preventDefault(); if (!event.repeat) current.click(); return;
        }
        if (!event.key.startsWith('Arrow')) return;
        if (current?.matches('textarea')) return;
        const horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key);
        if (horizontal && current?.matches('input[type="range"]')) return;
        if (horizontal && current?.matches('input:not([type="checkbox"]):not([type="radio"])')) return;
        const controls = [...document.querySelectorAll('button,input,select,textarea,a[href]')].filter(visible);
        const rect = current?.getBoundingClientRect();
        let next;
        if (!controls.includes(current)) next = controls[0];
        else if (!horizontal) next = controls[Math.max(0, Math.min(controls.length - 1, controls.indexOf(current) + (event.key === 'ArrowDown' ? 1 : -1)))];
        else {
            const forward = ['ArrowRight', 'ArrowDown'].includes(event.key);
            let best = Infinity;
            for (const candidate of controls) {
                if (candidate === current) continue;
                const target = candidate.getBoundingClientRect();
                const along = horizontal ? target.x + target.width/2 - rect.x - rect.width/2 : target.y + target.height/2 - rect.y - rect.height/2;
                if (forward ? along <= 4 : along >= -4) continue;
                const cross = horizontal ? Math.abs(target.y + target.height/2 - rect.y - rect.height/2) : Math.abs(target.x + target.width/2 - rect.x - rect.width/2);
                const score = Math.abs(along) + cross * 2;
                if (score < best) { best = score; next = candidate; }
            }
        }
        event.preventDefault();
        if (next) { next.focus({preventScroll:true}); next.scrollIntoView({block:'nearest',inline:'nearest'}); }
    });
    const style = document.createElement('style');
    style.textContent = 'button:focus,input:focus,select:focus,textarea:focus,a:focus{outline:4px solid #f7931a!important;outline-offset:4px}input[type=checkbox]:focus + *{outline:4px solid #f7931a;outline-offset:4px}';
    document.head.append(style);
})();
