/**
 * share.js – Bezserverové sdílení závodu a synchronizace průběhu přes URL hash
 *
 * Formáty odkazu: index.html#race_data=<LZ-compressed payload>
 *   • t: "full"  – celý závod (úseky, běžci, logistika, časy)
 *   • t: "sync"  – jen průběh (hotovo + reálný čas), stejné ID závodu u příjemce
 */

const SHARE_FORMAT_VERSION = 3;

/** Pomocný lokální parser HH:MM:SS na minuty */
function parseHMSInShare(s) {
    if (typeof parseHMS === 'function') {
        return parseHMS(s);
    }
    if (!s) return 0;
    let p = s.split(':').map(v => parseFloat(v) || 0);
    if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
    if (p.length === 2) return p[0] * 60 + p[1];
    return 0;
}

/** Uloží aktuální závod z paměti do localStorage a vrátí jeho kopii */
function getCurrentRaceFromStorage() {
    if (!window.RACE_ID) return null;

    if (typeof saveCurrentRaceToLocalStorage === 'function') {
        saveCurrentRaceToLocalStorage();
    }

    const races = getRacesFromLocalStorage();
    const race = races[window.RACE_ID];
    if (!race) return null;

    return JSON.parse(JSON.stringify(race));
}

/** Kompletní závod ke sdílení novému zařízení (Ultra-kompaktní v3) */
function serializeRaceToV3(race) {
    const compactSegments = (race.segments || []).map(s => {
        const id = parseInt(s.id) || 0;
        const nameDiff = (s.name === `Úsek ${id}`) ? '' : (s.name || '');
        return [
            id,
            nameDiff,
            parseFloat(s.dist) || 0,
            parseFloat(s.elev_up) || 0,
            parseFloat(s.elev_down) || 0,
            parseInt(s.difficulty) || 3,
            s.is_done ? 1 : 0,
            s.actual_time || ''
        ];
    });

    const compactRunners = (race.runners || []).map(r => {
        return [
            r.name || '',
            r.color || '#808080',
            parseFloat(r.ctrl_dist_m) || 5000,
            parseFloat(r.ctrl_elev) || 100,
            r.ctrl_time_hms || '',
            r.segments || []
        ];
    });

    let compactLogistics = null;
    if (race.logistics && race.logistics.config) {
        const cfg = race.logistics.config;
        compactLogistics = [
            parseInt(cfg.car_count) || 1,
            cfg.has_central ? 1 : 0,
            cfg.central_segments ? (cfg.central_segments.start || []) : [],
            cfg.central_segments ? (cfg.central_segments.end || []) : []
        ];
    }

    return {
        v: 3,
        t: 'full',
        id: race.id,
        n: race.name,
        s: race.start_time,
        c: parseInt(race.segment_count) || compactSegments.length,
        g: race.last_generation_method || '',
        segs: compactSegments,
        runs: compactRunners,
        log: compactLogistics
    };
}

/** Dekóduje ultra-kompaktní v3 formát zpět na objekt závodu */
function deserializeV3ToRace(payload) {
    if (!payload || payload.v !== 3 || payload.t !== 'full') {
        throw new Error('Neplatný formát v3.');
    }

    const segments = (payload.segs || []).map(([id, nameDiff, dist, elev_up, elev_down, difficulty, is_done, actual_time]) => {
        const segId = parseInt(id) || 0;
        return {
            id: segId,
            name: nameDiff || `Úsek ${segId}`,
            dist: parseFloat(dist) || 0,
            elev_up: parseFloat(elev_up) || 0,
            elev_down: parseFloat(elev_down) || 0,
            difficulty: parseInt(difficulty) || 3,
            is_done: !!is_done,
            actual_time: actual_time || ''
        };
    });

    const runners = (payload.runs || []).map(([name, color, ctrl_dist_m, ctrl_elev, ctrl_time_hms, segList]) => {
        const hms = ctrl_time_hms || '';
        return {
            name: name || '',
            color: color || '#808080',
            ctrl_dist_m: parseFloat(ctrl_dist_m) || 5000,
            ctrl_elev: parseFloat(ctrl_elev) || 100,
            ctrl_time_hms: hms,
            ctrl_time_min: parseHMSInShare(hms),
            target_count: Array.isArray(segList) ? segList.length : 0,
            segments: Array.isArray(segList) ? segList.map(x => parseInt(x) || 0) : []
        };
    });

    let logistics = null;
    if (payload.log) {
        const [car_count, has_central, central_start, central_end] = payload.log;
        const config = {
            car_count: parseInt(car_count) || 1,
            has_central: !!has_central,
            central_segments: {
                start: Array.isArray(central_start) ? central_start.map(x => parseInt(x) || 0) : [],
                end: Array.isArray(central_end) ? central_end.map(x => parseInt(x) || 0) : []
            }
        };

        let blocks = [];
        if (typeof calculateLogisticsInJS === 'function') {
            try {
                blocks = calculateLogisticsInJS(runners, segments, config.car_count, config.has_central, config.central_segments);
            } catch (err) {
                console.warn('Nepodařilo se přepočítat logistiku při importu:', err);
            }
        }

        logistics = {
            config: config,
            blocks: blocks
        };
    }

    return {
        id: payload.id,
        name: payload.n || 'Importovaný závod',
        start_time: payload.s,
        segment_count: parseInt(payload.c) || segments.length,
        segments: segments,
        runners: runners,
        logistics: logistics,
        last_generation_method: payload.g || null
    };
}

/** Kompletní závod ke sdílení (Pro legacy podporu) */
function buildFullRaceSnapshot(race) {
    return {
        id: race.id,
        name: race.name,
        start_time: race.start_time,
        segment_count: race.segment_count,
        segments: race.segments || [],
        runners: race.runners || [],
        logistics: race.logistics || null,
        last_generation_method: race.last_generation_method || null
    };
}

/** Kompaktní průběh – předpokládá stejný závod u příjemce */
function buildSyncSnapshot(race) {
    return {
        v: 2, // Synchronizační zprávy zůstávají v2
        t: 'sync',
        id: race.id,
        n: race.name,
        p: (race.segments || []).map(s => [
            s.id,
            s.is_done ? 1 : 0,
            s.actual_time || ''
        ])
    };
}

/** Zakóduje payload do URL hash parametru */
function encodeSharePayload(payload) {
    if (typeof LZString === 'undefined') {
        throw new Error('Chybí knihovna LZ-String pro kompresi odkazu.');
    }
    return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

/** Dekóduje a rozpozná typ sdílení s podporou zpětné kompatibility */
function decodeSharePayload(encoded) {
    if (typeof LZString === 'undefined') {
        throw new Error('Chybí knihovna LZ-String.');
    }
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) {
        throw new Error('Neplatná nebo poškozená data v odkazu.');
    }
    const payload = JSON.parse(json);

    // starší formát v1: { v: 1, race }
    if (payload && payload.v === 1 && payload.race && payload.race.id) {
        return { type: 'full', race: payload.race };
    }

    if (!payload) {
        throw new Error('Neplatná data sdílení.');
    }

    // Formát v3 (ultra-komprimovaný celý závod)
    if (payload.v === 3 && payload.t === 'full') {
        const race = deserializeV3ToRace(payload);
        return { type: 'full', race: race };
    }

    // Formát v2
    if (payload.v === 2) {
        if (payload.t === 'sync') {
            if (!payload.id || !Array.isArray(payload.p)) {
                throw new Error('Neplatná synchronizační zpráva.');
            }
            return { type: 'sync', sync: payload };
        }
        if (payload.t === 'full' && payload.race && payload.race.id) {
            return { type: 'full', race: payload.race };
        }
    }

    // Pro sync zprávy verze 3 (do budoucna)
    if (payload.v === 3 && payload.t === 'sync') {
        if (!payload.id || !Array.isArray(payload.p)) {
            throw new Error('Neplatná synchronizační zpráva.');
        }
        return { type: 'sync', sync: payload };
    }

    throw new Error('Nepodporovaný formát nebo typ sdílení.');
}

function getDocumentBaseUrl() {
    const { protocol, host, pathname, search, href } = window.location;
    if (protocol === 'http:' || protocol === 'https:') {
        return `${protocol}//${host}${pathname}${search}`;
    }
    return href.split('#')[0];
}

function buildShareUrl(encodedPayload) {
    return `${getDocumentBaseUrl()}#race_data=${encodedPayload}`;
}

function importSharedRace(sharedRace) {
    const races = getRacesFromLocalStorage();
    const existing = races[sharedRace.id];

    if (existing) {
        existing.name = sharedRace.name;
        existing.start_time = sharedRace.start_time;
        existing.segment_count = sharedRace.segment_count;
        existing.segments = sharedRace.segments;
        existing.runners = sharedRace.runners;
        existing.logistics = sharedRace.logistics;
        existing.last_generation_method = sharedRace.last_generation_method;
        races[sharedRace.id] = existing;
    } else {
        races[sharedRace.id] = sharedRace;
    }

    saveRacesToLocalStorage(races);
    return sharedRace.id;
}

/** Sloučí průběh do existujícího závodu se stejným ID */
function importSyncPayload(sync) {
    const races = getRacesFromLocalStorage();
    const existing = races[sync.id];

    if (!existing || !existing.segments) {
        throw new Error(
            'Závod v tomto prohlížeči neexistuje. Nejdříve načtěte odkaz „Sdílet závod“, pak používejte synchronizaci.'
        );
    }

    const byId = {};
    existing.segments.forEach(s => {
        byId[s.id] = s;
    });

    let updated = 0;
    sync.p.forEach(([segId, done, time]) => {
        const seg = byId[segId];
        if (seg) {
            seg.is_done = !!done;
            seg.actual_time = time || '';
            updated++;
        }
    });

    if (updated === 0) {
        throw new Error('Žádný úsek se nepodařilo spárovat – zkontrolujte, že máte stejný závod.');
    }

    saveRacesToLocalStorage(races);
    return { raceId: sync.id, name: sync.n || existing.name, updated };
}

function processShareHashIfPresent() {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#race_data=')) {
        return false;
    }

    const encoded = hash.slice('#race_data='.length);
    if (!encoded) {
        return false;
    }

    try {
        const decoded = decodeSharePayload(encoded);
        let raceId;
        let alertMsg;

        if (decoded.type === 'sync') {
            const result = importSyncPayload(decoded.sync);
            raceId = result.raceId;
            const doneCount = decoded.sync.p.filter(row => row[1]).length;
            alertMsg = `Synchronizace „${result.name}“ dokončena (${doneCount} doběhnutých úseků).`;
        } else {
            raceId = importSharedRace(decoded.race);
            const doneCount = (decoded.race.segments || []).filter(s => s.is_done).length;
            alertMsg = `Závod „${decoded.race.name}“ byl importován (${doneCount} doběhnutých úseků).`;
        }

        const cleanUrl = `${getDocumentBaseUrl()}#race/${raceId}`;
        history.replaceState(null, '', cleanUrl);
        setTimeout(() => alert(alertMsg), 100);
        return true;
    } catch (err) {
        console.error('Import sdíleného stavu:', err);
        alert('Nepodařilo se načíst sdílená data:\n' + err.message);
        history.replaceState(null, '', getDocumentBaseUrl());
        return true;
    }
}

let _activeShareMode = 'full';

const SHARE_MODE_DESCRIPTIONS = {
    full: 'Kompletní závod pro nové zařízení: úseky, běžci, logistika i aktuální časy. Příjemce nemusí mít závod uložený.',
    sync: 'Jen průběh závodu (Hotovo + reálný čas). Příjemce musí mít stejný závod – nejdříve sdílejte odkaz „Sdílet závod“.'
};

function renderShareQrCode(url) {
    const container = document.getElementById('share-qrcode');
    if (!container) return;

    container.innerHTML = '';

    if (typeof QRCode === 'undefined') {
        container.innerHTML = '<p class="share-qr-hint">QR kód nelze zobrazit (chybí knihovna).</p>';
        return;
    }

    if (!url || url.includes('null/')) {
        container.innerHTML = '<p class="share-qr-hint">Neplatná adresa odkazu. Obnovte stránku a zkuste znovu.</p>';
        return;
    }

    if (window.location.protocol === 'file:') {
        container.innerHTML = '<p class="share-qr-hint">Stránku máte otevřenou jako soubor (file://). Pro sdílení na telefon spusťte aplikaci přes HTTP server nebo GitHub Pages. Odkaz níže lze zkopírovat pro test na tomto počítači.</p>';
        return;
    }

    const qrLimit = _activeShareMode === 'sync' ? 2800 : 2400;
    if (url.length > qrLimit) {
        container.innerHTML = '<p class="share-qr-hint">Odkaz je příliš dlouhý pro QR kód. Použijte „Zkopírovat odkaz“ a pošlete ho např. přes messenger.</p>';
        return;
    }

    try {
        new QRCode(container, {
            text: url,
            width: 200,
            height: 200,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.L
        });
    } catch (err) {
        console.warn('QR kód:', err);
        container.innerHTML = '<p class="share-qr-hint">QR kód se nepodařilo vygenerovat. Použijte zkopírování odkazu níže.</p>';
    }
}

function updateShareModeTabs() {
    document.querySelectorAll('.share-mode-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === _activeShareMode);
    });
    const desc = document.getElementById('share-mode-desc');
    if (desc) {
        desc.textContent = SHARE_MODE_DESCRIPTIONS[_activeShareMode];
    }
}

/** Vygeneruje odkaz pro zvolený režim a aktualizuje modal */
function renderShareForMode(mode) {
    _activeShareMode = mode;
    const race = getCurrentRaceFromStorage();
    if (!race) {
        alert('Stav závodu se nepodařilo načíst.');
        return;
    }

    let payload;
    let metaText;

    if (mode === 'sync') {
        payload = buildSyncSnapshot(race);
        const doneCount = payload.p.filter(row => row[1]).length;
        metaText = `Synchronizace · ${race.name} · ${doneCount}/${payload.p.length} doběhnuto`;
    } else {
        // Použije ultra-kompaktní v3 formát pro sdílení celého závodu
        payload = serializeRaceToV3(race);
        const doneCount = (race.segments || []).filter(s => s.is_done).length;
        metaText = `Celý závod · ${race.name} · ${doneCount}/${(race.segments || []).length} doběhnuto`;
    }

    let encoded;
    try {
        encoded = encodeSharePayload(payload);
    } catch (err) {
        alert(err.message);
        return;
    }

    const shareUrl = buildShareUrl(encoded);
    const linkInput = document.getElementById('share-link-input');
    const meta = document.getElementById('share-link-meta');

    if (linkInput) linkInput.value = shareUrl;
    if (meta) {
        meta.textContent = `${metaText} · délka odkazu ${shareUrl.length} znaků`;
    }

    // Vypsání statistik zkrácení do konzole
    const origJson = JSON.stringify(race);
    const compactJson = JSON.stringify(payload);
    const origLen = origJson.length;
    const compactLen = compactJson.length;
    const urlLen = shareUrl.length;
    const savedPct = Math.round((1 - urlLen / origLen) * 100);

    console.group('📊 Optimalizace sdílení QR kódu (v3)');
    console.log(`Původní JSON data závodu:  ${origLen} znaků`);
    console.log(`Zkomprimované v3 poziční: ${compactLen} znaků (redukce o ${Math.round((1 - compactLen / origLen) * 100)}%)`);
    console.log(`LZ-String zakódovaný hash: ${encoded.length} znaků`);
    console.log(`Celková délka URL odkazu: ${urlLen} znaků`);
    console.log(`Celkové zkrácení QR dat:  o ${savedPct}% méně dat!`);
    console.groupEnd();

    updateShareModeTabs();
    renderShareQrCode(shareUrl);
}

function selectShareMode(mode) {
    if (mode !== 'full' && mode !== 'sync') return;
    renderShareForMode(mode);
}

function openShareModal() {
    if (!window.RACE_ID) {
        alert('Nejdříve otevřete uložený závod.');
        return;
    }

    const modal = document.getElementById('shareModal');
    if (modal) {
        modal.style.display = 'block';
    }
    renderShareForMode('full');
}

function closeShareModal() {
    const modal = document.getElementById('shareModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function copyShareLink() {
    const linkInput = document.getElementById('share-link-input');
    if (!linkInput || !linkInput.value) return;

    const text = linkInput.value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            alert('Odkaz zkopírován do schránky.');
        }).catch(() => {
            fallbackCopyShareLink(linkInput);
        });
    } else {
        fallbackCopyShareLink(linkInput);
    }
}

function fallbackCopyShareLink(input) {
    input.select();
    input.setSelectionRange(0, 99999);
    try {
        document.execCommand('copy');
        alert('Odkaz zkopírován do schránky.');
    } catch {
        alert('Zkopírujte odkaz ručně (Ctrl+C).');
    }
}
