# Research: Rename a livello di solution

**Feature**: `002-solution-wide-rename` | **Date**: 2026-10-18 *(raccolta il 2026-10-17 durante il lavoro)*

## §1 — Perché il suffisso è dell'ambiente

**Decision**: un solo suffisso per operazione, valido per tutti gli agent della solution.

**Rationale**: il package è la solution intera (001 §12). Un suffisso per agent riproduce il difetto che la funzione corregge: nomi misti nello stesso ambiente. La documentazione Microsoft tratta il *Channel display name suffix* come una variabile d'ambiente per ambiente — `(Development)`, `(Test)`, vuota in produzione — valida per tutti gli agent che la usano.

**Alternatives considered**: suffisso per agent — scartato, riapre il difetto; più operazioni separate per agent — scartato, il package è comunque uno solo.

## §2 — Nomi nel package: dove compaiono (misurato su export reali a due agent)

Verificato il 2026-10-17 su `testAgentTool` con due agent:

| Agent | `bot.xml <name>` | `botcomponent` GPT `<name>` | Perché |
|---|---|---|---|
| agenteTool1 | `agenteTool1 [DEV]` | `agenteTool1` | creato senza suffisso; `[DEV]` aggiunto dopo, solo sull'agent |
| agenteTool2 | `agenteTool2 [DEV]` | `agenteTool2 [DEV]` | creato già con il suffisso: Copilot Studio lo copia anche nel componente |

La 001 (§14) conosceva solo il primo caso. Il secondo faceva scattare "il nome compare in posti che il tool non conosce" a ogni salvataggio. **Decision**: il componente GPT è un posto noto in entrambe le forme; se porta ancora un suffisso vecchio la schermata dei controlli lo dice come scelta consapevole (non patchato, coerente con la regola "si tocca solo `<name>` di `bot.xml`").

**Non verificato**: se il nome intero nel componente GPT abbia un effetto visibile sui canali di un agent creato con suffisso. Dopo l'import controllare che Teams e M365 Copilot mostrino il nome nuovo. Se così non fosse, si passa a patchare anche quel `<name>` (con modifica di spec).

## §3 — `configuration.json` di un agent mai collegato

Nell'export `agenteTool2` ha le chiavi `$kind, aISettings, gPTSettings, isAgentConnectable, recognizer, settings`: **mancano** `channels`, `isLightweightBot`, `publishOnImport`. `agenteTool1` le ha tutte. L'impronta del formato leggeva solo il **primo** `configuration.json` dello zip, quindi l'esito dipendeva dall'ordine dei file. **Decision**: unire le chiavi di tutti gli agent; una chiave "sparisce" solo se manca ovunque; `channels` e `isLightweightBot` diventano opzionali nella baseline.

## §4 — Due agent con lo stesso nome

Trovato dalla suite combinatoria (spec 006) — non segnalato dall'utente. Il nome di ciascuno compariva nel `bot.xml` dell'altro e veniva riportato come posto sconosciuto. **Decision**: il `<name>` del `bot.xml` di qualunque agent è un posto noto; lo patcha il controllo dell'agent stesso, e un agent escluso conserva il nome per scelta.

## §5 — Il difetto originale e la rete di sicurezza

Con la UI "un agent alla volta" l'utente selezionava `agenteTool2` e il package usciva con `agenteTool1 [DEV]` accanto a `agenteTool2 [UAT]`. **Decision**: oltre a rendere il rename di solution il comportamento normale (FR-001), il tool conta i suffissi distinti dopo il rename (esclusi compresi) e blocca con conferma se sono più di uno (FR-003). Il caso *"escluso per errore"* resta comunque raggiungibile, ed è per questo che serve.

## §6 — Idempotenza con suffisso vuoto

Trovato dalla suite: `alpha [DEV] [X]` + suffisso vuoto → `alpha [DEV]`; rilanciato → `alpha`. Con un suffisso non vuoto il risultato è un punto fisso (`alpha [DEV] [X]` + `UAT` → `alpha [DEV] [UAT]` → invariato). **Decision**: non è un difetto; "rimuovi il suffisso" toglie un gruppo per esecuzione, e nel nome risultante `[DEV]` è davvero un suffisso. Aspettativa del test corretta di conseguenza, nessuna regola inventata.

## §7 — Ordine

La schermata ordina gli agent per **nome**; il package, il manifest e lo storico per **schemaname** (ordine in cui `readPackage` li trova). Scelta consapevole, documentata nei test per non essere "corretta" per sbaglio.

## §9 — Un posto in più che il controllo non vede: il YAML del componente GPT

Scoperto il 2026-10-18 leggendo l'export per la spec 008: il file `botcomponents/<agent>.gpt.default/data` è YAML e può contenere **`displayName: <nome dell'agent>`** (es. `displayName: agenteTool2 [DEV]`). Il controllo delle occorrenze (FR-005) legge **elementi XML e stringhe JSON**, non le righe di un YAML: quel posto non viene né segnalato né patchato. Non è verificato se abbia un effetto visibile dopo l'import. **Follow-up**: leggere anche il YAML nel controllo (solo segnalazione) e verificare in UAT. Vedi [008 research §5](../008-agent-icon-and-description/research.md).

## §8 — Stato tra schermate

`selectSolution` azzera lo stato solo se la solution cambia (FR-009). Una versione precedente dell'idea azzerava a ogni apertura e faceva perdere le scelte tornando indietro dalla revisione.
