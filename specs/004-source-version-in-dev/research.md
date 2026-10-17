# Research: La versione si alza in DEV

**Feature**: `004-source-version-in-dev` | **Date**: 2026-10-18

> La versione estesa dell'analisi sta in [001 research §16](../001-agent-rename-manager/research.md). Qui le decisioni e ciò che è emerso dopo.

## §1 — Che cosa fa Microsoft

| Fonte | Che cosa dice |
|---|---|
| [Upgrade or update a solution](https://learn.microsoft.com/power-apps/maker/data-platform/update-solutions) | *"Increment the version number when you export the solution as managed"* nell'ambiente di sviluppo; un update deve avere una versione più alta del parent |
| [Export a solution](https://learn.microsoft.com/power-automate/export-flow-solution) | Il pannello di export propone la versione già incrementata e permette di cambiarla |
| [Build Tools — Set Solution Version](https://learn.microsoft.com/power-platform/alm/devops-build-tool-tasks#solution-tasks) | Imposta la versione **nella solution dell'ambiente**, poi si esporta |
| `pac solution online-version` | Scrive la versione della solution nell'ambiente connesso |
| ALM Accelerator `UseSolutionVersionFromDataverse` | La versione esportata resta la stessa in tutti gli ambienti e finisce nel source control |
| [Pipelines](https://learn.microsoft.com/power-platform/alm/pipelines) | Upgrade come comportamento predefinito; ritoccare `solution.xml` è un espediente da amministratore |

Il principio: **una sola fonte di verità**, la solution sorgente.

## §2 — Update, Upgrade, Stage for upgrade

Da [Upgrade or update a solution](https://learn.microsoft.com/power-apps/maker/data-platform/update-solutions):

- **Upgrade** (predefinito): elimina i componenti della versione precedente che non sono nella nuova.
- **Stage for upgrade**: porta alla versione più alta ma rinvia l'eliminazione fino a *Apply solution upgrade*.
- **Update**: sostituisce la solution; i componenti che non sono nella nuova **non vengono eliminati**.

*"You can't delete components with an update"* ([Solution concepts](https://learn.microsoft.com/power-platform/alm/solution-concepts-alm)). Un import alla **stessa versione** non può essere un upgrade: l'errore dell'utente. Nel caso reale: 5 agent in DEV → 3, ancora 5 in UAT.

## §3 — Decisione: scrivere in DEV, con consenso implicito nella revisione

**Decision**: il tool scrive `version` della solution unmanaged in DEV (FR-004), per default, con la proposta modificabile. Il pulsante che avvia il packaging, dopo una revisione che dice esplicitamente "written to the solution in DEV before the export", è la conferma. Non c'è un dialogo aggiuntivo: l'utente aveva chiesto un comportamento automatico "come fa il portale".

**Alternatives considered**:

- *Solo avviso, nessuna scrittura* — scartata: lascia a un passo manuale proprio l'errore che si voleva evitare.
- *Bump nello zip, ma partendo dall'ultima versione prodotta (storico)* — scartata: non risolve il divario con DEV e può collidere con un incremento fatto a mano.
- *Pubblicare con `PublishAllXml` prima dell'export* — discussa e **non** implementata: pubblica tutto in DEV, non solo questa solution, e per soli agent probabilmente non cambia l'export (la pubblicazione degli agent è `PvaPublish`). Resta una possibile funzione futura.

## §4 — Per evitare la doppia alzata

`versionFrom` si fissa all'inizio dell'operazione e non scivola dopo l'export (altrimenti indietro-avanti proporrebbe `1.0.0.4`). La scrittura è **idempotente**: se DEV ha già la versione richiesta non si riscrive. Si riparte da zero solo dopo il salvataggio o cambiando solution.

## §5 — Problemi trovati dalla suite durante il lavoro

- L'**elenco degli artefatti** nel passo del suffisso mostrava `…_1_0_0_2_…` mentre il file sarebbe uscito `…_1_0_0_3_…`: corretto, ora usa la versione che il package avrà.
- Un'asserzione mia errata su "la scrittura non ha effetto" — l'app era corretta ("reads 1.0.0.2 after writing 1.0.0.3. The export was not started").

## §6 — Verificato e non verificato

- ✅ **2026-10-18, DEV reale**: `dataverseAPI.update('solution', id, { version })` è accettato; il package esce con la versione nuova.
- ⚠️ Non verificato: il comportamento con un utente senza il privilegio di modificare la solution (il test lo copre con un errore simulato; il messaggio reale dipende da Dataverse).
- ⚠️ Non verificato: due utenti che alzano la versione nello stesso momento (la rilettura e il controllo "DEV già più alto" lo coprono in teoria).
