# Feature Specification: Colonna "Agent type" con l'icona dell'architettura

**Feature Branch**: `010-agent-type-column`

**Created**: 2026-10-18

**Status**: **Specificata, non implementata** (in attesa delle risposte alle domande aperte)

**Input**: Richiesta dell'utente (2026-10-18): *"nuova specifica: voglio una colonna nuova con tipo agente in cui metti l'icona"*, con l'icona del **GitHub Copilot** (SVG fornita) per gli agent harness e *"l'icona Copilot ce l'hai già"* per gli agent standard (indicata nello screenshot: il logo dell'intestazione dell'app, `src/public/logo.svg`). Nello screenshot, la vista della solution `testAgentTool` con cinque agent: tre classici e due GitHub Copilot harness.

## Il problema

In una solution con agent di due architetture (classico e GitHub Copilot harness) la lista mostra solo nome e icona personale dell'agent: non si capisce quale è quale se non guardando in Copilot Studio. Il tipo conta: i due tipi hanno componenti, impostazioni e controlli diversi (spec 009), e un harness non ha né GPT né topic.

## User Stories

### US1 — Riconoscere il tipo a colpo d'occhio (P1)
Nella vista della solution c'è una colonna **Agent type** con l'icona del tipo: l'icona del GitHub Copilot per gli agent harness, l'icona Copilot dell'app per quelli classici. Il nome del tipo è nel suggerimento (`title`) e nell'etichetta accessibile.

**Independent Test**: una solution con un agent classico, uno harness e uno di tipo mai visto → tre icone diverse (la terza neutra), ciascuna con il suo suggerimento.

### US2 — Nessuna supposizione (P1)
Un agent il cui tipo non si riconosce NON è dichiarato "classico": mostra un'icona neutra e il suggerimento "Unknown agent type".

### US3 — Lo stesso tipo dove si decide (P2, *da confermare*)
La tabella del passo del suffisso mostra la stessa colonna.

## Requisiti

- **FR-001**: La vista della solution DEVE avere una colonna **Agent type**, subito dopo la colonna **Agent**, con l'icona del tipo.
- **FR-002**: Il tipo DEVE derivare dalla colonna `template` della tabella `bot` (documentata: *Agent (bot) table*): `cliagent-…` → GitHub Copilot harness; `default-…` → standard. Qualsiasi altro valore, o valore assente, è **sconosciuto**.
- **FR-003**: Il tipo NON DEVE derivare dal nome, dal prefisso dello schema o dalla presenza di altre colonne (valori non documentati: regola del progetto).
- **FR-004**: Ogni icona DEVE avere dimensione fissa e un'etichetta accessibile col nome del tipo; l'icona GitHub Copilot DEVE seguire il colore del testo e il tema (stessa tecnica delle altre icone: maschera CSS e `currentColor`); NON si usano emoji.
- **FR-005**: La colonna DEVE comparire insieme alle altre: il tipo si legge **nella stessa query** già usata per l'icona dell'agent (008), aggiungendo `template`; nessuna lettura in più, solo per la solution aperta, con la stessa cache.
- **FR-006**: Se la lettura fallisce, la colonna mostra l'icona neutra e il log un avviso, senza bloccare la lista (come 008, FR-005).
- **FR-007**: Il tipo NON DEVE comparire nel package, nel manifest o nello storico, e NON si scrive nulla su Dataverse.
- **FR-008**: La colonna NON DEVE spostare le righe: la cella ha larghezza e altezza fisse e si riempie sul posto dopo la lettura.
- **FR-009** *(solo se US3 è confermata)*: Gli stessi tipo e icona compaiono nel passo del suffisso.

## Criteri di successo

- **SC-001**: Per ogni valore di `template` (`cliagent-1.0.0`, `default-2.1.0`, `cliagent-9.9.9`, `default-9.9`, vuoto, assente, `weird`, con maiuscole/spazi) il tipo è quello previsto dall'oracolo.
- **SC-002**: Le tre icone sono distinguibili e ogni cella ha etichetta e suggerimento.
- **SC-003**: Nessuna query in più rispetto alla 008; riaprire la solution non rilegge.
- **SC-004**: *Manuale*: sulla solution `testAgentTool` gli agent 1-3 hanno l'icona classica, 4-5 quella GitHub Copilot.

## Domande aperte

1. **Passo del suffisso** (US3): la colonna anche lì, o solo nella vista della solution?
2. **Icona dello standard**: va bene il logo dell'app (`logo.svg`, a colori) o preferisci l'icona ufficiale di Copilot Studio (da fornire)?
3. **Prefisso a parte**: `template` ha un solo valore osservato per tipo (`default-2.1.0`, `cliagent-1.0.0`). Il confronto per prefisso (`default-`, `cliagent-`) regge a nuove versioni, ma altri tipi di agent (per esempio quelli del Copilot chat harness) hanno altri valori: finiscono in "sconosciuto" finché non li misuriamo. Va bene?

## Fuori ambito

- Cambiare il comportamento del rename per tipo (non serve: spec 009).
- Filtrare o ordinare per tipo.
- Mostrare il tipo nella revisione, nell'anteprima o nei chip della ricerca.
