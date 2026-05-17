/**
 * sidebar.js – Postranní panel se seznamem běžců (Step 3)
 *
 * Sidebar umožňuje prohlížet a editovat přiřazené běžce
 * přímo z detailu závodu bez nutnosti znovu vyplňovat formulář.
 *
 * Obsahuje:
 *   - openSidebar()       – otevření a naplnění sidebaru daty
 *   - closeSidebar()      – zavření sidebaru
 *   - toggleDropdown()    – rozbalení/sbalení menu generátoru
 *   - toggleRunnerEdit()  – zobrazení/skrytí editačního formuláře
 *   - saveRunner()        – uložení změn jednoho běžce na server
 *
 * Globální proměnné (z race.js / inline):
 *   - runnersData   : Pole s daty běžců
 *   - segmentsData  : Pole s daty úseků
 *   - RACE_ID       : ID závodu
 *   - formatHMS()   : Formátovací funkce z race.js
 */


// ============================================
// OTEVŘENÍ A NAPLNĚNÍ SIDEBARU
// ============================================

/**
 * Otevře sidebar a dynamicky vygeneruje seznam běžců
 * včetně jejich statistik (vzdálenost, převýšení, obtížnost).
 */
function openSidebar() {
    const sidebar = document.getElementById('runnerSidebar');
    const list = document.getElementById('sidebarRunnersList');
    list.innerHTML = '';

    if (!runnersData || runnersData.length === 0) {
        list.innerHTML = '<p style="font-size:0.9rem; color:var(--text-muted);">Tým je prázdný. Nikdo nebyl přiřazen.</p>';
    } else {
        runnersData.forEach((r, idx) => {
            const div = document.createElement('div');
            div.className = 'sidebar-runner-item';

            // Barevný kroužek s barvou běžce
            const colorCircle = `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background-color:${r.color};"></span>`;

            // Výpočet souhrnných statistik běžce ze všech přiřazených úseků
            let totalDist = 0, totalUp = 0, totalDown = 0, totalDiff = 0, diffCount = 0;
            (r.segments || []).forEach(segId => {
                const s = segmentsData.find(x => x.id === segId);
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

            // Kontrolní čas – kompatibilita se staršími verzemi (ctrl_time_hms vs ctrl_time_min)
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
    sidebar.classList.add('open');
}


// ============================================
// ZAVŘENÍ A OVLÁDÁNÍ SIDEBARU
// ============================================

/** Zavře sidebar a schová dropdown menu */
function closeSidebar() {
    document.getElementById('runnerSidebar').classList.remove('open');
    document.getElementById('segmentsDropdown').classList.remove('active');
}

/** Přepíná rozbalení/sbalení dropdown menu generátoru úseků */
function toggleDropdown() {
    document.getElementById('segmentsDropdown').classList.toggle('active');
}

/**
 * Přepíná zobrazení editačního formuláře konkrétního běžce.
 * @param {number} idx – Index běžce v poli runnersData
 */
function toggleRunnerEdit(idx) {
    document.getElementById(`sidebar_form_${idx}`).classList.toggle('active');
}


// ============================================
// ULOŽENÍ ZMĚN BĚŽCE
// ============================================

/**
 * Uloží upravená data jednoho běžce na server.
 * Po úspěchu provede reload stránky pro přepočet.
 *
 * @param {number} idx – Index běžce v poli runnersData
 */
async function saveRunner(idx) {
    // Deep copy pro zamezení nežádoucí mutace původních dat
    let updatedRunners = JSON.parse(JSON.stringify(runnersData || []));

    updatedRunners[idx].name = document.getElementById(`sb_r_name_${idx}`).value;
    updatedRunners[idx].ctrl_time_hms = document.getElementById(`sb_r_time_${idx}`).value;

    // Parsování čárkou oddělených čísel úseků
    let segsStr = document.getElementById(`sb_r_segs_${idx}`).value;
    let segsArr = segsStr.split(',').map(s => parseInt(s.trim())).filter(s => !isNaN(s));
    updatedRunners[idx].segments = segsArr;

    try {
        let res = await fetch(`/api/race/${RACE_ID}/edit_settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                runners: updatedRunners
            })
        });

        let data = await res.json();
        if (data.status === 'success') {
            window.location.reload();
        } else {
            alert("Chyba při ukládání běžce: " + (data.error || "Neznámá chyba"));
        }
    } catch (e) {
        alert("Nepodařilo se uložit běžce.");
        console.error(e);
    }
}
