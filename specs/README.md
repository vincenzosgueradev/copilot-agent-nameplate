# Specifiche

Ogni funzione ha la sua cartella `NNN-nome/` con `spec.md`, `plan.md`, `research.md`, `data-model.md`,
`quickstart.md`, `tasks.md`, `checklists/requirements.md` e, dove serve, `contracts/`.
Ogni `tasks.md` ha una **tabella di tracciabilità** requisito → codice → test, e ogni `quickstart.md`
dice che cosa i test **non** coprono e come controllarlo a mano.

| # | Funzione | Stato | Rilascio | Sostituisce / estende |
|---|---|---|---|---|
| [001](001-agent-rename-manager/spec.md) | Agent Rename Manager — packaging di una solution con i nomi giusti per ambiente | Implementata | 1.0.0 | — |
| [002](002-solution-wide-rename/spec.md) | Rename a livello di solution: più agent, un solo suffisso, esclusioni, rete di sicurezza | Implementata | 1.1.0 | sostituisce 001 FR-023, completa FR-076 |
| [003](003-per-agent-publish-on-import/spec.md) | Publish on import per agent, con "per tutti" e verifica dei valori scritti | Implementata | 1.1.0 | estende 001 FR-090 |
| [004](004-source-version-in-dev/spec.md) | La versione si alza in DEV (come il portale), non nello zip | Implementata, **verificata su un DEV reale** | 1.1.0 | sostituisce 001 FR-073; eccezione FR-067a |
| [005](005-flow-and-layout-refinements/spec.md) | Perfezionamenti di flusso e layout: tabelle, anteprima per agent, scorrimento, fasi | Implementata | 1.1.0 | estende 001 FR-044, FR-075 |
| [006](006-quality-gates/spec.md) | Cancelli di qualità: matrici di test, test della schermata, controllo per mutazione | Implementata | (sviluppo) | Constitution 1.3.0 |
| [007](007-release-process/spec.md) | Processo di rilascio: changelog, versione, pubblicazione | Implementata (manca il primo publish vero) | (processo) | Constitution 1.2.0 |
| [008](008-agent-icon-and-description/spec.md) | Icona dell'agent nelle liste | **Implementata** (resta da provare la lettura reale via Web API, T002) | — | estende 002 |
| [009](009-agent-architectures/spec.md) | Due architetture di agent: baseline per architettura (standard e GitHub Copilot harness) | **Implementata** | — | estende 001 (FR-097) |

## Come leggere le specifiche successive

- La **001** resta la specifica madre; contiene anche i requisiti nati dopo (con la data), perché sono stati aggiunti
  mentre si lavorava. Le specifiche **002–005** sono la casa autorevole di quei requisiti, con numerazione propria
  (`FR-001…`) e, per ciascuno, l'**origine** nella 001.
- Le specifiche **002–007** sono state scritte **a lavoro concluso** (retroattive): i requisiti sono ricavati dal
  comportamento verificato, e ogni file lo dichiara.
- Le specifiche **006** e **007** non cambiano il prodotto: cambiano come lo si verifica e lo si rilascia.

## Mappa dei requisiti della 001 spostati

| 001 | Dove sta ora |
|---|---|
| FR-023, FR-023a/b/c, FR-076, FR-096/096a | **002** |
| FR-090a | **003** |
| FR-067a, FR-073, FR-073a/b/c | **004** |
| FR-075, FR-075a | **005** |

## Regola

Una funzione nuova nasce con la sua cartella (vedi `CLAUDE.md` — "Specifiche per ogni funzione"). Se è stata
costruita prima, si documenta subito dopo.
