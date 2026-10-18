# Feature Specification: Due architetture di agent (standard e GitHub Copilot harness)

**Feature Branch**: `009-agent-architectures`

**Created**: 2026-10-18

**Status**: **Implementata** (2026-10-18) · il rename sull'agent harness è provato su un DEV e un UAT reali

**Input**: Richiesta dell'utente (2026-10-18): una solution con tre agent Copilot Studio classici e uno **GitHub Copilot harness**; *"mappali così non vai più in warning… fai la cosa più enterprise e scalabile"*. L'avviso "configuration.json keys: appeared agentSettings (vs baseline)" compariva a ogni packaging.

## Il problema

Il controllo del formato (FR-097) confronta le chiavi di `configuration.json` con **un solo** baseline, misurato su agent classici. Un agent harness scrive chiavi sue (`agentSettings`, `categories`…) e quindi produce un avviso a ogni packaging: rumore permanente che insegna a ignorare gli avvisi, compresi quelli veri.

## Che cosa si è verificato (research §1)

Export reali di `testAgentTool` (1.0.0.8, .13, .14, .15) con tre agent classici e due harness:

- Il **nome** sta nello stesso posto: `<name>` di `bots/<schema>/bot.xml`. Il rename funziona uguale.
- L'agent harness **non ha** componente GPT né topic: solo un componente di feedback senza `<name>`.
- `configuration.json` cambia: `recognizer.$kind` è `CLICopilotRecognizer` (non `GenerativeAIRecognizer`) e c'è `agentSettings`; le altre chiavi compaiono solo dopo che l'agent è stato aperto e collegato a un canale.
- Import in UAT: nome `agenteTool4 [UAT]` e agent **pubblicato dall'import** (`publishOnImport` ha effetto anche qui).

## User Stories

### US1 — Nessun falso allarme su package legittimi (P1)
Un package con agent classici e/o harness, in qualunque stato (collegati o no, con o senza `publishOnImport`), **non produce avvisi di formato**.

### US2 — La rete di sicurezza resta (P1)
Una chiave davvero fuori posto, o mancante tra quelle obbligatorie, si segnala **col nome dell'architettura**; un'architettura mai vista si segnala **con una sola riga**, non una per chiave.

### US3 — Si aggiunge un'architettura senza toccare il codice (P2)
Un'architettura nuova è un profilo nel baseline (`recognizer`, chiavi, chiavi opzionali).

## Requisiti

- **FR-001**: Le chiavi di `configuration.json` DEVONO essere raggruppate per architettura, identificata da `recognizer.$kind`; senza un `$kind` valido l'architettura è `(none)`.
- **FR-002**: Ogni architettura DEVE essere confrontata col profilo della **sua** architettura; le chiavi di un profilo NON DEVONO essere accettate in un altro.
- **FR-003**: Un'architettura senza profilo DEVE produrre **una** riga di avviso (non bloccante) che la nomina e dice che non c'è baseline.
- **FR-004**: Le chiavi opzionali di un profilo NON DEVONO produrre avvisi quando mancano o compaiono.
- **FR-005**: Il confronto con il packaging precedente DEVE essere per architettura; una registrazione senza raggruppamento (anteriore a questa spec) NON DEVE produrre avvisi sulle chiavi.
- **FR-006**: Gli elementi di `bot.xml` e `botcomponent.xml` DEVONO essere letti da **tutti** i file e uniti, non dal primo trovato; `name` è opzionale nei componenti (il componente di feedback non lo ha).
- **FR-007**: Il rename NON DEVE cambiare per l'agent harness: solo `<name>` (e `publishOnImport` se richiesto); tutto il resto resta identico.
- **FR-008**: Nessuna scrittura su Dataverse.

## Criteri di successo

- **SC-001**: Tutte le combinazioni di (architettura × collegato × `publishOnImport`) per 1-3 agent: nessun avviso di formato, nessuna occorrenza imprevista.
- **SC-002**: Gli export reali 1.0.0.12–1.0.0.15: nessun avviso.
- **SC-003**: Ogni mutazione elencata in tasks.md è scoperta dalla suite.
- **SC-004**: *Manuale (fatto)*: import in UAT di un package con un agent harness → nome corretto e pubblicato.

## Fuori ambito

- Il YAML `displayName` del componente GPT (spec 002, follow-up).
- Come il nome compare nei canali per l'agent harness (non verificato).
- Un secondo pulsante o una logica diversa per architettura: **non servono** (research §2).
