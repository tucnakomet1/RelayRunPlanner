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

# --- INICIALIZACE DATABÁZE ---
def get_db():
    conn = sqlite3.connect('race.db')
    conn.row_factory = sqlite3.Row
    return conn

with get_db() as conn:
    conn.execute('CREATE TABLE IF NOT EXISTS races (id TEXT PRIMARY KEY, data TEXT)')

# --- POMOCNÉ FUNKCE ---
# Pomocné funkce zůstávají stejné jako v předchozí verzi (is_night_run, time_to_minutes, calculate_expected_time)
def is_night_run(start_time, end_time):
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
    
    # Úsek je noční, pokud obsahuje alespoň 1 noční minutu.
    # (Pokud bys chtěl toleranci např. 10 minut, změň to na: return night_minutes >= 10)
    return night_minutes > 0

def time_to_minutes(time_str):
    try:
        parts = list(map(int, time_str.strip().split(':')))
        if len(parts) == 3: return parts[0] * 60 + parts[1] + parts[2] / 60.0
        elif len(parts) == 2: return parts[0] * 60 + parts[1]
        return 0
    except: return 0

def calculate_expected_time(runner, segment_dist_km, segment_elev):
    ctrl_dist_km = runner['ctrl_dist_m'] / 1000.0
    ctrl_eq_dist = ctrl_dist_km + (runner['ctrl_elev'] / 100.0)
    runner_pace_min_per_km = runner['ctrl_time_min'] / ctrl_eq_dist if ctrl_eq_dist > 0 else 0
    seg_eq_dist = segment_dist_km + (segment_elev / 100.0)
    return runner_pace_min_per_km * seg_eq_dist, (runner_pace_min_per_km * seg_eq_dist) / segment_dist_km

# --- ROUTY ---
@app.route('/', methods=['GET'])
def step1():
    # Načtení seznamu všech existujících závodů z databáze
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
    return render_template('index.html', step=2, race_name=request.form.get('race_name'), 
                           start_time=request.form.get('start_time'), 
                           segment_count=int(request.form.get('segment_count', 0)))

@app.route('/result', methods=['POST'])
def result():
    race_name = request.form.get('race_name')
    start_time_str = request.form.get('start_time')
    start_time = datetime.strptime(start_time_str, '%Y-%m-%dT%H:%M')
    
    runners_raw = json.loads(request.form.get('runners_data', '[]'))
    colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#eab308']
    
    runners = []
    for i, r in enumerate(runners_raw):
        r['ctrl_time_min'] = time_to_minutes(r['ctrl_time_hms'])
        r['color'] = colors[i % len(colors)]
        r['run_count'] = 0
        runners.append(r)

    file = request.files.get('route_file')
    route_data = json.loads(file.read().decode('utf-8')) if file else []
    segments_output = []
    current_time = start_time
    
    for segment in route_data:
        seg_id = int(segment.get('usek_id', 0))
        dist_raw = float(segment.get('delka_km', 0))
        dist_km = dist_raw / 1000.0 if dist_raw > 500 else dist_raw 
        elev_up = float(segment.get('stoupani_m', 0))
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
                'planned_duration_min': exp_time_min, # Klíčové pro JS
                'is_night': is_night_run(current_time, end_time)
            })
            current_time = end_time
    # Uložení do databáze
    race_id = str(uuid.uuid4())[:8] # Krátké ID pro hezčí URL
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

# --- API PRO SYNCHRONIZACI ---
@app.route('/api/race/<race_id>', methods=['GET'])
def get_race_api(race_id):
    with get_db() as conn:
        row = conn.execute('SELECT data FROM races WHERE id = ?', (race_id,)).fetchone()
    if row: return jsonify(json.loads(row['data']))
    return jsonify({"error": "not found"}), 404

@app.route('/api/race/<race_id>/update', methods=['POST'])
def update_race_api(race_id):
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
    req_data = request.json
    new_name = req_data.get('race_name')
    new_start = req_data.get('start_iso')
    new_runners = req_data.get('runners')

    with get_db() as conn:
        row = conn.execute('SELECT data FROM races WHERE id = ?', (race_id,)).fetchone()
        if not row:
            return jsonify({"error": "Race not found"}), 404
        
        race_data = json.loads(row['data'])
        
        # Update name and start time
        if new_name:
            race_data['race_name'] = new_name
        
        try:
            # Převedeme čas na datetime objekt
            if new_start:
                race_data['start_iso'] = new_start
            start_time = datetime.fromisoformat(race_data.get('start_iso', ''))
        except:
            start_time = datetime.now()

        # Update runners
        if new_runners:
            # Přepočítáme ctrl_time_min pro běžce, pokud byl odeslán hh:mm:ss
            for r in new_runners:
                if 'ctrl_time_hms' in r:
                    r['ctrl_time_min'] = time_to_minutes(r['ctrl_time_hms'])
                r['run_count'] = 0
            race_data['runners'] = new_runners
        
        runners = race_data.get('runners', [])
        
        # Recompute segments
        current_time = start_time
        for segment in race_data['segments']:
            seg_id = segment['id']
            # Najít běžce pro tento úsek
            assigned_runner = next((r for r in runners if seg_id in r.get('segments', [])), None)
            
            if assigned_runner:
                assigned_runner['run_count'] += 1
                
                # Předpokládáme, že původní dist a elev_up jsou v pořádku uložené
                dist_km = segment['dist']
                elev_up = segment['elev_up']
                
                exp_time_min, _ = calculate_expected_time(assigned_runner, dist_km, elev_up)
                end_time = current_time + timedelta(minutes=exp_time_min)
                
                segment['runner'] = assigned_runner['name']
                segment['runner_color'] = assigned_runner.get('color', '#808080')
                segment['runner_iteration'] = assigned_runner['run_count']
                segment['planned_duration_min'] = exp_time_min
                segment['is_night'] = is_night_run(current_time, end_time)
                
                # Pokud úsek je hotový, přidáme i jeho actual_time (který zůstává, ale ETA a night se může změnit)
                if segment.get('is_done') and segment.get('actual_time'):
                    actual_min = time_to_minutes(segment['actual_time'])
                    current_time = current_time + timedelta(minutes=actual_min)
                else:
                    current_time = end_time
            else:
                # Pokud nikdo úsek neběží
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
    data = [{"usek_id": i, "nazev": "", "delka_km": "", "stoupani_m": "", "klesani_m": "", "obtiznost": ""} for i in range(1, n + 1)]
    return Response(json.dumps(data, indent=4), mimetype="application/json", headers={"Content-disposition": f"attachment; filename=plan_{n}.json"})

@app.route('/api/race/<race_id>/smart_generate_ilp', methods=['POST'])
def smart_generate_ilp(race_id):
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
    with get_db() as conn:
        conn.execute('DELETE FROM races WHERE id = ?', (race_id,))
    return jsonify({"status": "success"})

if __name__ == '__main__':
    app.run(debug=True)