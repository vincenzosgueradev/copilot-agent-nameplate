# Specifica 016 — Più ambienti di destinazione in un solo giro

**Stato**: **Proposta, non implementata.** Qui c'è solo la specifica; plan, research, data-model, quickstart, tasks e checklist si scrivono quando le domande aperte (in fondo) hanno una risposta.
**Estende**: 002 (suffisso unico per la solution), 004 (versione alzata in DEV), artifact set (001 FR-078/FR-083). **Nasce da**: la domanda su come si arriva in PROD (vedi 015).

## Il problema
Per portare gli agent in UAT **e** in PROD oggi si fa il giro due volte: stessa solution di DEV, suffisso `[UAT]` poi `[PROD]` (o vuoto). Ne vengono fuori tre difetti:
1. **Due esportazioni da DEV** in momenti diversi: le due varianti possono partire da stati diversi di DEV se nel frattempo qualcuno ha modificato la solution.
2. **La versione si alza due volte** a meno di spegnere l'opzione al secondo giro (README: «To import the same version into a second environment, turn the option off»). È facile sbagliare.
3. **Nulla prova che UAT e PROD differiscano solo per i nomi.** Ogni zip è verificato contro il proprio export, ma non c'è un confronto tra i due.

## User Story
Chi promuove una solution da DEV sceglie in un solo passaggio tutti gli ambienti di destinazione (per esempio UAT e PROD), ognuno con il suo suffisso, e ottiene **un solo set di file** con uno zip managed per destinazione, partiti dallo **stesso export** e dalla **stessa versione**, con la prova che si distinguono solo per i nomi.

## Che cosa NON promette
Non è «lo stesso artefatto in ogni ambiente» (il principio delle Pipelines): lo zip per PROD resta diverso da quello per UAT perché i nomi degli agent sono diversi, ed è la ragione d'essere del tool. Promette che la differenza è **provata e limitata** a quei nomi (e a `publishOnImport` se scelto).

## Requisiti (bozza)
- **FR-001**: Il passo Suffix DEVE permettere di definire **da una a N destinazioni**, ciascuna con un'etichetta (UAT, PROD…) e un suffisso (anche vuoto). Con una sola destinazione il comportamento DEVE restare identico a oggi.
- **FR-002**: L'export di DEV (managed + unmanaged) DEVE avvenire **una volta sola**; ogni destinazione parte dagli **stessi byte**.
- **FR-003**: La versione della solution DEVE essere alzata **una sola volta** in DEV (con la conferma di oggi, 014) e valere per tutti gli zip.
- **FR-004**: Ogni destinazione DEVE passare la verifica entry per entry di oggi.
- **FR-005**: Il set di file DEVE contenere **una cartella**, uno zip managed per destinazione (nome con etichetta e suffisso), gli export originali **una volta** e un `manifest.json` con l'hash dell'export di partenza e l'elenco delle destinazioni (etichetta, suffisso, hash dello zip, opzioni).
- **FR-006**: Il manifest DEVE riportare il **confronto tra le destinazioni**: per ogni coppia, le entry diverse (con la loro natura: nome di un agent, `publishOnImport`) e la conferma che **tutte le altre** sono identiche byte per byte. Se un'entry diversa non è nell'elenco atteso, la verifica DEVE fallire.
- **FR-007**: Le opzioni di publish on import sono **per destinazione** o **comuni**: da decidere (domanda 2).
- **FR-008**: Il nome di due destinazioni NON DEVE coincidere (etichetta e suffisso); i suffissi uguali con etichette diverse sono ammessi ma segnalati.
- **FR-009**: Nessuna scrittura in DEV oltre alla versione (invariata); nessun import (invariato).
- **FR-010**: Lo storico DEVE registrare un'operazione con N destinazioni, non N operazioni scollegate.

## Domande aperte (servono all'utente prima di scrivere plan e tasks)
1. **Etichetta e suffisso sono la stessa cosa?** Oggi c'è solo il suffisso. Ipotesi: etichetta = suffisso, con i preset UAT/PROD, e «nessun suffisso» come destinazione valida (PROD senza suffisso).
2. **`publishOnImport` per destinazione o comune?** Ipotesi: comune di default, con la possibilità di cambiarlo per destinazione.
3. **Gli agent esclusi** valgono per tutte le destinazioni (ipotesi) o per ciascuna?
4. **Compatibilità con 1.1.x**: il formato del manifest cambia (`targets[]`). Con una sola destinazione si mantiene il formato attuale o si passa al nuovo? Da decidere insieme alla versione da rilasciare (MINOR con note di aggiornamento, oppure MAJOR).

## Fuori ambito
- Import nelle destinazioni (resta un passo manuale: il tool usa solo la connessione attiva).
- Rinominare dopo l'import nell'ambiente di destinazione: ricreerebbe il layer unmanaged che il tool esiste per evitare.
- Compatibilità con le Power Platform Pipelines (già esclusa nel README).
