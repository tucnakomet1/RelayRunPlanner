/**
 * sidebar.js – Postranní panel se seznamem běžců (Step 3)
 *
 * Sidebar umožňuje prohlížet a editovat přiřazené běžce
 * přímo z detailu závodu bez nutnosti znovu vyplňovat formulář.
 * Všechny změny se okamžitě ukládají do localStorage.
 */

// ============================================
// OTEVŘENÍ A VYKRASLOVÁNÍ SIDEBARU
// ============================================

/**
 * Otevře sidebar a vykreslí aktuální seznam běžců.
 */
function openSidebar() {
    const sidebar = document.getElementById('runnerSidebar');
    renderSidebarRunners();
    sidebar.classList.add('open');
}

/**
 * Dynamicky vykreslí seznam běžců a jejich statistik v sidebaru.
 */
function renderSidebarRunners() {
    const list = document.getElementById('sidebarRunnersList');
    list.innerHTML = '';

    if (!window.runnersData || window.runnersData.length === 0) {
        list.innerHTML = '<p style="font-size:0.9rem; color:var(--text-muted); padding: 15px;">Tým je prázdný. Nikdo nebyl přiřazen.</p>';
        return;
    }

    window.runnersData.forEach((r, idx) => {
        const div = document.createElement('div');
        div.className = 'sidebar-runner-item';

        const colorCircle = `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background-color:${r.color};"></span>`;

        // Výpočet souhrnných statistik běžce ze všech přiřazených úseků
        let totalDist = 0, totalUp = 0, totalDown = 0, totalDiff = 0, diffCount = 0;
        (r.segments || []).forEach(segId => {
            const s = window.segmentsData.find(x => x.id === segId);
            if (s) {
                totalDist += s.dist || 0;
                totalUp += s.elev_up || 0;
                totalDown += s.elev_down || 0;
                if (s.difficulty) {
                    totalDiff += parseFloat(s.difficulty) || 0;
                    diffCount++;
                }
            }
        });
        const avgDiff = diffCount > 0 ? (totalDiff / diffCount).toFixed(1) : '-';

        const ctrlTime = r.ctrl_time_hms || (r.ctrl_time_min ? formatHMS(r.ctrl_time_min) : '-');

        div.innerHTML = `
            <div class="sidebar-runner-header">
                <span>${colorCircle} Běžec ${idx + 1}: ${r.name}</span>
                <button class="sidebar-runner-edit-btn" onclick="toggleRunnerEdit(${idx})">✏️</button>
            </div>
            <div style="padding: 8px 15px; font-size: 0.85rem; color: var(--text-muted); border-bottom: 1px solid var(--border-color);">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; margin-bottom: 6px;">
                    <span>📏 <strong>${totalDist.toFixed(1)} km</strong></span>
                    <span>↗ <strong>${Math.round(totalUp)} m</strong></span>
                    <span>↘ <strong>${Math.round(totalDown)} m</strong></span>
                    <span>⭐ <strong>${avgDiff}/5</strong></span>
                </div>
                <div style="font-size: 0.8rem;">⏱️ Kontrolní čas: <strong>${ctrlTime}</strong> · ${r.segments ? r.segments.length : 0} úseků</div>
            </div>
            <div class="sidebar-runner-form" id="sidebar_form_${idx}">
                <div class="form-group">
                    <label>Jméno</label>
                    <input type="text" id="sb_r_name_${idx}" value="${r.name}">
                </div>
                <div class="form-group">
                    <label>Čas kontr. úseku (HH:MM:SS)</label>
                    <input type="text" id="sb_r_time_${idx}" value="${ctrlTime !== '-' ? ctrlTime : ''}" pattern="[0-9]{1,2}:[0-9]{2}:[0-9]{2}">
                </div>
                <div class="form-group">
                    <label>Úseky (čárkou oddělená čísla)</label>
                    <input type="text" id="sb_r_segs_${idx}" value="${r.segments.join(', ')}">
                </div>
                <button class="btn btn-primary" style="margin-top: 10px; width: 100%; padding: 0.5rem;" onclick="saveRunner(${idx})">Uložit běžce</button>
            </div>
        `;
        list.appendChild(div);
    });
}


// ============================================
// OVLÁDÁNÍ SIDEBARU A DROPDOWNU
// ============================================

function closeSidebar() {
    const sidebar = document.getElementById('runnerSidebar');
    if (sidebar) sidebar.classList.remove('open');
    const dropdown = document.getElementById('segmentsDropdown');
    if (dropdown) dropdown.classList.remove('active');
}

function toggleDropdown() {
    const dropdown = document.getElementById('segmentsDropdown');
    if (dropdown) dropdown.classList.toggle('active');
}

function toggleRunnerEdit(idx) {
    const form = document.getElementById(`sidebar_form_${idx}`);
    if (form) form.classList.toggle('active');
}


// ============================================
// UKLÁDÁNÍ EDITOVANÉHO BĚŽCE (LOCALSTORAGE)
// ============================================

/**
 * Uloží změny o běžci přímo lokálně a přepočítá časy bez reloadu.
 */
function saveRunner(idx) {
    if (!window.runnersData || !window.runnersData[idx]) return;

    // Upravit jméno a kontrolní čas běžce v paměti
    window.runnersData[idx].name = document.getElementById(`sb_r_name_${idx}`).value;
    const hmsValue = document.getElementById(`sb_r_time_${idx}`).value;
    window.runnersData[idx].ctrl_time_hms = hmsValue;
    if (typeof parseHMS === 'function') {
        window.runnersData[idx].ctrl_time_min = parseHMS(hmsValue);
    }

    // Parsování čárkou oddělených čísel úseků
    const segsStr = document.getElementById(`sb_r_segs_${idx}`).value;
    const segsArr = segsStr.split(',').map(s => parseInt(s.trim())).filter(s => !isNaN(s));
    window.runnersData[idx].segments = segsArr;

    // Uložit stav do localStorage
    if (typeof saveCurrentRaceToLocalStorage === 'function') {
        saveCurrentRaceToLocalStorage();
    }

    // Překreslit a přepočítat
    renderSidebarRunners();
    if (typeof recalculateAll === 'function') {
        recalculateAll();
    }
}
