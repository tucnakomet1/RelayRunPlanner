"""
logistics.py – Plánování logistiky aut pro štafetový závod

Tento modul řeší otázku: „Kdo jede v jakém autě a na jaké úseky?"
Podporuje dva režimy provozu:

1. BEZ CENTRÁLY (lineární trasa, např. Vltava Run):
   - Úseky se rovnoměrně rozdělí mezi auta
   - Každé auto pokrývá souvislý blok úseků
   - Posádka auta se nemění

2. S CENTRÁLOU (např. 250 Českým rájem):
   - Auta se střídají v jízdách z centrální základny
   - Dynamické programování optimalizuje velikost bloků (2-4 úseky)
   - Pro každý blok se určí, kdo jede z centrály (outbound)
     a kdo se vrací (returning)
   - Respektuje úseky začínající/končící přímo v centrále

Podrobný matematický popis včetně schémat je v docs/relayrun.pdf.
"""

import json


def calculate_logistics(runners, segments, car_count, has_central, central_segments=None):
    """
    Vypočítá optimální rozložení úseků do bloků aut.

    Args:
        runners (list[dict]):    Seznam běžců s polem 'segments' (1-indexed)
        segments (list[dict]):   Seznam úseků závodu
        car_count (int):         Počet aut v týmu
        has_central (bool):      True = centrálový režim, False = lineární
        central_segments (dict): Konfigurace centrálových úseků:
            {
                "start": [1, 36],  – Úseky ZAČÍNAJÍCÍ v centrále
                "end": [35, 36]    – Úseky KONČÍCÍ v centrále
            }

    Returns:
        list[dict]: Seznam bloků, kde každý blok obsahuje:
            - car_num (int):     Číslo auta (1-indexed)
            - start_seg (int):   První úsek bloku (1-indexed)
            - end_seg (int):     Poslední úsek bloku (1-indexed)
            - outbound (list):   Indexy běžců jedoucích z centrály
            - returning (list):  Indexy běžců vracejících se na centrálu
    """
    N = len(segments)

    # Zpracování central_segments – převedeme na sety pro rychlý lookup
    if central_segments is None:
        central_segments = {}
    central_start_set = set(central_segments.get('start', []))  # Úseky ZAČÍNAJÍCÍ v centrále
    central_end_set = set(central_segments.get('end', []))      # Úseky KONČÍCÍ v centrále

    # ----------------------------------------
    # Mapování: pro každý úsek zjistíme index běžce
    # runner_for_seg[s] = index běžce, kde s je 0-indexed
    # ----------------------------------------
    runner_for_seg = [-1] * N
    for r_idx, r in enumerate(runners):
        for s_id in r.get('segments', []):
            if 1 <= s_id <= N:
                runner_for_seg[s_id - 1] = r_idx  # Převod 1-indexed → 0-indexed

    blocks = []

    if not has_central:
        # ============================================
        # LINEÁRNÍ REŽIM (bez centrály)
        # ============================================
        # Úseky se rovnoměrně rozdělí mezi auta.
        # Např. 36 úseků / 3 auta = 12 úseků na auto.
        # Pokud N není dělitelné, první auta dostanou o 1 úsek více.

        base_size = N // car_count
        rem = N % car_count  # Kolik aut dostane o 1 úsek navíc

        start = 0
        for i in range(car_count):
            size = base_size + (1 if i < rem else 0)
            end = start + size

            # Zjistíme, kteří běžci jsou v tomto bloku
            car_runners = set()
            for s in range(start, end):
                if runner_for_seg[s] != -1:
                    car_runners.add(runner_for_seg[s])

            blocks.append({
                "car_num": i + 1,
                "start_seg": start + 1,    # 1-indexed pro frontend
                "end_seg": end,            # 1-indexed
                "outbound": list(car_runners),
                "returning": list(car_runners),
                "incoming": []
            })
            start = end

    else:
        # ============================================
        # CENTRÁLOVÝ REŽIM (s centrální základnou)
        # ============================================
        # Dynamické programování hledá optimální rozdělení N úseků
        # na bloky velikosti 2, 3 nebo 4.
        #
        # Heuristická cena bloku zohledňuje:
        #   - Počet lidí v bloku × velikost bloku (méně = lepší)
        #   - Mírná preference bloků velikosti 3 (bonus -1)

        memo = {}

        def solve(idx):
            """
            Rekurzivní řešení s memoizací.

            Args:
                idx (int): Aktuální pozice na trase (0-indexed)

            Returns:
                tuple: (celková_cena, seznam_velikostí_bloků)
            """
            if idx == N:
                return 0, []
            if idx in memo:
                return memo[idx]

            best_cost = float('inf')
            best_path = None

            for k in [2, 3, 4]:
                if idx + k <= N:
                    cost_rest, path_rest = solve(idx + k)

                    # Spočítáme lidi v tomto bloku (včetně posledního běžce předchozího)
                    people = set()
                    for s in range(idx, idx + k):
                        if runner_for_seg[s] != -1:
                            people.add(runner_for_seg[s])
                    if idx > 0 and runner_for_seg[idx - 1] != -1:
                        people.add(runner_for_seg[idx - 1])

                    # Heuristická cena: méně lidí × méně úseků = lepší
                    cost_here = len(people) * k
                    if k == 3: cost_here -= 1  # Mírná preference bloků velikosti 3

                    total_cost = cost_here + cost_rest
                    if total_cost < best_cost:
                        best_cost = total_cost
                        best_path = [k] + path_rest

            memo[idx] = (best_cost, best_path)
            return memo[idx]

        _, best_k_list = solve(0)

        # ----------------------------------------
        # Sestavení bloků z optimálního rozdělení
        #
        # Logika auta u centrálového závodu:
        #
        # Blok pokrývá úseky S..E (1-indexed). Auto jede z centrály
        # a zastavuje na předávkách (konec úseku S, S+1, ..., E).
        #
        # OUTBOUND (jedou z centrály):
        #   - Běžci pro úseky S+1..E (vysazeni na předávkách)
        #   - Běžec pro úsek E+1 (vysazen na poslední předávce)
        #   - Výjimka: první blok, kde i běžec S musí jet
        #
        # RETURNING (vrací se do centrály):
        #   - Běžci pro úseky S..E (naloženi po doběhu)
        #   - Výjimka: pokud úsek končí v centrále, běžec se vrací sám
        # ----------------------------------------

        start = 0
        car_turn = 0
        for block_idx, k in enumerate(best_k_list):
            end = start + k

            first_seg_id = start + 1   # 1-indexed
            last_seg_id = end          # 1-indexed

            # Zjistíme, zda první/poslední úsek bloku je u centrály
            first_starts_at_central = first_seg_id in central_start_set
            last_ends_at_central = last_seg_id in central_end_set

            # --- OUTBOUND: kdo jede z centrály v autě ---
            outbound = set()

            # Běžci pro úseky S+1 .. E (všichni kromě prvního v bloku)
            for s in range(start + 1, end):
                if runner_for_seg[s] != -1:
                    outbound.add(runner_for_seg[s])

            # Běžec pro úsek E+1 (první úsek dalšího bloku, vysazen na poslední předávce)
            if end < N and runner_for_seg[end] != -1:
                next_seg_id = end + 1  # 1-indexed
                # Pokud E+1 začíná v centrále, běžec tam už je a nemusí jet autem
                if next_seg_id not in central_start_set:
                    outbound.add(runner_for_seg[end])

            # Výjimka: první blok, úsek 1 nezačíná v centrále → běžec musí jet na start
            if block_idx == 0 and not first_starts_at_central:
                if runner_for_seg[start] != -1:
                    outbound.add(runner_for_seg[start])

            # --- RETURNING: kdo se vrací do centrály ---
            returning = set()

            # Běžci pro úseky S..E (naloženi po doběhu na předávkách)
            for s in range(start, end):
                if runner_for_seg[s] != -1:
                    seg_id = s + 1  # 1-indexed
                    # Pokud úsek končí v centrále, běžec tam doběhne sám
                    if seg_id not in central_end_set:
                        returning.add(runner_for_seg[s])

            blocks.append({
                "car_num": (car_turn % car_count) + 1,
                "start_seg": start + 1,
                "end_seg": end,
                "outbound": list(outbound),
                "returning": list(returning),
                "first_starts_at_central": first_starts_at_central,
                "last_ends_at_central": last_ends_at_central
            })

            start = end
            car_turn += 1

    return blocks
