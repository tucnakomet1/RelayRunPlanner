/**
 * logistics.js – Logistika aut pro štafetový závod
 *
 * Řeší plánování přejezdů a posádek aut na základě přiřazení
 * úseků běžcům. Podporuje dva režimy:
 *   1. Lineární trasa – fixní rotace posádek v blocích
 *   2. Centrální stanoviště – dynamické kyvadlo s návratem na základnu
 *
 * Obsahuje:
 *   - openLogisticsModal()       – otevření modalu (cache / formulář)
 *   - showLogisticsConfigForm()  – zobrazení konfiguračního formuláře
 *   - toggleCentralSegmentsUI()  – přepínání UI pro centrálové úseky
 *   - generateCentralSegmentsGrid() – grid s checkboxy pro centrálové úseky
 *   - collectCentralSegments()   – sběr označených centrálových úseků
 *   - calculateLogistics()       – odeslání na server a zpracování výsledku
 *   - renderLogisticsResult()    – vykreslení bloků aut s posádkami
 *
 * Globální proměnné (z race.js / inline):
 *   - runnersData     : Pole s daty běžců
 *   - segmentsData    : Pole s daty úseků
 *   - RACE_ID         : ID závodu
 *   - logistics_data  : Cached logistika ze serveru (nebo null)
 */


// Globální proměnné pro logistiku jsou deklarovány v index.html a router.js


// ============================================
// OTEVŘENÍ A SPRÁVA MODALU
// ============================================

/**
 * Otevře logistický modal. Pokud existují uložená data,
 * zobrazí je rovnou. Jinak zobrazí konfigurační formulář.
 */
function openLogisticsModal() {
    const modal = document.getElementById('logisticsModal');
    const cachedView = document.getElementById('logisticsCachedView');
    const configView = document.getElementById('logisticsConfigView');

    if (cachedLogisticsData && cachedLogisticsData.blocks && cachedLogisticsData.blocks.length > 0) {
        // Máme uloženou logistiku – zobrazíme ji rovnou
        cachedView.style.display = 'block';
        configView.style.display = 'none';
        renderLogisticsResult(cachedLogisticsData.blocks, 'logisticsCachedResultContainer', cachedLogisticsConfig);
    } else {
        // Nemáme logistiku – zobrazíme formulář
        cachedView.style.display = 'none';
        configView.style.display = 'block';
    }

    modal.style.display = 'block';
}

/**
 * Přepne z cached pohledu na konfigurační formulář.
 * Předvyplní hodnoty z uložené konfigurace (pokud existuje).
 */
function showLogisticsConfigForm() {
    const cachedView = document.getElementById('logisticsCachedView');
    const configView = document.getElementById('logisticsConfigView');

    cachedView.style.display = 'none';
    configView.style.display = 'block';

    // Předvyplníme z uložené konfigurace
    if (cachedLogisticsConfig) {
        document.getElementById('logisticsCarCount').value = cachedLogisticsConfig.car_count || 2;
        document.getElementById('logisticsHasCentral').checked = cachedLogisticsConfig.has_central || false;
        toggleCentralSegmentsUI();

        // Předvyplníme checkboxy pro centrálové úseky
        if (cachedLogisticsConfig.central_segments) {
            const startSegs = cachedLogisticsConfig.central_segments.start || [];
            const endSegs = cachedLogisticsConfig.central_segments.end || [];
            startSegs.forEach(id => {
                const cb = document.getElementById(`cs_start_${id}`);
                if (cb) cb.checked = true;
            });
            endSegs.forEach(id => {
                const cb = document.getElementById(`cs_end_${id}`);
                if (cb) cb.checked = true;
            });
        }
    }
}

/** Zavře logistický modal */
function closeLogisticsModal() {
    document.getElementById('logisticsModal').style.display = 'none';
}


// ============================================
// KONFIGURACE CENTRÁLNÍCH ÚSEKŮ
// ============================================

/**
 * Přepíná zobrazení sekce pro konfiguraci centrálových úseků.
 * Pokud je zaškrtnuto „Máme centrálu", zobrazí grid s checkboxy.
 */
function toggleCentralSegmentsUI() {
    const hasCentral = document.getElementById('logisticsHasCentral').checked;
    const container = document.getElementById('centralSegmentsConfig');
    container.style.display = hasCentral ? 'block' : 'none';

    if (hasCentral) {
        generateCentralSegmentsGrid();
    }
}

/**
 * Vygeneruje tabulku se všemi úseky závodu.
 * U každého úseku jsou dva checkboxy:
 *   - „Začíná v centrále" – běžec vybíhá přímo ze základny
 *   - „Končí v centrále" – běžec dobíhá přímo na základnu
 */
function generateCentralSegmentsGrid() {
    const grid = document.getElementById('centralSegmentsGrid');
    const segs = (typeof segmentsData !== 'undefined') ? segmentsData : [];

    if (segs.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Žádné úseky k zobrazení.</p>';
        return;
    }

    let html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
            <thead>
                <tr style="border-bottom: 2px solid var(--border-color);">
                    <th style="text-align: left; padding: 6px 8px; color: var(--text-muted); font-size: 0.8rem;">Úsek</th>
                    <th style="text-align: center; padding: 6px 8px; color: var(--text-muted); font-size: 0.8rem;">Začíná v centrále</th>
                    <th style="text-align: center; padding: 6px 8px; color: var(--text-muted); font-size: 0.8rem;">Končí v centrále</th>
                </tr>
            </thead>
            <tbody>
    `;

    segs.forEach(s => {
        html += `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 5px 8px; font-weight: 500;">${s.id}. ${s.name || ''}</td>
                <td style="text-align: center; padding: 5px 8px;">
                    <input type="checkbox" id="cs_start_${s.id}" style="width: auto; cursor: pointer;">
                </td>
                <td style="text-align: center; padding: 5px 8px;">
                    <input type="checkbox" id="cs_end_${s.id}" style="width: auto; cursor: pointer;">
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    grid.innerHTML = html;
}

/**
 * Posbírá označené centrálové úseky z gridu.
 * @returns {Object} – Objekt s poli 'start' a 'end' (čísla úseků)
 */
function collectCentralSegments() {
    const segs = (typeof segmentsData !== 'undefined') ? segmentsData : [];
    const startIds = [];
    const endIds = [];

    segs.forEach(s => {
        const startCb = document.getElementById(`cs_start_${s.id}`);
        const endCb = document.getElementById(`cs_end_${s.id}`);
        if (startCb && startCb.checked) startIds.push(s.id);
        if (endCb && endCb.checked) endIds.push(s.id);
    });

    return { start: startIds, end: endIds };
}


// ============================================
// VÝPOČET A ZOBRAZENÍ LOGISTIKY
// ============================================

/**
 * Vypočítá optimální rozložení úseků do bloků aut plně na klientské straně.
 * Kopíruje kompletní optimalizační DP / Lineární algoritmus z původního logistics.py.
 * 
 * @param {Array} runners          - Seznam běžců s polem 'segments' (1-indexed)
 * @param {Array} segments         - Seznam úseků závodu
 * @param {number} carCount        - Počet aut v týmu
 * @param {boolean} hasCentral     - True = centrálový režim, False = lineární
 * @param {Object} centralSegments - Konfigurace centrálových úseků: { start: [], end: [] }
 * @returns {Array} Seznam bloků s posádkami a přiřazenými úseky
 */
function calculateLogisticsInJS(runners, segments, carCount, hasCentral, centralSegments) {
    const N = segments.length;
    if (N === 0) return [];

    const centralStartSet = new Set(centralSegments ? (centralSegments.start || []) : []);
    const centralEndSet = new Set(centralSegments ? (centralSegments.end || []) : []);

    // runnerForSeg[s] = index běžce, kde s je 0-indexed index úseku
    const runnerForSeg = new Array(N).fill(-1);
    runners.forEach((r, rIdx) => {
        (r.segments || []).forEach(sId => {
            if (sId >= 1 && sId <= N) {
                runnerForSeg[sId - 1] = rIdx;
            }
        });
    });

    const blocks = [];

    if (!hasCentral) {
        // ============================================
        // LINEÁRNÍ REŽIM (bez centrály)
        // ============================================
        // Úseky se rovnoměrně rozdělí mezi auta.
        const baseSize = Math.floor(N / carCount);
        const rem = N % carCount;

        let start = 0;
        for (let i = 0; i < carCount; i++) {
            const size = baseSize + (i < rem ? 1 : 0);
            const end = start + size;

            if (size === 0) continue;

            // Zjistíme, kteří běžci jsou v tomto bloku
            const carRunners = new Set();
            for (let s = start; s < end; s++) {
                if (runnerForSeg[s] !== -1) {
                    carRunners.add(runnerForSeg[s]);
                }
            }

            blocks.push({
                "car_num": i + 1,
                "start_seg": start + 1,
                "end_seg": end,
                "outbound": Array.from(carRunners),
                "returning": Array.from(carRunners),
                "incoming": []
            });
            start = end;
        }
    } else {
        // ============================================
        // CENTRÁLOVÝ REŽIM (s centrální základnou)
        // ============================================
        // Dynamické programování hledá optimální rozdělení N úseků
        // na bloky velikosti 2, 3 nebo 4.
        const memo = {};

        function solve(idx) {
            if (idx === N) {
                return [0, []];
            }
            if (idx in memo) {
                return memo[idx];
            }

            let bestCost = Infinity;
            let bestPath = null;

            for (const k of [2, 3, 4]) {
                if (idx + k <= N) {
                    const [costRest, pathRest] = solve(idx + k);

                    // Spočítáme unikátní lidi v tomto bloku
                    const people = new Set();
                    for (let s = idx; s < idx + k; s++) {
                        if (runnerForSeg[s] !== -1) {
                            people.add(runnerForSeg[s]);
                        }
                    }
                    if (idx > 0 && runnerForSeg[idx - 1] !== -1) {
                        people.add(runnerForSeg[idx - 1]);
                    }

                    let costHere = people.size * k;
                    if (k === 3) {
                        costHere -= 1; // Preference bloků o velikosti 3
                    }

                    const totalCost = costHere + costRest;
                    if (totalCost < bestCost) {
                        bestCost = totalCost;
                        bestPath = [k].concat(pathRest);
                    }
                }
            }

            memo[idx] = [bestCost, bestPath];
            return memo[idx];
        }

        const [_, bestKList] = solve(0);

        // Sestavení bloků z optimálního rozdělení
        let start = 0;
        let carTurn = 0;
        bestKList.forEach((k, blockIdx) => {
            const end = start + k;
            const firstSegId = start + 1;
            const lastSegId = end;

            const firstStartsAtCentral = centralStartSet.has(firstSegId);
            const lastEndsAtCentral = centralEndSet.has(lastSegId);

            // --- OUTBOUND: kdo jede z centrály v autě ---
            const outbound = new Set();
            for (let s = start + 1; s < end; s++) {
                if (runnerForSeg[s] !== -1) {
                    outbound.add(runnerForSeg[s]);
                }
            }

            // Běžec pro úsek E+1 (vysazen na poslední předávce)
            if (end < N && runnerForSeg[end] !== -1) {
                const nextSegId = end + 1;
                if (!centralStartSet.has(nextSegId)) {
                    outbound.add(runnerForSeg[end]);
                }
            }

            // Výjimka: první úsek 1 nezačíná v centrále -> běžec tam musí jet autem
            if (blockIdx === 0 && !firstStartsAtCentral) {
                if (runnerForSeg[start] !== -1) {
                    outbound.add(runnerForSeg[start]);
                }
            }

            // --- RETURNING: kdo se vrací do centrály ---
            const returning = new Set();
            for (let s = start; s < end; s++) {
                if (runnerForSeg[s] !== -1) {
                    const segId = s + 1;
                    if (!centralEndSet.has(segId)) {
                        returning.add(runnerForSeg[s]);
                    }
                }
            }

            blocks.push({
                "car_num": (carTurn % carCount) + 1,
                "start_seg": start + 1,
                "end_seg": end,
                "outbound": Array.from(outbound),
                "returning": Array.from(returning),
                "first_starts_at_central": firstStartsAtCentral,
                "last_ends_at_central": lastEndsAtCentral
            });

            start = end;
            carTurn++;
        });
    }

    return blocks;
}

/**
 * Vypočítá konfiguraci logistiky kompletně v prohlížeči,
 * zobrazí výsledek a odešle jej k pasivnímu uložení do databáze.
 */
function calculateLogistics() {
    const btn = document.querySelector('#logisticsConfigView .btn-primary');
    const originalText = btn.innerText;
    const carCount = parseInt(document.getElementById('logisticsCarCount').value) || 1;
    const hasCentral = document.getElementById('logisticsHasCentral').checked;
    const centralSegments = hasCentral ? collectCentralSegments() : {};
    const container = document.getElementById('logisticsResultContainer');

    btn.innerText = 'Počítám optimální rozložení...';
    btn.disabled = true;
    container.innerHTML = '';

    try {
        const runners = (typeof tempGeneratedRunners !== 'undefined' && tempGeneratedRunners.length > 0) ? tempGeneratedRunners : runnersData;
        const segments = (typeof segmentsData !== 'undefined') ? segmentsData : [];

        // 1. Spočítat kompletní logistiku přímo v prohlížeči
        const blocks = calculateLogisticsInJS(runners, segments, carCount, hasCentral, centralSegments);

        const config = {
            car_count: carCount,
            has_central: hasCentral,
            central_segments: centralSegments
        };

        const raceId = typeof window.RACE_ID !== 'undefined' ? window.RACE_ID : '';

        // 2. Uložit předpočítanou logistiku do localStorage
        if (raceId) {
            const races = getRacesFromLocalStorage();
            if (races[raceId]) {
                races[raceId].logistics = {
                    blocks: blocks,
                    config: config
                };
                saveRacesToLocalStorage(races);
            }
        }

        // 3. Vykreslit výsledky z lokálně spočítaných bloků
        renderLogisticsResult(blocks, 'logisticsResultContainer', config);

        // Aktualizujeme lokální cache
        cachedLogisticsData = { blocks: blocks, config: config };
        cachedLogisticsConfig = config;

    } catch (e) {
        alert("Výpočet logistiky selhal.");
        console.error(e);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

/**
 * Vykreslí výsledky logistiky jako karty výjezdů aut.
 * Každá karta zobrazuje:
 *   - Číslo auta a pořadí výjezdu
 *   - Rozsah úseků (start_seg – end_seg)
 *   - Časový rozsah (z DOM – start prvního / start dalšího úseku)
 *   - Posádku (lineární) nebo outbound/returning (centrálový režim)
 *
 * @param {Array}  blocks      – Pole bloků z backendu
 * @param {string} containerId – ID HTML elementu pro výpis
 * @param {Object} config      – Konfigurační objekt (car_count, has_central...)
 */
function renderLogisticsResult(blocks, containerId, config) {
    const container = document.getElementById(containerId);
    if (blocks.length === 0) {
        container.innerHTML = '<p>Zatím nejsou přiděleny žádné úseky.</p>';
        return;
    }

    const hasCentral = config && config.has_central;
    // Použijeme dočasně vygenerované běžce (pokud existují) nebo originální data
    const runnersForMapping = (typeof tempGeneratedRunners !== 'undefined' && tempGeneratedRunners.length > 0) ? tempGeneratedRunners : runnersData;

    /**
     * Převede pole indexů běžců na jejich jména.
     * @param {Array} indices – Pole indexů do runnersForMapping
     * @returns {string} – Čárkou oddělená jména
     */
    const getNames = (indices) => indices.map(idx => runnersForMapping[idx]?.name || 'Neznámý').join(', ');

    let html = '<div style="display: flex; flex-direction: column; gap: 15px;">';

    blocks.forEach((b, idx) => {
        // Získání časů startu a konce bloku z DOM (pokud existují)
        let startTime = "--:--";
        let endTime = "--:--";

        let startSegEl = document.getElementById(`seg-${b.start_seg - 1}`);
        if (startSegEl) {
            let sTimeText = startSegEl.querySelector('.start-time-text')?.innerText;
            if (sTimeText) startTime = sTimeText.replace('Start ', '').trim();
        }

        let nextSegEl = document.getElementById(`seg-${b.end_seg}`);
        if (nextSegEl) {
            let eTimeText = nextSegEl.querySelector('.start-time-text')?.innerText;
            if (eTimeText) endTime = eTimeText.replace('Start ', '').trim();
        } else {
            endTime = document.getElementById('total-finish-time')?.innerText || "--:--";
        }

        // Sestavení HTML karty bloku
        let blockHtml = `
            <div style="background: var(--bg-card); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color); border-left: 5px solid var(--primary);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="margin: 0;">🚗 Auto ${b.car_num} <span style="font-weight: normal; font-size: 0.9rem;">(Výjezd ${idx + 1})</span></h4>
                    <span style="background: var(--bg-body); padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-family: monospace;">⏱️ ${startTime} - ${endTime}</span>
                </div>
                <div style="font-size: 0.95rem; margin-bottom: 8px;"><strong>Úseky:</strong> ${b.start_seg} až ${b.end_seg}</div>
        `;

        if (hasCentral) {
            // Centrálový režim – zobrazíme indikátory a outbound/returning
            let centralTags = '';
            if (b.first_starts_at_central) {
                centralTags += '<span style="display: inline-block; background: #10b981; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; margin-right: 5px;">📍 Start z centrály</span>';
            }
            if (b.last_ends_at_central) {
                centralTags += '<span style="display: inline-block; background: #3b82f6; color: white; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px;">📍 Doběh do centrály</span>';
            }
            if (centralTags) {
                blockHtml += `<div style="margin-bottom: 8px;">${centralTags}</div>`;
            }

            blockHtml += `
                <div style="font-size: 0.9rem; margin-bottom: 4px;"><strong>Jedou z centrály:</strong> ${getNames(b.outbound) || '-'}</div>
                <div style="font-size: 0.9rem;"><strong>Vrací se na centrálu:</strong> ${getNames(b.returning) || '-'}</div>
            `;
        } else {
            // Lineární režim – zobrazíme členy auta
            blockHtml += `
                <div style="font-size: 0.9rem;"><strong>Členové v autě:</strong> ${getNames(b.outbound) || '-'}</div>
            `;
        }

        blockHtml += `</div>`;
        html += blockHtml;
    });

    html += '</div>';
    container.innerHTML = html;
}

/**
 * Inicializuje cached logistiku z dat předaných serverem.
 * Volá se z inline scriptu v HTML (kde je přístup k Jinja proměnným).
 *
 * @param {Object|null} logisticsData – Data logistiky z Jinja (nebo null)
 */
function initLogisticsCache(logisticsData) {
    cachedLogisticsData = logisticsData;
    cachedLogisticsConfig = logisticsData ? logisticsData.config : null;
}
