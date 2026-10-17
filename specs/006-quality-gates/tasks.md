---

description: "Task list — cancelli di qualità (retroattivo: completato)"
---

# Tasks: Cancelli di qualità

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md)

## Phase 1 — Infrastruttura (US1, US6)

- [x] T001 Vitest, jsdom, cross-env come dipendenze di sviluppo; `vitest.config.ts`; script `test`, `test:full`, `test:watch` — `d0e694d`
- [x] T002 `test/setup.ts`: `DOMParser` di xmldom; poi `Uint8Array` allineato e `dataverseAPI` segnaposto — `d0e694d`, `76e611d`
- [x] T003 `helpers/fixture.ts`: package sintetici con la struttura vera — `d0e694d`
- [x] T004 `helpers/combinatorics.ts`: cartesiano, tutte le coppie (greedy con seme), rng, sottoinsiemi — `d0e694d`
- [x] T005 `helpers/oracle.ts`: le regole della spec — `d0e694d`
- [x] T006 `tsconfig.json` include `test/`; `@types/node` per gli helper — `76e611d`

## Phase 2 — Matrici sul motore (US1)

- [x] T007 `engine.plan.test.ts`: cartesiano a 1–2 agent, coppie + campioni a 3–4 — `d0e694d`
- [x] T008 `engine.pipeline.test.ts`: pipeline vera, entry per entry, rilettura, idempotenza — `d0e694d`; poi con DEV finto e versione
- [x] T009 `outcomes.test.ts`, `package.format.test.ts` — `d0e694d`
- [x] T010 Modalità veloce/esaustiva (`helpers/mode.ts`) — `d0e694d`

## Phase 3 — Verificatori (US2)

- [x] T011 `verify.test.ts`: zip che devono essere respinti — `d0e694d`, `490291d`
- [x] T012 `version.test.ts`: formato, confronto, proposta, `versionProblem` (matrice), `raiseSolutionVersion` con tutti gli errori

## Phase 4 — La schermata (US3)

- [x] T013 `helpers/ui-harness.ts`: vera `index.html` + app in jsdom; FS e PPTB finti — `76e611d`
- [x] T014 `ui.matrix.test.ts`: percorsi casuali contro un modello, fino al salvataggio — `76e611d`
- [x] T015 `ui.scenarios.test.ts`: scenari per regola — `76e611d` e successivi
- [x] T016 `helpers/fake-dev.ts`: DEV finto con registro degli eventi — con la spec 004
- [x] T017 `helpers/source.ts`: lettura dei sorgenti dal disco (CSS) — `be7eb8c`

## Phase 5 — Mutazione (US4)

- [x] T018 `scripts/mutation-check.mjs` con ripristino dalla memoria — `d0e694d`
- [x] T019 Mutazioni del piano, del formato, della verifica — `d0e694d`, `490291d`
- [x] T020 Mutazioni della schermata — `76e611d`, `8f8995c`, `be7eb8c`, `b9cff42`, `328b3bd`
- [x] T021 Mutazioni della versione in DEV — con la spec 004

## Phase 6 — Governo (US5)

- [x] T022 Constitution 1.3.0 — *Testing Standard*
- [x] T023 CLAUDE.md: "Test: niente è finito senza" e "Specifiche per ogni funzione"
- [x] T024 `/custom-publish` esegue `npm test`, `test:full`, `test:mutation` e si ferma al primo fallimento; `/custom-ampush` esegue `npm test`

## Tracciabilità: requisito → artefatto

| Requisito | Dove |
|---|---|
| FR-001 matrici | `engine.plan`, `engine.pipeline`, `outcomes`, `package.format`, `version`, `ui.matrix` |
| FR-002 oracolo | `test/helpers/oracle.ts` |
| FR-003 codice vero | `engine.pipeline` (mock solo di `export` e Dataverse), `ui-harness` |
| FR-004 negativi | `verify`, `version`, `package.format` ("errori di formato") |
| FR-005 mutazione | `scripts/mutation-check.mjs` |
| FR-006 test prima | prassi, in CLAUDE.md |
| FR-007 fixture | `helpers/fixture.ts`, `.gitignore` per gli artifact set |
| FR-008 cancelli | Constitution 1.3.0, `/custom-publish`, `/custom-ampush` |
| FR-009 non coperto | quickstart di ogni specifica |
| FR-010 modalità | `package.json` |
| FR-011 tracciabilità | `tasks.md` di ogni specifica |

## Follow-up

- Verificare periodicamente che l'elenco delle mutazioni cresca con le funzioni nuove.
- Un test di schermata con un browser vero, se l'interfaccia continua a crescere (research §3).
