# Tasks: colonna Agent type

**Prima di tutto**: risposte alle domande aperte di spec.md.

- [ ] T001 Provare la lettura di `bot.template` via Web API su un DEV vero (come T002 della 008); annotare il valore per i due tipi
- [ ] T002 Test prima del codice: matrice di `agentKindOf` (`cliagent-1.0.0`, `default-2.1.0`, versioni nuove, maiuscole, spazi, vuoto, assente, `weird`, numero) → `tools/test/agentCards.test.ts`
- [ ] T003 `types.ts`: `AgentCard.kind`; `agentCards.ts`: `agentKindOf`, `template` nella query
- [ ] T004 Icona `github-copilot` (maschera, `currentColor`) in `icons.ts` e `styles.css`
- [ ] T005 `app.ts`: colonna **Agent type** subito dopo **Agent**; cella a dimensione fissa; etichetta e `title`; riempimento sul posto
- [ ] T006 Scenari: tre tipi con tre icone; sconosciuto neutro; lettura fallita; nessuna query in piu'; riaprire non rilegge; nessuna traccia in package, manifest, storico → `tools/test/ui.cards.test.ts`
- [ ] T007 Harness: `UiAgent.template`, il DEV finto lo restituisce
- [ ] T008 Mutazioni (010): prefisso ignorato, sconosciuto trattato come standard, tipo derivato dal nome, `template` non letto, etichetta mancante
- [ ] T009 `npm test`, `tsc`, build; poi `test:full` e `test:mutation`
- [ ] T010 Changelog (*Added*), `specs/README.md`, tabella di tracciabilità
- [ ] T011 *(solo se US3 è confermata)* stessa colonna nel passo del suffisso

## Tracciabilità *(da completare a fine lavoro)*

| Requisito | Codice | Test |
|---|---|---|
| FR-001 colonna dopo Agent | `app.ts` | T006 |
| FR-002 tipo da `template` | `agentCards.ts` `agentKindOf` | T002 |
| FR-003 mai da nome/prefisso | `agentCards.ts` | T002, T008 |
| FR-004 icona, etichetta, tema | `icons.ts`, `styles.css`, `app.ts` | T006 |
| FR-005 stessa query | `agentCards.ts` | T006 |
| FR-006 lettura fallita | `agentCards.ts`, `app.ts` | T006 |
| FR-007 nessuna traccia | — | T006 |
| FR-008 righe stabili | `app.ts`, `styles.css` | T006 |
