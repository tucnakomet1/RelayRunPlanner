# 🏃‍♂️ RelayRunPlanner

**RelayRunPlanner** je webová aplikace v Pythonu (Flask) určená pro kompletní správu, matematickou optimalizaci a logistické plánování štafetových závodů (např. *[Vltava Run](https://www.vltavarun.cz/)*, *[JizeRun](https://www.jizerun.cz/)*, *[250 km Českým rájem](https://250cr.cz/)*, apod.).

Aplikace řeší dva hlavní problémy štafetových týmů:
1. **Spravedlivé rozdělení úseků** mezi běžce pomocí celočíselného lineárního programování (ILP).
2. **Logistiku a přejezdy aut** – podporuje jak klasickou lineární rotaci, tak pokročilý model **Dynamického kyvadla** pro závody s centrální základnou.

## Klíčové vlastnosti

- **Interaktivní UI:** Kompletní webové rozhraní s podporou tmavého/světlého režimu.
  - nahrání úseků trasy pro závod ve formátu json
  - rozložení úseků běžců
  - úseky označené nočními úseky a čelovkami
  - předpokládaný čas na úsek na základě převýšení a délky úseku
  - předpokládaný čas doběhu
- **Matematická optimalizace (ILP):** Algoritmické rozřazení běžců na úseky na základě jejich preferencí, délky úseků a převýšení s garantovaným minimálním odpočinkem.
- **Detekce nočních úseků:** Automatický výpočet západu a východu slunce pro danou lokalitu (využití knihovny `astral`), který přesně označí úseky běžící se za tmy a čelovky.
- **Plánování logistiky aut:**
  - *Lineární trasa (např. Vltava Run):* Fixní rotace posádek v bloku po $X$ úsecích.
  - *Trasa s centrálou (např. 250ČR):* Optimalizace pro závody s centrální základnou. Auta se vrací pro odpočinek dříve a kříží své trasy, čímž maximalizují čas na spánek posádky.

*Poznámka:* Celá logika ILP a logistiky je podrobně popsaná v souboru [docs/relayrun.pdf](docs/relayrun.pdf).

## Struktura projektu

```
RelayRunPlanner/
├── app.py                  # Hlavní Flask aplikace (routy + API)
├── generator.py            # ILP optimalizace přiřazení úseků (PuLP)
├── logistics.py            # Plánování logistiky aut
├── requirements.txt        # Python závislosti
├── race.db                 # SQLite databáze závodů (generuje se automaticky)
│
├── templates/
│   └── index.html          # Jinja2 šablona (HTML + Jinja proměnné)
│
├── static/
│   ├── style.css           # Vstupní bod CSS (importuje ostatní moduly)
│   ├── theme.css           # CSS proměnné – světlý / tmavý režim
│   ├── base.css            # Základní layout (body, header, main, karty)
│   ├── forms.css           # Formulářové prvky a tlačítka
│   ├── components.css      # UI komponenty (modaly, sidebar, seznam závodů)
│   ├── segments.css        # Boxy jednotlivých úseků závodu
│   ├── responsive.css      # Media queries pro mobilní zařízení
│   ├── img/                # SVG ikony
│   └── js/
│       ├── common.js       # Sdílené funkce (motiv, mazání závodu)
│       ├── setup.js        # Krok 2 – přidávání běžců a formulář
│       ├── race.js         # Krok 3 – hlavní logika (přepočet časů, polling)
│       ├── sidebar.js      # Krok 3 – postranní panel běžců
│       ├── generator.js    # Krok 3 – generování úseků (náhodné + ILP)
│       └── logistics.js    # Krok 3 – logistika aut
│
├── docs/
│   ├── relayrun.tex        # LaTeX zdrojový kód dokumentace
│   └── relayrun.pdf        # Zkompilovaná dokumentace (ILP model + logistika)
│
├── route/                  # Příklady JSON souborů s trasami závodů
│   ├── plan_250cr_2026.json
│   ├── plan_jizerun_2026.json
│   └── plan_vlatavarun_2026.json
│
├── img/                    # Screenshoty z aplikace pro README
│   ├── main_window.png
│   ├── logistics_runners.png
│   └── ILP.png
│
└── README.md
```

## Instalace a spuštění

Pro naklonování repozitáře a spuštění projektu na lokálním počítači nebo serveru postupujte podle následujících kroků.

```bash
git clone https://github.com/tucnakomet1/RelayRunPlanner.git
cd RelayRunPlanner

# Instalace potřebných balíčků
pip install -r requirements.txt

# Spuštění aplikace
python3 app.py
```

Aplikace poběží lokálně na adrese: `http://127.0.0.1:5000/`

---

## 📄 Licence

Tento projekt je licencován pod [MIT](LICENSE) licencí.


## 📸 Ukázky z aplikace

![Hlavní stránka závodu s předpokládanými časy a nočními úseky](img/main_window.png)
![Logistika a rozpis běžců](img/logistics_runners.png)
![ILP model ](img/ILP.png)
