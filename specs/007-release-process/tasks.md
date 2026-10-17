---

description: "Task list — processo di rilascio (retroattivo)"
---

# Tasks: Processo di rilascio

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md)

## Phase 1 — Changelog e regola (US1)

- [x] T001 `CHANGELOG.md` con 1.0.0 (ricostruita da git e spec) e la voce in avanti — `cfa64a2`
- [x] T002 Constitution 1.2.0: sezione *Release Changelog* — `cfa64a2`
- [x] T003 Correggere la regola 5: le `version` di `pptb.config.json` sono versioni di schema — `cfa64a2`

## Phase 2 — Skill (US2, US3)

- [x] T004 `/custom-changelog`: bozza dai commit, tre casi, versione decisa, conferma, scrittura — `957ceef`
- [x] T005 `/custom-changelog`: caso "voce scritta in anticipo" e numero scelto dalla skill — `957ceef` e successivi
- [x] T006 `/custom-publish`: versione dal changelog, mai `publish-package`, controlli, conferma, 2FA senza aggirarla — `957ceef`
- [x] T007 `/custom-publish`: controlli di test (`npm test`, `test:full`, `test:mutation`) — con la spec 006

## Phase 3 — Comportamento dell'assistente (US4)

- [x] T008 `CLAUDE.md`: skill "solo su via libera" e "solo manuali"; tabella delle situazioni — `957ceef`
- [x] T009 `CLAUDE.md`: "Essere propositivi su commit e rilasci" con la tabella di versione e momento — `957ceef`
- [x] T010 `CLAUDE.md`: "Test: niente è finito senza" e "Specifiche per ogni funzione" — con la spec 006

## Phase 4 — Uso reale

- [x] T011 Voce 1.1.0 con versione scelta dal contenuto (MINOR perché c'è una funzione nuova) — `b8aff7a`
- [ ] T012 Primo `/custom-publish` end-to-end *(non ancora eseguito)*

## Tracciabilità: requisito → artefatto

| Requisito | Dove |
|---|---|
| FR-001…FR-005 | Constitution 1.2.0 (Release Changelog); `CHANGELOG.md` |
| FR-006 | `.claude/skills/custom-changelog/SKILL.md` |
| FR-007…FR-009 | `.claude/skills/custom-publish/SKILL.md` |
| FR-008, FR-010 | `CLAUDE.md` ("Solo manuali, mai da te"; "Essere propositivi") |

## Follow-up

- T012: provare la pubblicazione vera.
- Valutare un tag git per release, per semplificare la ricerca dell'intervallo (research §4).
