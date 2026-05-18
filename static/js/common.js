/**
 * common.js – Sdílené funkce pro celou aplikaci RelayRunPlanner
 *
 * Obsahuje:
 *   - Přepínání světlého/tmavého motivu (theme toggle)
 *   - Zavírání modálních oken kliknutím mimo obsah
 */


// ============================================
// PŘEPÍNÁNÍ MOTIVU (Light / Dark Mode)
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('themeToggle');
    if (themeToggleBtn) {
        /** Načtení uloženého motivu z localStorage (výchozí = 'light') */
        const currentTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', currentTheme);

        /** Po kliknutí přepne data-theme atribut a uloží volbu */
        themeToggleBtn.addEventListener('click', () => {
            let theme = document.documentElement.getAttribute('data-theme');
            let newTheme = theme === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }

    // Zavření modálů při kliknutí mimo obsah
    window.addEventListener('click', (event) => {
        const modals = ['settingsModal', 'logisticsModal', 'analysisModal', 'smartGenModal'];
        modals.forEach(id => {
            const modal = document.getElementById(id);
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
});
