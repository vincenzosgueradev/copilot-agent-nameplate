# Feature Specification: Processo di rilascio — changelog, versione e pubblicazione

**Feature Branch**: `007-release-process`

**Created**: 2026-10-18 *(specifica retroattiva: costruita il 2026-10-17)*

**Status**: Implemented — regola in **Constitution 1.2.0 (Release Changelog)** e **1.3.0 (Testing Standard, per i cancelli)**; skill `/custom-changelog` e `/custom-publish`

**Input**: Richieste dell'utente: *"nuova regola della constitution: per ogni release crei un changelog così mi aiuta a capire cosa sale su ogni versione"*; *"la versione voglio la decidi tu in base al changelog; farei una skill per pubblicare su npm con le regole?"*; *"sii propositivo su quando chiamare un comando: se il codice l'abbiamo stravolto, quando fare commit e publish"*.

**Riguarda**: il tool pubblicato su npm (`@vincenzosgueradev/pptb-copilot-nameplate`) e il modo di rilasciarlo.

---

## Il problema

Una versione pubblicata su npm **non si riusa e non si annulla davvero**. Lo script `publish-package` alzava sempre la patch (`npm version patch`) ignorando ciò che era cambiato, e nulla diceva all'utente che cosa portava ciascuna versione. Mancava anche un criterio per decidere *quando* conviene rilasciare.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Un changelog per ogni versione (Priority: P1)

`CHANGELOG.md` alla radice ha una sezione per ogni versione (`## [x.y.z] - AAAA-MM-GG`), con **Added / Changed / Fixed / Removed / Security** e, se serve, **Upgrade notes**, scritte per chi installa il tool: che cosa cambia *per lui* e perché, e per un fix il **sintomo** visto.

**Independent Test**: la voce della versione più alta esiste, ha data e contenuto, e il suo numero coincide con `tools/package.json` al momento della pubblicazione.

**Acceptance Scenarios**:

1. **Given** una release, **When** si prepara la pubblicazione, **Then** la voce esiste nel commit che precede `npm publish`.
2. **Given** un cambio di comportamento che contraddice una versione precedente, **Then** compare sotto **Changed** anche se è un fix.
3. **Given** una release che chiede qualcosa all'utente (rifare un export, un'opzione cambiata), **Then** ha **Upgrade notes**.

---

### User Story 2 — Una bozza del changelog dai commit (Priority: P1)

`/custom-changelog` (manuale) legge l'ultima voce, decide a quale versione si riferisce, raccoglie i commit da allora, li raggruppa nelle sezioni e scrive in linguaggio per l'utente, mostra la bozza e la inserisce dopo conferma.

**Acceptance Scenarios**:

1. **Given** `package.json` più alto dell'ultima voce, **Then** scrive una sezione nuova per quella versione.
2. **Given** `package.json` uguale all'ultima voce (già pubblicata), **Then** scrive una sezione nuova e **decide il numero** (PATCH per soli fix, MINOR per una funzione nuova visibile, MAJOR se rompe dati salvati o il contratto), con il motivo in una riga.
3. **Given** `package.json` più basso dell'ultima voce (voce scritta in anticipo), **Then** **aggiorna quella voce** senza duplicare le righe.
4. **Given** nessun cambio visibile all'utente nell'intervallo, **Then** non scrive niente e lo dice.

---

### User Story 3 — Pubblicare con le regole (Priority: P1)

`/custom-publish` (solo manuale, mai lanciata dall'assistente) pubblica **la versione della voce più alta del changelog**, mai un incremento automatico, dopo aver controllato tutto, e **chiede una conferma esplicita** prima di `npm publish`.

**Acceptance Scenarios**:

1. **Given** albero non pulito, changelog mancante o senza data, versione già su npm, salto di versione anomalo, branch diverso da `main` o non allineato, **Then** si ferma e lo spiega.
2. **Given** i controlli, **Then** esegue `tsc`, `npm test`, `npm run test:full`, `npm run test:mutation`, `npm run validate` e gli smoke; **qualunque fallimento o mutazione sopravvissuta** è un blocco.
3. **Given** i controlli passati, **Then** imposta la versione con `npm version <V> --no-git-tag-version`, compila, mostra il riepilogo con `npm pack --dry-run` e chiede conferma.
4. **Given** una richiesta di autenticazione a due fattori, **Then** non cerca scorciatoie: dà il comando da eseguire nel terminale dell'utente.
5. **Given** una pubblicazione riuscita, **Then** **non** committa né fa push: indica il commit del bump e il push come passi successivi.

---

### User Story 4 — L'assistente propone quando committare e rilasciare (Priority: P2)

A ogni blocco concluso e verificato l'assistente lancia `/custom-commit`; dopo ogni commit conta i commit visibili all'utente non ancora rilasciati e **propone** un rilascio con versione e motivo, secondo una tabella: bug con risultati sbagliati → PATCH subito; funzione nuova completa → MINOR; cambio che tocca dati salvati o formato → MAJOR (con avviso); 3–5 fix piccoli o fine di una fase → PATCH; solo documentazione o chore → nessun rilascio. Se il codice è stato stravolto: prima `/custom-types` e `/custom-dedup`. **Publish e push li lancia sempre l'utente.**

---

### Edge Cases

- `npm run publish-package` resta nello `package.json` ma **non si usa**: alza sempre la patch ignorando il changelog.
- Le `version` dentro `pptb.config.json` sono versioni di schema, non quella del tool.
- Una voce di changelog per una versione non ancora pubblicata si può aggiornare; **mai** quelle già pubblicate.
- Nessun tag git nel repository: l'intervallo dei commit si ricava dal commit che ha introdotto l'ultima intestazione (`git log -S`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** *(Constitution — Release Changelog 1)*: Ogni release DEVE avere la sua voce in `CHANGELOG.md` **prima** della pubblicazione, nel commit che precede `npm publish`, con il numero che la pubblicazione produce.
- **FR-002** *(RC 2)*: Le modifiche DEVONO essere raggruppate in Added/Changed/Fixed/Removed/Security; **Upgrade notes** se la release chiede qualcosa all'utente.
- **FR-003** *(RC 3)*: Le voci DEVONO essere scritte per chi installa il tool; un fix dice il sintomo.
- **FR-004** *(RC 4)*: Un cambio che contraddice una versione precedente DEVE stare sotto **Changed** anche se è un fix.
- **FR-005** *(RC 5)*: La versione dell'ultima voce DEVE coincidere con `version` di `tools/package.json` alla pubblicazione.
- **FR-006**: `/custom-changelog` DEVE decidere il numero secondo SemVer (PATCH/MINOR/MAJOR) e motivarlo; DEVE gestire i tre casi `package.json` maggiore/uguale/minore dell'ultima voce; NON DEVE committare, taggare, alzare `package.json` né pubblicare; NON DEVE toccare voci già pubblicate.
- **FR-007**: `/custom-publish` DEVE pubblicare la versione del changelog e MAI usare `npm run publish-package`; DEVE fermarsi in tutti i casi di FR-009; DEVE chiedere conferma esplicita; NON DEVE aggirare l'autenticazione a due fattori né usare `--force`, `--tag` o `npm unpublish`.
- **FR-008**: `/custom-publish` NON DEVE essere invocata dall'assistente: è solo manuale.
- **FR-009**: Controlli di `/custom-publish`: changelog con voce datata e piena; albero pulito; versione maggiore di quella su npm e non oltre un passo senza conferma; `main` allineato; `tsc`; `npm test`, `test:full`, `test:mutation`; `npm run validate`; smoke; contenuto del pacchetto (`npm pack --dry-run`: solo `dist` e lo shrinkwrap).
- **FR-010**: L'assistente DEVE essere propositivo secondo la tabella della User Story 4, descritta in `CLAUDE.md`, e non DEVE mai eseguire publish né push.

### Key Entities

- **Voce del changelog** — sezione di una versione: data, sezioni per tipo, Upgrade notes.
- **Intervallo della release** — i commit dal commit che ha introdotto l'ultima intestazione.

## Success Criteria *(mandatory)*

- **SC-001**: Per ogni versione pubblicata esiste una voce con data e contenuto, e il numero coincide con quello pubblicato.
- **SC-002**: Nessuna pubblicazione parte con un controllo fallito o una mutazione sopravvissuta.
- **SC-003**: L'utente può rispondere "che cosa porta la 1.1.0?" leggendo una sola pagina.
- **SC-004**: L'assistente non lancia mai `/custom-publish` né `git push`.

## Assumptions

- Il pacchetto è `@vincenzosgueradev/pptb-copilot-nameplate`; npm può richiedere un codice a due fattori.
- Il repository ha due remote (Azure DevOps e GitHub): il push li raggiunge entrambi, lo decide l'utente.
- Come il pacchetto arrivi al marketplace PPTB non è descritto dalla documentazione del progetto; non è oggetto di questa funzione.
