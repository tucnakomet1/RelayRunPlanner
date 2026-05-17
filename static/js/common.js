/**
 * common.js – Sdílené funkce pro celou aplikaci RelayRunPlanner
 *
 * Obsahuje:
 *   - Přepínání světlého/tmavého motivu (theme toggle)
 *   - Potvrzení a smazání závodu
 *   - Zavírání modálních oken kliknutím mimo obsah
 */


// ============================================
// PŘEPÍNÁNÍ MOTIVU (Light / Dark Mode)
// ============================================

/** Tlačítko pro přepnutí motivu v hlavičce */
const themeToggleBtn = document.getElementById('themeToggle');

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


// ============================================
// MAZÁNÍ ZÁVODU
// ============================================

/**
 * Zobrazí potvrzovací dialog a po odsouhlasení smaže závod.
 * @param {string} raceId   – ID závodu v databázi
 * @param {string} raceName – Název závodu (pro zobrazení v dialogu)
 */
async function confirmDeleteRace(raceId, raceName) {
    if (confirm(`Opravdu chcete smazat závod "${raceName}"?`)) {
        try {
            const response = await fetch(`/api/race/${raceId}/delete`, {
                method: 'POST'
            });
            const result = await response.json();
            if (result.status === 'success') {
                window.location.reload();
            } else {
                alert('Chyba při mazání závodu.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Nepodařilo se smazat závod.');
        }
    }
}
