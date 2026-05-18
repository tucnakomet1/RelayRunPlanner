/**
 * share.js – Bezserverové sdílení závodu a synchronizace průběhu přes URL hash
 *
 * Formáty odkazu: index.html#race_data=<LZ-compressed payload>
 *   • t: "full"  – celý závod (úseky, běžci, logistika, časy)
 *   • t: "sync"  – jen průběh (hotovo + reálný čas), stejné ID závodu u příjemce
 */

const SHARE_FORMAT_VERSION = 2;

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

/** Kompletní závod ke sdílení novému zařízení */
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
        v: SHARE_FORMAT_VERSION,
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

/** Dekóduje a rozpozná typ sdílení */
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

    if (!payload || payload.v !== SHARE_FORMAT_VERSION) {
        throw new Error('Nepodporovaný formát sdílených dat.');
    }

    if (payload.t === 'sync') {
        if (!payload.id || !Array.isArray(payload.p)) {
            throw new Error('Neplatná synchronizační zpráva.');
        }
        return { type: 'sync', sync: payload };
    }

    if (payload.t === 'full' && payload.race && payload.race.id) {
        return { type: 'full', race: payload.race };
    }

    throw new Error('Nepodporovaný typ sdílení.');
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
        const snap = buildFullRaceSnapshot(race);
        payload = { v: SHARE_FORMAT_VERSION, t: 'full', race: snap };
        const doneCount = (snap.segments || []).filter(s => s.is_done).length;
        metaText = `Celý závod · ${race.name} · ${doneCount}/${snap.segments.length} doběhnuto`;
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
