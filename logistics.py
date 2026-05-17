import json

def calculate_logistics(runners, segments, car_count, has_central, central_segments=None):
    """
    Vypočítá optimální nebo pevné rozložení úseků do aut.
    
    central_segments: dict s klíči 'start' a 'end', každý je seznam segment IDs (1-indexed),
                      které začínají/končí v centrále. Např. {"start": [1, 36], "end": [35, 36]}
    """
    N = len(segments)
    
    # Zpracování central_segments – převedeme na sety pro rychlý lookup
    if central_segments is None:
        central_segments = {}
    central_start_set = set(central_segments.get('start', []))  # Úseky, které ZAČÍNAJÍ v centrále
    central_end_set = set(central_segments.get('end', []))      # Úseky, které KONČÍ v centrále
    
    # 1. Kdo běží jaký úsek
    # Vytvoříme pole: runner_for_segment[s] = runner_idx, kde s je 0..N-1
    runner_for_seg = [-1] * N
    for r_idx, r in enumerate(runners):
        for s_id in r.get('segments', []):
            # s_id je 1-indexed
            if 1 <= s_id <= N:
                runner_for_seg[s_id - 1] = r_idx

    blocks = []
    
    if not has_central:
        # BEZ CENTRÁLY: Pevné rozložení.
        # Spočítáme velikost bloku jako N / car_count
        # Např 36 / 3 = 12. Takže Auto 1 má 1-12. Auto 2 má 13-24.
        # Ale pozor, velikost bloku se může lišit, pokud N není dělitelné beze zbytku.
        # Obvykle se prostě auta střídají po X úsecích, ale uživatel zadal "12 lidí, 3 auta = 4 lidi na auto".
        # Takže auto jede celou dobu a lidi v něm se střídají.
        # Rozdělíme 36 úseků rovnoměrně mezi car_count aut.
        base_size = N // car_count
        rem = N % car_count
        
        start = 0
        for i in range(car_count):
            size = base_size + (1 if i < rem else 0)
            end = start + size
            
            # Kteří běžci v tomto autě reálně jsou?
            car_runners = set()
            for s in range(start, end):
                if runner_for_seg[s] != -1:
                    car_runners.add(runner_for_seg[s])
            
            blocks.append({
                "car_num": i + 1,
                "start_seg": start + 1,
                "end_seg": end,
                "outbound": list(car_runners),
                "returning": list(car_runners),
                "incoming": []
            })
            start = end
            
    else:
        # S CENTRÁLOU: Heuristické dělení na bloky 2, 3, 4
        # Prohledáme možné rozdělení N na 2, 3, 4.
        
        memo = {}
        def solve(idx):
            if idx == N:
                return 0, []
            if idx in memo:
                return memo[idx]
            
            best_cost = float('inf')
            best_path = None
            
            for k in [2, 3, 4]:
                if idx + k <= N:
                    cost_rest, path_rest = solve(idx + k)
                    
                    # Heuristická cena tohoto bloku:
                    # Chceme penalizovat velká auta (počet lidí * počet úseků)
                    # a zhruba držet průměr. Jelikož neumíme v lokálním DP 
                    # penalizovat přesně globální "krátké pauzy",
                    # penalizujeme střídání stejných lidí.
                    
                    # Lidé v tomto bloku
                    people = set()
                    for s in range(idx, idx + k):
                        if runner_for_seg[s] != -1:
                            people.add(runner_for_seg[s])
                    if idx > 0 and runner_for_seg[idx - 1] != -1:
                        people.add(runner_for_seg[idx - 1])
                        
                    # Mírně preferujeme bloky velikosti 3
                    cost_here = len(people) * k
                    if k == 3: cost_here -= 1 
                    
                    total_cost = cost_here + cost_rest
                    if total_cost < best_cost:
                        best_cost = total_cost
                        best_path = [k] + path_rest
                        
            memo[idx] = (best_cost, best_path)
            return memo[idx]
            
        _, best_k_list = solve(0)
        
        # Sestavíme bloky z best_k_list
        #
        # Jak funguje auto u centrálového závodu:
        # Blok pokrývá úseky S..E (1-indexed). Auto jede z centrály a zastavuje
        # na předávkách (konec úseku S, konec S+1, ..., konec E).
        #
        # Na každé předávce (konec úseku i):
        #   - Vysadí běžce pro úsek i+1 (ten začíná běžet)
        #   - Naloží běžce úseku i (ten právě doběhl)
        #
        # Proto:
        #   OUTBOUND (jedou z centrály): běžci S+1..E + běžec E+1 (vysazen na poslední předávce)
        #     - Běžec S NENÍ v autě – buď startuje z centrály (první blok), 
        #       nebo byl vysazen předchozím autem
        #     - Výjimka: první blok, úsek S nezačíná v centrále → i běžec S musí jet
        #   RETURNING (vrací se do centrály): běžci S..E (naloženi po doběhu)
        #     - Výjimka: běžec jehož úsek končí v centrále se vrací sám
        
        start = 0
        car_turn = 0
        for block_idx, k in enumerate(best_k_list):
            end = start + k
            
            first_seg_id = start + 1   # 1-indexed
            last_seg_id = end           # 1-indexed
            
            first_starts_at_central = first_seg_id in central_start_set
            last_ends_at_central = last_seg_id in central_end_set
            
            # --- OUTBOUND: kdo jede z centrály v autě ---
            outbound = set()
            
            # Běžci pro úseky S+1 .. E (všichni kromě prvního v bloku)
            for s in range(start + 1, end):  # 0-indexed
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
            for s in range(start, end):  # 0-indexed
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
