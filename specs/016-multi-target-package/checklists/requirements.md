# Checklist: Targets

- [x] Decisioni D1–D6 prese con l'utente e riportate nella spec
- [x] Requisiti testabili (FR-001…FR-015) e senza dettagli di implementazione
- [x] Comportamento con un solo Target uguale a oggi, tranne il formato del manifest (FR-006, D6)
- [x] Un solo export e una sola versione, verificabili da test (FR-008, FR-009)
- [x] Confronto fra Target limitato a nomi e `publishOnImport`, con fallimento sulle differenze inattese (FR-013)
- [x] Matrice di test con oracolo scritto dalla spec e casi negativi (vedi `tasks.md`)
- [x] Contratto del manifest v2 scritto (`contracts/manifest-v2.md`)
- [x] Nessuna scrittura su Dataverse oltre alla versione; nessun import (FR-015)
- [x] Nessuna chiamata di rete in più; nessun dato personale: la lista sta nelle impostazioni locali
- [x] Rischi e cosa i test non coprono dichiarati (`plan.md`, `quickstart.md`)
- [x] Plan, research, data model, quickstart e tasks con tracciabilità presenti
- [x] P1 confermata (D7): l'eccezione di publish per agent è uguale per tutti i Target e prevale sul default del Target (`research.md` §6)
- [ ] Implementazione, mutazioni e prova a mano (T001–T023)
- [ ] Al rilascio: Upgrade notes sul manifest (T024)
