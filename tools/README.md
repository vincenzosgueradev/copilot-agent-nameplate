# Copilot Agent Nameplate

**Rename Copilot Studio agents per environment — without an unmanaged layer.**

Produce il package di una solution con i display name degli agent Copilot Studio già corretti
per l'ambiente di destinazione: l'agent arriva in UAT o PROD **già con la targhetta giusta**,
invece di essere rinominato una volta lì. È la differenza fra un package pulito e un unmanaged
layer che si porta dietro per sempre.

## Il problema

Quando una solution con un agent Copilot Studio arriva in UAT o PROD, l'agent si chiama come in
DEV. Rinominarlo nell'ambiente di destinazione **crea un unmanaged layer** sul componente
managed: da quel momento quel layer vince su ogni upgrade successivo della solution, e
l'ambiente si scollega dal package. Il problema non è che l'`UPDATE` possa fallire — è che
possa **riuscire**, perché il danno è silenzioso.

## Il flusso

```text
DEV → solution → ExportSolution ×2 (managed + unmanaged)
    → patch di <name> in bots/<schema>/bot.xml
    → rezip + verifica per archivio
    → artifact set: coppia patchata + originali + manifest.json
                         └→ (opzionale) import nell'ambiente di destinazione
```

Il nome entra nel **managed layer**, come qualsiasi altra proprietà della solution. Il tool
**non scrive su nessun environment**: non tocca `bot`, `botcomponent` né le environment
variable, e quindi non può creare layer. Il `pptb.config.json` dichiara `"write": []`, e il
vuoto è voluto.

## Cosa viene modificato nel package

**Un solo elemento**: il contenuto di `<name>` in `bots/<schemaname>/bot.xml`, uno per agent.

Non vengono toccati `schemaname`, nomi di cartella, nomi di file, GUID, `[Content_Types].xml`,
`customizations.xml`. Nessuna sostituzione testuale globale — lo schemaname compare in **31
entry su 34**, un "cerca e sostituisci" distruggerebbe la solution.

Su richiesta si toccano anche `<Version>` in `solution.xml` (bump) e `publishOnImport` in
`configuration.json`. Ogni altra entry resta **byte-identica**, e il tool lo verifica entry per
entry prima di consegnare il file.

## Teams e M365 Copilot

Il nome sui canali è una **copia di `bot.name` scattata al publish**, in ciascun environment:
il patch del package lo copre, a patto che l'agent venga pubblicato nel target —
`publishOnImport: true` lo fa all'import. Il manifest Teams non viaggia nel package e non
contiene alcun nome.

Il *Channel display name suffix* nativo di Copilot Studio è un'**alternativa**, non un
complemento: usato insieme al suffisso nel nome produce `agenteTool1 [UAT] (UAT)`. Il tool non
lo tocca e avvisa se lo trova configurato.

## Supportabilità — da sapere prima di usarlo

Microsoft **non supporta la modifica manuale dei file estratti da una solution**
([Source control with solution files](https://learn.microsoft.com/power-platform/alm/use-source-control-solution-files)).
Il tool la fa comunque, su un solo elemento. La scelta è stata presa consapevolmente, su tre
basi verificate:

1. **Nessuna dipendenza può rompersi**: i record di dipendenza contengono solo GUID e
   `componenttype`, nessun campo con un nome. Il display name non è una chiave.
2. **Viene toccato un solo elemento**, e la verifica entry-per-entry lo dimostra a ogni
   esecuzione.
3. **L'export originale resta nell'artifact set**: ogni problema è riproducibile senza il patch.

Esiste un'alternativa formalmente ineccepibile — rinominare in un *build environment* dove la
solution è unmanaged ed esportare da lì — documentata in `research.md §15`, valutata e scartata
per costo operativo.

**Le Power Platform Pipelines native non sono compatibili** con questo flusso: il pipelines host
proibisce la modifica dell'artefatto e distribuisce lo stesso artefatto managed a tutti gli
stage.

## Artifact set

Ogni operazione lascia una cartella:

```text
testAgentTool_1.0.0.2_UAT_20261015-143022/
├── manifest.json                              sorgente, suffisso, operatore, impronta, hash
├── testAgentTool_1_0_0_2_managed_UAT.zip      role: deploy   ← l'unico da importare in UAT/PROD
├── testAgentTool_1_0_0_2_unmanaged_UAT.zip    role: source   ← source control, mai a valle
├── source_managed.zip                         role: restore
└── source_unmanaged.zip                       role: restore
```

Due artefatti della stessa `<Version>` si distinguono dall'**hash SHA-256** nel manifest, non
dalla versione: per questo non serve forzare un bump, che creerebbe una deriva di versioni per
ambiente.

## Sviluppo

```bash
npm install
npm run build          # UI + entry headless
npm run build-headless # solo l'entry headless
npm run validate       # pptb-validate
```

### Smoke check

Verifica l'invariante che regge tutto — un solo elemento modificato, tutto il resto
byte-identico — su un export reale:

```bash
npm run smoke -- <percorso-zip> [suffisso] [--bump] [--publish=false]
```

Richiede `@xmldom/xmldom` (devDependency): il codice gira nel browser e usa `DOMParser`.

### Struttura

```text
src/
├── app.ts                  routing, stato, rendering
├── types.ts                entità del flusso
├── globals.d.ts            API PPTB su globalThis (serve all'headless)
├── headless.ts             interfaccia MCP
├── baseline/
│   └── package-format.json impronta di riferimento del formato, verificata 2026-10-15
└── services/
    ├── dataverse.ts        letture (nessuna scrittura, per costruzione)
    ├── solutions.ts        solution e agent
    ├── export.ts           ExportSolution sincrono + fallback asincrono
    ├── package.ts          lettura del package
    ├── compat.ts           impronta del formato, occorrenze del nome, scostamenti
    ├── patch.ts            Patch Plan e riscrittura mirata
    ├── rezip.ts            ricostruzione e verifica
    ├── packaging.ts        orchestratore
    ├── artifacts.ts        artifact set e manifest
    ├── history.ts          storico dei packaging
    ├── deploy.ts           import opzionale nel target
    ├── files.ts            scrittura su disco
    ├── log.ts              log con export CSV/JSON
    └── ui.ts               indicatori e dialog di conferma
```

## Documentazione

Spec, decisioni e misure: `specs/001-agent-rename-manager/`. In particolare `research.md`, che
raccoglie quindici sezioni di verifiche fatte su dati reali — compresi gli errori incontrati e
il perché di ogni scelta.

## Licenza

MIT
