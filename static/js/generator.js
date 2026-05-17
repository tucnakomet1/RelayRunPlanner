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
 * rozložených intervalů trasy.
 */
function generateRandomSegments() {
    document.getElementById('segmentsDropdown').classList.remove('active');

    if (!runnersData || runnersData.length === 0) {
        alert("Nejsou přiřazeni žádní běžci!");
        return;
    }

    const totalSegments = segmentsData.length;
    let usedSet = new Set();

    // Deep copy – nechceme modifikovat originální data
    tempGeneratedRunners = JSON.parse(JSON.stringify(runnersData));

    tempGeneratedRunners.forEach(runner => {
        const segCount = runner.segments.length;
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

/**
 * Uloží vygenerované přiřazení na server a provede reload.
 */
async function applyGeneratedSegments() {
    try {
        let res = await fetch(`/api/race/${RACE_ID}/edit_settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                runners: tempGeneratedRunners
            })
        });

        let data = await res.json();
        if (data.status === 'success') {
            window.location.reload();
        } else {
            alert("Chyba při ukládání: " + (data.error || "Neznámá chyba"));
        }
    } catch (e) {
        alert("Nepodařilo se uložit rozlosování.");
        console.error(e);
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
    document.getElementById('smartGenModal').style.display = 'none';
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
 * Spustí pokročilé generování – odešle konfiguraci na server,
 * kde se řeší ILP model. Po úspěchu zobrazí analytický modal.
 */
async function runSmartGeneration() {
    const btn = document.querySelector('#smartGenModal .btn-primary');
    const originalText = btn.innerText;

    const minPause = parseInt(document.getElementById('sgMinPause').value) || 0;
    const carCount = parseInt(document.getElementById('sgCarCount').value) || 1;
    const hasCentral = document.getElementById('sgHasCentral').checked;
    const usePreferred = document.getElementById('sgUsePreferred').checked && !hasCentral;

    let cars = [];
    let runners = JSON.parse(JSON.stringify(runnersData)); // Deep copy
    runners.forEach(r => {
        r.target_count = r.segments ? r.segments.length : 0;
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

    btn.innerText = 'Načítání (řeším model)...';
    btn.disabled = true;

    try {
        let res = await fetch(`/api/race/${RACE_ID}/smart_generate_ilp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                runners: runners,
                min_pause: minPause,
                car_count: carCount,
                has_central: hasCentral,
                cars: cars
            })
        });

        let data = await res.json();

        if (data.status === 'success') {
            // Převedení výsledného přiřazení zpět na pole segmentů pro běžce
            let assignment = data.assignment;
            assignment.forEach((runnerIdx, segmentIdx) => {
                runners[runnerIdx].segments.push(segmentIdx + 1); // 1-indexed
            });
            tempGeneratedRunners = runners;
            closeSmartGenModal();
            showAnalysisModal();
        } else {
            alert("Chyba při generování: " + (data.message || data.error));
        }
    } catch (e) {
        alert("Nepodařilo se spojit se serverem.");
        console.error(e);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}
