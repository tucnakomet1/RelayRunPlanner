import pulp

def generate_ilp_plan(runners, segments, gap, car_count, has_central, cars):
    """
    runners: list of dicts [{'target_count': 3}, ...]
    segments: list of dicts [{'id': 1, 'dist': 10.5, 'elev': 150}, ...]
    gap: int, minimum pause
    car_count: int
    has_central: bool
    cars: list of lists of runner indices, e.g. [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]]
    """
    prob = pulp.LpProblem("Relay_Generation", pulp.LpMinimize)
    
    R = len(runners)
    S = len(segments)
    
    # x[r][s] = 1 if runner r runs segment s (0-indexed)
    x = pulp.LpVariable.dicts("x", (range(R), range(S)), cat='Binary')
    
    # 1. Každý úsek běží právě jeden běžec
    for s in range(S):
        prob += pulp.lpSum([x[r][s] for r in range(R)]) == 1
        
    # 2. Každý běžec běží požadovaný počet úseků
    for r in range(R):
        prob += pulp.lpSum([x[r][s] for s in range(S)]) == runners[r]['target_count']
        
    # 3. Gap omezení
    for r in range(R):
        for s in range(S - gap):
            prob += pulp.lpSum([x[r][s+k] for k in range(gap + 1)]) <= 1
            
    # 4. Předřazení aut (pokud není centrála)
    if not has_central:
        car_assignments = []
        car_turn = 0
        segment_idx = 0
        
        while segment_idx < S:
            active_car = cars[car_turn]
            if len(active_car) == 0:
                car_turn = (car_turn + 1) % car_count
                continue
                
            run_limit = len(active_car)
            run_count = 0
            while run_count < run_limit and segment_idx < S:
                car_assignments.append(car_turn)
                segment_idx += 1
                run_count += 1
            car_turn = (car_turn + 1) % car_count
            
        for s in range(S):
            assigned_car_idx = car_assignments[s]
            allowed_runners = set(cars[assigned_car_idx])
            for r in range(R):
                if r not in allowed_runners:
                    prob += x[r][s] == 0

    # 4.5. Rovnoměrné rozložení (Spread Constraint / Třetiny)
    for r in range(R):
        K = runners[r].get('target_count', 0)
        if K > 1:
            interval_size = S / float(K)
            for i in range(K):
                start_idx = int(round(i * interval_size))
                end_idx = int(round((i + 1) * interval_size))
                prob += pulp.lpSum([x[r][s] for s in range(start_idx, end_idx)]) <= 1

    # 5. Cílová funkce (Vyvážení)
    avg_dist = sum(seg['dist'] for seg in segments) / S if S > 0 else 0
    avg_elev = sum(seg['elev_up'] for seg in segments) / S if S > 0 else 0
    
    dev_dist = pulp.LpVariable.dicts("dev_dist", range(R), lowBound=0)
    dev_elev = pulp.LpVariable.dicts("dev_elev", range(R), lowBound=0)
    
    for r in range(R):
        target_segs = runners[r]['target_count']
        expected_dist = target_segs * avg_dist
        expected_elev = target_segs * avg_elev
        
        actual_dist = pulp.lpSum([x[r][s] * segments[s]['dist'] for s in range(S)])
        actual_elev = pulp.lpSum([x[r][s] * segments[s]['elev_up'] for s in range(S)])
        
        prob += dev_dist[r] >= actual_dist - expected_dist
        prob += dev_dist[r] >= expected_dist - actual_dist
        
        prob += dev_elev[r] >= actual_elev - expected_elev
        prob += dev_elev[r] >= expected_elev - actual_elev

    # Objective: Minimize sum of distance deviations + weighted sum of elevation deviations
    prob += pulp.lpSum([dev_dist[r] + 0.01 * dev_elev[r] for r in range(R)])
    
    solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=20)
    status = prob.solve(solver)
    
    if status == pulp.LpStatusInfeasible:
        return {"status": "error", "message": "Pravidla jsou příliš přísná a řešení neexistuje. Zkuste snížit mezeru."}
        
    is_feasible = False
    for r in range(R):
        for s in range(S):
            if pulp.value(x[r][s]) is not None and pulp.value(x[r][s]) > 0.5:
                is_feasible = True
                break
    
    if not is_feasible:
         return {"status": "error", "message": "Optimalizace selhala. Zkuste volnější pravidla."}
         
    result_assignment = []
    for s in range(S):
        assigned_runner = -1
        for r in range(R):
            val = pulp.value(x[r][s])
            if val is not None and val > 0.5:
                assigned_runner = r
                break
        result_assignment.append(assigned_runner)
        
    return {
        "status": "success",
        "assignment": result_assignment
    }
