# Research: due architetture di agent

## §1 — Cosa si è misurato (2026-10-18, export di `testAgentTool`)

| | Agent classico | Agent harness (GitHub Copilot) |
|---|---|---|
| `template` (bot.xml) | `default-2.1.0` | `cliagent-1.0.0` |
| `recognizer.$kind` | `GenerativeAIRecognizer` | `CLICopilotRecognizer` |
| Impostazioni | `gPTSettings`, `aISettings`, `settings`, `channels` | `agentSettings` (modello, `instructions`, `web`) |
| Componenti | GPT + topic | solo `Default_FeedbackCollectionBotSettings_…` (senza `<name>`) |
| Prefisso | quello del publisher | può essere diverso (`crc44_…`: creato fuori dalla solution) |
| Dove sta il nome | `<name>` di bot.xml + `displayName` nel YAML del GPT | `<name>` di bot.xml |

Chiavi di `configuration.json` dell'harness: appena creato `$kind, recognizer, agentSettings, publishOnImport`; dopo apertura e canali anche `categories, channels, settings, publishOnCreate, isLightweightBot, deferredProvisioning`.

## §2 — Due pulsanti o una logica?

**Una logica.** Il rename tocca `<name>` in bot.xml, uguale nelle due architetture. Quello che cambia è solo il controllo del formato. Prova: import in UAT del package 1.0.0.13: l'agent harness diventa `agenteTool4 [UAT]` ed è pubblicato dall'import.

## §3 — Alternative scartate

- **Confrontare solo le chiavi obbligatorie** (ignorare le opzionali): nasconde chiavi davvero nuove e non distingue le architetture.
- **Un unico baseline con l'unione delle chiavi**: un agent classico con `agentSettings` passerebbe in silenzio.
- **Riconoscere l'architettura dal `template`** (in bot.xml): ha lo stesso potere ma è un'altra lettura di file; `recognizer.$kind` sta già nel file che si confronta.

## §4 — Limiti

Due agent harness reali (uno appena creato, uno aperto e collegato): il profilo è stato misurato su quelli. Una chiave nuova di piattaforma si segnala una volta, con il nome dell'architettura, e si risolve aggiungendola al profilo.
