/**
 * generator.js – Generování a správa přiřazení úseků běžcům
 *
 * Obsahuje dvě metody generování:
 *   1. Náhodné generování – rychlé rozlosování úseků s rovnoměrným rozložením
 *   2. Pokročilé generování (Smart Gen) – volání ILP modelu na serveru
 *      s podporou pravidel (minimální pauza, auta, centrála)
 *
 * Po vygenerování se otevře analytický modal, kde si uživatel
 * prohlédne výsledky a může je ručně upravit před uložením.
 *
 * Globální proměnné (z race.js / inline):
 *   - runnersData   : Pole s daty běžců
 *   - segmentsData  : Pole s daty úseků
 *   - RACE_ID       : ID závodu
 */

/** Dočasné pole s vygenerovaným přiřazením (před potvrzením uživatelem) */
let tempGeneratedRunners = [];

/**
 * Spočítá tempo běžce (min/km) z jeho referenčního úseku.
 */
function getRunnerPace(runner) {
    const distM = parseFloat(runner.ctrl_dist_m || 5000);
    const timeMin = parseFloat(runner.ctrl_time_min || 25);
    if (distM <= 0) return 999.0;
    return timeMin / (distM / 1000.0);
}

/**
 * Spočítá obtížnost/úsilí úseku na základě délky, stoupání a obtížnosti.
 */
function getSegmentDifficultyScore(seg) {
    const d = parseFloat(seg.dist || 0);
    const e = parseFloat(seg.elev_up || 0);
    const diff = parseInt(seg.difficulty || 3);
    // Skóre úsilí: vzdálenost + převýšení/100 + obtížnost * 1.5
    return d + (e / 100.0) + (diff * 1.5);
}

/**
 * Provede výkonnostní spárování (post-processing):
 * 1. Spočítá tempo pro každého běžce.
 * 2. Rozdělí běžce do skupin (buď celá skupina dohromady, nebo po jednotlivých autech).
 * 3. Pro každou skupinu spočítá celkovou obtížnost sad vygenerovaných úseků.
 * 4. Seřadí sady úseků od nejtěžší po nejlehčí.
 * 5. Seřadí běžce ve skupině od nejrychlejšího po nejpomalejšího.
 * 6. Přepíše běžcům sady úseků tak, aby nejrychlejší dostali nejtěžší sady.
 */
function postProcessPerformanceMatching(runners, carCount, hasCentral, cars) {
    if (!runners || runners.length === 0) return;

    // Spočítáme tempo pro každého běžce
    runners.forEach(r => {
        r._pace = getRunnerPace(r);
    });

    // Definujeme skupiny běžců, mezi kterými můžeme vyměňovat úseky (car groupings)
    let groups = [];
    if (hasCentral || !cars || cars.length === 0) {
        // Všichni běžci v jedné skupině (libovolná výměna)
        groups.push(runners.map((r, idx) => idx));
    } else {
        // Skupiny podle aut
        cars.forEach(carRunners => {
            if (carRunners && carRunners.length > 0) {
                groups.push([...carRunners]);
            }
        });
    }

    // Pro každou skupinu provedeme seřazení a přiřazení
    groups.forEach(memberIndices => {
        if (memberIndices.length <= 1) return;

        // Vytáhneme běžce v této skupině
        const groupRunners = memberIndices.map(idx => runners[idx]);

        // Vytáhneme jejich aktuálně přiřazené sady úseků
        // Každá sada úseků má celkovou obtížnost
        const segmentSets = groupRunners.map(r => {
            const segmentsList = [...(r.segments || [])];
            const totalDiff = segmentsList.reduce((sum, segNum) => {
                const seg = segmentsData[segNum - 1];
                return sum + (seg ? getSegmentDifficultyScore(seg) : 0);
            }, 0);
            return {
                segments: segmentsList,
                totalDiff: totalDiff
            };
        });

        // Seřadíme sady úseků od nejtěžší po nejlehčí
        segmentSets.sort((a, b) => b.totalDiff - a.totalDiff);

        // Seřadíme běžce v této skupině od nejrychlejšího po nejpomalejšího (podle tempa)
        groupRunners.sort((a, b) => a._pace - b._pace);

        // Přiřadíme seřazené sady úseků seřazeným běžcům!
        groupRunners.forEach((runner, sortedIdx) => {
            runner.segments = segmentSets[sortedIdx].segments;
        });
    });

    // Vyčistíme pomocné vlastnosti
    runners.forEach(r => {
        delete r._pace;
    });
}


// ============================================
// NÁHODNÉ GENEROVÁNÍ
// ============================================

/**
 * Vybere náhodný nepoužitý úsek z daného intervalu.
 * Zajišťuje rovnoměrné rozložení – úseky jsou vybírány z „pásem" trasy.
 *
 * @param {number} minRange – Dolní hranice intervalu (1-indexed)
 * @param {number} maxRange – Horní hranice intervalu (1-indexed)
 * @param {Set}    usedSet  – Množina již přiřazených úseků
 * @returns {number|null} – Číslo vybraného úseku nebo null
 */
function pickRandomUnused(minRange, maxRange, usedSet) {
    let available = [];
    for (let i = minRange; i <= maxRange; i++) {
        if (!usedSet.has(i)) available.push(i);
    }
    if (available.length > 0) {
        const picked = available[Math.floor(Math.random() * available.length)];
        usedSet.add(picked);
        return picked;
    }
    // Fallback: celá trasa
    for (let i = 1; i <= segmentsData.length; i++) {
        if (!usedSet.has(i)) {
            usedSet.add(i);
            return i;
        }
    }
    return null;
}

/**
 * Vygeneruje náhodné přiřazení úseků pro všechny běžce.
 * Zachovává počet úseků každého běžce, ale přiřadí nové z rovnoměrně
 * rozložených intervalů trasy. Zohledňuje výkonnost běžců a obtížnost úseků.
 */
function generateRandomSegments(useCurrentTemp = false) {
    document.getElementById('segmentsDropdown').classList.remove('active');

    const sourceRunners = useCurrentTemp && tempGeneratedRunners && tempGeneratedRunners.length > 0
        ? tempGeneratedRunners
        : window.runnersData;

    if (!sourceRunners || sourceRunners.length === 0) {
        alert("Nejsou přiřazeni žádní běžci!");
        return;
    }

    const totalSegments = segmentsData.length;
    let usedSet = new Set();

    // Vytáhneme počet segmentů pro každého běžce
    const counts = sourceRunners.map(r => r.target_count || (r.segments ? r.segments.length : 0));

    // Deep copy originálních dat
    tempGeneratedRunners = JSON.parse(JSON.stringify(window.runnersData));

    tempGeneratedRunners.forEach((runner, idx) => {
        const segCount = counts[idx];
        runner.segments = []; // Vyprázdníme pro nové přiřazení

        if (segCount > 0 && totalSegments > 0) {
            // Rozdělíme trasu na segCount stejně velkých intervalů
            const intervalSize = totalSegments / segCount;
            for (let k = 0; k < segCount; k++) {
                const minRange = Math.floor(k * intervalSize) + 1;
                const maxRange = k === segCount - 1 ? totalSegments : Math.floor((k + 1) * intervalSize);
                const picked = pickRandomUnused(minRange, maxRange, usedSet);
                if (picked !== null) runner.segments.push(picked);
            }
            runner.segments.sort((a, b) => a - b);
        }
    });

    // Provedeme post-processing pro dokonalé výkonnostní spárování napříč celým týmem
    postProcessPerformanceMatching(tempGeneratedRunners, 1, true, null);

    window._lastGenerationMethod = 'random';
    updateRecalculateButtonVisibility();
    showAnalysisModal();
}


// ============================================
// ANALYTICKÝ MODAL (výsledky generování)
// ============================================

/**
 * Otevře modal s vizualizací vygenerovaného přiřazení.
 * Obsahuje karty běžců se statistikami a grid s možností ruční úpravy.
 */
function showAnalysisModal() {
    const modal = document.getElementById('analysisModal');
    const body = document.getElementById('analysisModalBody');

    body.innerHTML = `
        <div id="analysisCardsContainer" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;"></div>
        <hr style="border-top: 1px solid var(--border-color); margin: 20px 0;">

        <h4 style="margin-top: 0;">Ruční úprava přiřazení (drag & drop alternativa)</h4>
        <div id="analysisSegmentsGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;"></div>
    `;

    renderAnalysisCards();
    renderAnalysisGrid();

    modal.style.display = 'block';
}

/**
 * Vykreslí karty běžců v analytickém modalu.
 * Každá karta zobrazuje přiřazené úseky a souhrnné statistiky.
 */
function renderAnalysisCards() {
    const container = document.getElementById('analysisCardsContainer');
    container.innerHTML = '';

    tempGeneratedRunners.forEach((runner, idx) => {
        let dist = 0;
        let elevUp = 0;
        let elevDown = 0;

        runner.segments.sort((a, b) => a - b);

        // Výpočet statistik ze segmentů
        runner.segments.forEach(segId => {
            const s = segmentsData.find(x => x.id === segId);
            if (s) {
                dist += s.dist;
                elevUp += s.elev_up;
                elevDown += s.elev_down;
            }
        });

        const div = document.createElement('div');
        div.className = 'analysis-card';

        const colorCircle = `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background-color:${runner.color};"></span>`;

        div.innerHTML = `
            <h4 style="margin:0 0 12px 0; display:flex; align-items:center; gap:8px;">${colorCircle} Běžec ${idx + 1}: ${runner.name}</h4>
            <div class="analysis-grid">
                <div class="a-col"><span class="a-lbl">Nové úseky</span><span class="a-val" style="font-size:1.1rem;">${runner.segments.join(', ') || '-'}</span></div>
                <div class="a-col"><span class="a-lbl">Vzdálenost</span><span class="a-val">${dist.toFixed(1)} km</span></div>
                <div class="a-col"><span class="a-lbl">Nastoupá</span><span class="a-val" style="color:var(--primary);">${Math.round(elevUp)} m</span></div>
                <div class="a-col"><span class="a-lbl">Naklesá</span><span class="a-val" style="color:#10b981;">${Math.round(elevDown)} m</span></div>
            </div>
        `;
        container.appendChild(div);
    });
}

/**
 * Vykreslí grid s dropdown selecty pro ruční úpravu přiřazení.
 * Každý úsek má select, kde lze změnit přiřazeného běžce.
 */
function renderAnalysisGrid() {
    const container = document.getElementById('analysisSegmentsGrid');
    container.innerHTML = '';

    segmentsData.forEach((s) => {
        const div = document.createElement('div');
        div.style.border = "1px solid var(--border-color)";
        div.style.padding = "10px";
        div.style.borderRadius = "6px";
        div.style.background = "var(--bg-card)";

        // Najdeme aktuálně přiřazeného běžce
        let currentRunnerIdx = -1;
        tempGeneratedRunners.forEach((r, idx) => {
            if (r.segments.includes(s.id)) currentRunnerIdx = idx;
        });

        // Vytvoříme options pro select
        let options = tempGeneratedRunners.map((r, idx) => {
            let sel = (idx === currentRunnerIdx) ? 'selected' : '';
            return `<option value="${idx}" ${sel}>${r.name}</option>`;
        }).join('');

        div.innerHTML = `
            <div style="font-size: 0.85rem; font-weight: bold; margin-bottom: 5px; color: var(--text-color);">Úsek ${s.id} <span style="font-weight: normal;">(${s.dist}km, ↗${s.elev_up}m)</span></div>
            <select style="width: 100%; padding: 4px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-color);" onchange="changeSegmentRunner(${s.id}, this.value)">
                <option value="-1">Nikdo</option>
                ${options}
            </select>
        `;
        container.appendChild(div);
    });
}

/**
 * Změní přiřazení běžce k úseku v dočasných datech.
 * @param {number} segmentId      – ID úseku (1-indexed)
 * @param {string} newRunnerIdxStr – Nový index běžce (jako string)
 */
function changeSegmentRunner(segmentId, newRunnerIdxStr) {
    const newRunnerIdx = parseInt(newRunnerIdxStr);

    // Odstraníme úsek od všech běžců
    tempGeneratedRunners.forEach(r => {
        r.segments = r.segments.filter(id => id !== segmentId);
    });

    // Přiřadíme novému běžci
    if (newRunnerIdx >= 0) {
        tempGeneratedRunners[newRunnerIdx].segments.push(segmentId);
    }

    // Překreslíme karty (ne grid – tam uživatel právě kliká)
    renderAnalysisCards();
}

/** Zavře analytický modal */
function closeAnalysisModal() {
    document.getElementById('analysisModal').style.display = 'none';
}

function applyGeneratedSegments() {
    if (!tempGeneratedRunners) return;

    // Přepsat globální běžce vygenerovaným rozřazením
    window.runnersData = JSON.parse(JSON.stringify(tempGeneratedRunners));

    // Uložit do localStorage
    if (typeof saveCurrentRaceToLocalStorage === 'function') {
        saveCurrentRaceToLocalStorage();
    }

    closeAnalysisModal();

    // Překreslit a přepočítat časy na místě
    if (typeof renderSidebarRunners === 'function') {
        renderSidebarRunners();
    }
    if (typeof recalculateAll === 'function') {
        recalculateAll();
    }
}


// ============================================
// POKROČILÉ GENEROVÁNÍ (Smart Gen – ILP model)
// ============================================

/** Otevře modal pro pokročilé generování s pravidly */
function openSmartGenModal() {
    document.getElementById('segmentsDropdown').classList.remove('active');
    if (!runnersData || runnersData.length === 0) {
        alert("Nejsou přiřazeni žádní běžci!");
        return;
    }
    updateSmartGenUI();
    document.getElementById('smartGenModal').style.display = 'block';
}

/** Zavře Smart Gen modal */
function closeSmartGenModal() {
    cancelSmartGeneration();
    document.getElementById('smartGenModal').style.display = 'none';
}

/** Globální instance aktivního Web Workera pro optimalizaci */
let activeSmartGenWorker = null;

/** Stornuje spuštěné výpočty (nepotřebné pro rychlý synchronní solver) */
function cancelSmartGeneration() {
    // Solver běží bleskově v hlavním vlákně, storno netřeba
}

/**
 * Aktualizuje viditelnost prvků ve Smart Gen modalu
 * na základě stavu checkboxů (centrála, preferovaní lidé).
 */
function updateSmartGenUI() {
    const hasCentral = document.getElementById('sgHasCentral').checked;
    const prefContainer = document.getElementById('sgPreferredPeopleContainer');
    const carFormsContainer = document.getElementById('sgCarFormsContainer');
    const usePreferred = document.getElementById('sgUsePreferred').checked;

    if (hasCentral) {
        // S centrálou se nepoužívají preferovaní lidé v autech
        prefContainer.style.display = 'none';
    } else {
        prefContainer.style.display = 'block';
        if (usePreferred) {
            carFormsContainer.style.display = 'flex';
            generateCarForms();
        } else {
            carFormsContainer.style.display = 'none';
        }
    }
}

/**
 * Vygeneruje formuláře pro přiřazení běžců do aut.
 * Každé auto má checkboxy pro výběr běžců.
 */
function generateCarForms() {
    const carCount = parseInt(document.getElementById('sgCarCount').value) || 1;
    const container = document.getElementById('sgCarFormsContainer');
    container.innerHTML = '';

    for (let i = 0; i < carCount; i++) {
        let div = document.createElement('div');
        div.style.border = "1px solid var(--border-color)";
        div.style.padding = "10px";
        div.style.borderRadius = "6px";
        div.style.background = "var(--bg-card)";

        let html = `<h4 style="margin-top:0; margin-bottom:10px;">Auto ${i + 1}</h4><div style="display: flex; flex-wrap: wrap; gap: 10px;">`;
        runnersData.forEach((r, idx) => {
            html += `<label style="display:flex; align-items:center; gap:5px; font-size:0.9rem; font-weight:normal; cursor:pointer;">
                <input type="checkbox" name="car_${i}_runner" value="${idx}" style="width:auto;"> ${r.name}
            </label>`;
        });
        html += `</div>`;
        div.innerHTML = html;
        container.appendChild(div);
    }
}

/**
 * Logovací funkce pro zobrazení diagnostiky optimalizace v reálném čase.
 */
function logToDiagnostics(message) {
    console.log("[ILP Diagnostics]", message);
    const container = document.getElementById('sgDiagnosticsContainer');
    const logDiv = document.getElementById('sgDiagnosticsLog');
    if (container && logDiv) {
        container.style.display = 'block';
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
        logDiv.innerHTML += `[${timeStr}] ${message}\n`;
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

function clearDiagnostics() {
    const container = document.getElementById('sgDiagnosticsContainer');
    const logDiv = document.getElementById('sgDiagnosticsLog');
    if (container && logDiv) {
        container.style.display = 'none';
        logDiv.innerHTML = '';
    }
}

/**
 * Najde optimální přiřazení úseků běžcům pomocí ILP (celočíselného lineárního programování)
 * přímo v prohlížeči přes knihovnu glpk.js.
 * 
 * Kopíruje kompletní optimalizační ILP model z původního generator.py.
 */
function solveIlpModel(glpk, runners, segments, gap, carCount, hasCentral, cars, useSpread) {
    const R = runners.length;
    const S = segments.length;

    // Průměrná vzdálenost a převýšení na úsek
    const avg_dist = S > 0 ? segments.reduce((sum, seg) => sum + (seg.dist || 0), 0) / S : 0;
    const avg_elev = S > 0 ? segments.reduce((sum, seg) => sum + (seg.elev_up || 0), 0) / S : 0;

    // Příprava logistiky aut (pokud hasCentral = false)
    const car_assignments = [];
    if (!hasCentral) {
        let car_turn = 0;
        let segment_idx = 0;
        while (segment_idx < S) {
            const active_car = cars[car_turn];
            if (!active_car || active_car.length === 0) {
                car_turn = (car_turn + 1) % carCount;
                continue;
            }
            const run_limit = active_car.length;
            let run_count = 0;
            while (run_count < run_limit && segment_idx < S) {
                car_assignments.push(car_turn);
                segment_idx++;
                run_count++;
            }
            car_turn = (car_turn + 1) % carCount;
        }
    }

    // Sestavení proměnných a mezí pro glpk.js (čistě feasibility model pro okamžité řešení)
    const objVars = [];
    const bounds = [];

    const binaries = [];
    for (let r = 0; r < R; r++) {
        for (let s = 0; s < S; s++) {
            let allowed = true;
            if (!hasCentral) {
                const assigned_car_idx = car_assignments[s];
                const allowed_runners = cars[assigned_car_idx] || [];
                if (!allowed_runners.includes(r)) {
                    allowed = false;
                }
            }
            if (allowed) {
                const varName = `x_${r}_${s}`;
                objVars.push({ name: varName, coef: 0.0 });
                binaries.push(varName);
            }
        }
    }

    const subjectTo = [];

    // 1. Omezení obsazenosti úseku (každý úsek běží právě jeden běžec)
    for (let s = 0; s < S; s++) {
        const vars = [];
        for (let r = 0; r < R; r++) {
            let allowed = true;
            if (!hasCentral) {
                const assigned_car_idx = car_assignments[s];
                const allowed_runners = cars[assigned_car_idx] || [];
                if (!allowed_runners.includes(r)) {
                    allowed = false;
                }
            }
            if (allowed) {
                vars.push({ name: `x_${r}_${s}`, coef: 1.0 });
            }
        }
        subjectTo.push({
            name: `seg_occupied_${s}`,
            vars: vars,
            bnds: { type: glpk.GLP_FX, lb: 1.0, ub: 1.0 }
        });
    }

    // 2. Omezení zátěže běžce (každý běžec běží přesně target_count úseků)
    for (let r = 0; r < R; r++) {
        const vars = [];
        for (let s = 0; s < S; s++) {
            let allowed = true;
            if (!hasCentral) {
                const assigned_car_idx = car_assignments[s];
                const allowed_runners = cars[assigned_car_idx] || [];
                if (!allowed_runners.includes(r)) {
                    allowed = false;
                }
            }
            if (allowed) {
                vars.push({ name: `x_${r}_${s}`, coef: 1.0 });
            }
        }
        subjectTo.push({
            name: `runner_target_${r}`,
            vars: vars,
            bnds: { type: glpk.GLP_FX, lb: parseFloat(runners[r].target_count), ub: parseFloat(runners[r].target_count) }
        });
    }

    // 3. Omezení odpočinku - gap
    if (gap > 0) {
        for (let r = 0; r < R; r++) {
            for (let s_start = 0; s_start < S - gap; s_start++) {
                const vars = [];
                for (let i = 0; i <= gap; i++) {
                    const s = s_start + i;
                    let allowed = true;
                    if (!hasCentral) {
                        const assigned_car_idx = car_assignments[s];
                        const allowed_runners = cars[assigned_car_idx] || [];
                        if (!allowed_runners.includes(r)) {
                            allowed = false;
                        }
                    }
                    if (allowed) {
                        vars.push({ name: `x_${r}_${s}`, coef: 1.0 });
                    }
                }
                if (vars.length > 0) {
                    subjectTo.push({
                        name: `gap_${r}_${s_start}`,
                        vars: vars,
                        bnds: { type: glpk.GLP_UP, lb: 0.0, ub: 1.0 }
                    });
                }
            }
        }
    }

    // 4. Spread constraint - rovnoměrné rozmístění
    if (useSpread) {
        for (let r = 0; r < R; r++) {
            const K = runners[r].target_count;
            if (K > 1) {
                const interval_size = S / K;
                for (let i = 0; i < K; i++) {
                    const start_idx = Math.round(i * interval_size);
                    const end_idx = Math.round((i + 1) * interval_size);

                    const vars = [];
                    for (let s = start_idx; s < end_idx; s++) {
                        let allowed = true;
                        if (!hasCentral) {
                            const assigned_car_idx = car_assignments[s];
                            const allowed_runners = cars[assigned_car_idx] || [];
                            if (!allowed_runners.includes(r)) {
                                allowed = false;
                            }
                        }
                        if (allowed) {
                            vars.push({ name: `x_${r}_${s}`, coef: 1.0 });
                        }
                    }
                    if (vars.length > 0) {
                        subjectTo.push({
                            name: `spread_${r}_${i}`,
                            vars: vars,
                            bnds: { type: glpk.GLP_UP, lb: 0.0, ub: 1.0 }
                        });
                    }
                }
            }
        }
    }

    // Model je nyní čistě feasibility model, spravedlivé rozdělení obtížnosti úseků
    // je dokonale zajištěno post-processingem (postProcessPerformanceMatching).

    const lp = {
        name: "RelayRunPlanner",
        objective: {
            direction: glpk.GLP_MIN,
            name: "obj",
            vars: objVars
        },
        subjectTo: subjectTo,
        bounds: bounds,
        binaries: binaries
    };

    const options = {
        msglev: glpk.GLP_MSG_ALL,
        presol: true,
        tmlim: 3 // glpk.js: časový limit v sekundách
    };

    logToDiagnostics(`Model: ${subjectTo.length} omezení, ${objVars.length} proměnných.`);
    logToDiagnostics(`Spouštím GLPK solver (limit 3s)...`);

    const result = glpk.solve(lp, options);
    const solveResult = result.result || {};
    const status = solveResult.status;

    const isFeasible = (status === glpk.GLP_OPT || status === glpk.GLP_FEAS);
    logToDiagnostics(`Výsledek solveru: status = ${status} (feasible = ${isFeasible})`);

    if (!isFeasible || !solveResult.vars) {
        logToDiagnostics(`Tento krok neuspěl – nepřípustné řešení nebo vypršel čas.`);
        return {
            status: "error",
            message: "Pravidla jsou příliš přísná a řešení neexistuje."
        };
    }

    // Extrakce přiřazení z binárních proměnných
    const assignment = new Array(S).fill(-1);
    let hasAssignments = false;

    for (let r = 0; r < R; r++) {
        for (let s = 0; s < S; s++) {
            const varName = `x_${r}_${s}`;
            if (solveResult.vars[varName] !== undefined && solveResult.vars[varName] > 0.5) {
                assignment[s] = r;
                hasAssignments = true;
            }
        }
    }

    if (!hasAssignments) {
        return {
            status: "error",
            message: "Optimalizace selhala."
        };
    }

    return {
        status: "success",
        assignment: assignment
    };
}

function generateIlpPlanInJS(glpk, runners, segments, gap, carCount, hasCentral, cars) {
    const R = runners.length;
    const S = segments.length;

    if (R === 0 || S === 0) {
        return { status: "error", message: "Nedostatek běžců nebo úseků pro optimalizaci." };
    }

    // Ujistíme se, že sum(target_count) == S
    let totalTarget = 0;
    runners.forEach(r => {
        r.target_count = r.target_count || (r.segments ? r.segments.length : 0);
        totalTarget += r.target_count;
    });

    if (totalTarget !== S && R > 0) {
        let diff = S - totalTarget;
        if (diff > 0) {
            while (diff > 0) {
                for (let i = 0; i < R && diff > 0; i++) {
                    runners[i].target_count++;
                    diff--;
                }
            }
        } else if (diff < 0) {
            while (diff < 0) {
                let changed = false;
                for (let i = 0; i < R && diff < 0; i++) {
                    if (runners[i].target_count > 1) {
                        runners[i].target_count--;
                        diff++;
                        changed = true;
                    }
                }
                if (!changed) break;
            }
        }
    }

    // 1. Zkusit plný model (včetně spread constraints)
    logToDiagnostics("FÁZE 1: Pokouším se o plný model (gap + spread)...");
    let res = solveIlpModel(glpk, runners, segments, gap, carCount, hasCentral, cars, true);
    if (res.status === "success") {
        logToDiagnostics("FÁZE 1 úspěšně nalezla řešení!");
        return res;
    }

    // 2. Fallback: bez spread constraints
    logToDiagnostics("FÁZE 1 selhala. FÁZE 2: Zkouším model bez spread constraints...");
    res = solveIlpModel(glpk, runners, segments, gap, carCount, hasCentral, cars, false);
    if (res.status === "success") {
        logToDiagnostics("FÁZE 2 úspěšně nalezla řešení!");
        return res;
    }

    // 3. Fallback 2: postupné snižování gapu
    logToDiagnostics("FÁZE 2 selhala. FÁZE 3: Budu postupně snižovat pauzu (gap)...");
    let currentGap = gap;
    while (currentGap > 0) {
        currentGap--;
        logToDiagnostics(`FÁZE 3: Zkouším uvolněný gap = ${currentGap}...`);
        res = solveIlpModel(glpk, runners, segments, currentGap, carCount, hasCentral, cars, false);
        if (res.status === "success") {
            logToDiagnostics(`FÁZE 3 úspěšně nalezla řešení s gapem = ${currentGap}!`);
            res.message = `Optimalizace uspěla s mírnějším gapem: ${currentGap} (původní: ${gap}).`;
            return res;
        }
    }

    return {
        status: "error",
        message: "Optimalizace selhala. Ani po uvolnění všech pravidel nebylo možné najít přípustné řešení."
    };
}

/**
 * Spustí pokročilé generování – vypočítá ILP přiřazení plně v prohlížeči,
 * na pozadí pomocí Web Workera pro zachování plynulosti UI.
 */
function runSmartGeneration() {
    // Stornujeme předchozí běžící výpočty, pokud existují
    cancelSmartGeneration();
    clearDiagnostics();

    const btn = document.querySelector('#smartGenModal .btn-primary');
    const originalText = btn.innerText;

    const minPause = parseInt(document.getElementById('sgMinPause').value) || 0;
    const carCount = parseInt(document.getElementById('sgCarCount').value) || 1;
    const hasCentral = document.getElementById('sgHasCentral').checked;
    const usePreferred = document.getElementById('sgUsePreferred').checked && !hasCentral;

    let cars = [];
    let runners = JSON.parse(JSON.stringify(runnersData)); // Deep copy
    runners.forEach(r => {
        r.target_count = r.target_count || (r.segments ? r.segments.length : 0);
        r.segments = []; // Reset pro novou generaci
    });

    if (usePreferred) {
        // Přiřazení běžců do aut podle checkboxů
        let assigned = new Set();
        let error = false;
        let totalAssigned = 0;
        for (let i = 0; i < carCount; i++) {
            let carRunners = [];
            let checkboxes = document.querySelectorAll(`input[name="car_${i}_runner"]:checked`);
            checkboxes.forEach(cb => {
                let idx = parseInt(cb.value);
                if (assigned.has(idx)) error = true;
                carRunners.push(idx);
                assigned.add(idx);
                totalAssigned++;
            });
            cars.push(carRunners);
        }
        // Validace: každý běžec musí být v přesně jednom autě
        if (error || totalAssigned !== runners.length) {
            alert("Každý běžec z týmu musí být přiřazen přesně do jednoho auta.");
            return;
        }
    } else {
        // Automatické rovnoměrné rozdělení běžců do aut
        for (let i = 0; i < carCount; i++) cars.push([]);
        runners.forEach((r, idx) => {
            cars[idx % carCount].push(idx);
        });
    }

    btn.innerText = 'Počítám...';
    btn.disabled = true;

    logToDiagnostics("Spouštím optimalizaci v hlavním vlákně...");

    // Krátká prodleva pro překreslení tlačítka a diagnostiky v UI
    setTimeout(async () => {
        let wasmBinary = null;
        if (typeof GLPK_WASM_BASE64 !== 'undefined') {
            try {
                const binaryString = atob(GLPK_WASM_BASE64);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                wasmBinary = bytes.buffer;
                logToDiagnostics("Úspěšně dekódována lokální in-memory knihovna GLPK (WASM).");
            } catch (e) {
                logToDiagnostics("⚠️ Nepodařilo se dekódovat lokální WASM: " + e.message);
            }
        }

        if (!wasmBinary) {
            throw new Error(
                'GLPK WASM není k dispozici. Ověřte, že je načten soubor static/js/glpk_wasm.js.'
            );
        }

        try {
            logToDiagnostics("Inicializuji GLPK solver...");
            const glpk = await GLPK({ wasmBinary });
            logToDiagnostics("GLPK solver inicializován úspěšně. Verze: " + glpk.version);

            const segments = (typeof segmentsData !== 'undefined') ? segmentsData : [];
            logToDiagnostics("Sestavuji model a spouštím optimalizaci...");
            const data = generateIlpPlanInJS(glpk, runners, segments, minPause, carCount, hasCentral, cars);

            btn.innerText = originalText;
            btn.disabled = false;

            if (data.status === 'success') {
                const assignment = data.assignment;
                assignment.forEach((runnerIdx, segmentIdx) => {
                    runners[runnerIdx].segments.push(segmentIdx + 1); // 1-indexed
                });
                tempGeneratedRunners = runners;

                // Provedeme post-processing pro dokonalé výkonnostní spárování (v rámci aut nebo týmu)
                postProcessPerformanceMatching(tempGeneratedRunners, carCount, hasCentral, cars);

                window._lastGenerationMethod = 'smart';
                updateRecalculateButtonVisibility();
                closeSmartGenModal();
                showAnalysisModal();
            } else {
                alert("Chyba při generování: " + (data.message || "Model nemá řešení. Zkuste snížit požadavky."));
            }
        } catch (err) {
            logToDiagnostics("❌ Chyba při běhu optimalizace: " + err.message);
            btn.innerText = originalText;
            btn.disabled = false;
            alert("Optimalizace selhala: " + err.message);
        }
    }, 50);
}

/**
 * Spustí přepočet / znovu-vygenerování úseků na základě naposledy použité metody.
 * U náhodného generování zachovává aktuální rozložení počtu úseků z tempGeneratedRunners.
 */
function regenerateAnalysis() {
    if (window._lastGenerationMethod === 'smart') {
        runSmartGeneration();
    } else {
        generateRandomSegments(true);
    }
}

/**
 * Aktualizuje viditelnost tlačítka pro rychlý přepočet úseků.
 */
function updateRecalculateButtonVisibility() {
    const recalcBtn = document.getElementById('recalculateSegmentsBtn');
    if (recalcBtn) {
        if (window._lastGenerationMethod) {
            recalcBtn.style.display = 'flex';
        } else {
            recalcBtn.style.display = 'none';
        }
    }
}
