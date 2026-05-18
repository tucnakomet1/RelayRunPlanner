/**
 * setup.js – Logika pro Step 2 (přidávání členů týmu) a Step 1 (nový závod)
 *
 * Obsahuje:
 *   - handleCreateNewRace()    – zpracuje vytvoření nového závodu a přechod do Kroku 2
 *   - addRunner()              – přidání karty běžce do formuláře
 *   - generateRunners()        – generování N karet běžců
 *   - toggleGlobalControl()    – přepínání globálního kontrolního úseku
 *   - toggleRandomSegments()   – přepnutí náhodného přiřazení úseků
 *   - generateSegmentFields()  – vygenerování inputů pro čísla úseků
 *   - loadPrefilledTemplate()  – klientské načtení předvyplněné trasy
 *   - readRouteFile()          – asynchronní přečtení JSON souboru
 *   - collectRunnersFromSetup()– sběr dat o běžcích z formuláře
 *   - handleGeneratePlan()     – hlavní klientský uzel pro uložení nového závodu a přechod do Kroku 3
 */


// ============================================
// KROK 1 – INICIACE ZÁVODU
// ============================================

/**
 * Zpracuje odeslání úvodního formuláře a přesměruje uživatele do Kroku 2.
 */
function handleCreateNewRace(event) {
    event.preventDefault();
    const name = document.getElementById('newRaceName').value;
    const start = document.getElementById('newStartTime').value;
    const count = parseInt(document.getElementById('newSegmentCount').value);

    // Uložit dočasnou konfiguraci do paměti
    window._tempNewRace = {
        name: name,
        start_time: start,
        segment_count: count
    };

    // Navigace na Step 2
    window.location.hash = '#step2';
}


// ============================================
// KROK 2 – PŘIDÁNÍ KARTY BĚŽCE
// ============================================

/**
 * Vytvoří HTML kartu pro jednoho běžce a přidá ji do kontejneru.
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

    const isGlobal = document.getElementById('globalControlCheck') ? document.getElementById('globalControlCheck').checked : false;
    if (isGlobal) {
        div.querySelector('.r-dist-wrapper').style.display = 'none';
        div.querySelector('.r-elev-wrapper').style.display = 'none';
        div.querySelector('.r-dist').required = false;
        div.querySelector('.r-elev').required = false;
    }
}

/**
 * Zajistí, aby v kontejneru bylo přesně 'count' karet běžců.
 */
function generateRunners(count) {
    count = parseInt(count) || 1;
    const container = document.getElementById('runnersContainer');
    const currentCount = container.children.length;

    if (count > currentCount) {
        for (let i = currentCount; i < count; i++) {
            addRunner(i + 1);
        }
    } else if (count < currentCount) {
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
 */
function toggleGlobalControl(isChecked) {
    const globalInputs = document.getElementById('globalControlInputs');
    if (globalInputs) {
        globalInputs.style.display = isChecked ? 'flex' : 'none';
    }

    const distInput = document.getElementById('globalControlDist');
    const elevInput = document.getElementById('globalControlElev');
    if (distInput) distInput.required = isChecked;
    if (elevInput) elevInput.required = isChecked;

    document.querySelectorAll('.runner-card').forEach(card => {
        const distWrap = card.querySelector('.r-dist-wrapper');
        const elevWrap = card.querySelector('.r-elev-wrapper');
        if (distWrap) distWrap.style.display = isChecked ? 'none' : 'block';
        if (elevWrap) elevWrap.style.display = isChecked ? 'none' : 'block';
        
        const distInp = card.querySelector('.r-dist');
        const elevInp = card.querySelector('.r-elev');
        if (distInp) distInp.required = !isChecked;
        if (elevInp) elevInp.required = !isChecked;
    });
}


// ============================================
// NÁHODNÉ PŘIŘAZENÍ ÚSEKŮ
// ============================================

/**
 * Přepíná viditelnost inputů pro čísla úseků u konkrétního běžce.
 */
function toggleRandomSegments(checkbox) {
    const segContainer = checkbox.closest('.runner-card').querySelector('.seg-inputs');
    segContainer.style.display = checkbox.checked ? 'none' : 'flex';
    segContainer.querySelectorAll('.r-seg-id').forEach(inp => {
        inp.required = !checkbox.checked;
    });
}

/**
 * Vygeneruje inputy pro zadání čísel konkrétních úseků běžce.
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
// DŮVĚRYHODNÝ KLIENTSKÝ IMPORT A PŘEDBĚŽNÉ ŠABLONY
// ============================================

/**
 * Vybere a načte staticky předvyplněnou šablonu trasy přímo z paměti.
 * @param {number} count – Počet úseků trasy (15, 24, 36)
 */
function loadPrefilledTemplate(count) {
    const templateData = window.PREFILLED_TEMPLATES ? window.PREFILLED_TEMPLATES[count] : null;
    if (!templateData) {
        alert("Předvyplněná šablona nebyla nalezena.");
        return;
    }

    // Uložit do paměti jako rozpracovaný import
    window._tempUploadedRoute = templateData;

    // Zrušit povinnost nahrát soubor trasy
    const fileInput = document.getElementById('routeFileInput');
    fileInput.required = false;

    // Vykreslit info o vybrané šabloně
    let info = document.getElementById('template-loaded-info');
    if (!info) {
        info = document.createElement('p');
        info.id = 'template-loaded-info';
        info.style.color = 'var(--primary)';
        info.style.fontWeight = 'bold';
        info.style.marginTop = '10px';
        fileInput.parentNode.insertBefore(info, fileInput.nextSibling);
    }

    let name = "";
    if (count === 15) name = "JizeRun (15 úseků)";
    if (count === 24) name = "250 km Českým rájem (24 úseků)";
    if (count === 36) name = "Vltava Run (36 úseků)";

    info.innerText = `✅ Vybrána předvyplněná šablona: ${name}`;

    // Zvýraznění aktivního tlačítka
    document.querySelectorAll('.prefilled-btn').forEach(btn => {
        btn.style.backgroundColor = '';
        btn.style.color = 'var(--primary)';
    });
    const activeBtn = document.getElementById(`prefilled-${count}-btn`);
    if (activeBtn) {
        activeBtn.style.backgroundColor = 'var(--primary)';
        activeBtn.style.color = '#ffffff';
    }
}

/**
 * Asynchronně přečte nahraný JSON soubor.
 */
function readRouteFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                resolve(data);
            } catch (e) {
                reject(new Error("Soubor neobsahuje platný JSON formát."));
            }
        };
        reader.onerror = () => reject(new Error("Chyba při čtení souboru."));
        reader.readAsText(file);
    });
}


// ============================================
// SBĚR DATA BĚŽCŮ A VYTVOŘENÍ ZÁVODU
// ============================================

/**
 * Vybere náhodný nepoužitý úsek z daného intervalu.
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
    for (let i = 1; i <= totalSegments; i++) {
        if (!usedSet.has(i)) {
            usedSet.add(i);
            return i;
        }
    }
    return null;
}

/**
 * Posbírá data o běžcích a jejich úsecích ze setup karet.
 * @returns {Array} – Pole běžců
 */
function collectRunnersFromSetup() {
    const runners = [];
    const globalCheck = document.getElementById('globalControlCheck');
    const isGlobalControl = globalCheck ? globalCheck.checked : false;
    const globalDist = parseFloat(document.getElementById('globalControlDist') ? document.getElementById('globalControlDist').value : 0);
    const globalElev = parseFloat(document.getElementById('globalControlElev') ? document.getElementById('globalControlElev').value : 0);

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

    const totalSegments = window._totalSegments || 0;

    document.querySelectorAll('.runner-card').forEach((card, rIdx) => {
        const isRandom = card.querySelector('.r-random-segs').checked;
        let segs = [];
        const segCount = parseInt(card.querySelector('.r-seg-count').value) || 0;

        if (!isRandom) {
            segs = Array.from(card.querySelectorAll('.r-seg-id'))
                .map(inp => parseInt(inp.value))
                .filter(v => !isNaN(v));
        } else {
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

        // Barevná paleta pro běžce (odlišitelné barvy)
        const colors = [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
            '#14b8a6', '#f97316', '#06b6d4', '#6366f1', '#a855f7', '#6b7280'
        ];
        const runnerColor = colors[rIdx % colors.length];
        const ctrlHms = card.querySelector('.r-time').value;

        runners.push({
            name: card.querySelector('.r-name').value,
            color: runnerColor,
            ctrl_dist_m: isGlobalControl ? globalDist : parseFloat(card.querySelector('.r-dist').value),
            ctrl_elev: isGlobalControl ? globalElev : parseFloat(card.querySelector('.r-elev').value),
            ctrl_time_hms: ctrlHms,
            ctrl_time_min: parseHMS(ctrlHms),
            target_count: segCount,
            segments: segs
        });
    });

    return runners;
}

/**
 * Zpracuje formulář Kroku 2, přečte soubor trasy, vytvoří závod a uloží jej.
 */
async function handleGeneratePlan(event) {
    event.preventDefault();

    let routeData = null;
    if (window._tempUploadedRoute) {
        routeData = window._tempUploadedRoute;
    } else {
        const fileInput = document.getElementById('routeFileInput');
        if (!fileInput.files || fileInput.files.length === 0) {
            alert("Prosím nahrajte JSON soubor s trasou nebo vyberte předvyplněnou šablonu.");
            return;
        }

        try {
            routeData = await readRouteFile(fileInput.files[0]);
        } catch (err) {
            alert("Nepodařilo se načíst trasu: " + err.message);
            return;
        }
    }

    if (!Array.isArray(routeData)) {
        alert("Neplatný formát trasy. Soubor musí obsahovat seznam úseků.");
        return;
    }

    // Posbírat běžce
    const runners = collectRunnersFromSetup();
    if (runners.length === 0) {
        alert("Prosím přidejte alespoň jednoho běžce.");
        return;
    }

    // Namapovat raw data z importu do standardizovaných segmentů
    const segments = routeData.map(s => {
        const distMeters = parseFloat(s.delka_km || s.dist || 0);
        // Pokud je hodnota > 500, jde nejspíš o metry -> přepočítáme na km. Jinak je to v km.
        const distKm = distMeters > 500 ? (distMeters / 1000.0) : distMeters;

        return {
            id: parseInt(s.usek_id || s.id),
            name: s.nazev || s.name || `Úsek ${s.usek_id || s.id}`,
            dist: distKm,
            elev_up: parseFloat(s.stoupani_m || s.elev_up || 0),
            elev_down: parseFloat(s.klesani_m || s.elev_down || 0),
            difficulty: parseInt(s.obtiznost || s.difficulty || 3),
            is_done: false,
            actual_time: ""
        };
    });

    // Vygenerovat unikátní ID závodu
    const raceId = 'race-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    const newRaceObj = {
        id: raceId,
        name: window._tempNewRace.name,
        start_time: window._tempNewRace.start_time,
        segment_count: window._tempNewRace.segment_count,
        segments: segments,
        runners: runners,
        logistics: null
    };

    // Uložit do localStorage
    saveRaceToLocalStorage(newRaceObj);

    // Vyčistit setup states
    window._tempNewRace = null;
    window._tempUploadedRoute = null;

    // Přepnout na detail nového závodu!
    window.location.hash = `#race/${raceId}`;
}


// ============================================
// POMOCNÝ GENERÁTOR PRÁZDNÉHO JSONU
// ============================================

/**
 * Vygeneruje a stáhne prázdnou JSON šablonu pro N úseků přímo v prohlížeči.
 */
function downloadEmptyJson(n) {
    const data = [];
    for (let i = 1; i <= n; i++) {
        data.push({
            usek_id: i,
            nazev: "",
            delka_km: "",
            stoupani_m: "",
            klesani_m: "",
            obtiznost: ""
        });
    }

    const jsonString = JSON.stringify(data, null, 4);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `plan_${n}.json`;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Bind click handler dynamically
function initDownloadButton() {
    const btn = document.getElementById('downloadEmptyJsonBtn');
    if (btn) {
        btn.onclick = () => {
            const count = window._totalSegments || (window._tempNewRace ? window._tempNewRace.segment_count : 15);
            downloadEmptyJson(count);
        };
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDownloadButton);
} else {
    initDownloadButton();
}
