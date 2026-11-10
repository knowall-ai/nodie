/** --tv only: mirror Sofa Launcher's background and theme (sent by the main process) onto <html>. */
(() => {
    if (!window.nodie?.onSofaAppearance) return;
    const root = document.documentElement;
    const apply = ({ background = null, theme = null } = {}) => {
        // The main process validates both values against lib/sofa-appearance.js; null means Nod.ie's own look.
        if (background) root.dataset.sofaBackground = background; else delete root.dataset.sofaBackground;
        if (theme) root.dataset.sofaTheme = theme; else delete root.dataset.sofaTheme;
    };
    window.nodie.onSofaAppearance(apply);
})();
