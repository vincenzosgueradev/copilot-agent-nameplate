# Research: Cancelli di qualità

**Feature**: `006-quality-gates` | **Date**: 2026-10-18

## §1 — Perché non basta "i test passano"

Il 2026-10-17 la suite era uno smoke script su un export reale più prove manuali. Le segnalazioni dell'utente in poche ore — nomi misti, publish mostrato male, versione divergente tra DEV e artefatto — erano tutte difetti che un test pensato per trovarli avrebbe visto. **Decision**: lavorare sul *modo* di testare, non solo sul numero di test (Constitution — Testing Standard).

## §2 — Difetti scoperti dalla suite (non segnalati dall'utente)

| Difetto | Scoperto da | Corretto in |
|---|---|---|
| Due agent con lo stesso nome → falso "posto sconosciuto" | matrice di pipeline | spec 002 §4 |
| `verifyZip` controllava solo i nomi (publish e versione non rilette) | revisione di `verifyZip` mentre si scrivevano i test negativi | spec 003 §5 |
| Una entry con byte in coda contata come identica | mutazione sopravvissuta | spec 003 §5 |
| Impronta del formato dipendeva dall'ordine dei file (un solo `configuration.json`) | smoke su dati reali + matrice | spec 002 §3 |
| Elenco degli artefatti con la versione vecchia | scenario sui nomi degli archivi | spec 004 §5 |
| Commento di `AgentListItem` finito sopra un'altra interfaccia; regex con escape perso in uno script | lettura del diff | commit `fc87be1` |

Più, nel verso opposto, **tre aspettative sbagliate dei test** corrette senza toccare il codice: l'idempotenza con suffisso vuoto (spec 002 §6), l'ordine per nome vs per schema (002 §7), un'asserzione su "la scrittura non ha effetto" (004 §5). Distinguere un difetto del codice da uno del test è parte del lavoro.

## §3 — Strumenti

| Strumento | Perché | Dove |
|---|---|---|
| **Vitest** | Gira su Vite 8, TypeScript senza configurazione, ambienti per file | `vitest.config.ts` |
| **jsdom** | Il DOM per la vera `index.html`; `DOMParser` per il parsing XML | `test/*.test.ts` con `// @vitest-environment jsdom` |
| **`@xmldom/xmldom`** | `DOMParser` per i test in Node (già usato dagli smoke script) | `test/setup.ts` |
| **cross-env** | `TEST_FULL=1` anche su Windows | `package.json` |
| **`@types/node`** | `node:fs` negli helper che leggono il CSS | `tsconfig.json` |

Alternativa scartata per la schermata: un browser headless (Playwright). Pro: layout reale. Contro: dipendenza pesante, avvio lento, fragilità. Si è scelto jsdom + test strutturali, dichiarando il limite (nessun pixel) nel quickstart di ogni funzione.

## §4 — Strategia combinatoria

- **Cartesiano completo** fino a ~10⁶: piano per 1 e 2 agent (746.496 casi per due), pipeline per 1 agent in `test:full`.
- **Tutte le coppie** (greedy con seme) oltre: per ogni coppia di parametri e di valori esiste almeno una riga che li combina; la maggior parte dei difetti dipende da una o due variabili. Più campioni casuali con seme fisso (riproducibili).
- **Percorsi casuali con modello** per la schermata: l'azione sceglie tra suffisso, preset, Clear, spunta, publish, "per tutti", opzione versione, valore versione; dopo ciascuna si confronta DOM e modello.

## §5 — L'oracolo

`test/helpers/oracle.ts` è scritto dalla spec: `expectedName`, `expectedNameState`, `effectiveMode`, `expectedPublish`, `distinctSuffixes`. Per le versioni, un confronto per **segmenti riempiti a larghezza fissa** (diverso dall'implementazione, che confronta numeri). Se oracolo e codice sbagliassero allo stesso modo il test non se ne accorgerebbe: per questo ogni regola dell'oracolo cita il requisito.

## §6 — Il controllo per mutazione

`scripts/mutation-check.mjs`: elenco di `[etichetta, file, da, a, perché]`; per ciascuno scrive il file modificato, lancia `vitest run --bail 1`, ripristina **dal contenuto in memoria** (mai git: le modifiche non committate non vanno perse), registra scoperto/sopravvissuto. Le ancore possono essere stringhe o espressioni regolari (utile con i fine riga CRLF di `app.ts`).

**Regole apprese**: mentre gira non si tocca `src/`; un'ancora non trovata è un errore, non un successo; una mutazione sopravvissuta è un test mancante (è così che è emerso il difetto dei byte in coda).

## §7 — Test in ambiente jsdom: trappole

- `fflate` controlla `instanceof Uint8Array`: in jsdom il globale e quello di `TextEncoder` sono di realm diversi e i file vengono scambiati per cartelle (chiavi con `/` finale). Lo setup porta il test nelle condizioni del browser vero.
- `new URL(..., import.meta.url)` è riscritto da Vite come risorsa: i test leggono i file con `process.cwd()`.
- Vitest svuota i `.css`, anche `?raw`.
- jsdom non fa layout: lo scorrimento si simula sostituendo `scrollTop`.
- I timer sono finti (`vi.useFakeTimers`) per le pause dell'interfaccia; si avanzano a mano.

## §8 — Non coperto (manuale)

Pixel e aspetto reale (spec 005 quickstart); comportamento di Dataverse all'import (spec 003 P5); privilegi reali sulla solution (spec 004 §6).
