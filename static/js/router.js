/**
 * router.js – Klientský hash-based router a správa localStorage
 * 
 * Tento soubor řídí navigaci mezi jednotlivými kroky (Step 1, Step 2, Step 3)
 * bez nutnosti obnovení stránky a načítá/ukládá data o závodech do localStorage.
 */

// ============================================
// POMOCNÉ FUNKCE PRO LOCALSTORAGE
// ============================================

/** Načte všechny uložené závody z localStorage */
function getRacesFromLocalStorage() {
    const data = localStorage.getItem('relay_races');
    return data ? JSON.parse(data) : {};
}

/** Uloží objekt všech závodů do localStorage */
function saveRacesToLocalStorage(racesObj) {
    localStorage.setItem('relay_races', JSON.stringify(racesObj));
}

/** Uloží nebo aktualizuje jeden konkrétní závod */
function saveRaceToLocalStorage(race) {
    const racesObj = getRacesFromLocalStorage();
    racesObj[race.id] = race;
    saveRacesToLocalStorage(racesObj);
}

/** Pomocná funkce pro uložení aktuálně zobrazeného závodu */
function saveCurrentRaceToLocalStorage() {
    if (!window.RACE_ID) return;
    const racesObj = getRacesFromLocalStorage();
    if (racesObj[window.RACE_ID]) {
        racesObj[window.RACE_ID].segments = window.segmentsData;
        racesObj[window.RACE_ID].runners = window.runnersData;
        racesObj[window.RACE_ID].name = document.getElementById('editRaceName')?.value || racesObj[window.RACE_ID].name;
        racesObj[window.RACE_ID].start_time = window.START_ISO;
        racesObj[window.RACE_ID].last_generation_method = window._lastGenerationMethod;
        saveRacesToLocalStorage(racesObj);
    }
}

/** Potvrdí a smaže závod z localStorage */
function confirmDeleteRace(raceId, raceName) {
    if (confirm(`Opravdu chcete smazat závod "${raceName}"?`)) {
        const racesObj = getRacesFromLocalStorage();
        delete racesObj[raceId];
        saveRacesToLocalStorage(racesObj);
        loadExistingRaces();
    }
}


// ============================================
// DYNAMICKÉ VYKRASLOVÁNÍ DOMU
// ============================================

/** Načte seznam existujících závodů a vygeneruje jej v Step 1 */
function loadExistingRaces() {
    const racesObj = getRacesFromLocalStorage();
    const raceList = document.getElementById('race-list');
    const existingSection = document.getElementById('existing-races-section');

    raceList.innerHTML = '';
    const raceIds = Object.keys(racesObj);

    if (raceIds.length > 0) {
        existingSection.style.display = 'block';
        raceIds.forEach(id => {
            const race = racesObj[id];
            const div = document.createElement('div');
            div.className = 'race-link-wrapper';
            div.style.position = 'relative';
            div.innerHTML = `
                <a href="#race/${race.id}" class="race-link-item">
                    <span class="race-link-icon">🏃</span>
                    <span class="race-link-name">${race.name}</span>
                    <span class="race-link-arrow">➔</span>
                </a>
                <button onclick="confirmDeleteRace('${race.id}', '${race.name.replace(/'/g, "\\'")}')" class="btn-delete-race" title="Smazat závod">×</button>
            `;
            raceList.appendChild(div);
        });
    } else {
        existingSection.style.display = 'none';
    }
}

/** Vygeneruje HTML skeleton segmentů pro Krok 3 */
function renderSegmentsDOM() {
    const list = document.getElementById('segments-list');
    list.innerHTML = '';

    if (!window.segmentsData || window.segmentsData.length === 0) {
        list.innerHTML = '<p>Závod nemá žádné úseky.</p>';
        return;
    }

    window.segmentsData.forEach((seg, i) => {
        const div = document.createElement('div');
        div.className = 'segment-box';
        div.id = `seg-${i}`;
        div.dataset.index = i;
        div.dataset.plannedMin = "0";
        div.dataset.runner = "Nepřiřazeno";
        div.style.borderLeftColor = "#dddddd";

        div.innerHTML = `
            <!-- Horní řádek: číslo, název, checkbox, badge běžce -->
            <div class="seg-top-row">
                <div class="seg-title">
                    <span class="seg-id">${seg.id}</span>
                    <span class="seg-name">${seg.name}</span>
                    <label class="status-check" title="Označit jako doběhnuté">
                        <input type="checkbox" style="display:none;" ${seg.is_done ? 'checked' : ''}
                            onchange="toggleDone(${i}, this)">
                        <span class="custom-chk"></span>
                    </label>
                </div>
                <div class="seg-right-group">
                    <span class="badge night-badge" style="display: none;">🌙 Noční</span>
                    <span class="runner-badge" style="background-color: #dddddd;">Nepřiřazeno</span>
                </div>
            </div>

            <!-- Časové údaje: start, odhad, skutečný čas -->
            <div class="seg-timing-row">
                <div class="timing-left">
                    <span class="start-time-text">Start --:--</span>
                    <span class="dot">•</span>
                    <span class="duration-text">odhad --</span>
                </div>
                <div class="timing-right">
                    <span class="diff-tag"></span>
                    <div class="actual-input-wrap"
                        style="display: ${seg.is_done ? 'block' : 'none'};">
                        <input type="text" placeholder="HH:MM:SS" class="actual-time-input"
                            value="${seg.actual_time || ''}" onchange="saveTimeInput(${i}, this)">
                    </div>
                </div>
            </div>

            <!-- Statistiky úseku (délka, stoupání, klesání, tempo) -->
            <div class="seg-stats-table">
                <div class="stat-col"><span>Délka</span><strong>${seg.dist} km</strong></div>
                <div class="stat-col"><span>Stoupání</span><strong>↗ ${seg.elev_up}m</strong></div>
                <div class="stat-col"><span>Klesání</span><strong>↘ ${seg.elev_down}m</strong></div>
                <div class="stat-col"><span>Tempo</span><strong class="pace-val">--:--</strong></div>
            </div>

            <!-- Patička: obtížnost, etapa běžce, očekávaná předávka -->
            <div class="seg-footer">
                <span>Obtížnost ${seg.difficulty}/5 • <span class="runner-iteration-text"><strong class="runner-iter-val">0</strong>. etapa běžce</span></span>
                <span class="eta-text">Očekávaná předávka v <strong>--:--</strong></span>
            </div>
        `;
        list.appendChild(div);
    });
}


// ============================================
// REAKCE NA HASH (ROUTER LOGIKA)
// ============================================

/** Řídí viditelnost kroků v závislosti na URL hashi */
function handleRouting() {
    const hash = window.location.hash || '';

    // Skrýt všechny sekce
    document.getElementById('step-1').style.display = 'none';
    document.getElementById('step-2').style.display = 'none';
    document.getElementById('step-3').style.display = 'none';

    // Zavřít případné otevřené sidebary a modaly
    if (typeof closeSidebar === 'function') closeSidebar();
    if (typeof closeSettingsModal === 'function') closeSettingsModal();
    if (typeof closeLogisticsModal === 'function') closeLogisticsModal();
    if (typeof closeAnalysisModal === 'function') closeAnalysisModal();
    if (typeof closeSmartGenModal === 'function') closeSmartGenModal();
    if (typeof closeShareModal === 'function') closeShareModal();

    const raceMatch = hash.match(/^#race\/([a-zA-Z0-9-]+)$/);

    if (raceMatch) {
        // ============================================
        // KROK 3 – DETAIL ZÁVODU
        // ============================================
        const raceId = raceMatch[1];
        const races = getRacesFromLocalStorage();
        const race = races[raceId];

        if (!race) {
            alert("Závod nebyl nalezen!");
            window.location.hash = '';
            return;
        }

        // Nastavení globálních proměnných pro výpočetní moduly
        window.RACE_ID = race.id;
        window.START_ISO = race.start_time;
        window.segmentsData = race.segments;
        window.runnersData = race.runners || [];
        window._lastGenerationMethod = race.last_generation_method || null;
        if (typeof updateRecalculateButtonVisibility === 'function') {
            updateRecalculateButtonVisibility();
        }

        // Inicializace logistiky z cache
        if (race.logistics) {
            if (typeof initLogisticsCache === 'function') {
                initLogisticsCache(race.logistics);
            }
        } else {
            if (typeof initLogisticsCache === 'function') {
                initLogisticsCache(null);
            }
        }

        // Naplnění editovatelných polí v modalu nastavení
        document.getElementById('editRaceName').value = race.name;
        document.getElementById('editStartTime').value = race.start_time.substring(0, 16);
        document.getElementById('step3-race-title').innerText = race.name;

        // Odkaz na závod
        document.getElementById('race-url-display').innerText = window.location.href;

        // Vykreslení segmentů v DOM
        renderSegmentsDOM();

        // Spuštění adaptivního přepočtu
        if (typeof ensureRunnersData === 'function') ensureRunnersData();
        if (typeof renderSidebarRunners === 'function') renderSidebarRunners();
        if (typeof recalculateAll === 'function') recalculateAll();

        document.getElementById('step-3').style.display = 'block';

    } else if (hash === '#step2') {
        // ============================================
        // KROK 2 – DETAIL TÝMU A BĚŽCŮ
        // ============================================
        if (!window._tempNewRace) {
            window.location.hash = '';
            return;
        }

        // Nastavení textů a limitů
        document.getElementById('step2-header-title').innerText = `Detail týmu - ${window._tempNewRace.name}`;
        document.getElementById('step2-hint-text').innerText = `Nejprve si stáhni prázdnou šablonu pro ${window._tempNewRace.segment_count} úseků, doplň ji a nahraj zpět.`;
        window._totalSegments = window._tempNewRace.segment_count;

        // Zobrazení/skrytí šablon podle velikosti
        document.querySelectorAll('.prefilled-btn').forEach(btn => btn.style.display = 'none');
        const count = window._tempNewRace.segment_count;
        if (count === 15 || count === 24 || count === 36) {
            const prefilledBtn = document.getElementById(`prefilled-${count}-btn`);
            if (prefilledBtn) prefilledBtn.style.display = 'inline-block';
        }

        // Reset info štítku o vybrané šabloně
        const info = document.getElementById('template-loaded-info');
        if (info) info.remove();
        document.querySelectorAll('.prefilled-btn').forEach(btn => {
            btn.style.backgroundColor = '';
            btn.style.color = 'var(--primary)';
        });

        // Vymazání a inicializace jednoho běžce
        const container = document.getElementById('runnersContainer');
        container.innerHTML = '';
        if (typeof generateRunners === 'function') generateRunners(1);
        document.getElementById('globalRunnerCount').value = 1;
        document.getElementById('globalControlCheck').checked = false;
        if (typeof toggleGlobalControl === 'function') toggleGlobalControl(false);

        // Vyčistit file input
        const fileInput = document.getElementById('routeFileInput');
        fileInput.value = '';
        fileInput.required = true;

        document.getElementById('step-2').style.display = 'block';

    } else {
        // ============================================
        // KROK 1 – ÚVODNÍ STRÁNKA (DASHBOARD)
        // ============================================
        loadExistingRaces();
        document.getElementById('step-1').style.display = 'block';
    }
}

/** Spustí router; nejdříve zpracuje import ze sdíleného odkazu #race_data=… */
function runRouter() {
    if (typeof processShareHashIfPresent === 'function' && processShareHashIfPresent()) {
        // hash byl nahrazen na #race/<id>, pokračovat normálním směrováním
    }
    handleRouting();
}

window.addEventListener('hashchange', runRouter);
document.addEventListener('DOMContentLoaded', runRouter);
