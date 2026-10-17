# Data Model: Cancelli di qualità

**Feature**: `006-quality-gates` | **Date**: 2026-10-18

## Comandi

| Comando | Cosa esegue | Tempo | Quando |
|---|---|---|---|
| `npm test` | Tutte le coppie di valori + campioni, 1–4 agent; pipeline; schermata; verifiche | ≈40 s | A ogni modifica al codice, e prima di ogni commit |
| `npm run test:full` | In più il prodotto cartesiano completo (746.496 piani a 2 agent) e campioni più numerosi | minuti | Prima di un rilascio |
| `npm run test:mutation [parola]` | Rompe il codice un difetto alla volta e verifica che la suite fallisca | decine di minuti (filtrabile) | Dopo aver cambiato logica; intero prima di un rilascio |
| `npm run test:watch` | Vitest in ascolto | — | Sviluppo |

## Dimensioni delle matrici

| Matrice | Dimensioni |
|---|---|
| Piano di patch | nome di partenza (6) × publish di partenza (3) × suffisso (6) × eccezione per agent (4) × default (3) × selezione (2ⁿ) × n agent (1–4) |
| Pipeline | + nome del componente GPT (2) × agent collegato (2) × **versione** (null / +1 / salto / uguale) |
| Formato | collegato (2) × GPT base/intero (2) × publish (3) per 1–3 agent: cartesiano |
| Versione | versione corrente (3) × candidata (valida e non valide) con confronto numerico |
| Esiti | 4 nomi × 4 suffissi × selezioni, per 1–3 agent |
| Schermata | percorsi casuali: 5 dimensioni di solution, 12 passi del modello, fino al salvataggio |

## L'oracolo (`helpers/oracle.ts`)

```ts
expectedName(name, suffix, selected)            // FR-004 spec 002
expectedNameState(name, suffix)                  // no-change | suffix-removed | suffix-changed | suffix-added
effectiveMode(perAgent, fallback)                // FR-001 spec 003
expectedPublish(initial, mode, selected)         // valore del file dopo la patch
distinctSuffixes(agents, suffix)                 // FR-003 spec 002
```

## Il DEV finto (`helpers/fake-dev.ts`)

```ts
interface FakeDev {
    solutions: { id, unique, version, managed? }[];
    writes: { id, unique, version }[];       // ogni versione scritta, in ordine
    events: string[];                         // 'write S1 1.0.0.3', 'export S1', …
    failWriteWith?: string;                   // permessi mancanti
    ignoreWrites?: boolean;                   // la scrittura non ha effetto
}
```

Risponde alle sole query che il tool usa (`solutions?$filter=uniquename eq '…'`, `solutions(<id>)?$select=version`) e alla scrittura su `solution`; ogni altra chiamata è un errore del test.

## L'elenco delle mutazioni (`scripts/mutation-check.mjs`)

Voce = `[etichetta, file, da (stringa o RegExp), a, perché]`. Gruppi: piano, formato/occorrenze, verifica, schermata, versione, layout. Il filtro per parola cerca nel file e nel "perché".

## Convenzioni

- I test della schermata iniziano con `// @vitest-environment jsdom`.
- Un'ancora di mutazione con fine riga: `app.ts` è CRLF, quindi si usano ancore su una sola riga o espressioni regolari con `\r?\n`.
- Seme fisso per ogni sorgente casuale: un fallimento si riproduce.
