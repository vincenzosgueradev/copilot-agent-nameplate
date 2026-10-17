---

description: "Task list — icona e descrizione dell'agent"
---

# Tasks: Icona e descrizione dell'agent

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md)

**Tests**: richiesti (Constitution 1.3.0 — Testing Standard): matrice, test negativi, percorsi della schermata, mutazioni.

**Format**: `[ID] [P?] [Story] Descrizione` — `[P]` = parallelizzabile.

## Phase 0 — Prima di tutto

- [x] T001 [US2] **Dove sta la descrizione** — verificato il 2026-10-18 su un export reale: `botcomponent.description` del componente `<schema>.gpt.default` (research §2)
- [ ] T002 [US1] Provare la lettura via Web API: `bot.iconbase64` e `botcomponent.description` (FetchXML con `in` sugli id) su un agent reale; annotare forma e dimensione della risposta in research §3

## Phase 1 — Servizio e validazione (US1, US2, US3)

- [x] T003 [P] [US1] Test: `isValidIcon` — matrice: buona, vuota, spazi, a capo, prefisso `data:`, non PNG (JPEG/GIF/SVG/testo), base64 con caratteri fuori alfabeto, troncata, al limite (136.533), oltre il limite → `tools/test/agentCards.test.ts`
- [x] T004 [P] [US2] Test: `normalizeDescription` — null/vuota/spazi, a capo e tabulazioni, HTML, emoji, 2000 e oltre → `tools/test/agentCards.test.ts`
- [x] T005 [US1] `tools/src/types.ts`: `AgentCard`
- [x] T006 [US1] `tools/src/services/agentCards.ts`: `isValidIcon`, `normalizeDescription`
- [x] T007 [US3] `loadAgentCards(agentIds)`: una query FetchXML con `in` sugli id, `$select` esplicito (FR-009), errori → avviso nel log e carta vuota
- [x] T008 [US3] Cache per sessione con chiave `agentId + modifiedOn`

## Phase 2 — Schermata (US1, US2, US3, US4)

- [x] T009 [US1] Harness: `UiAgent { icon?, description? }`; il DEV finto risponde alla lettura delle carte e conta le letture → `tools/test/helpers/ui-harness.ts`, `fake-dev.ts`
- [x] T010 [US1] `agentIconHtml(card, size)` e cella dell'agent in `tools/src/app.ts`; stili `.agent-cell`, `.agent-icon` (dimensione fissa) in `styles.css`
- [x] T011 [US3] Disegnare la lista subito, leggere dopo e riempire sul posto senza spostare le righe; non leggere per altre solution
- [x] T012 [US2] Descrizione sotto il nome (una riga, troncata, `title` col testo intero; "No description" attenuato)
- [x] T013 [US2] La seconda query: `botcomponent` per genitore; si tiene lato client il componente `<schema>.gpt.default` (nessun filtro su `componenttype`)
- [x] T014 [US2] Test: la scelta del componente GPT (più componenti per agent, nessun GPT, schemaname diverso, description vuota o assente)
- [x] T015 [US4] Icona piccola nella revisione e nei chip della ricerca
- [x] T016 [US1] Il passo del suffisso riusa la stessa cella

## Phase 3 — Verifica (Testing Standard)

- [x] T017 [US1] Scenari: tre agent (icona valida / senza / non valida) → `<img>` solo per la valida, con quel dato
- [x] T018 [US2] Scenari: descrizione breve / lunga con HTML / assente → solo testo, troncata, "No description"
- [x] T019 [US3] Scenari: lettura solo per la solution aperta; riaprire non rilegge; agent modificato rilegge; lettura fallita → liste usabili e avviso
- [x] T020 [US4] Scenari: stessa icona in vista, suffisso, revisione, chip; nessuna immagine in anteprima, manifest, storico
- [x] T021 Mutazioni: validazione senza firma PNG; `<img>` con valore non validato; descrizione come HTML; lettura di tutto l'ambiente; cache ignorata → aggiungerle a `scripts/mutation-check.mjs` e lanciarle
- [x] T022 `npm test` (199 verdi), `tsc`, build: fatti; `test:full` e la `test:mutation` completa prima del rilascio

## Phase 4 — Rifiniture

- [x] T023 Voce del changelog (sezione *Added*)
- [x] T024 Riga in `specs/README.md`; tabella di tracciabilità qui sotto completata con gli hash

## Tracciabilità: requisito → codice → test *(da completare a fine lavoro)*

| Requisito | Codice | Test |
|---|---|---|
| FR-001 icona nelle liste | `app.ts` `agentIconHtml` | `ui.cards.test.ts` «icone», «le stesse carte» |
| FR-002 validità | `agentCards.ts` `isValidIcon` | `agentCards.test.ts` «isValidIcon — matrice» |
| FR-003 `<img>` costruito dal tool | `app.ts` | `ui.cards.test.ts` «un'icona che prova a uscire…», mutazioni (008) |
| FR-004 descrizione come testo | `app.ts`, `agentCards.ts` | `agentCards.test.ts`, `ui.cards.test.ts` «descrizioni» |
| FR-005 solo la solution aperta, dopo la lista | `app.ts`, `agentCards.ts` | `ui.cards.test.ts` «quando si legge», «lettura fallita» |
| FR-006 cache | `agentCards.ts` | `agentCards.test.ts` «riaprire non rilegge», `ui.cards.test.ts` |
| FR-007 revisione e chip | `app.ts` | `ui.cards.test.ts` «le stesse carte in tutte le liste» |
| FR-008 nessuna traccia nel package | — | `ui.cards.test.ts` «niente nel package» |
| FR-009 `$select` esplicito | `agentCards.ts` | `agentCards.test.ts` «una lettura per tabella» |
| FR-010 sorgente della descrizione | `agentCards.ts` | `agentCards.test.ts` «sceglie il componente GPT» |

## Dipendenze

- T002 va fatto prima di T007/T013 (la forma della risposta); il resto può partire subito.
- T003 e T004 sono scritti **prima** del codice (Testing Standard 6), e devono fallire.

## Follow-up (fuori ambito)

- Leggere anche il YAML `data` del componente GPT nel controllo delle occorrenze del nome (research §5): riguarda la spec 002.
