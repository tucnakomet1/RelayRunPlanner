# 🏃‍♂️ RelayRunPlanner

**RelayRunPlanner** je webová aplikace v Pythonu (Flask) určená pro kompletní správu, matematickou optimalizaci a logistické plánování štafetových závodů (např. *Vltava Run*, *250 km Českým rájem*).

Aplikace řeší dva hlavní problémy štafetových týmů:
1. **Spravedlivé rozdělení úseků** mezi běžce pomocí celočíselného lineárního programování (ILP).
2. **Logistiku a přejezdy aut** – podporuje jak klasickou lineární rotaci, tak pokročilý model **Dynamického kyvadla** pro závody s centrální základnou.

---

## 🚀 Klíčové vlastnosti

- **Matematická optimalizace (ILP):** Algoritmické rozřazení běžců na úseky na základě jejich preferencí, délky úseků a převýšení s garantovaným minimálním odpočinkem (gap restriction).
- **Detekce nočních úseků:** Automatický výpočet západu a východu slunce pro danou lokalitu (využití knihovny `astral`), který přesně označí úseky běžící se za tmy a čelovky.
- **Plánování logistiky aut:**
  - *Lineární trasa (např. Vltava Run):* Fixní rotace posádek v bloku po $X$ úsecích.
  - *Dynamické kyvadlo (např. 250ČR):* Optimalizace pro závody s centrální základnou. Auta se vrací pro odpočinek dříve a kříží své trasy, čímž maximalizují čas na spánek posádky.
- **Interaktivní UI:** Kompletní webové rozhraní s podporou tmavého/světlého režimu.

---

## 🛠️ Architektura logistiky (Ukázka)

### 1. Lineární trasa (Vltava Run)
Při lineárním závodě se auta točí v pevných blocích. Jakmile jedno auto odjede své úseky, posádka odpočívá a auto se přesouvá na start dalšího velkého bloku.


```

[Auto 1: Úseky 1-4] ──> [Auto 2: Úseky 5-8] ──> [Auto 3: Úseky 9-12]
│                                               │
└────────────────── < ──────────────────────────┘
(Přesun na Úseky 13-16)

```

### 2. Dynamické kyvadlo (Závody s centrálou jako 250 km Českým rájem)
Díky možnosti vracet se na základnu systém počítá s překrýváním. Auto 1 vysadí posádku na trať, a jakmile běžec B předá běžci C, Auto 1 naloží volné lidi (A, B) a ihned odjíždí odpočívat na základnu. Štafetu na trati (předávku z C na D) pak přebírá čerstvé Auto 2 vyslané z centrály.


```
┌───────── Auto 1 (Vezou A, B, C) ────────> [ Start A ]
│ <──────── Auto 1 (A, B zpět) ─────────── [předávka B ──> C]
[ ZÁKLADNA ] ───┤
│ ───────── Auto 2 (Veze D) ──────────────> [předávka C ──> D]
└─ ─ ─ ─ ─  Auto 2 pokračuje s C a D  ─ ─ > ...
```

---

## 📦 Instalace a spuštění (přes SSH)

Pro naklonování repozitáře a spuštění projektu na lokálním počítači nebo serveru postupujte podle následujících kroků.

### 1. Klonování repozitáře přes SSH
Uistěte se, že máte na svém GitHub účtu přidaný SSH klíč.

```bash
git clone git@github.com:tucnakomet1/RelayRunPlanner.git
cd RelayRunPlanner

```

### 2. Vytvoření virtuálního prostředí a instalace závislostí

```bash
# Vytvoření venv
python3 -m venv venv

# Aktivace venv (Linux/macOS)
source venv/bin/activate

# Aktivace venv (Windows)
# .\\venv\\Scripts\\activate

# Instalace potřebných balíčků
pip install -r requirements.txt

```

*Poznámka: Projekt vyžaduje knihovny `Flask`, `pulp`, `astral` a další.*

### 3. Spuštění aplikace

```bash
python3 app.py

```

Aplikace poběží lokálně na adrese: `http://127.0.0.1:5000/`

---

## 📄 Licence

Tento projekt je licencován pod [MIT](LICENSE) licencí.

### 1. Krátký popisek repozitáře (Repository Description na GitHubu)
> Webová aplikace pro matematickou optimalizaci (ILP) rozpisu štafetových běžců a pokročilé plánování logistiky aut (lineární trasy i dynamické kyvadlo s centrální základnou).

---

### 2. Postup pro nahrání přes SSH
Pokud chcete lokální projekt poprvé nahrát do nového repozitáře přes SSH, spusťte v kořenovém adresáři projektu tyto příkazy:

```bash
# Inicializace gitu (pokud ještě není)
git init

# Přidání souborů
git add .
git commit -m "Initial commit: kompletní aplikace včetně optimalizace a logistiky"

# Nastavení vzdáleného repozitáře přes SSH
git branch -M main
git remote add origin git@github.com:tucnakomet1/RelayRunPlanner.git

# Odeslání na GitHub
git push -u origin main


---

### 3. Obsah vygenerovaného `README.md`

Soubor, který se vygeneroval do vašeho pracovního prostředí, obsahuje strukturovaný přehled funkcí. Pokud budete chtít do README vložit reálné screenshoty přímo z běžící aplikace, stačí v kořenovém adresáři vytvořit složku `img/`, uložit do ní obrázky (např. `dashboard.png` a `logistika.png`) a do souboru vložit následující markdown odkazy:

## 📸 Ukázky z aplikace

![Hlavní nástěnka a nastavení závodu](img/dashboard.png)
![Grafické schéma logistiky a směn](img/logistika.png)

