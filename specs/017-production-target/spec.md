# Specifica 017 — Target «Production» senza suffisso

**Estende**: 013 (avviso «nessun suffisso») e 016 (Targets). **Nasce da**: richiesta dell'utente (2026-11-02) durante la prova a mano della 016.
**Stato**: Implementata; resta la prova a mano (vedi `quickstart.md`).

## Il problema
In produzione un agent si chiama senza suffisso (`agenteTool1`, non `agenteTool1 [PROD]`). Per questo il target di produzione è quello con il nome vuoto («no suffix»). L'avviso della 013 compare però **ogni volta** che un target senza suffisso è spuntato: per chi lo ha creato apposta per la produzione è un avviso inutile, ripetuto a ogni giro, che si impara a ignorare.

## Decisione
Il target senza suffisso ha una casella **Production**. Spuntata, il tool sa che quel target è la produzione e che il suffisso vuoto è voluto: l'avviso non compare più per lui. Resta per ogni altro target senza suffisso non marcato (quello che nasce da una dimenticanza). Solo l'avviso: la casella non aggiunge altre protezioni.

## User Story
Chi ha un target di produzione senza suffisso lo marca una volta come «Production» e smette di vedere l'avviso; chi dimentica di scrivere un suffisso lo vede ancora.

## Requisiti
- **FR-001**: La riga di un target **con il nome vuoto** DEVE mostrare una casella «Production». Le righe con un nome non la mostrano. Di partenza è **spenta**.
- **FR-002**: Con un target spuntato, senza nome e marcato Production, premere Review NON DEVE mostrare l'avviso «nessun suffisso», con un target solo come con più target.
- **FR-003**: Con un target spuntato, senza nome e **non** marcato, l'avviso resta come nella 013 (nessun cambio di testo né di scelte).
- **FR-004**: Conta solo il target **spuntato** per questo giro: un target Production non spuntato non cambia nulla, e un target non marcato non spuntato non fa comparire l'avviso (come nella 016).
- **FR-005**: La marcatura DEVE essere salvata con la lista dei target dell'ambiente (impostazioni locali di PPTB, come pin e target) e riletta all'apertura. Una lista salvata prima della 017, senza il campo, vale «non marcato».
- **FR-006**: La marcatura ha senso solo con il nome vuoto: se il target viene **rinominato** con un nome non vuoto si azzera; un valore salvato su un target con nome è ignorato alla lettura.
- **FR-007**: Nella tabella «un export, N package» (dialoghi e revisione) il target Production dice «(production)» al posto di «(removes the suffix)». I nomi cambiano come prima.
- **FR-008**: «Add "no suffix"» e «Restore defaults» NON marcano nessun target. La marcatura non entra mai nel package, nel manifest né nello storico.
- **FR-009**: Il testo sotto la lista spiega la casella in una frase.

## Fuori ambito
- Altre protezioni per la produzione (conferme extra, divieto di «Force no», nomi riservati): non richieste.
- Riconoscere la produzione dal nome (`PROD`): scartato, vedi `research.md`.
- I pixel della casella e della riga: prova a mano, vedi `quickstart.md`.
