/**
 * TV layout for settings.html (full-screen modes only): a section list on the left, one section
 * on the right, remote-only operation (arrows, OK, Back). It reorganises the existing form, so
 * every id and handler in settings.js keeps working; the desktop window is untouched.
 * Key routing is in modules/tv-settings-nav.js; side-by-side geometry in modules/spatial-nav.js.
 *
 * Changes apply immediately (save-settings accepts a single key), with a short confirmation.
 * Destructive actions ask first, with Cancel focused.
 */
(() => {
    const api = window.nodie, route = window.NodieTvSettingsNav?.route, spatial = window.NodieSpatialNav;
    if (!api?.settingsPresentation || !route || !spatial) return;
    const root = document.documentElement;
    root.classList.add('tv-pending');
    api.settingsPresentation()
        .then(presentation => { if (presentation?.layout === 'tv') setup(presentation); })
        .catch(() => {})
        .finally(() => { root.classList.remove('tv-pending'); if (root.classList.contains('tv')) items[active]?.focus(); });

    const make = (tag, props = {}, ...children) => { const node = Object.assign(document.createElement(tag), props); node.append(...children); return node; };
    const NAMES = { 'Avatar Settings': 'Avatar', 'Connection Settings': 'Connection', 'Keyboard Shortcuts': 'Shortcuts', 'Security and container updates': 'Updates', 'Health and unusual activity': 'Health', 'People': 'Voices and history', 'People — faces': 'Faces', 'Visual curiosity': 'Curiosity', 'Linked people and memory': 'Linked people', 'Event journal': 'Event journal' };
    // Settings saved one key at a time (the main process validates a partial patch).
    const CONFIG = { avatarEnabled: 'AVATAR_ENABLED', avatarIdleEnabled: 'AVATAR_IDLE_ENABLED', curiosityLevel: 'CURIOSITY_LEVEL', assistantName: 'ASSISTANT_NAME', unmuteBackendUrl: 'UNMUTE_BACKEND_URL', voiceModel: 'VOICE_MODEL', globalHotkey: 'GLOBAL_HOTKEY' };
    // Destructive buttons that settings.js runs without its own confirm().
    const GUARDED = [['#clear-history', 'Clear the saved conversation history? Reverie memories remain.'], ['#people-list button', 'Unlink this person? Their face and voice profiles are kept.'], ['#apply', 'Apply this update? The service will restart; a second confirmation follows.']];

    let lastInPane = null, level = 'list', active = 0, items = [], sections = [], pane, toastTimer, approved = null, overlay = null;
    const isText = node => node?.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea');
    const kindOf = node => node.matches('input[type="checkbox"]') ? 'switch' : node.matches('select') ? 'select' : isText(node) ? 'text' : node.classList.contains('tv-scroll') ? 'scroll' : 'button';
    const visible = node => !node.disabled && !node.closest('[hidden]') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
    // Status blocks take focus only when they overflow, so there is something to scroll.
    const worthFocus = node => !node.classList.contains('tv-scroll') || node.scrollHeight > node.clientHeight + 1;
    const controls = () => [...sections[active].querySelectorAll('button, input, select, textarea, a[href], .tv-scroll')].filter(node => visible(node) && worthFocus(node));
    const rect = node => node.getBoundingClientRect();

    function toast(text, kind = 'ok') {
        const box = document.getElementById('tv-toast');
        box.textContent = text; box.dataset.kind = kind; box.hidden = false;
        clearTimeout(toastTimer); toastTimer = setTimeout(() => { box.hidden = true; }, kind === 'error' ? 6000 : 1800);
    }
    function setSofa(sofa) {
        if (sofa?.background) root.dataset.sofaBackground = sofa.background; else delete root.dataset.sofaBackground;
        if (sofa?.theme) root.dataset.sofaTheme = sofa.theme; else delete root.dataset.sofaTheme;
    }

    function setup(presentation) {
        root.classList.add('tv');
        document.body.classList.add('tv-fullscreen');
        if (presentation.sofa) { setSofa(presentation.sofa); api.onSofaAppearance?.(setSofa); }
        const header = document.querySelector('.settings-header');
        sections = [...document.querySelectorAll('body > .section')];
        const list = make('nav', { id: 'tv-sections' });
        list.setAttribute('aria-label', 'Settings sections');
        pane = make('main', { id: 'tv-pane' });
        items = sections.map((section, index) => {
            const title = section.querySelector('h2')?.textContent.trim() || `Section ${index + 1}`;
            const item = make('button', { type: 'button', className: 'tv-section-item', textContent: NAMES[title] || title });
            item.addEventListener('click', () => { show(index); enterSection(); });
            list.append(item); pane.append(section);
            return item;
        });
        const hint = make('p', { id: 'tv-hint', textContent: 'OK selects · Back returns · Changes apply immediately' });
        const column = make('div', { id: 'tv-column' }, header, list, hint);
        const shell = make('div', { id: 'tv-shell' }, column, pane);
        document.body.prepend(shell);
        document.body.append(make('div', { id: 'tv-toast', hidden: true, role: 'status' }));
        document.getElementById('settings-error')?.setAttribute('data-tv-toast', '');
        decorate(presentation);
        show(0);
        items[0].focus();
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('click', guard, true);
        document.addEventListener('focusin', event => { if (sections[active]?.contains(event.target)) lastInPane = event.target; });
        document.addEventListener('focusin', event => { if (isText(event.target) && !('tvSaved' in event.target.dataset)) event.target.dataset.tvSaved = event.target.value; });
        window.confirm = askInstead;
        // The window may not have focus yet when the layout is built.
        window.addEventListener('focus', () => { if (document.activeElement === document.body) (level === 'list' ? items[active] : controls()[0] || items[active]).focus(); });
    }

    function decorate(presentation) {
        // Switches show their state in words, not colour alone (CSS fills in On/Off).
        for (const box of document.querySelectorAll('.section input[type="checkbox"]')) box.after(make('span', { className: 'tv-state' }));
        for (const block of document.querySelectorAll('.section pre, #journal-events')) { block.classList.add('tv-scroll'); block.tabIndex = 0; }
        const typing = presentation.sofa
            ? 'To type, open Sofa’s menu → Keyboard / mic while this field is selected, then press OK to save.'
            : 'Needs a keyboard: type, then press OK to save.';
        for (const id of ['assistantName', 'unmuteBackendUrl', 'voiceModel', 'globalHotkey']) document.getElementById(id)?.closest('.setting-row')?.querySelector('.setting-label')?.append(make('p', { className: 'tv-note', textContent: typing }));
        for (const [id, key] of Object.entries(CONFIG)) {
            const input = document.getElementById(id);
            if (!input) continue;
            input.addEventListener('change', () => save(input, key));
        }
    }

    async function save(input, key) {
        const value = input.type === 'checkbox' ? input.checked : input.value;
        if (isText(input) && input.dataset.tvSaved === input.value) return;
        try {
            await api.saveSettings({ [key]: value });
            if (isText(input)) input.dataset.tvSaved = input.value;
            toast('Saved');
        } catch (error) {
            if (input.type === 'checkbox') input.checked = !value;
            else if (isText(input)) input.value = input.dataset.tvSaved ?? input.value;
            toast(`Not saved: ${String(error.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, 'error');
        }
    }

    function show(index) {
        active = index;
        sections.forEach((section, i) => section.classList.toggle('tv-active', i === index));
        items.forEach((item, i) => item.toggleAttribute('aria-current', i === index));
        pane.scrollTop = 0;
    }
    function focusInPane(node) { node.focus({ preventScroll: true }); node.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    // A control that disables itself while it works loses focus; give it back when it is ready.
    function keepFocus(node, tries = 60) {
        if (!node.disabled) return;
        const wait = setInterval(() => {
            if (--tries < 0 || !node.isConnected) return clearInterval(wait);
            if (node.disabled) return;
            clearInterval(wait);
            if (document.activeElement === document.body && level === 'pane') focusInPane(node);
        }, 50);
    }
    function enterSection() { const first = controls()[0]; if (!first) return; level = 'pane'; focusInPane(first); }
    function toList() { level = 'list'; items[active].focus(); }

    function state(current) {
        if (level !== 'pane') return { level };
        const kind = kindOf(current);
        const value = current.value ?? '', start = kind === 'text' ? current.selectionStart : null;
        const caret = kind !== 'text' ? undefined : (start === null || value === '') ? 'empty' : start === 0 && current.selectionEnd === 0 ? 'start' : start >= value.length ? 'end' : 'middle';
        // Up/Down follow the form's reading order, so every control is reachable with them alone;
        // Left/Right move between controls side by side on the same row (geometry), else Left exits.
        const next = key => {
            const list = controls(), index = list.indexOf(current);
            if (key === 'ArrowUp' || key === 'ArrowDown') return list[index + (key === 'ArrowDown' ? 1 : -1)];
            const r = rect(current);
            const row = list.filter(node => node !== current).map(node => ({ node, rect: rect(node) })).filter(({ rect: o }) => o.y < r.y + r.height && o.y + o.height > r.y);
            return spatial.nearest(r, row, key)?.node;
        };
        return {
            level, kind, caret, dirty: kind === 'text' && current.dataset.tvSaved !== undefined && current.dataset.tvSaved !== current.value,
            canScroll: kind === 'scroll' ? { up: current.scrollTop > 1, down: current.scrollTop + current.clientHeight < current.scrollHeight - 1 } : undefined,
            hasNeighbour: key => Boolean(next(key)),
            next
        };
    }

    function onKey(event) {
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        const current = document.activeElement;
        if (level === 'pane' && items.includes(current)) level = 'list';
        // Focus can drop to the page when a control disables itself while it works (the
        // recognition switches do). Put it back before acting on the key.
        if (!overlay && (level === 'list' ? !items.includes(current) : !sections[active].contains(current))) {
            event.preventDefault(); event.stopPropagation();
            if (level === 'list') items[active].focus();
            else focusInPane(lastInPane && sections[active].contains(lastInPane) && visible(lastInPane) ? lastInPane : controls()[0] || items[active]);
            return;
        }
        const s = state(current);
        const action = route(event.key, s);
        if (action.type === 'native') return;
        event.preventDefault(); event.stopPropagation();
        if (event.repeat && ['choose', 'activate', 'close', 'open-chooser', 'save-text'].includes(action.type)) return;
        switch (action.type) {
        case 'list-move': { const index = Math.max(0, Math.min(items.length - 1, active + action.delta)); show(index); items[index].focus(); break; }
        case 'enter-section': enterSection(); break;
        case 'close': window.close(); break;
        case 'to-list': toList(); break;
        case 'move': focusInPane(s.next(action.key)); break;
        case 'scroll': current.scrollBy({ top: action.delta * Math.max(60, current.clientHeight * 0.8) }); break;
        case 'activate': current.click(); keepFocus(current); break;
        case 'open-chooser': openChooser(current); break;
        case 'save-text': { const key = CONFIG[current.id]; if (key) save(current, key); else current.parentElement?.querySelector('button')?.focus(); break; }
        case 'revert-text': current.value = current.dataset.tvSaved; toast('Change discarded'); break;
        case 'step': overlay?.step(action.delta); break;
        case 'choose': overlay?.choose(); break;
        case 'cancel': overlay?.cancel(); break;
        default: break;
        }
    }

    /** A modal list of options or answers: Up/Down (or Left/Right) move, OK chooses, Back cancels. */
    function openOverlay({ title, message, options, index, onChoose, origin, className }) {
        const box = make('div', { className: `tv-overlay ${className}` });
        box.setAttribute('role', className === 'tv-dialog' ? 'alertdialog' : 'listbox');
        const card = make('div', { className: 'tv-overlay-card' }, make('h2', { textContent: title }));
        if (message) card.append(make('p', { textContent: message }));
        const buttons = options.map((label, i) => make('button', { type: 'button', textContent: label, className: 'tv-option' }));
        card.append(make('div', { className: 'tv-options' }, ...buttons));
        box.append(card); document.body.append(box);
        const previous = level; level = className === 'tv-dialog' ? 'dialog' : 'chooser';
        let at = index;
        const focus = () => { buttons.forEach((b, i) => b.toggleAttribute('aria-selected', i === at)); buttons[at].focus(); buttons[at].scrollIntoView({ block: 'nearest' }); };
        const close = () => { box.remove(); overlay = null; level = previous; origin?.focus(); };
        overlay = {
            step(delta) { at = Math.max(0, Math.min(buttons.length - 1, at + delta)); focus(); },
            choose() { const chosen = at; close(); onChoose(chosen); },
            cancel: close
        };
        focus();
    }
    function openChooser(select) {
        const label = select.closest('label')?.childNodes[0]?.textContent?.trim() || select.getAttribute('aria-label') || select.closest('.setting-row')?.querySelector('h3')?.textContent || 'Choose';
        openOverlay({
            title: label, options: [...select.options].map(option => option.textContent), index: Math.max(0, select.selectedIndex), origin: select, className: 'tv-chooser',
            onChoose: i => { if (select.selectedIndex === i) return; select.selectedIndex = i; select.dispatchEvent(new Event('change', { bubbles: true })); }
        });
    }
    function ask(message, origin, onConfirm) {
        openOverlay({ title: 'Are you sure?', message, options: ['Cancel', 'Confirm'], index: 0, origin, className: 'tv-dialog', onChoose: i => { if (i === 1) onConfirm(); } });
    }
    // settings.js calls confirm() synchronously. Ask on screen instead, then repeat the click once approved.
    function askInstead(message) {
        const origin = document.activeElement;
        if (approved && approved === origin) { approved = null; return true; }
        ask(String(message), origin, () => { approved = origin; origin.click(); });
        return false;
    }
    function guard(event) {
        const button = event.target.closest?.('button');
        const match = button && GUARDED.find(([selector]) => button.matches(selector));
        if (!match) return;
        if (approved === button) { approved = null; return; }
        event.preventDefault(); event.stopImmediatePropagation();
        ask(match[1], button, () => { approved = button; button.click(); });
    }
})();
