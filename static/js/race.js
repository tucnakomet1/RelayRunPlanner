/**
 * race.js – Hlavní logika pro zobrazení závodu (Step 3)
 *
 * Tento soubor řídí celý pohled na detail závodu:
 *   - Výpočet a zobrazení časů startu, trvání a předávek
 *   - Adaptivní predikce na základě předchozího výkonu běžce
 *   - Označování úseků jako „doběhnutých"
 *   - Správa modálu nastavení závodu (název, start)
 *
 * Všechna data se ukládají lokálně přes localStorage.
 */


// ============================================
// KOMPATIBILITA SE STARŠÍMI ZÁVODY
// ============================================

/**
 * Rekonstruuje data běžců ze segmentů, pokud v DB nejsou uložena.
 */
function ensureRunnersData() {
    if (!window.runnersData || window.runnersData.length === 0) {
        const reconstructed = {};
        window.segmentsData.forEach(seg => {
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
                        _first_seg: seg
                    };
                }
                reconstructed[seg.runner].segments.push(seg.id);
            }
        });

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
                    r.ctrl_time_hms = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                }
            }
            delete r._first_seg;
        });

        window.runnersData = Object.values(reconstructed);
    }
}


// ============================================
// FORMÁTOVACÍ FUNKCE
// ============================================

let runnerFactors = {};

/** Formátuje minuty na řetězec HH:MM:SS */
function formatHMS(totalMin) {
    let h = Math.floor(totalMin / 60);
    let m = Math.floor(totalMin % 60);
    let s = Math.round((totalMin % 1) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Formátuje minuty na lidsky čitelný řetězec "Xh YYm" */
function formatHM(totalMin) {
    let h = Math.floor(totalMin / 60);
    let m = Math.floor(totalMin % 60);
    return `${h}h ${m.toString().padStart(2, '0')}m`;
}

/** Formátuje Date objekt na řetězec HH:MM */
function formatTime(date) {
    return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
}

/** Formátuje odchylku v minutách na řetězec ±HH:MM:SS */
function formatDiff(diffMinutes) {
    let diffSec = diffMinutes * 60;
    let sign = diffSec >= 0 ? '+' : '-';
    let absSec = Math.abs(Math.round(diffSec));
    let h = Math.floor(absSec / 3600).toString().padStart(2, '0');
    let m = Math.floor((absSec % 3600) / 60).toString().padStart(2, '0');
    let s = (absSec % 60).toString().padStart(2, '0');
    return `${sign}${h}:${m}:${s}`;
}

/** Parsuje řetězec HH:MM:SS nebo HH:MM na minuty */
function parseHMS(s) {
    if (!s) return 0;
    let p = s.split(':').map(v => parseFloat(v) || 0);
    if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
    if (p.length === 2) return p[0] * 60 + p[1];
    return 0;
}


// ============================================
// NOČNÍ ÚSEKY (SUNCALC)
// ============================================

/** Určí, zda úsek probíhá v noci pro souřadnice Prahy */
function isNightRun(startTime, endTime) {
    const lat = 50.073658;
    const lng = 14.418540;

    let current = new Date(startTime.getTime());
    let end = new Date(endTime.getTime());

    let totalMinutes = (end.getTime() - current.getTime()) / 60000;
    if (totalMinutes <= 0) return false;

    const sunData = {};

    while (current < end) {
        const dateStr = `${current.getFullYear()}-${current.getMonth() + 1}-${current.getDate()}`;

        if (!sunData[dateStr]) {
            const times = SunCalc.getTimes(current, lat, lng);
            const sunriseExtended = new Date(times.sunrise.getTime() + 30 * 60000);
            const sunsetExtended = new Date(times.sunset.getTime() - 30 * 60000);

            sunData[dateStr] = {
                sunriseExtended,
                sunsetExtended
            };
        }

        const daySun = sunData[dateStr];

        if (current < daySun.sunriseExtended || current >= daySun.sunsetExtended) {
            return true;
        }

        current = new Date(current.getTime() + 60000);
    }

    return false;
}


// ============================================
// KOEFICIENT EKVIVALENTNÍ VZDÁLENOSTI
// ============================================

/** Vypočítá předpokládaný čas běžce na daném úseku */
function calculateExpectedTime(runner, segmentDistKm, segmentElev) {
    if (!runner) return 0;

    let ctrlTimeMin = runner.ctrl_time_min;
    if (!ctrlTimeMin && runner.ctrl_time_hms) {
        ctrlTimeMin = parseHMS(runner.ctrl_time_hms);
    }

    const ctrlDistKm = runner.ctrl_dist_m / 1000.0;
    const ctrlEqDist = ctrlDistKm + (runner.ctrl_elev / 100.0);
    const runnerPaceMinPerKm = ctrlEqDist > 0 ? (ctrlTimeMin / ctrlEqDist) : 0;

    const segEqDist = segmentDistKm + (segmentElev / 100.0);
    return runnerPaceMinPerKm * segEqDist;
}


// ============================================
// UKLÁDÁNÍ STAVU ZÁVODU DO LOCALSTORAGE
// ============================================

/**
 * Aktualizuje stav úseku a zapíše jej do localStorage.
 */
function pushUpdateToServer(idx, isDone, actualTime) {
    if (window.segmentsData && window.segmentsData[idx]) {
        window.segmentsData[idx].is_done = isDone;
        window.segmentsData[idx].actual_time = actualTime;

        // Uložit do localStorage
        if (typeof saveCurrentRaceToLocalStorage === 'function') {
            saveCurrentRaceToLocalStorage();
        }
    }
}


// ============================================
// OVLÁDÁNÍ ÚSEKŮ
// ============================================

/** Zpracuje změnu checkboxu doběhnutí */
function toggleDone(idx, cb) {
    const box = document.getElementById(`seg-${idx}`);
    const inputWrap = box.querySelector('.actual-input-wrap');
    const inputEl = box.querySelector('.actual-time-input');

    inputWrap.style.display = cb.checked ? 'block' : 'none';

    if (cb.checked && (!inputEl.value || inputEl.value === 'undefined')) {
        const predictedMin = parseFloat(box.dataset.predictedMin || box.dataset.plannedMin);
        inputEl.value = formatHMS(predictedMin);
    }

    pushUpdateToServer(idx, cb.checked, inputEl.value);
    recalculateAll();
}

/** Zpracuje změnu skutečného času */
function saveTimeInput(idx, inputEl) {
    const box = document.getElementById(`seg-${idx}`);
    const isDone = box.querySelector('.status-check input').checked;
    pushUpdateToServer(idx, isDone, inputEl.value);
    recalculateAll();
}


// ============================================
// PŘEPOČET ČASŮ (CLIENT-SIDE)
// ============================================

/** Přepočítá kompletně startovní časy, doběhy a odchylky */
function recalculateAll() {
    if (!window.START_ISO) return;

    let currentTime = new Date(window.START_ISO);
    document.getElementById('total-start-time').innerText = formatTime(currentTime);

    let totalMin = 0;
    runnerFactors = {};

    // Vynulovat etapy běžců
    window.runnersData.forEach(r => r.run_count = 0);

    const boxes = document.querySelectorAll('.segment-box');
    boxes.forEach((box, i) => {
        const seg = window.segmentsData[i];
        const segId = seg.id;

        const runnerObj = window.runnersData.find(r => r.segments && r.segments.includes(segId));

        let runnerName = 'Nepřiřazeno';
        let runnerColor = '#dddddd';
        let runnerIteration = 0;
        let plannedMin = 0;

        if (runnerObj) {
            runnerObj.run_count = (runnerObj.run_count || 0) + 1;
            runnerName = runnerObj.name;
            runnerColor = runnerObj.color || '#808080';
            runnerIteration = runnerObj.run_count;
            plannedMin = calculateExpectedTime(runnerObj, parseFloat(seg.dist), parseFloat(seg.elev_up));
        }

        // Nastavit border a badge běžce v DOM
        box.style.borderLeftColor = runnerColor;
        const rBadge = box.querySelector('.runner-badge');
        if (rBadge) {
            rBadge.style.backgroundColor = runnerColor;
            rBadge.innerText = runnerName;
        }
        const rIter = box.querySelector('.runner-iter-val');
        if (rIter) {
            rIter.innerText = runnerIteration;
        }

        box.dataset.runner = runnerName;
        box.dataset.plannedMin = plannedMin;

        // Synchronizovat s segmentsData pro další moduly
        seg.planned_duration_min = plannedMin;
        seg.runner = runnerName;
        seg.runner_color = runnerColor;
        seg.runner_iteration = runnerIteration;

        const isDone = box.querySelector('.status-check input').checked;
        const actualInput = box.querySelector('.actual-time-input').value;

        let duration = plannedMin;

        // Adaptivní koeficienty
        if (!isDone && runnerFactors[runnerName]) {
            duration *= runnerFactors[runnerName];
        }

        box.dataset.predictedMin = duration;

        if (isDone && actualInput.includes(':')) {
            duration = parseHMS(actualInput);
            runnerFactors[runnerName] = duration / plannedMin;

            let diff = duration - plannedMin;
            let diffTag = box.querySelector('.diff-tag');
            diffTag.innerText = `(${formatDiff(diff)})`;
            diffTag.style.color = diff > 0 ? '#ef4444' : '#10b981';
        } else {
            box.querySelector('.diff-tag').innerText = '';
        }

        box.querySelector('.start-time-text').innerText = `Start ${formatTime(currentTime)}`;
        let labelType = isDone && actualInput.includes(':') ? 'zaběhnuto' : 'odhad';
        box.querySelector('.duration-text').innerText = `${labelType} ${formatHM(duration)}`;

        let pace = parseFloat(seg.dist) > 0 ? (duration / parseFloat(seg.dist)) : 0;
        box.querySelector('.pace-val').innerText = `${Math.floor(pace)}:${Math.floor((pace % 1) * 60).toString().padStart(2, '0')} /km`;

        let segmentStart = new Date(currentTime.getTime());
        currentTime = new Date(currentTime.getTime() + duration * 60000);
        let segmentEnd = new Date(currentTime.getTime());

        let isNight = isNightRun(segmentStart, segmentEnd);
        const nightBadge = box.querySelector('.night-badge');
        if (isNight) {
            box.classList.add('night-mode');
            if (nightBadge) nightBadge.style.display = 'inline-block';
        } else {
            box.classList.remove('night-mode');
            if (nightBadge) nightBadge.style.display = 'none';
        }

        box.querySelector('.eta-text strong').innerText = formatTime(currentTime);
        totalMin += duration;
    });

    document.getElementById('total-duration').innerText = formatHM(totalMin);
    document.getElementById('total-finish-time').innerText = formatTime(currentTime);
}


// ============================================
// OBECNÉ NASTAVENÍ ZÁVODU (MODAL)
// ============================================

function openSettingsModal() {
    document.getElementById('settingsModal').style.display = 'block';
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

/** Uloží název a startovní čas lokálně do localStorage a přepočítá časy */
function saveGeneralSettings() {
    const newName = document.getElementById('editRaceName').value;
    const newStart = document.getElementById('editStartTime').value;

    if (!window.RACE_ID) return;

    const races = getRacesFromLocalStorage();
    if (races[window.RACE_ID]) {
        races[window.RACE_ID].name = newName;
        races[window.RACE_ID].start_time = newStart;

        // Uložit do localStorage
        saveRacesToLocalStorage(races);

        // Aktualizovat globální proměnné v paměti
        window.START_ISO = newStart;
        document.getElementById('step3-race-title').innerText = newName;

        closeSettingsModal();
        recalculateAll();
    }
}
