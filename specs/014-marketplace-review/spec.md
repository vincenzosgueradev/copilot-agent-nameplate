# Spec 014 — Correzioni dopo la revisione del marketplace (1.1.0)

Nasce dal rifiuto di `@vincenzosgueradev/pptb-copilot-nameplate@1.1.0` ("Needs Changes", 26 ott 2026).
Policy: https://docs.powerplatformtoolbox.com/policies/marketplace

## Requisiti
- **FR-001** Il nome visualizzato non contiene il marchio "Copilot" (package.json, `<title>`, header, README, notifiche, terminale). Il nome del package npm non cambia.
- **FR-002** `author` è chi ha scritto il tool (Vincenzo Sguera), non "Power Platform ToolBox".
- **FR-003** L'header mostra la versione di `package.json`, iniettata dal build; mai scritta a mano.
- **FR-004** Prima di scrivere la versione in DEV, un dialog nomina l'ambiente (nome e URL della connessione), la solution, la versione di partenza e di arrivo, dice che il tool non può annullare e come tornare indietro (portale, export di backup). Annullando non si scrive e non si esporta.
- **FR-005** Con "Raise the version" spento non compare nessun dialog: il tool non scrive nulla.
- **FR-006** Headless: `options.newVersion` senza `confirmVersionWrite: true` (booleano esatto) si rifiuta con `VERSION_WRITE_NOT_CONFIRMED`, prima di ogni chiamata a Dataverse.
- **FR-007** Il README ha la sezione "What this tool changes" (package e DEV) e non afferma più che nessun ambiente viene scritto.
- **FR-008** (modifica FR-097/FR-098 della spec 001) L'avviso "Package format" nella schermata di verifica compare solo se manca `<name>` in `bot.xml`, cioe' cio' che il tool modifica. Chiavi, elementi o cartelle nuove non cambiano il risultato (il resto e' byte-identico, verificato entry per entry): restano nel log (livello info) e nel manifest. `publishOnImport` assente non conta (opzionale). Origine: avviso su `categories` in un agent standard, 26 ott 2026.
- **FR-009** (policy §7) Il dialog dice anche lo scope: una proprieta' di una solution, nessun agent, componente o variabile. Il README ha la sezione "What this tool changes" con il titolo esatto della policy.
- **FR-010** (policy §3) Il tool segue il tema di PPTB: `data-theme` da `getCurrentTheme()`, riletto a `settings:updated`; un valore sconosciuto vale scuro. Il tema chiaro ridefinisce tutte le variabili colore e i colori fissi (chip, badge, avvisi); il testo ha contrasto >= 4.5 (WCAG).

## Cosa i test non coprono
I pixel del dialog e dei due temi, il comportamento vero di Dataverse, l'esito della revisione del marketplace.
