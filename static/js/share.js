/**
 * share.js – Bezserverové sdílení stavu závodu přes URL hash a QR kód
 *
 * Formát odkazu: index.html#race_data=<LZ-compressed payload>
 * Payload obsahuje kompletní závod včetně reálných časů doběhů pro import do localStorage.
 */

const SHARE_FORMAT_VERSION = 1;

/** Sestaví objekt závodu připravený ke sdílení z aktuálního stavu */
function buildShareableRaceSnapshot() {
    if (!window.RACE_ID) return null;

    if (typeof saveCurrentRaceToLocalStorage === 'function') {
        saveCurrentRaceToLocalStorage();
    }

    const races = getRacesFromLocalStorage();
    const race = races[window.RACE_ID];
    if (!race) return null;

    return {
        id: race.id,
        name: race.name,
        start_time: race.start_time,
        segment_count: race.segment_count,
        segments: JSON.parse(JSON.stringify(race.segments || [])),
        runners: JSON.parse(JSON.stringify(race.runners || [])),
        logistics: race.logistics ? JSON.parse(JSON.stringify(race.logistics)) : null,
        last_generation_method: race.last_generation_method || null
    };
}

/** Zakóduje závod do řetězce vhodného pro URL hash */
function encodeRaceForShare(race) {
    if (typeof LZString === 'undefined') {
        throw new Error('Chybí knihovna LZ-String pro kompresi odkazu.');
    }
    const payload = { v: SHARE_FORMAT_VERSION, race };
    return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

/** Dekóduje payload z hash parametru race_data */
function decodeRaceFromShare(encoded) {
    if (typeof LZString === 'undefined') {
        throw new Error('Chybí knihovna LZ-String.');
    }
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) {
        throw new Error('Neplatná nebo poškozená data v odkazu.');
    }
    const payload = JSON.parse(json);
    if (!payload || payload.v !== SHARE_FORMAT_VERSION || !payload.race || !payload.race.id) {
        throw new Error('Nepodporovaný formát sdílených dat.');
    }
    return payload.race;
}

/**
 * Základní URL dokumentu bez hashe.
 * U file:// je location.origin řetězec "null" – proto sestavujeme z href.
 */
function getDocumentBaseUrl() {
    const { protocol, host, pathname, search, href } = window.location;
    if (protocol === 'http:' || protocol === 'https:') {
        return `${protocol}//${host}${pathname}${search}`;
    }
    return href.split('#')[0];
}

/** Vrátí absolutní URL stránky se zakódovaným stavem v hash */
function buildShareUrl(encodedPayload) {
    return `${getDocumentBaseUrl()}#race_data=${encodedPayload}`;
}

/** Uloží nebo aktualizuje závod z odkazu v localStorage */
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

/** Zpracuje #race_data=… při načtení nebo změně hash; vrátí true pokud hash zpracován */
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
        const sharedRace = decodeRaceFromShare(encoded);
        const raceId = importSharedRace(sharedRace);
        const cleanUrl = `${getDocumentBaseUrl()}#race/${raceId}`;
        history.replaceState(null, '', cleanUrl);
        const doneCount = (sharedRace.segments || []).filter(s => s.is_done).length;
        setTimeout(() => {
            alert(`Stav závodu „${sharedRace.name}“ byl importován (${doneCount} doběhnutých úseků).`);
        }, 100);
        return true;
    } catch (err) {
        console.error('Import sdíleného stavu:', err);
        alert('Nepodařilo se načíst sdílený stav závodu:\n' + err.message);
        history.replaceState(null, '', getDocumentBaseUrl());
        return true;
    }
}

/** Vykreslí QR kód odkazu do kontejneru */
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
        container.innerHTML = '<p class="share-qr-hint">Stránku máte otevřenou jako soubor (file://). Pro sdílení na telefon spusťte aplikaci přes HTTP server nebo GitHub Pages – pak bude fungovat i QR kód. Odkaz níže lze zkopírovat pro test na tomto počítači.</p>';
        return;
    }

    if (url.length > 2400) {
        container.innerHTML = '<p class="share-qr-hint">Odkaz je příliš dlouhý pro QR kód (velký závod). Použijte tlačítko „Zkopírovat odkaz“ a pošlete ho např. přes messenger.</p>';
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

function openShareModal() {
    if (!window.RACE_ID) {
        alert('Nejdříve otevřete uložený závod.');
        return;
    }

    const race = buildShareableRaceSnapshot();
    if (!race) {
        alert('Stav závodu se nepodařilo připravit ke sdílení.');
        return;
    }

    let encoded;
    try {
        encoded = encodeRaceForShare(race);
    } catch (err) {
        alert(err.message);
        return;
    }

    const shareUrl = buildShareUrl(encoded);
    const linkInput = document.getElementById('share-link-input');
    const meta = document.getElementById('share-link-meta');

    if (linkInput) {
        linkInput.value = shareUrl;
    }
    if (meta) {
        const doneCount = (race.segments || []).filter(s => s.is_done).length;
        meta.textContent = `${race.name} · ${doneCount}/${race.segments.length} doběhnutých úseků · délka odkazu ${shareUrl.length} znaků`;
    }

    renderShareQrCode(shareUrl);

    const modal = document.getElementById('shareModal');
    if (modal) {
        modal.style.display = 'block';
    }
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
