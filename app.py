"""
app.py – Hlavní Flask aplikace pro RelayRunPlanner

Poskytuje webové rozhraní a REST API pro správu štafetových závodů.
Data závodů jsou ukládána v SQLite databázi (race.db) jako JSON.

Workflow aplikace:
    Step 1 → Vytvoření nového závodu (název, start, počet úseků)
    Step 2 → Nahrání trasy (JSON) a přidání běžců s kontrolními časy
    Step 3 → Zobrazení plánu závodu s predikovanými časy a správou běžců

Endpointy:
    GET  /                           → Úvodní stránka (Step 1)
    POST /step2                      → Formulář pro tým (Step 2)
    POST /result                     → Vytvoření závodu a redirect na detail
    GET  /race/<id>                  → Detail závodu (Step 3)
    GET  /api/race/<id>              → JSON data závodu (polling)
    POST /api/race/<id>/update       → Aktualizace jednoho úseku
    POST /api/race/<id>/edit_settings → Editace nastavení závodu
    POST /api/race/<id>/smart_generate_ilp → Spuštění ILP optimalizace
    POST /api/race/<id>/logistics    → Výpočet logistiky aut
    POST /api/race/<id>/delete       → Smazání závodu
    GET  /sample/json/<n>            → Stažení prázdné JSON šablony

Závislosti: Flask, astral (výpočet západu/východu slunce), generator, logistics
"""

from flask import Flask, render_template, request, Response, redirect, url_for, jsonify
import json
import sqlite3
import uuid
from datetime import datetime, timedelta
from astral import LocationInfo
from astral.sun import sun
import generator
import logistics

app = Flask(__name__)


# ============================================
# INICIALIZACE DATABÁZE
# ============================================

def get_db():
    """
    Vytvoří a vrátí připojení k SQLite databázi.
    Používá sqlite3.Row pro přístup ke sloupcům podle jména.

    Returns:
        sqlite3.Connection: Aktivní připojení k databázi race.db
    """
    conn = sqlite3.connect('race.db')
    conn.row_factory = sqlite3.Row
    return conn

# Zajistíme, že tabulka 'races' existuje při startu aplikace
with get_db() as conn:
    conn.execute('CREATE TABLE IF NOT EXISTS races (id TEXT PRIMARY KEY, data TEXT)')


# ============================================
# POMOCNÉ FUNKCE
# ============================================

def is_night_run(start_time, end_time):
    """
    Určí, zda úsek závodu probíhá (alespoň částečně) v noci.

    Noční běh je definován jako běh před východem slunce + 30 min
    nebo po západu slunce - 30 min. Tato tolerance zajišťuje,
    že běžci mají čas na přípravu čelovky.

    Algoritmus prochází úsek minutu po minutě a počítá noční minuty.
    Pro optimalizaci si cachuje sluneční data pro každý den.

    Args:
        start_time (datetime): Začátek úseku
        end_time (datetime):   Konec úseku

    Returns:
        bool: True pokud úsek obsahuje alespoň 1 noční minutu
    """
    city = LocationInfo("Prague", "Czechia", "Europe/Prague", 50.073658, 14.418540)

    current = start_time
    night_minutes = 0
    total_minutes = (end_time - start_time).total_seconds() / 60

    if total_minutes <= 0: return False

    # Slovník pro uložení časů východu/západu pro konkrétní dny (optimalizace výkonu)
    sun_data = {}

    while current < end_time:
        current_date = current.date()

        # Pokud sluneční data pro tento konkrétní den ještě nemáme, stáhneme je
        if current_date not in sun_data:
            s = sun(city.observer, date=current_date, tzinfo=city.timezone)

            # Odstraníme časové pásmo a ROZŠÍŘÍME definici noci o 30 minut z obou stran
            sun_data[current_date] = {
                # Noc trvá ještě 30 minut PO východu slunce
                'sunrise_extended': s['sunrise'].replace(tzinfo=None) + timedelta(minutes=30),
                # Noc začíná už 30 minut PŘED západem slunce
                'sunset_extended': s['sunset'].replace(tzinfo=None) - timedelta(minutes=30)
            }

        day_sun = sun_data[current_date]

        # Noc je cokoliv PŘED prodlouženým východem NEBO PO brzkém západu slunce
        if current < day_sun['sunrise_extended'] or current >= day_sun['sunset_extended']:
            night_minutes += 1

        current += timedelta(minutes=1)

    # Úsek je noční, pokud obsahuje alespoň 1 noční minutu
    return night_minutes > 0


def time_to_minutes(time_str):
    """
    Převede časový řetězec (HH:MM:SS nebo HH:MM) na minuty.

    Args:
        time_str (str): Čas ve formátu "HH:MM:SS" nebo "HH:MM"

    Returns:
        float: Celkový počet minut (včetně desetinných míst pro sekundy)
    """
    try:
        parts = list(map(int, time_str.strip().split(':')))
        if len(parts) == 3: return parts[0] * 60 + parts[1] + parts[2] / 60.0
        elif len(parts) == 2: return parts[0] * 60 + parts[1]
        return 0
    except: return 0


def calculate_expected_time(runner, segment_dist_km, segment_elev):
    """
    Vypočítá předpokládaný čas běžce na daném úseku.

    Používá koncept „ekvivalentní vzdálenosti", kde se k reálné
    vzdálenosti přičte převýšení přepočtené koeficientem (100m převýšení = 1km).
    Tempo běžce se odvodí z jeho kontrolního úseku.

    Vzorec:
        eq_dist = dist_km + (elev_up / 100)
        pace = ctrl_time / ctrl_eq_dist
        expected = pace * seg_eq_dist

    Args:
        runner (dict):          Data běžce (ctrl_time_min, ctrl_dist_m, ctrl_elev)
        segment_dist_km (float): Délka úseku v km
        segment_elev (float):    Převýšení úseku v metrech

    Returns:
        tuple: (expected_minutes, expected_pace_per_km)
    """
    ctrl_dist_km = runner['ctrl_dist_m'] / 1000.0
    ctrl_eq_dist = ctrl_dist_km + (runner['ctrl_elev'] / 100.0)
    runner_pace_min_per_km = runner['ctrl_time_min'] / ctrl_eq_dist if ctrl_eq_dist > 0 else 0
    seg_eq_dist = segment_dist_km + (segment_elev / 100.0)
    return runner_pace_min_per_km * seg_eq_dist, (runner_pace_min_per_km * seg_eq_dist) / segment_dist_km


# ============================================
# ROUTY – HLAVNÍ STRÁNKY
# ============================================

@app.route('/', methods=['GET'])
def step1():
    """
    Úvodní stránka (Krok 1).
    Zobrazí formulář pro vytvoření nového závodu a seznam existujících závodů.
    """
    with get_db() as conn:
        rows = conn.execute('SELECT id, data FROM races').fetchall()

    existing_races = []
    for row in rows:
        try:
            race_data = json.loads(row['data'])
            existing_races.append({
                'id': row['id'],
                'name': race_data.get('race_name', 'Nepojmenovaný závod')
            })
        except:
            continue

    return render_template('index.html', step=1, existing_races=existing_races)


@app.route('/step2', methods=['POST'])
def step2():
    """
    Formulář pro nastavení týmu (Krok 2).
    Přijímá data z Kroku 1 a zobrazí formulář pro přidání běžců.
    """
    return render_template('index.html', step=2, race_name=request.form.get('race_name'),
                           start_time=request.form.get('start_time'),
                           segment_count=int(request.form.get('segment_count', 0)))


@app.route('/result', methods=['POST'])
def result():
    """
    Zpracování formuláře z Kroku 2 – vytvoření závodu.

    Postup:
        1. Parsování dat běžců z JSON hidden inputu
        2. Načtení trasy z nahraného JSON souboru
        3. Pro každý úsek: přiřazení běžce, výpočet predikovaného času,
           detekce nočního běhu
        4. Uložení závodu do databáze s unikátním 8-znakovým ID
        5. Redirect na detail závodu
    """
    race_name = request.form.get('race_name')
    start_time_str = request.form.get('start_time')
    start_time = datetime.strptime(start_time_str, '%Y-%m-%dT%H:%M')

    # Parsování JSON dat běžců z hidden inputu
    runners_raw = json.loads(request.form.get('runners_data', '[]'))
    # Paleta barev pro běžce (cyklicky se opakuje)
    colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#eab308']

    runners = []
    for i, r in enumerate(runners_raw):
        r['ctrl_time_min'] = time_to_minutes(r['ctrl_time_hms'])
        r['color'] = colors[i % len(colors)]
        r['run_count'] = 0  # Počítadlo etap běžce (kolikátý úsek v řadě)
        runners.append(r)

    # Načtení trasy z nahraného souboru
    file = request.files.get('route_file')
    route_data = json.loads(file.read().decode('utf-8')) if file else []
    segments_output = []
    current_time = start_time

    for segment in route_data:
        seg_id = int(segment.get('usek_id', 0))
        dist_raw = float(segment.get('delka_km', 0))
        # Autodetekce: pokud je hodnota > 500, předpokládáme metry místo km
        dist_km = dist_raw / 1000.0 if dist_raw > 500 else dist_raw
        elev_up = float(segment.get('stoupani_m', 0))

        # Najdeme běžce, který má tento úsek přiřazen
        assigned_runner = next((r for r in runners if seg_id in r['segments']), None)

        if assigned_runner:
            assigned_runner['run_count'] += 1
            exp_time_min, exp_pace = calculate_expected_time(assigned_runner, dist_km, elev_up)
            end_time = current_time + timedelta(minutes=exp_time_min)

            segments_output.append({
                'id': seg_id, 'name': segment.get('nazev', f'Úsek {seg_id}'),
                'runner': assigned_runner['name'], 'runner_color': assigned_runner['color'],
                'runner_iteration': assigned_runner['run_count'], 'dist': round(dist_km, 2),
                'elev_up': elev_up, 'elev_down': float(segment.get('klesani_m', 0)),
                'difficulty': segment.get('obtiznost', ''),
                'planned_duration_min': exp_time_min,  # Klíčové pro JS přepočet
                'is_night': is_night_run(current_time, end_time)
            })
            current_time = end_time

    # Uložení do databáze s krátkým UUID (8 znaků pro hezčí URL)
    race_id = str(uuid.uuid4())[:8]
    race_data = {
        'race_name': race_name,
        'start_iso': start_time.isoformat(),
        'segments': segments_output,
        'runners': runners
    }

    with get_db() as conn:
        conn.execute('INSERT INTO races (id, data) VALUES (?, ?)', (race_id, json.dumps(race_data)))

    return redirect(url_for('view_race', race_id=race_id))


@app.route('/race/<race_id>')
def view_race(race_id):
    """
    Detail závodu (Krok 3).
    Načte data závodu z databáze a vykreslí plán s úseky.

    Args:
        race_id (str): Unikátní ID závodu v databázi

    Returns:
        Rendered template nebo 404 pokud závod neexistuje
    """
    with get_db() as conn:
        row = conn.execute('SELECT data FROM races WHERE id = ?', (race_id,)).fetchone()
    if not row:
        return "Závod nenalezen. Zkontrolujte URL.", 404

    race_data = json.loads(row['data'])
    return render_template('index.html', step=3, race_id=race_id,
                           segments=race_data['segments'],
                           race_name=race_data.get('race_name', ''),
                           start_iso=race_data.get('start_iso', ''),
                           runners=race_data.get('runners', []),
                           logistics_data=race_data.get('logistics', None))


# ============================================
# API – SYNCHRONIZACE A EDITACE
# ============================================

@app.route('/api/race/<race_id>', methods=['GET'])
def get_race_api(race_id):
    """
    Vrátí kompletní JSON data závodu.
    Používá se pro polling z klientského JS (každých 10s).
    """
    with get_db() as conn:
        row = conn.execute('SELECT data FROM races WHERE id = ?', (race_id,)).fetchone()
    if row: return jsonify(json.loads(row['data']))
    return jsonify({"error": "not found"}), 404


@app.route('/api/race/<race_id>/update', methods=['POST'])
def update_race_api(race_id):
    """
    Aktualizuje stav jednoho úseku (doběhnutý/čas).
    Volá se z JS při zaškrtnutí checkboxu nebo změně času.

    Očekávaný JSON body:
        { "index": 0, "is_done": true, "actual_time": "01:23:45" }
    """
    req_data = request.json
    idx = req_data.get('index')
    is_done = req_data.get('is_done')
    actual_time = req_data.get('actual_time')

    with get_db() as conn:
        row = conn.execute('SELECT data FROM races WHERE id = ?', (race_id,)).fetchone()
        if row:
            race_data = json.loads(row['data'])
            # Aktualizace konkrétního úseku
            race_data['segments'][idx]['is_done'] = is_done
            race_data['segments'][idx]['actual_time'] = actual_time

            conn.execute('UPDATE races SET data = ? WHERE id = ?', (json.dumps(race_data), race_id))
            return jsonify({"status": "success"})
    return jsonify({"error": "failed"}), 400


@app.route('/api/race/<race_id>/edit_settings', methods=['POST'])
def edit_race_settings(race_id):
    """
    Editace nastavení závodu – název, čas startu a/nebo přiřazení běžců.

    Pokud se změní běžci, přepočítají se všechny predikované časy
    a noční příznaky úseků. Běžcům se recalkuluje ctrl_time_min
    z ctrl_time_hms.

    Očekávaný JSON body (všechna pole jsou volitelná):
        {
            "race_name": "Nový název",
            "start_iso": "2026-05-17T06:00",
            "runners": [...]
        }
    """
    req_data = request.json
    new_name = req_data.get('race_name')
    new_start = req_data.get('start_iso')
    new_runners = req_data.get('runners')

    with get_db() as conn:
        row = conn.execute('SELECT data FROM races WHERE id = ?', (race_id,)).fetchone()
        if not row:
            return jsonify({"error": "Race not found"}), 404

        race_data = json.loads(row['data'])

        # Aktualizace názvu
        if new_name:
            race_data['race_name'] = new_name

        # Aktualizace času startu
        try:
            if new_start:
                race_data['start_iso'] = new_start
            start_time = datetime.fromisoformat(race_data.get('start_iso', ''))
        except:
            start_time = datetime.now()

        # Aktualizace běžců – přepočet kontrolních časů
        if new_runners:
            for r in new_runners:
                if 'ctrl_time_hms' in r:
                    r['ctrl_time_min'] = time_to_minutes(r['ctrl_time_hms'])
                r['run_count'] = 0
            race_data['runners'] = new_runners

        runners = race_data.get('runners', [])

        # Přepočet všech úseků s novými daty běžců
        current_time = start_time
        for segment in race_data['segments']:
            seg_id = segment['id']
            # Najít běžce pro tento úsek
            assigned_runner = next((r for r in runners if seg_id in r.get('segments', [])), None)

            if assigned_runner:
                assigned_runner['run_count'] += 1

                dist_km = segment['dist']
                elev_up = segment['elev_up']

                exp_time_min, _ = calculate_expected_time(assigned_runner, dist_km, elev_up)
                end_time = current_time + timedelta(minutes=exp_time_min)

                # Aktualizace dat úseku
                segment['runner'] = assigned_runner['name']
                segment['runner_color'] = assigned_runner.get('color', '#808080')
                segment['runner_iteration'] = assigned_runner['run_count']
                segment['planned_duration_min'] = exp_time_min
                segment['is_night'] = is_night_run(current_time, end_time)

                # Pro doběhnuté úseky použijeme skutečný čas pro posun časové osy
                if segment.get('is_done') and segment.get('actual_time'):
                    actual_min = time_to_minutes(segment['actual_time'])
                    current_time = current_time + timedelta(minutes=actual_min)
                else:
                    current_time = end_time
            else:
                # Úsek bez přiřazeného běžce
                segment['runner'] = 'Nepřiřazeno'
                segment['runner_color'] = '#dddddd'
                segment['runner_iteration'] = 0
                segment['planned_duration_min'] = 0
                segment['is_night'] = is_night_run(current_time, current_time)

                if segment.get('is_done') and segment.get('actual_time'):
                    actual_min = time_to_minutes(segment['actual_time'])
                    current_time = current_time + timedelta(minutes=actual_min)

        conn.execute('UPDATE races SET data = ? WHERE id = ?', (json.dumps(race_data), race_id))
        return jsonify({"status": "success"})


@app.route('/sample/json/<int:n>')
def sample_json(n):
    """
    Vygeneruje a stáhne prázdnou JSON šablonu pro n úseků.
    Uživatel ji vyplní daty trasy a nahraje zpět v Kroku 2.

    Args:
        n (int): Požadovaný počet úseků

    Returns:
        Response: JSON soubor ke stažení
    """
    data = [{
        "usek_id": i,
        "nazev": "",
        "delka_km": "",
        "stoupani_m": "",
        "klesani_m": "",
        "obtiznost": ""
    } for i in range(1, n + 1)]
    return Response(
        json.dumps(data, indent=4),
        mimetype="application/json",
        headers={"Content-disposition": f"attachment; filename=plan_{n}.json"}
    )


# ============================================
# API – ILP GENERÁTOR A LOGISTIKA
# ============================================

@app.route('/api/race/<race_id>/smart_generate_ilp', methods=['POST'])
def smart_generate_ilp(race_id):
    """
    Spustí optimalizaci přiřazení úseků pomocí ILP modelu.
    Volá modul generator.py s konfigurací z klienta.

    Očekávaný JSON body:
        {
            "runners": [...],       – Běžci s target_count
            "min_pause": 3,         – Minimální pauza v úsecích
            "car_count": 2,         – Počet aut
            "has_central": false,   – Režim s centrálou
            "cars": [[0,1],[2,3]]   – Přiřazení běžců do aut
        }
    """
    req_data = request.json
    runners_data = req_data.get('runners', [])
    min_pause = req_data.get('min_pause', 0)
    car_count = req_data.get('car_count', 1)
    has_central = req_data.get('has_central', False)
    cars = req_data.get('cars', [])

    with get_db() as conn:
        row = conn.execute('SELECT data FROM races WHERE id = ?', (race_id,)).fetchone()
        if not row:
            return jsonify({"error": "Race not found"}), 404
        race_data = json.loads(row['data'])
        segments_data = race_data.get('segments', [])

    result = generator.generate_ilp_plan(runners_data, segments_data, min_pause, car_count, has_central, cars)
    return jsonify(result)


@app.route('/api/race/<race_id>/logistics', methods=['POST'])
def calculate_logistics_route(race_id):
    """
    Vypočítá logistiku aut – rozdělení úseků do bloků
    a přiřazení posádek. Výsledek se uloží do databáze.

    Očekávaný JSON body:
        {
            "runners": [...],
            "car_count": 2,
            "has_central": false,
            "central_segments": {"start": [1], "end": [36]}
        }
    """
    req_data = request.json
    runners_data = req_data.get('runners', [])
    car_count = req_data.get('car_count', 2)
    has_central = req_data.get('has_central', False)
    central_segments = req_data.get('central_segments', {})

    with get_db() as conn:
        row = conn.execute('SELECT data FROM races WHERE id = ?', (race_id,)).fetchone()
        if not row:
            return jsonify({"error": "Race not found"}), 404
        race_data = json.loads(row['data'])
        segments_data = race_data.get('segments', [])

    blocks = logistics.calculate_logistics(runners_data, segments_data, car_count, has_central, central_segments)

    # Uložíme logistiku do databáze, aby se příště zobrazila rovnou
    with get_db() as conn:
        row = conn.execute('SELECT data FROM races WHERE id = ?', (race_id,)).fetchone()
        if row:
            race_data = json.loads(row['data'])
            race_data['logistics'] = {
                'blocks': blocks,
                'config': {
                    'car_count': car_count,
                    'has_central': has_central,
                    'central_segments': central_segments
                }
            }
            conn.execute('UPDATE races SET data = ? WHERE id = ?', (json.dumps(race_data), race_id))

    return jsonify({"status": "success", "blocks": blocks})


@app.route('/api/race/<race_id>/delete', methods=['POST'])
def delete_race(race_id):
    """
    Smaže závod z databáze.

    Args:
        race_id (str): ID závodu ke smazání
    """
    with get_db() as conn:
        conn.execute('DELETE FROM races WHERE id = ?', (race_id,))
    return jsonify({"status": "success"})


# ============================================
# SPUŠTĚNÍ APLIKACE
# ============================================

if __name__ == '__main__':
    app.run(debug=True)