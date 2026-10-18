# Research: Icona e descrizione dell'agent

**Feature**: `008-agent-icon-and-description` | **Date**: 2026-10-18

## §1 — Che cosa dice la documentazione sulla tabella `bot`

[Agent (bot) table/entity reference](https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/bot):

| Colonna | Tipo | Note |
|---|---|---|
| `iconbase64` | Memo, max **136.533** caratteri | *"Used to visually identify your bot in channels and services. Represented in a base64 encoded string. **Must be in PNG format, and no larger than 100KB** in size. This value can be changed at any time."* — DisplayName *Icon (Base64)* |
| (descrizione) | — | Le 29 colonne scrivibili di `bot` sono: `accesscontrolpolicy, applicationmanifestinformation, authenticationconfiguration, authenticationmode, authenticationtrigger, authorizedsecuritygroupids, botId, Configuration, iconbase64, ImportSequenceNumber, IsCustomizable, Language, name, Origin, OverriddenCreatedOn, OwnerId, OwnerIdType, ProviderConnectionReferenceId, publishedby, publishedon, RuntimeProvider, SchemaName, statecode, statuscode, SupportedLanguages, SynchronizationStatus, Template, TimeZoneRuleVersionNumber, UTCConversionTimeZoneCode`. **Nessuna `description`** |

**Conclusione**: l'icona sta in `bot.iconbase64` (documentata, PNG ≤ 100 KB). La **descrizione non è una colonna di `bot`**.

## §2 — Dove sta la descrizione: **verificato** il 2026-10-18

Nell'export reale di `testAgentTool` (misurato il 2026-10-18):

- `bots/<agent>/bot.xml` ha gli elementi `authenticationmode, authenticationtrigger, iconbase64, iscustomizable, language, name, runtimeprovider, template, timezoneruleversionnumber`: **nessuna descrizione**.
- Il componente `botcomponents/<agent>.gpt.default/` (tipo 15, il "GPT component") ha `botcomponent.xml` con `componenttype, iscustomizable, name, parentbotid, statecode, statuscode` e un file `data` YAML:

```yaml
kind: GptComponentMetadata
displayName: agenteTool2 [DEV]      # presente solo per alcuni agent
instructions:
gptCapabilities:
  webBrowsing: true
aISettings:
  model:
    modelNameHint: GPT56Chat
```

Il primo export non aveva descrizioni (la scheda *Details* diceva "None provided"), quindi non c'era un esempio. Dopo che l'utente ha scritto una descrizione su due agent e ha esportato di nuovo, la ricerca del testo in tutti i file di `bots/` e `botcomponents/` ha dato **un solo posto**:

```xml
<!-- botcomponents/ava_agenteTool2.gpt.default/botcomponent.xml -->
<description>agente agenteTool3  per utenti</description>
```

Lo stesso per `ava_agenteTool3.gpt.default`; `agenteTool1` non ha l'elemento (la descrizione è opzionale e l'export la serializza solo se c'è).

| Candidato | Esito |
|---|---|
| `botcomponent.description` del componente GPT | ✅ **È questo** |
| chiave `description:` nel YAML `data` | ❌ non compare |
| `bot.xml` / `Configuration` di `bot` | ❌ non compare |

**Conseguenze**
- La baseline del package già prevede `description` come elemento opzionale di `botcomponent.xml` (era una nota di 001 §14): nessun cambio di formato.
- Il package patchato la porta **invariata** (il tool non tocca quel file): una descrizione in DEV arriva in UAT com'è.
- Per leggerla da Dataverse si legge il `botcomponent` il cui `schemaname` termina con `.gpt.default` ed è figlio dell'agent. **Non si filtra per `componenttype`** (regola del progetto: i valori non documentati si indovinano male e restituiscono zero righe senza errore): si filtra per genitore e si sceglie lato client lo `schemaname` giusto. La lettura via Web API resta da provare (T002).

## §3 — Costo delle icone (misurato)

L'icona dell'agent `ava_agenteTool1` pesa **19.436 caratteri base64** (≈14 KB); il limite documentato è 136.533 (~100 KB). Per una solution di 3–20 agent: 60–300 KB. Per l'intero ambiente (47 agent) potrebbero essere 0,7–6 MB. **Decision**: leggere solo gli agent della solution aperta, dopo che la lista è apparsa (FR-005), con cache per sessione.

Seconda misura sull'export `testAgentTool 1.0.0.7` (2026-10-18): l'icona di tutti e tre gli agent pesa **97.828 caratteri** (≈72 KB), ancora sotto il limite: lo stesso agent può avere un'icona ben più pesante di quella misurata prima, quindi la lettura resta limitata alla solution aperta. La descrizione si ritrova solo in `botcomponents/<agent>.gpt.default/botcomponent.xml`; il YAML `data` contiene solo `displayName` (ancora con `[DEV]` nel package per UAT: vedi §5).

La firma di un PNG in base64 è `iVBORw0KGgo` (visto: `iVBORw0KGgoAAAANSUhEUgAA`): è un controllo rapido e sufficiente per scartare ciò che non è PNG.

## §4 — Sicurezza

Il valore arriva da Dataverse e potrebbe contenere qualsiasi cosa. **Decision**: l'icona entra nel documento **solo** come attributo `src` di un `<img>` costruito dal tool, dopo la validazione di FR-002; la descrizione solo come testo (`textContent`/escape). Nessun valore non validato si concatena in HTML.

## §5 — Scoperta collaterale: `displayName` nel YAML (riguarda la spec 002)

Il file `data` del componente GPT può contenere **`displayName: <nome dell'agent>`**: per `agenteTool2` è `agenteTool2 [DEV]`, per `agenteTool3` `agenteTool3  [DEV]` (con doppio spazio, come nel suo `<name>`). Il controllo "il nome compare in posti sconosciuti" (001 FR-096) legge **elementi XML e stringhe JSON**, non le righe di un file YAML: questo posto **non** viene visto né patchato.

È lo stesso tema dell'aperto della 002 (research §2): non è verificato se quel `displayName` abbia un effetto su ciò che l'utente vede dopo l'import. **Follow-up**: aggiungere la lettura del YAML al controllo delle occorrenze (solo segnalazione) e verificare l'effetto in UAT. Non fa parte di questa funzione, ma l'ha fatta emergere.

**Osservazione manuale (2026-10-18)**: dopo l'import in UAT di un package con il `displayName` ancora a `[DEV]` nel YAML, l'utente ha visto l'agent **rinominato `[UAT]` dappertutto**. Al momento quel valore risulta inerte; resta un'osservazione a occhio, non una verifica completa di ogni schermata e canale. Il follow-up sul controllo delle occorrenze (solo segnalazione) resta facoltativo.

## §6 — Alternative scartate

- **Leggere l'icona dal package invece che da Dataverse**: il package è già in mano al tool solo dopo l'export (dopo che l'utente ha scelto); le liste servono prima.
- **Leggere tutte le icone dell'ambiente al caricamento**: troppo costoso (§3).
- **Mostrare un'icona generata dalle iniziali**: utile come ripiego, ma l'icona generica del tool è più semplice e coerente; si può rivedere.
