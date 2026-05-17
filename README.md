<p align="center">
  <a href="#Cíl">Cíl</a> •
  <a href="#Hlavní-funkce">Hlavní funkce</a> •
  <a href="#Instalace">Instalace</a> •
  <a href="#Použití">Použití</a> •
  <a href="#Jak-to-funguje">Jak to funguje</a> •
  <a href="#Licence">Licence</a> •
  <a href="#Galerie">Galerie</a> •
</p>

# <img src="img/icon/RelayRunPlanner_150.png" alt="RelayRunPlanner logo" width="30" align="center"> RelayRunPlanner

<img align="left" src="img/icon/RelayRunPlanner_150.png" alt="RelayRunPlanner logo" width="100" style="margin-right: 20px;">

**RelayRunPlanner** je webová aplikace v Pythonu (Flask) navržená pro správu, matematickou optimalizaci a logistické plánování dlouhých štafetových závodů (např. *Vltava Run*, *JizeRun*, *250 km Českým rájem* a další). 

Díky optimalizačním algoritmům odstraňuje hodiny ručního a neefektivního plánování v tabulkových procesorech a nahrazuje je optimálním řešením na jedno kliknutí.

## Cíl

Aplikace byla vytvpřena k plánování štafetového závodu s 5 až 12 běžci na 15+ úsecích s využitím 1+ doprovodných vozidel. Běžně je to je extrémně složitý logistický a kombinatorický problém. Organizátor týmu typicky čelí následujícím výzvám:
1. **Spravedlivé rozdělení zátěže:** Každý běžec by měl uběhnout podobnou celkovou vzdálenost a nastoupat srovnatelné výškové metry s ohledem na své individuální preference a výkonnost.
2. **Dodržení odpočinku:** Mezi jednotlivými běhy stejného běžce musí být garantována dostatečně dlouhá pauza na regeneraci a spánek.
3. **Logistická omezení aut:** Běžci sedící ve stejném autě se musí střídat tak, aby auto mohlo přejet na další předávku a posádka měla čas na přesun a odpočinek.
4. **Vliv terénu a predikce:** Jednoduchý přepočet podle čistého běžeckého tempa na rovině selhává v kopcovitém terénu. Je nutné modelovat vliv převýšení na rychlost běhu.
5. **Noční bezpečnost:** Je kritické vědět, kteří běžci poběží za tmy, aby byli včas připraveni s čelovkami a reflexními prvky.

**RelayRunPlanner řeší všechny tyto aspekty najednou.** Vytváří spravedlivé rozpisy běžců, optimalizuje logistiku aut pro lineární i okruhové závody s centrální základnou a poskytuje real-time sledování závodu přímo na trati.

## Hlavní funkce

*   **Matematická optimalizace (ILP):** Algoritmické rozřazení běžců na úseky pomocí celočíselného lineárního programování.
*   **Dva logistické režimy:**
    *   *Lineární trasa (např. Vltava Run):* Fixní střídání posádek aut v souvislých blocích.
    *   *Trasa s centrálou (např. 250ČR):* Auta se vrací do centrálního kempu k odpočinku dříve a kříží své trasy.
*   **Dynamická predikce časů:** Výpočet očekávaného času na základě délky, stoupání a individuálního tempa z kontrolního běhu (koeficient: 100 m převýšení = 1 km roviny).
*   **Automatická detekce nočních úseků:** Výpočet přesného času východu a západu slunce pro dané datum a lokalitu (využití knihovny `astral`), který označí úseky vyžadující čelovku (s bezpečnostní tolerancí 30 minut).
*   **Real-time tracking na trati:** Možnost odškrtávat hotové úseky a zadávat reálné časy. Aplikace okamžitě přepočítá predikovaný čas doběhu pro všechny zbývající úseky v celém závodě.

## Instalace

Pro naklonování repozitáře a spuštění projektu na lokálním počítači nebo serveru postupujte podle následujících kroků.

```bash
# 1. Naklonujte repozitář
git clone https://github.com/tucnakomet1/RelayRunPlanner.git
cd RelayRunPlanner

# 2. Nainstalujte závislosti (flask, pulp, astral)
pip install -r requirements.txt

# 3. Spusťte Flask server
python3 app.py
```

Aplikace bude dostupná ve vašem webovém prohlížeči na adrese: [http://127.0.0.1:5000/](http://127.0.0.1:5000/).


## Použití

Používání aplikace je rozděleno do tří jednoduchých a přehledných kroků:

### Krok 1: Založení závodu

Na úvodní obrazovce zadejte základní parametry vašeho závodu:
*   **Název závodu** (např. *Vltava Run 2026* nebo *250 km Českým rájem*).
*   **Start závodu** – přesný datum a čas startu prvního běžce (tento údaj je kritický pro automatický výpočet nočních úseků podle zeměpisných souřadnic).
*   **Celkový počet úseků** (např. `36` pro Vltava Run, `24` pro 250ČR, `15` pro JizeRun).

Stisknutím tlačítka **"Pokračovat na nastavení týmu"** přejdete k podrobné konfiguraci (krok 2).

### Krok 2: Nahrání trasy a nastavení týmu

V tomto kroku definujete parametry tratě a výkonnost jednotlivých běžců.

#### A. Nahrání trasy (JSON)
Trať závodu se do systému nahrává jako JSON soubor. Pro usnadnění práce aplikace nabízí možnost **stáhnout si prázdnou JSON šablonu** vygenerovanou na míru vašemu počtu úseků. Tu stačí vyplnit a nahrát zpět. Zároveň se podle počtu úseků zobrazí i předvyplněná šablona pro Vltava run, JizeRun a 250 km Českým rájem (viz. [route](route/)).

> [!TIP]
> **Inteligentní detekce délky:** Pokud do pole `delka_km` zadáte hodnotu větší než 500 (např. `9300`), aplikace ji automaticky vyhodnotí jako metry a převede na kilometry (`9.3 km`). Pokud zadáte hodnotu menší než 500 (např. `9.3`), bere ji přímo jako kilometry.

**Příklad validního JSON souboru trasy:**
```json
[
  {
    "usek_id": 1,
    "nazev": "Kvilda - Borová Lada",
    "delka_km": 9300,
    "stoupani_m": 89,
    "klesani_m": 28,
    "obtiznost": 2
  },
  {
    "usek_id": 2,
    "nazev": "Borová Lada - Strážný",
    "delka_km": 12.2,
    "stoupani_m": 143,
    "klesani_m": 309,
    "obtiznost": 3
  }
]
```

#### B. Nastavení běžců a kontrolního tempa
Pro každého běžce zadejte jeho jméno, cílový počet úseků (které má celkem odběhnout) a výsledky z jeho **referenčního běhu** (vzdálenost v metrech, čas ve formátu `HH:MM:SS` nebo `MM:SS` a nastoupané výškové metry).

> [!NOTE]
> Z těchto dat aplikace vypočítá individuální **pace index** (referenční tempo běžce přepočtené na ekvivalentní rovinný kilometr). Tím se alespoň částečně eliminuje nespravedlnost v hodnocení, pokud někdo běžel test na dráze a někdo v náročném kopcovitém terénu.

Po vyplnění formuláře klikněte na **"Vygenerovat plán závodu"**.

### Krok 3: Dashboard, Smart optimalizace a Logistika

Po vytvoření závodu se zobrazí hlavní dashboard ([viz ukázky v Galerii](#galerie)), kde máte okamžitě k dispozici časovou osu, noční úseky a celkový harmonogram.

#### A. Sledování reálného průběhu (Live Tracking)
Během samotného závodu můžete u jednotlivých úseků zaškrtávat checkbox **"Hotovo"** a zapisovat reálné časy. Aplikace okamžitě adaptivně přepočítá předpokládané starty a doběhy všech následujících úseků, což týmu dává neocenitelný přehled o reálném zpoždění nebo náskoku.

#### B. Smart Generování s pravidly (ILP Optimalizace)
Pokud chcete rozdělit úseky matematicky nejoptimálnějším způsobem:
1.  Otevřete postranní panel **"Běžci"** a v horní nabídce vyberte <img src="static/img/line-segments-thin-svgrepo-com.svg" width="20" height="20" style="vertical-align: middle; background-color: grey; border-radius: 20%;"> a následně **"Pokročilé generování s pravidly"**.
2.  Zadejte **Minimální pauzu** (gap) mezi úseky běžce (např. pauza `3` znamená, že po odběhnutí úseku běžec 3 následující úseky povinně odpočívá než poběží další).
3.  Zadejte **Počet aut** v týmu a rozdělte běžce do konkrétních posádek (např. Auto 1 a Auto 2).
4.  Pokud plánujete závod s centrální základnou, zaškrtněte volbu **"Máme centrálu"**.
5.  Klikněte na **"Vygenerovat"**. Celočíselný lineární program během chvíle najde optimální rozpis respektující všechna omezení. Výsledný plán si můžete před uložením přehledně analyzovat v přehledových kartách.

#### C. Výpočet logistiky aut
Kliknutím na tlačítko **"Logistika"** v záhlaví spustíte logistický modul:
*   **Bez centrály (Lineární):** Rozdělí trať na souvislé bloky a střídá celá auta. Každá posádka přesně ví, kdy má službu na trati a kdy může přejet na spánek či jídlo.
*   **S centrálou:** Algoritmus dynamického programování najde optimální délky výjezdů z centrály (bloky po 2 až 4 úsecích) a určí posádky **Outbound** (kdo jede na start) a **Returning** (kdo se po doběhu vrací na základnu spát).

## Jak to funguje

### 1. Modelování terénu (Ekvivalentní vzdálenost)
Převýšení hraje v rychlosti běhu zásadní roli. Aplikace využívá mezinárodní model ekvivalentní vzdálenosti ($d_{eq}$), který převádí stoupání na fiktivní rovinné kilometry:

$$d_{eq} = d + \frac{e_{up}}{100}$$

*   $d$: reálná délka úseku v km
*   $e_{up}$: celkové stoupání v metrech

*Příklad:* Běh na 10 km s převýšením 200 metrů odpovídá náročnosti běhu na 12 km po rovině ($10 + 200/100 = 12$). Tento princip se používá jak pro výpočet výkonnosti běžce z jeho testu, tak pro predikci jeho času na konkrétním úseku.

### 2. Optimalizace rozdělení (ILP model)
Proces přiřazení je formulován jako matematická optimalizace celočíselného lineárního programování. Cílem je minimalizovat celkovou absolutní odchylku uběhnutých kilometrů a nastoupaných metrů každého běžce od spravedlivého průměru týmu:

$$\min \sum_{r \in R} \left( |D_r - \bar{D}_r| + 0.01 \times |E_r - \bar{E}_r| \right)$$

Za splnění těchto striktních podmínek:
1.  Každý úsek je obsazen právě jedním běžcem.
2.  Každý běžec běží přesně svůj cílový počet úseků.
3.  Mezi úseky jednoho běžce je dodržen minimální odstup (gap).
4.  Běžec smí běžet pouze úseky, které pokrývá jeho auto (v lineárním režimu).
5.  Úseky jednoho běžce jsou rovnoměrně rozmístěny po celé délce závodu (Spread constraint).


## Galerie

### Dashboard závodu
*Kompletní přehled úseků, predikované časy doběhu, noční úseky označené měsíčkem a real-time sledování.*
![Hlavní stránka závodu s předpokládanými časy a nočními úseky](img/main_window.png)

### Konfigurace ILP optimalizace
*Rozhraní pro nastavení parametrů optimalizačního solveru, volbu minimálního odpočinku a rozřazení běžců do jednotlivých vozidel.*
![ILP model ](img/ILP.png)

### Plánování logistiky aut a běžců
*Přehledné schéma přejezdů aut, rozdělení do logistických bloků a instrukce, kdo v jaký čas jede ze základny a kdo se vrací.*
![Logistika a rozpis běžců](img/logistics_runners.png)


## Licence

Tento projekt je licencován pod licencí [MIT](LICENSE). Podrobnosti naleznete v souboru [LICENSE](LICENSE).

---
*Podrobný popis matematické formulace a logistických algoritmů je k dispozici v PDF dokumentaci [docs/relayrun.pdf](docs/relayrun.pdf).*
