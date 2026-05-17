/**
 * race.js – Hlavní logika pro zobrazení závodu (Step 3)
 *
 * Tento soubor řídí celý pohled na detail závodu:
 *   - Výpočet a zobrazení časů startu, trvání a předávek
 *   - Adaptivní predikce na základě předchozího výkonu běžce
 *   - Synchronizace stavu s backendem (polling každých 10s)
 *   - Označování úseků jako „doběhnutých"
 *   - Správa modálu nastavení závodu
 *
 * Globální proměnné (definované inline v HTML):
 *   - START_ISO     : ISO 8601 řetězec se startem závodu
 *   - RACE_ID       : Unikátní ID závodu v databázi
 *   - segmentsData  : Pole objektů s daty úseků (z Jinja)
 *   - runnersData   : Pole objektů s daty běžců (z Jinja)
 */


// ============================================
// KOMPATIBILITA SE STARŠÍMI ZÁVODY
// ============================================

/**
 * Rekonstruuje data běžců ze segmentů, pokud v DB nejsou uložena.
 * Starší závody nemají explicitní pole 'runners' – musíme je
 * zpětně odvodit z přiřazení úseků.
 */
function ensureRunnersData() {
    if (!runnersData || runnersData.length === 0) {
        const reconstructed = {};
        segmentsData.forEach(seg => {
            if (seg.runner && seg.runner !== 'Nepřiřazeno') {
                if (!reconstructed[seg.runner]) {
                    reconstructed[seg.runner] = {
                        name: seg.runner,
                        color: seg.runner_color || '#808080',
                        ctrl_time_hms: '',
                        ctrl_time_min: 0,
                        ctrl_dist_m: 5000,
                        ctrl_elev: 100,
                        segments: [],
                        _first_seg: seg  // Uložíme první úsek pro zpětný výpočet tempa
                    };
                }
                reconstructed[seg.runner].segments.push(seg.id);
            }
        });

        // Zpětný výpočet kontrolního času z prvního úseku běžce
        // Logika: pace = planned_duration / eq_dist, ctrl_time = pace * ctrl_eq_dist
        Object.values(reconstructed).forEach(r => {
            const seg = r._first_seg;
            if (seg && seg.planned_duration_min && seg.dist > 0) {
                const segEqDist = seg.dist + (seg.elev_up / 100.0);
                if (segEqDist > 0) {
                    const paceMinPerKm = seg.planned_duration_min / segEqDist;
                    const ctrlEqDist = (r.ctrl_dist_m / 1000.0) + (r.ctrl_elev / 100.0);
                    const ctrlTimeMin = paceMinPerKm * ctrlEqDist;
                    r.ctrl_time_min = ctrlTimeMin;
                    const h = Math.floor(ctrlTimeMin / 60);
                    const m = Math.floor(ctrlTimeMin % 60);
                    const s = Math.round((ctrlTimeMin % 1) * 60);
                    r.ctrl_time_hms = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
                }
            }
            delete r._first_seg;
        });

        runnersData = Object.values(reconstructed);
    }
}


// ============================================
// FORMÁTOVACÍ FUNKCE
// ============================================

/** Koeficienty výkonu běžců (aktualizují se při každém přepočtu) */
let runnerFactors = {};

/**
 * Formátuje minuty na řetězec HH:MM:SS (pro input pole).
 * @param {number} totalMin – Celkový čas v minutách
 * @returns {string} – Formátovaný řetězec, např. "01:23:45"
 */
function formatHMS(totalMin) {
    let h = Math.floor(totalMin / 60);
    let m = Math.floor(totalMin % 60);
    let s = Math.round((totalMin % 1) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Formátuje minuty na lidsky čitelný řetězec "Xh YYm".
 * @param {number} totalMin – Celkový čas v minutách
 * @returns {string} – Formátovaný řetězec, např. "2h 05m"
 */
function formatHM(totalMin) {
    let h = Math.floor(totalMin / 60);
    let m = Math.floor(totalMin % 60);
    return `${h}h ${m.toString().padStart(2, '0')}m`;
}

/**
 * Formátuje Date objekt na řetězec HH:MM.
 * @param {Date} date – Objekt data
 * @returns {string} – Formátovaný čas, např. "14:30"
 */
function formatTime(date) {
    return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
}

/**
 * Formátuje odchylku v minutách na řetězec ±HH:MM:SS.
 * @param {number} diffMinutes – Rozdíl v minutách (kladný = pomalejší)
 * @returns {string} – Formátovaný řetězec, např. "+00:05:30"
 */
function formatDiff(diffMinutes) {
    let diffSec = diffMinutes * 60;
    let sign = diffSec >= 0 ? '+' : '-';
    let absSec = Math.abs(Math.round(diffSec));
    let h = Math.floor(absSec / 3600).toString().padStart(2, '0');
    let m = Math.floor((absSec % 3600) / 60).toString().padStart(2, '0');
    let s = (absSec % 60).toString().padStart(2, '0');
    return `${sign}${h}:${m}:${s}`;
}

/**
 * Parsuje řetězec HH:MM:SS na minuty.
 * @param {string} s – Řetězec s časem (podporuje HH:MM:SS i HH:MM)
 * @returns {number} – Celkový čas v minutách
 */
function parseHMS(s) {
    let p = s.split(':').map(v => parseFloat(v) || 0);
    if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
    if (p.length === 2) return p[0] * 60 + p[1];
    return 0;
}


// ============================================
// SYNCHRONIZACE SE SERVEREM
// ============================================

/**
 * Odešle aktualizaci jednoho úseku na server.
 * Volá se při označení úseku jako doběhnutého nebo při změně času.
 *
 * @param {number}  idx        – Index úseku (0-indexed)
 * @param {boolean} isDone     – Zda je úsek označen jako doběhnutý
 * @param {string}  actualTime – Skutečný čas úseku (HH:MM:SS)
 */
async function pushUpdateToServer(idx, isDone, actualTime) {
    try {
        await fetch(`/api/race/${RACE_ID}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index: idx, is_done: isDone, actual_time: actualTime })
        });
    } catch (e) { console.error("Chyba při ukládání na server", e); }
}

/**
 * Periodicky stahuje aktuální stav závodu ze serveru.
 * Pokud se data liší od lokálního stavu (např. jiný uživatel
 * označil úsek), aktualizuje DOM a přepočítá časy.
 */
async function pollServer() {
    try {
        let res = await fetch(`/api/race/${RACE_ID}`);
        if (!res.ok) return;
        let data = await res.json();
        let needRecalc = false;

        data.segments.forEach((seg, i) => {
            let box = document.getElementById(`seg-${i}`);
            let chk = box.querySelector('.status-check input');
            let inp = box.querySelector('.actual-time-input');
            let inputWrap = box.querySelector('.actual-input-wrap');

            // Ošetření starých záznamů v databázi, kde chybí hodnoty
            let serverIsDone = seg.is_done || false;
            let serverTime = seg.actual_time || "";

            // Pokud se data ze serveru liší od lokálních, aktualizuj DOM
            if (chk.checked !== serverIsDone || inp.value !== serverTime) {
                chk.checked = serverIsDone;
                inp.value = serverTime;
                inputWrap.style.display = serverIsDone ? 'block' : 'none';
                needRecalc = true;
            }
        });
        if (needRecalc) recalculateAll();
    } catch (e) { console.error("Chyba synchronizace", e); }
}

/** Spustí kontrolu nových dat každých 10 sekund */
setInterval(pollServer, 10000);


// ============================================
// OVLÁDÁNÍ ÚSEKŮ (checkbox, čas)
// ============================================

/**
 * Zpracuje kliknutí na checkbox „doběhnuto" u úseku.
 * Při zaškrtnutí předvyplní skutečný čas predikovanou hodnotou
 * (s ohledem na předchozí výkon běžce).
 *
 * @param {number}           idx – Index úseku (0-indexed)
 * @param {HTMLInputElement} cb  – Checkbox element
 */
function toggleDone(idx, cb) {
    const box = document.getElementById(`seg-${idx}`);
    const inputWrap = box.querySelector('.actual-input-wrap');
    const inputEl = box.querySelector('.actual-time-input');

    inputWrap.style.display = cb.checked ? 'block' : 'none';

    // Předvyplnění použije dynamicky predikovaný čas (včetně koeficientu běžce)
    if (cb.checked && (!inputEl.value || inputEl.value === 'undefined')) {
        const predictedMin = parseFloat(box.dataset.predictedMin || box.dataset.plannedMin);
        inputEl.value = formatHMS(predictedMin);
    }

    let actualTime = inputEl.value;
    pushUpdateToServer(idx, cb.checked, actualTime);
    recalculateAll();
}

/**
 * Uloží ručně zadaný čas úseku na server.
 * @param {number}           idx     – Index úseku (0-indexed)
 * @param {HTMLInputElement} inputEl – Input s časem
 */
function saveTimeInput(idx, inputEl) {
    const box = document.getElementById(`seg-${idx}`);
    const isDone = box.querySelector('.status-check input').checked;
    pushUpdateToServer(idx, isDone, inputEl.value);
    recalculateAll();
}


// ============================================
// PŘEPOČET VŠECH ČASŮ
// ============================================

/**
 * Hlavní funkce pro přepočet všech časů v závodu.
 *
 * Pro každý úsek:
 *   1. Vezme plánovaný čas (dataset.plannedMin)
 *   2. Pokud má běžec předchozí výkon, aplikuje koeficient
 *      (např. pokud běžel o 10% pomaleji, predikce se zvýší)
 *   3. Pokud je úsek „doběhnutý", použije skutečný čas
 *   4. Aktualizuje DOM: start, trvání, tempo, ETA předávky
 *   5. Vypočítá souhrnné hodnoty (celkový čas, čas doběhu)
 */
function recalculateAll() {
    let currentTime = new Date(START_ISO);
    document.getElementById('total-start-time').innerText = formatTime(currentTime);

    let totalMin = 0;
    runnerFactors = {};

    const boxes = document.querySelectorAll('.segment-box');
    boxes.forEach((box, i) => {
        const runner = box.dataset.runner;
        const plannedMin = parseFloat(box.dataset.plannedMin);
        const isDone = box.querySelector('.status-check input').checked;
        const actualInput = box.querySelector('.actual-time-input').value;

        let duration = plannedMin;

        // Adaptivní predikce: Zohlednění předchozího výkonu TOHOTO běžce
        // runnerFactors[runner] = poměr skutečného/plánovaného času z posledního úseku
        if (!isDone && runnerFactors[runner]) {
            duration *= runnerFactors[runner];
        }

        // Uložíme predikovaný čas do datasetu, aby ho toggleDone mohl přečíst
        box.dataset.predictedMin = duration;

        if (isDone && actualInput.includes(':')) {
            // Úsek je doběhnutý – použijeme skutečný čas
            duration = parseHMS(actualInput);
            // Aktualizace koeficientu pro tohoto běžce
            runnerFactors[runner] = duration / plannedMin;

            // Zobrazení odchylky od plánu (zelená = rychlejší, červená = pomalejší)
            let diff = duration - plannedMin;
            let diffTag = box.querySelector('.diff-tag');
            diffTag.innerText = `(${formatDiff(diff)})`;
            diffTag.style.color = diff > 0 ? '#ef4444' : '#10b981';
        } else {
            box.querySelector('.diff-tag').innerText = '';
        }

        // Aktualizace textu startu a trvání
        box.querySelector('.start-time-text').innerText = `Start ${formatTime(currentTime)}`;
        let labelType = isDone && actualInput.includes(':') ? 'zaběhnuto' : 'odhad';
        box.querySelector('.duration-text').innerText = `${labelType} ${formatHM(duration)}`;

        // Výpočet a zobrazení tempa (min/km)
        let pace = duration / parseFloat(segmentsData[i].dist);
        box.querySelector('.pace-val').innerText = `${Math.floor(pace)}:${Math.floor((pace % 1) * 60).toString().padStart(2, '0')} /km`;

        // Posun aktuálního času a zobrazení ETA předávky
        currentTime = new Date(currentTime.getTime() + duration * 60000);
        box.querySelector('.eta-text strong').innerText = formatTime(currentTime);
        totalMin += duration;
    });

    // Souhrnné hodnoty v záhlaví
    document.getElementById('total-duration').innerText = formatHM(totalMin);
    document.getElementById('total-finish-time').innerText = formatTime(currentTime);
}


// ============================================
// NASTAVENÍ ZÁVODU (MODAL)
// ============================================

/** Otevře modální okno s nastavením závodu */
function openSettingsModal() {
    document.getElementById('settingsModal').style.display = 'block';
}

/** Zavře modální okno s nastavením závodu */
function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

/**
 * Uloží změny obecného nastavení závodu (název, start) na server.
 * Po úspěšném uložení provede reload stránky, aby se změny promítly.
 */
async function saveGeneralSettings() {
    const newName = document.getElementById('editRaceName').value;
    const newStart = document.getElementById('editStartTime').value;

    try {
        let res = await fetch(`/api/race/${RACE_ID}/edit_settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                race_name: newName,
                start_iso: newStart,
                runners: runnersData
            })
        });

        let data = await res.json();
        if (data.status === 'success') {
            window.location.reload();
        } else {
            alert("Chyba při ukládání: " + (data.error || "Neznámá chyba"));
        }
    } catch (e) {
        alert("Nepodařilo se uložit změny.");
        console.error(e);
    }
}


// ============================================
// ZAVÍRÁNÍ MODÁLŮ KLIKNUTÍM MIMO OBSAH
// ============================================

/**
 * Globální handler pro zavírání modálních oken a dropdownu
 * kliknutím na překryvnou vrstvu (mimo obsah modálu).
 */
window.onclick = function (event) {
    const modal = document.getElementById('settingsModal');
    const analysisModal = document.getElementById('analysisModal');
    const smartGenModal = document.getElementById('smartGenModal');
    const logisticsModal = document.getElementById('logisticsModal');
    const dropdown = document.getElementById('segmentsDropdown');

    if (event.target == modal) {
        modal.style.display = "none";
    }
    if (event.target == analysisModal) {
        analysisModal.style.display = "none";
    }
    if (event.target == smartGenModal) {
        smartGenModal.style.display = "none";
    }
    if (event.target == logisticsModal) {
        logisticsModal.style.display = "none";
    }

    // Zavřít dropdown, pokud se klikne mimo
    if (dropdown && dropdown.classList.contains('active')) {
        if (!dropdown.contains(event.target)) {
            dropdown.classList.remove('active');
        }
    }
}

/** Po načtení stránky spustíme přepočet všech časů */
window.onload = function() {
    ensureRunnersData();
    recalculateAll();
};
