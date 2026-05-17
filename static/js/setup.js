/**
 * setup.js – Logika pro Step 2 (přidávání členů týmu)
 *
 * Tento soubor se načítá pouze ve Step 2, kde uživatel:
 *   1. Nahraje JSON soubor s trasou
 *   2. Přidá běžce s kontrolními časy
 *   3. Přiřadí úseky (ručně nebo náhodně)
 *
 * Obsahuje:
 *   - addRunner()              – přidání karty běžce do formuláře
 *   - generateRunners()        – generování N karet běžců
 *   - toggleGlobalControl()    – přepínání globálního kontrolního úseku
 *   - toggleRandomSegments()   – přepnutí náhodného přiřazení úseků
 *   - generateSegmentFields()  – vygenerování inputů pro čísla úseků
 *   - prepareSubmit()          – sběr dat z formuláře před odesláním
 *   - pickRandomUnused()       – výběr náhodného úseku z intervalu
 */


// ============================================
// PŘIDÁNÍ KARTY BĚŽCE
// ============================================

/**
 * Vytvoří HTML kartu pro jednoho běžce a přidá ji do kontejneru.
 * Karta obsahuje inputy pro jméno, kontrolní čas, úseky atd.
 * @param {number} index – Pořadové číslo běžce (1-indexed)
 */
function addRunner(index) {
    const div = document.createElement('div');
    div.className = 'runner-card';
    div.innerHTML = `
        <div class="r-header"><h4>Běžec ${index}</h4></div>
        <div class="runner-inputs">
            <div><label>Jméno</label><input type="text" class="r-name" required></div>
            <div class="r-dist-wrapper"><label>Délka kontr. (metry)</label><input type="number" class="r-dist" placeholder="např. 5000" required></div>
            <div><label>Čas (HH:MM:SS)</label><input type="text" class="r-time" pattern="[0-9]{1,2}:[0-9]{2}:[0-9]{2}" placeholder="00:25:30" title="Formát HH:MM:SS" required></div>
            <div class="r-elev-wrapper"><label>Převýšení (m)</label><input type="number" class="r-elev" required></div>
            <div><label>Počet úseků</label><input type="number" class="r-seg-count" min="1" onchange="generateSegmentFields(this)" required></div>
        </div>
        <div style="margin-bottom: 15px; margin-top: 5px;">
            <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; font-size: 0.9rem; cursor: pointer;">
                <input type="checkbox" class="r-random-segs" onchange="toggleRandomSegments(this)" style="width: auto;">
                Neznám ještě čísla úseků (vybrat náhodně)
            </label>
        </div>
        <div class="seg-inputs"></div>
    `;
    document.getElementById('runnersContainer').appendChild(div);

    // Pokud je zapnuté globální nastavení kontrolního úseku, skryjeme
    // individuální pole pro délku a převýšení
    const isGlobal = document.getElementById('globalControlCheck') ? document.getElementById('globalControlCheck').checked : false;
    if (isGlobal) {
        div.querySelector('.r-dist-wrapper').style.display = 'none';
        div.querySelector('.r-elev-wrapper').style.display = 'none';
        div.querySelector('.r-dist').required = false;
        div.querySelector('.r-elev').required = false;
    }
}


// ============================================
// GENEROVÁNÍ BĚŽCŮ (dynamické přidávání / odebírání)
// ============================================

/**
 * Zajistí, aby v kontejneru bylo přesně 'count' karet běžců.
 * @param {number} count – Požadovaný počet běžců
 */
function generateRunners(count) {
    count = parseInt(count) || 1;
    const container = document.getElementById('runnersContainer');
    const currentCount = container.children.length;

    if (count > currentCount) {
        // Přidáme chybějící karty
        for (let i = currentCount; i < count; i++) {
            addRunner(i + 1);
        }
    } else if (count < currentCount) {
        // Odebereme přebytečné karty (od konce)
        for (let i = currentCount; i > count; i--) {
            container.lastElementChild.remove();
        }
    }
}


// ============================================
// GLOBÁLNÍ KONTROLNÍ ÚSEK
// ============================================

/**
 * Přepíná zobrazení společného vs. individuálního kontrolního úseku.
 * Pokud je zaškrtnuto, všichni běžci sdílí stejnou délku a převýšení
 * kontrolního úseku definovanou globálně.
 * @param {boolean} isChecked – Stav checkboxu
 */
function toggleGlobalControl(isChecked) {
    const globalInputs = document.getElementById('globalControlInputs');
    globalInputs.style.display = isChecked ? 'flex' : 'none';

    const distInput = document.getElementById('globalControlDist');
    const elevInput = document.getElementById('globalControlElev');
    if (distInput) distInput.required = isChecked;
    if (elevInput) elevInput.required = isChecked;

    // Skryje/zobrazí individuální pole u všech karet běžců
    document.querySelectorAll('.runner-card').forEach(card => {
        const distWrap = card.querySelector('.r-dist-wrapper');
        const elevWrap = card.querySelector('.r-elev-wrapper');
        distWrap.style.display = isChecked ? 'none' : 'block';
        elevWrap.style.display = isChecked ? 'none' : 'block';
        card.querySelector('.r-dist').required = !isChecked;
        card.querySelector('.r-elev').required = !isChecked;
    });
}


// ============================================
// NÁHODNÉ PŘIŘAZENÍ ÚSEKŮ
// ============================================

/**
 * Přepíná viditelnost inputů pro čísla úseků u konkrétního běžce.
 * Pokud je zaškrtnuto, úseky se přiřadí náhodně při odeslání.
 * @param {HTMLInputElement} checkbox – Checkbox „vybrat náhodně"
 */
function toggleRandomSegments(checkbox) {
    const segContainer = checkbox.closest('.runner-card').querySelector('.seg-inputs');
    segContainer.style.display = checkbox.checked ? 'none' : 'flex';
    // Zrušíme povinnost, pokud je kontejner schovaný
    segContainer.querySelectorAll('.r-seg-id').forEach(inp => {
        inp.required = !checkbox.checked;
    });
}

/**
 * Vygeneruje inputy pro zadání čísel konkrétních úseků běžce.
 * @param {HTMLInputElement} inputEl – Input s počtem úseků
 */
function generateSegmentFields(inputEl) {
    const count = parseInt(inputEl.value) || 0;
    const card = inputEl.closest('.runner-card');
    const container = card.querySelector('.seg-inputs');
    const isRandom = card.querySelector('.r-random-segs').checked;

    container.innerHTML = '<label style="width:100%; display:block; margin-bottom:5px; font-size:0.85rem;">Čísla úseků (např. 1, 13, 25):</label>';
    for (let i = 0; i < count; i++) {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'r-seg-id';
        inp.placeholder = `${i + 1}. úsek`;
        inp.required = !isRandom;
        container.appendChild(inp);
    }
}


// ============================================
// PŘÍPRAVA DAT PRO ODESLÁNÍ FORMULÁŘE
// ============================================

/**
 * Vybere náhodný nepoužitý úsek z daného intervalu.
 * Pokud je interval vyčerpaný, vybere jakýkoliv volný úsek.
 *
 * @param {number} minRange       – Dolní hranice intervalu (1-indexed)
 * @param {number} maxRange       – Horní hranice intervalu (1-indexed)
 * @param {Set}    usedSet        – Množina již přiřazených úseků
 * @param {number} totalSegments  – Celkový počet úseků v závodě
 * @returns {number|null} – Číslo vybraného úseku nebo null
 */
function pickRandomUnusedSetup(minRange, maxRange, usedSet, totalSegments) {
    let available = [];
    for (let i = minRange; i <= maxRange; i++) {
        if (!usedSet.has(i)) available.push(i);
    }
    if (available.length > 0) {
        const picked = available[Math.floor(Math.random() * available.length)];
        usedSet.add(picked);
        return picked;
    }
    // Fallback: Pokud v intervalu není nic volného, vyber cokoliv z celku
    for (let i = 1; i <= totalSegments; i++) {
        if (!usedSet.has(i)) {
            usedSet.add(i);
            return i;
        }
    }
    return null;
}

/**
 * Sbírá data ze všech karet běžců a uloží je jako JSON
 * do skrytého inputu pro odeslání formuláře.
 *
 * Logika:
 *   1. Posbírá ručně zadané úseky
 *   2. Pro běžce s "náhodným" přiřazením vygeneruje úseky
 *      rovnoměrně rozložené po trase (třetiny, čtvrtiny atd.)
 *   3. Uloží výsledek do hidden inputu #runnersDataInput
 *
 * @param {Event} e – Submit event formuláře
 */
function prepareSubmit(e) {
    const runners = [];
    const globalCheck = document.getElementById('globalControlCheck');
    const isGlobalControl = globalCheck ? globalCheck.checked : false;
    const globalDist = parseFloat(document.getElementById('globalControlDist') ? document.getElementById('globalControlDist').value : 0);
    const globalElev = parseFloat(document.getElementById('globalControlElev') ? document.getElementById('globalControlElev').value : 0);

    // 1. Posbírat ručně vybrané úseky (pro kontrolu kolizí)
    const manualSelectedSegs = new Set();
    document.querySelectorAll('.runner-card').forEach(card => {
        const isRandom = card.querySelector('.r-random-segs').checked;
        if (!isRandom) {
            card.querySelectorAll('.r-seg-id').forEach(inp => {
                const val = parseInt(inp.value);
                if (!isNaN(val)) manualSelectedSegs.add(val);
            });
        }
    });

    // Celkový počet úseků (z Jinja proměnné, nastaveno inline v HTML)
    const totalSegments = window._totalSegments || 0;

    // 2. Zpracovat každou kartu běžce
    document.querySelectorAll('.runner-card').forEach(card => {
        const isRandom = card.querySelector('.r-random-segs').checked;
        let segs = [];
        const segCount = parseInt(card.querySelector('.r-seg-count').value) || 0;

        if (!isRandom) {
            // Ručně zadané úseky
            segs = Array.from(card.querySelectorAll('.r-seg-id'))
                .map(inp => parseInt(inp.value))
                .filter(v => !isNaN(v));
        } else {
            // Náhodné rozdělení s ohledem na rovnoměrné rozložení
            if (segCount > 0 && totalSegments > 0) {
                const intervalSize = totalSegments / segCount;
                for (let k = 0; k < segCount; k++) {
                    const minRange = Math.floor(k * intervalSize) + 1;
                    const maxRange = k === segCount - 1 ? totalSegments : Math.floor((k + 1) * intervalSize);
                    const picked = pickRandomUnusedSetup(minRange, maxRange, manualSelectedSegs, totalSegments);
                    if (picked !== null) segs.push(picked);
                }
            }
        }

        runners.push({
            name: card.querySelector('.r-name').value,
            ctrl_dist_m: isGlobalControl ? globalDist : parseFloat(card.querySelector('.r-dist').value),
            ctrl_elev: isGlobalControl ? globalElev : parseFloat(card.querySelector('.r-elev').value),
            ctrl_time_hms: card.querySelector('.r-time').value,
            segments: segs
        });
    });

    // 3. Uložit JSON do hidden inputu
    document.getElementById('runnersDataInput').value = JSON.stringify(runners);
}
