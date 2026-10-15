# Quickstart Validation Guide: Agent Rename Manager

**Branch**: `001-agent-rename-manager` | **Date**: 2026-10-14

Questo documento descrive gli scenari di validazione end-to-end da eseguire manualmente nel PPTB sandbox per verificare che il tool funzioni correttamente.

---

## Prerequisiti

1. PPTB installato e connesso a un environment Power Platform con:
   - Almeno una solution non-managed con 2-3 agent Copilot Studio
   - Un utente con ruolo System Customizer o superiore
2. Il tool `agent-rename-manager` caricato in PPTB (cartella `tools/agent-rename-manager/`)
3. (Opzionale) Secondo environment (es. UAT) con la stessa solution in versione managed per test managed solution

---

## Scenario V1 — Setup env variable e configurazione suffisso

**Obiettivo**: Verificare che il tool guidi correttamente la creazione della env variable in una solution che non ce l'ha.

**Steps**:
1. Aprire il tool in PPTB, connesso all'environment DEV
2. Nel Solution Explorer, selezionare una solution **senza** `{prefix}_AgentDisplaySuffix`
3. Verificare che appaia il warning con spiegazione e pulsante "Crea variabile ambiente"
4. Cliccare "Crea variabile ambiente" e seguire il wizard
5. Verificare che la env variable venga creata nella solution con valore iniziale vuoto
6. Selezionare il suffisso `(DEV)` dal selettore
7. Verificare che il warning scompaia e che il valore `(DEV)` sia visibile

**Expected outcome**:
- Warning presente inizialmente ✓
- Env variable `{prefix}_AgentDisplaySuffix` creata nella solution ✓
- Valore `(DEV)` salvato ✓
- Nessun warning residuo ✓

---

## Scenario V2 — Rename preview corretto

**Obiettivo**: Verificare che la preview mostri i nomi corretti e lo stato per ogni agent.

**Setup**: Solution con 3 agent — uno già rinominato `AgentA (DEV)`, due senza suffisso `AgentB` e `AgentC`. Env variable configurata su `(DEV)`.

**Steps**:
1. Aprire la solution nel tool
2. Cambiare il suffisso a `(UAT)` nel selettore
3. Aprire la sezione "Rename Preview"

**Expected outcome nella tabella preview**:
| Agent | Nome attuale | Nome finale | Stato |
|---|---|---|---|
| AgentA | `AgentA (DEV)` | `AgentA (UAT)` | suffix-changed |
| AgentB | `AgentB` | `AgentB (UAT)` | suffix-added |
| AgentC | `AgentC` | `AgentC (UAT)` | suffix-added |

- Stato inconsistente visibile senza warning bloccante ✓
- Nomi finali calcolati correttamente (strip DEV + append UAT) ✓

---

## Scenario V3 — Apply rename idempotente

**Obiettivo**: Verificare che il rename si applichi correttamente e che rieseguirlo non produca duplicati.

**Steps**:
1. Dalla preview V2, cliccare "Applica"
2. Verificare dialog di conferma con riepilogo operazioni
3. Confermare
4. Verificare progress in tempo reale per ogni agent
5. Verificare in Copilot Studio UI che i nomi siano aggiornati
6. Rieseguire il rename con stesso suffisso `(UAT)`
7. Verificare che nessun agent mostri `AgentA (UAT) (UAT)`

**Expected outcome**:
- Dialog conferma con lista operazioni ✓
- Progress per agent: `bot.name` aggiornato ✓, `applicationmanifestinformation` aggiornato ✓
- Nomi visibili in Copilot Studio UI immediatamente ✓
- Secondo apply: nomi invariati, nessun duplicato ✓ (idempotenza)

---

## Scenario V4 — Backup e rollback su errore

**Obiettivo**: Verificare che il backup venga creato e che il rollback funzioni.

**Steps**:
1. Prima di applicare il rename, verificare che il backup venga creato (visibile nel log)
2. Simulare errore di rete al terzo agent (disconnettere/riconnettere durante apply)
3. Verificare la UI mostra quali agent sono stati rinominati e quali no
4. Scegliere "Rollback tutto"
5. Verificare che tutti gli agent tornino ai nomi originali

**Expected outcome**:
- Backup visibile nel log prima dell'operazione ✓
- Stato parziale chiaro in UI ✓
- Rollback ripristina tutti i nomi al backup ✓
- Log registra sia le operazioni parziali che il rollback ✓

---

## Scenario V5 — Avviso Publish e Publish su agent Teams

**Obiettivo**: Verificare che il banner "Publish required" appaia per agent con Teams attivo.

**Setup**: Agent con canale Teams configurato.

**Steps**:
1. Dopo apply rename, verificare presenza banner `⚠️ Publish required` per agent con Teams
2. Verificare assenza banner per agent senza Teams
3. Cliccare "Publish ora" per un singolo agent
4. Verificare stato in tempo reale (in corso → completato)
5. Verificare in Teams che il nome sia aggiornato

**Expected outcome**:
- Banner present per agent con Teams ✓
- Nessun banner per agent senza Teams (`✅ Nessun Publish necessario`) ✓
- Publish in tempo reale con stato visibile ✓
- Nome aggiornato in Teams dopo publish ✓

---

## Scenario V6 — Log e export

**Obiettivo**: Verificare che tutte le operazioni siano tracciate e esportabili.

**Steps**:
1. Dopo aver completato scenario V3, aprire il Log Panel
2. Verificare presenza entry per ogni campo modificato (bot.name, manifest, env variable)
3. Cliccare "Esporta CSV"
4. Aprire il CSV e verificare struttura: timestamp, utente, environment, solution, agent, campo, valore prima, valore dopo, esito

**Expected outcome**:
- Log completo con entry per ogni operazione ✓
- Export CSV con tutti i campi ✓
- Nessuna operazione mancante ✓

---

## Scenario V7 — Agent con nome + suffisso che supera 30 char (limite manifest Teams)

**Obiettivo**: Verificare il warning preventivo in preview.

**Setup**: Agent con nome base `Very Long Customer Support Agent Name` (38 char) + suffisso `(UAT)` (5 char) = 44 char > 30.

**Expected outcome**:
- Warning in preview: `⚠️ "Very Long Customer Support Agent Name (UAT)" (44 char) supera il limite di 30 caratteri per il manifest Teams` ✓
- Campo `proposedManifestNameShort` troncato a 30 char automaticamente con indicazione in UI ✓
- Operazione non bloccata — l'utente può scegliere di procedere con troncatura ✓

---

## Scenario V8 — Managed solution (UAT/PROD)

**Obiettivo**: Verificare che il rename funzioni su solution managed.

**Setup**: Environment UAT con stessa solution in versione managed, agent con nome DEV.

**Steps**:
1. Connettere PPTB all'environment UAT
2. Selezionare la solution managed
3. Applicare rename con suffisso `(UAT)`

**Expected outcome**:
- PATCH su `bot.name` in managed solution → successo (Dataverse crea layer unmanaged) ✓
- In caso di errore 403: messaggio specifico con indicazione di contattare l'admin ✓

---

## Scenario V9 — headless preview via MCP

**Obiettivo**: Verificare l'interfaccia headless con un agent AI.

**Steps**:
1. Da un agent MCP connesso a PPTB, invocare `agent-rename-manager` con:
   ```json
   { "operation": "preview", "solutionUniqueName": "MySolution", "newSuffix": "(UAT)" }
   ```
2. Verificare che la risposta contenga la lista agent con proposedName corretti

**Expected outcome**:
- Response JSON con `status: "ok"` e array `agents` ✓
- Nessuna modifica apportata (headless è read-only) ✓

---

## Riferimenti

- [data-model.md](data-model.md) — struttura entità runtime e persistenza
- [contracts/pptb-config.md](contracts/pptb-config.md) — configurazione tool PPTB
- [contracts/headless-api.md](contracts/headless-api.md) — interfaccia MCP invokeHeadless
- [research.md](research.md) — decisioni tecniche e pattern API
