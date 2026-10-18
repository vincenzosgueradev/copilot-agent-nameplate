# Tasks: pin delle solution

- [ ] T001 Confermare su un DEV vero che `settings.get/set` conserva i pin tra riavvii e che il nome della connessione è una chiave stabile (D2)
- [x] T002 Test prima del codice: `pinFirst` (partizione stabile; vuoto; tutti fissati; pin orfani) e `pins.ts` (lettura, scrittura, ambienti separati, dati non validi, errore di lettura/scrittura, scritture concorrenti) → `tools/test/pins.test.ts`
- [x] T003 `types.ts`: `PinMap`; `services/pins.ts`: `readPins`, `setPinned`, coda serializzata
- [x] T004 Icona `pin` (maschera, `currentColor`) in `icons.ts` e `styles.css`; stati fissata / hover / focus / touch
- [x] T005 `app.ts`: `state.pins`, caricamento all'avvio, `pinFirst` in `visibleSolutions()`, cella pin con `aria-pressed` ed etichetta, `stopPropagation`, spostamento sul posto
- [x] T006 Scenari jsdom: 6 colonne x 2 direzioni con una fissata; due fissate con ordinamento interno; tab e ricerca; togliere il pin; tastiera; click che non apre la riga; zero pin identico a prima; pin orfano ignorato; persistenza dopo nuova inizializzazione; ambiente diverso → `tools/test/ui.pins.test.ts`
- [x] T007 Test negativi: il pin non cambia i conteggi, non entra in package/manifest/storico, un errore di `settings` non blocca la lista
- [x] T008 Mutazioni 012: pin ignorato dalla partizione, ordine del gruppo invertito, chiave d'ambiente ignorata, `stopPropagation` tolto, pin che cambia i conteggi, orfano che manda in errore
- [x] T009 `tsc`, build, `npm test` (295 verdi) e mutazioni 012 (13/13 scoperte); `test:full` e `test:mutation` interi restano per il rilascio
- [ ] T010 Changelog (*Added*), `specs/README.md` (stato), tabella di tracciabilità sotto
- [ ] T011 Quickstart a mano su un DEV vero

## Tracciabilità *(da completare a fine lavoro)*

| Requisito | Codice | Test |
|---|---|---|
| FR-001 controllo accessibile | `app.ts` | T006 tastiera, etichetta, `aria-pressed` |
| FR-002 fissate sempre prime | `app.ts` `pinFirst` | T006 matrice 6x2 |
| FR-003 ordine dentro i gruppi | `app.ts` | T006 due fissate |
| FR-004 indicatore senza emoji | `icons.ts`, `styles.css` | T006 + quickstart |
| FR-005 nessun effetto su filtri/conteggi | `app.ts` | T006, T007 |
| FR-006 persistenza per ambiente | `services/pins.ts` | T002, T006 |
| FR-007 pin orfani | `services/pins.ts`, `app.ts` | T002, T006 |
| FR-008 nessuna traccia | — | T007 |
| FR-009 spostamento sul posto | `app.ts` | T006 «nessuna rilettura» |
| FR-010 massimo 3 pin | `app.ts` (`pinsFull`), `services/pins.ts` (`MAX_PINS`) | `ui.pins.test.ts` «massimo tre fissate» |
| FR-011 fissate ancorate allo scroll | `app.ts` (`anchorPinnedRows`), `styles.css` (`.is-pinned`) | `ui.pins.test.ts` «classe che le ancora» (i pixel dello scroll: prova a mano) |
