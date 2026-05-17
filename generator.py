"""
generator.py – Optimalizace přiřazení úseků pomocí ILP (celočíselné lineární programování)

Tento modul řeší problém spravedlivého rozdělení úseků štafetového
závodu mezi běžce. Používá knihovnu PuLP pro formulaci a řešení
ILP problému s následujícími omezeními:

    1. Každý úsek běží právě jeden běžec
    2. Každý běžec má přesný počet úseků (target_count)
    3. Mezi úseky téhož běžce je minimální pauza (gap)
    4. Běžci jsou přiřazeni k autům (logistické omezení)
    5. Úseky jsou rovnoměrně rozloženy po trase (spread constraint)

Účelová funkce minimalizuje odchylku celkové vzdálenosti a převýšení
od „spravedlivého průměru" pro každého běžce.

Podrobný matematický popis je v docs/relayrun.pdf.
"""

import pulp


def generate_ilp_plan(runners, segments, gap, car_count, has_central, cars):
    """
    Najde optimální přiřazení úseků běžcům pomocí ILP.

    Args:
        runners (list[dict]): Seznam běžců, každý musí obsahovat:
            - target_count (int): Kolik úseků má běžec odběhnout
        segments (list[dict]): Seznam úseků, každý musí obsahovat:
            - dist (float): Délka v km
            - elev_up (float): Převýšení v metrech
        gap (int):           Minimální pauza mezi úseky téhož běžce
                             (počet mezilehlých úseků, ne čas)
        car_count (int):     Počet aut v týmu
        has_central (bool):  True pokud závod má centrální stanoviště
                             (ovlivňuje, zda se aplikují omezení aut)
        cars (list[list]):   Přiřazení běžců do aut, např. [[0,1],[2,3]]
                             (pouze pokud has_central=False)

    Returns:
        dict: Výsledek optimalizace:
            - status: "success" nebo "error"
            - assignment: seznam indexů běžců (0-indexed) pro každý úsek
            - message: chybová zpráva (pokud status="error")
    """
    prob = pulp.LpProblem("Relay_Generation", pulp.LpMinimize)

    R = len(runners)   # Počet běžců
    S = len(segments)  # Počet úseků

    # Rozhodovací proměnná: x[r][s] = 1 pokud běžec r běží úsek s (0-indexed)
    x = pulp.LpVariable.dicts("x", (range(R), range(S)), cat='Binary')

    # ----------------------------------------
    # PODMÍNKA 1: Obsazení úseku
    # Každý úsek musí běžet právě jeden běžec
    # ----------------------------------------
    for s in range(S):
        prob += pulp.lpSum([x[r][s] for r in range(R)]) == 1

    # ----------------------------------------
    # PODMÍNKA 2: Zátěž běžce
    # Každý běžec běží přesně target_count úseků
    # ----------------------------------------
    for r in range(R):
        prob += pulp.lpSum([x[r][s] for s in range(S)]) == runners[r]['target_count']

    # ----------------------------------------
    # PODMÍNKA 3: Odpočinek (gap)
    # Pokud běžec doběhne úsek, musí následovat pauza gap úseků
    # Realizováno: v okně gap+1 po sobě jdoucích úseků smí být max 1
    # ----------------------------------------
    for r in range(R):
        for s in range(S - gap):
            prob += pulp.lpSum([x[r][s+k] for k in range(gap + 1)]) <= 1

    # ----------------------------------------
    # PODMÍNKA 4: Logistika aut (pouze bez centrály)
    # Běžec smí běžet jen úseky pokryté jeho autem
    # ----------------------------------------
    if not has_central:
        # Výpočet, které auto pokrývá který úsek
        # Auta se střídají po blocích o velikosti počtu běžců v autě
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

        # Zakázat běžce na úsecích, které nejsou pokryté jeho autem
        for s in range(S):
            assigned_car_idx = car_assignments[s]
            allowed_runners = set(cars[assigned_car_idx])
            for r in range(R):
                if r not in allowed_runners:
                    prob += x[r][s] == 0

    # ----------------------------------------
    # PODMÍNKA 4.5: Rovnoměrné rozložení (Spread Constraint)
    # Úseky běžce mají být rovnoměrně rozmístěné po trase
    # Trasa se rozdělí na K intervalů a v každém smí být max 1 úsek
    # ----------------------------------------
    for r in range(R):
        K = runners[r].get('target_count', 0)
        if K > 1:
            interval_size = S / float(K)
            for i in range(K):
                start_idx = int(round(i * interval_size))
                end_idx = int(round((i + 1) * interval_size))
                prob += pulp.lpSum([x[r][s] for s in range(start_idx, end_idx)]) <= 1

    # ----------------------------------------
    # ÚČELOVÁ FUNKCE: Minimalizace nerovnoměrnosti
    # Snažíme se, aby celková vzdálenost a převýšení
    # byly mezi běžce rozděleny co nejrovnoměrněji
    # ----------------------------------------

    # Průměrná vzdálenost a převýšení na úsek
    avg_dist = sum(seg['dist'] for seg in segments) / S if S > 0 else 0
    avg_elev = sum(seg['elev_up'] for seg in segments) / S if S > 0 else 0

    # Pomocné proměnné pro absolutní odchylku (linearizace |x|)
    dev_dist = pulp.LpVariable.dicts("dev_dist", range(R), lowBound=0)
    dev_elev = pulp.LpVariable.dicts("dev_elev", range(R), lowBound=0)

    for r in range(R):
        target_segs = runners[r]['target_count']
        expected_dist = target_segs * avg_dist  # Kolik km by měl běžec „spravedlivě" běžet
        expected_elev = target_segs * avg_elev  # Kolik metrů stoupání by měl „spravedlivě" mít

        actual_dist = pulp.lpSum([x[r][s] * segments[s]['dist'] for s in range(S)])
        actual_elev = pulp.lpSum([x[r][s] * segments[s]['elev_up'] for s in range(S)])

        # Linearizace absolutní hodnoty: dev >= actual - expected, dev >= expected - actual
        prob += dev_dist[r] >= actual_dist - expected_dist
        prob += dev_dist[r] >= expected_dist - actual_dist

        prob += dev_elev[r] >= actual_elev - expected_elev
        prob += dev_elev[r] >= expected_elev - actual_elev

    # Minimalizujeme vážený součet odchylek
    # Váha 0.01 pro převýšení kompenzuje rozdíl řádů (km vs m)
    prob += pulp.lpSum([dev_dist[r] + 0.01 * dev_elev[r] for r in range(R)])

    # ----------------------------------------
    # ŘEŠENÍ
    # ----------------------------------------
    solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=20)
    status = prob.solve(solver)

    # Kontrola, zda řešení existuje
    if status == pulp.LpStatusInfeasible:
        return {"status": "error", "message": "Pravidla jsou příliš přísná a řešení neexistuje. Zkuste snížit mezeru."}

    # Kontrola, zda řešič našel alespoň jedno přiřazení
    is_feasible = False
    for r in range(R):
        for s in range(S):
            if pulp.value(x[r][s]) is not None and pulp.value(x[r][s]) > 0.5:
                is_feasible = True
                break

    if not is_feasible:
         return {"status": "error", "message": "Optimalizace selhala. Zkuste volnější pravidla."}

    # Extrakce výsledného přiřazení
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
