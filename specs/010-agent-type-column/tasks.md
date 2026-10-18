# Tasks: colonna Agent type

**Decisioni prese** (spec.md): colonna anche nel passo del suffisso; logo dell'app per lo standard; tipi non misurati = sconosciuti.

- [x] T001 Lettura di `bot.template` via Web API provata su un DEV vero (2026-10-18, `GET /bots?$select=name,template`, 47 agent): standard = `default-2.1.0` (agenteTool1/2/3), GitHub Copilot harness = `cliagent-1.0.0` (agenteTool4/5). Nessun altro valore nell'ambiente. La schermata di `testAgentTool` mostra le tre icone standard e le due harness, coerenti con la query.
- [x] T002 Test prima del codice: matrice di `agentKindOf` (`cliagent-1.0.0`, `default-2.1.0`, versioni nuove, maiuscole, spazi, vuoto, assente, `weird`, numero) → `tools/test/agentCards.test.ts`
- [x] T003 `types.ts`: `AgentCard.kind`; `agentCards.ts`: `agentKindOf`, `template` nella query
- [x] T004 Icona `github-copilot` (maschera, `currentColor`) in `icons.ts` e `styles.css`
- [x] T005 `app.ts`: colonna **Agent type** subito dopo **Agent**; cella a dimensione fissa; etichetta e `title`; riempimento sul posto
- [x] T006 Scenari: tre tipi con tre icone; sconosciuto neutro; lettura fallita; nessuna query in piu'; riaprire non rilegge; nessuna traccia in package, manifest, storico → `tools/test/ui.cards.test.ts`
- [x] T007 Harness: `UiAgent.template`, il DEV finto lo restituisce
- [x] T008 Mutazioni (010): prefisso ignorato, sconosciuto trattato come standard, tipo derivato dal nome, `template` non letto, etichetta mancante
- [x] T009 `npm test` (240 verdi), `tsc`, build: fatti; `test:full` e la `test:mutation` completa prima del rilascio
- [x] T010 Changelog (*Added*), `specs/README.md`, tabella di tracciabilità
- [x] T011 Stessa colonna nel passo del suffisso (US3 confermata)

## Tracciabilità *(da completare a fine lavoro)*

| Requisito | Codice | Test |
|---|---|---|
| FR-001 colonna dopo Agent | `app.ts` | `ui.cards.test.ts` «la colonna sta subito dopo Agent» |
| FR-002 tipo da `template` | `agentCards.ts` `agentKindOf` | `agentCards.test.ts` «agentKindOf — matrice» |
| FR-003 mai da nome/prefisso | `agentCards.ts` | «il tipo non dipende da altro che dal template», mutazioni (010) |
| FR-004 icona, etichetta, tema | `icons.ts`, `styles.css`, `app.ts` | `ui.cards.test.ts` «quattro celle, tre icone diverse» |
| FR-005 stessa query | `agentCards.ts` | «nessuna lettura in più», «la query chiede la colonna template» |
| FR-006 lettura fallita | `agentCards.ts`, `app.ts` | «lettura fallita: tutti sconosciuti» |
| FR-007 nessuna traccia | — | «il tipo non esce dalla schermata» |
| FR-008 righe stabili | `app.ts`, `styles.css` | «le righe sono le stesse prima e dopo la lettura» |
| FR-009 colonna nel suffisso | `app.ts` | «colonna Agent type nel passo del suffisso» |
