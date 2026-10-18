# Implementation Plan: pin delle solution

**Spec**: [spec.md](spec.md) · **Stato**: da implementare

## Approccio

Un piccolo servizio `pins.ts` legge e scrive l'insieme dei pin nello store `settings` locale di PPTB (lo stesso dello storico). Una funzione pura `pinFirst(list, pinned)` riordina l'elenco già ordinato: partizione stabile in fissate / non fissate, così l'ordinamento scelto vale dentro ciascun gruppo. `visibleSolutions()` la applica dopo `compareSolutions`; la tabella disegna la cella pin.

## File (previsti)

```text
tools/src/services/pins.ts       # readPins(env), setPinned(env, uniqueName, on): lettura/scrittura serializzata
tools/src/types.ts               # PinMap = Record<ambiente, string[]>
tools/src/app.ts                 # state.pins, pinFirst() in visibleSolutions(), cella pin, handler che non apre la riga
tools/src/icons.ts + styles.css  # icona 'pin' (maschera, currentColor), stati: fissata / hover / focus / touch
tools/test/pins.test.ts          # servizio: lettura, scrittura, errori, ambienti separati, orfani
tools/test/ui.pins.test.ts       # matrice ordinamento x direzione x tab x ricerca; click; tastiera; persistenza
tools/scripts/mutation-check.mjs # mutazioni della 012
```

## Decisioni

| # | Decisione | Perché |
|---|---|---|
| D1 | Il pin è identificato da `uniqueName` | Stabile tra rinomine del nome visibile; `solutionId` cambia tra ambienti (FR-006) |
| D2 | Chiave d'ambiente = nome della connessione attiva (`state.connectionName`) | È già la chiave usata per l'ambiente di origine del package; nessun dato nuovo da chiedere |
| D3 | Partizione stabile *dopo* l'ordinamento | Una sola regola, nessuna modifica a `compareSolutions` (FR-002, FR-003) |
| D4 | Preferenza in `settings`, non in `localStorage` | Come lo storico: dello strumento e non del pannello; `localStorage` resta per il log (FR-006) |
| D5 | Scritture serializzate in coda, come lo storico | Più copie dello strumento aperte insieme non si sovrascrivono a metà |
| D6 | Rendering sul posto, nessuna rilettura da Dataverse | FR-009: il pin è solo stato locale |
| D7 | Nessun pin sulla riga "Agents without a solution" | Non è una solution: non ha `uniqueName` |
| D8 | I pin orfani non si cancellano da soli | Un fallimento nella lettura della lista non deve far perdere i pin (FR-007) |

## Rischi

- **L'aspetto reale del controllo** (hover, touch, tema) non è coperto dai test: resta nel quickstart.
- **Il nome della connessione come chiave** cambia se l'utente rinomina la connessione in PPTB: i pin non si perdono ma non si ritrovano. Accettato; se pesa, passare all'URL dell'ambiente.
- **Più copie dello strumento**: sullo stesso ambiente vince l'ultima scrittura; la coda serializza solo la sequenza lettura-modifica-scrittura (D5).

## Constitution Check

Testing Standard (matrice, test negativi, mutazioni, jsdom), UI senza emoji e senza ridondanze (nessuna intestazione del gruppo), nessuna scrittura su Dataverse né nel package.
