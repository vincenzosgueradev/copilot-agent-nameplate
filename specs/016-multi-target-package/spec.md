# Specifica 016 — Targets: le destinazioni del rilascio, un solo giro

**Stato**: **Implementata (fasi 1–5); in corso la revisione D8 (agent e publish per Target).** Decisioni prese (D1–D8); plan, research, data-model, contratto del manifest, quickstart, tasks e checklist scritti. Tutte le assunzioni confermate (D7 chiude P1).
**Estende**: 002 (suffisso unico per la solution), 004 (versione alzata in DEV), artifact set (001 FR-078/FR-083), 012 (impostazioni per ambiente, come i pin). **Nasce da**: la domanda su come si arriva in PROD (vedi 015) e dall'idea dell'utente: una lista di destinazioni che ognuno compone e che il tool ricorda.

## Il problema
Per portare gli agent in più ambienti oggi si fa il giro più volte: stessa solution di DEV, suffisso `[UAT]`, poi `[PROD]`, e così via. Ne vengono fuori tre difetti:
1. **Più esportazioni da DEV** in momenti diversi: le varianti possono partire da stati diversi di DEV se nel frattempo qualcuno ha modificato la solution.
2. **La versione si alza a ogni giro** a meno di spegnere l'opzione dal secondo in poi (README: «To import the same version into a second environment, turn the option off»). È facile sbagliare.
3. **Nulla prova che le varianti differiscano solo per i nomi.** Ogni zip è verificato contro il proprio export, ma non c'è un confronto tra gli zip.

Inoltre il tool non sa quanti ambienti ha chi lo usa: oggi ci sono sei preset fissi (DEV, TEST, UAT, STAGING, PREPROD, PROD) e nient'altro.

## User Story
Chi promuove una solution da DEV ha una **lista di Targets** sua (per esempio UAT, PROD e un `[HOTFIX]` creato da lui), che il tool ricorda. A ogni giro **spunta le destinazioni che servono** e ottiene **un solo set di file** con uno zip managed per destinazione, partiti dallo **stesso export** e dalla **stessa versione**, con la prova che si distinguono solo per i nomi.

## Decisioni prese (con l'utente)
- **D1 — Dove si ricorda**: per **ambiente DEV collegato**, come i pin (012). Un altro cliente o progetto ha la sua lista.
- **D2 — Cosa si ricorda**: per ogni destinazione, **etichetta/suffisso, ordine e publish on import**.
- **D3 — Spunte al giro dopo**: quelle **usate l'ultima volta per quella solution**; una solution nuova parte senza spunte.
- **D4 — Nome**: **Targets**. Si evita «Pipeline» perché il README dichiara il tool non compatibile con le Power Platform Pipelines native.
- ~~**D5 — Agent esclusi uguali per tutti i Target**~~ — **sostituita da D8** (2026-11-01).
- **D7 — Eccezione di publish per agent**: vale la regola **più specifica**: l'eccezione dell'agent batte il default del Target. ~~Ed è la stessa in tutti i Target~~ — **da D8 è per Target**.
- **D8 — Agent e publish per Target** (dopo la prova a mano del 2026-11-01): sotto **ogni Target spuntato** compare la sua tabella di agent, con la **casella** (rinominare o lasciare com'è) e il **publish per agent** di quel Target. Le scelte sono **indipendenti fra Target** (togliere un agent da UAT non lo toglie da PROD). Ogni tabella parte con tutti gli agent spuntati e con il default di publish del Target. Le scelte per agent **non si ricordano** fra un giro e l'altro (come prima); si ricorda solo la lista dei Target e le spunte (D3). Motivo: il selettore `[UAT] | [PROD]` sopra una tabella sola non faceva capire a quale Target appartenessero le scelte.
- **D6 — Manifest**: **sempre il formato nuovo** (`targets[]`), anche con un solo Target. Un solo formato da mantenere; si rilascia come MINOR con una nota nelle Upgrade notes (chi legge il manifest con uno script deve adattarsi).

## Che cosa NON promette
Non è «lo stesso artefatto in ogni ambiente» (il principio delle Pipelines): lo zip per PROD resta diverso da quello per UAT perché i nomi degli agent sono diversi, ed è la ragione d'essere del tool. Promette che la differenza è **provata e limitata** a quei nomi (e a `publishOnImport` se scelto).

## Requisiti (bozza)
### La lista
- **FR-001**: Il tool DEVE mantenere una **lista di Targets per ambiente DEV collegato**. Ogni Target ha: un **nome** che coincide con il suffisso (può essere vuoto per «nessun suffisso», una sola volta nella lista), un **ordine** e un valore di **publish on import** (leave as is / force yes / force no).
- **FR-002**: Alla prima apertura su un ambiente la lista DEVE essere precompilata con i preset già esistenti (DEV, TEST, UAT, STAGING, PREPROD, PROD) e l'utente DEVE poter togliere quelli che non gli servono.
- **FR-003**: L'utente DEVE poter **creare** un Target personalizzato, **rinominarlo**, **toglierlo**, **riordinarlo** (trascinando, e con pulsanti su/giù da tastiera) e **cambiarne il publish on import**. Le regole del suffisso restano quelle di oggi (lunghezza massima, caratteri non ammessi).
- **FR-004**: La lista DEVE essere salvata a ogni modifica, come i pin. Se il salvataggio fallisce, il tool DEVE dirlo e dire che la lista dura solo fino alla chiusura. Un valore salvato illeggibile DEVE essere ignorato senza rompere la schermata.
- **FR-005**: Due Target NON DEVONO avere lo stesso nome (senza distinguere maiuscole).

### Il giro
- **FR-006**: Il passo Suffix DEVE mostrare la lista e lasciare **spuntare da uno a N Target**. Con un solo Target spuntato il comportamento DEVE restare quello di oggi, tranne il formato del manifest (FR-012, D6). Gli agent rinominati e il publish per agent si scelgono **per Target** (D8); l'intestazione della lista dice cosa è ogni colonna.
- **FR-007**: All'apertura di una solution, le spunte DEVONO essere quelle dell'ultimo giro **per quella solution** (D3); i Target tolti dalla lista nel frattempo non compaiono.
- **FR-008**: L'export di DEV (managed + unmanaged) DEVE avvenire **una volta sola**; ogni Target parte dagli **stessi byte**.
- **FR-009**: La versione DEVE essere alzata **una sola volta** in DEV (con la conferma di oggi, 014) e valere per tutti gli zip.
- **FR-010**: Ogni Target DEVE passare la verifica entry per entry di oggi.
- **FR-011**: Il publish on import di un Target parte dal valore salvato ed è modificabile prima dell'export, senza cambiare quello salvato salvo scelta esplicita.

### Il risultato
- **FR-012**: Il set di file DEVE contenere **una cartella**, uno zip managed per Target (nome con etichetta e suffisso), gli export originali **una volta** e un `manifest.json` con l'hash dell'export di partenza e l'elenco `targets[]` (nome, ordine, hash dello zip, publish on import). Il formato è lo stesso anche con un solo Target (D6) e la versione del formato sale, così uno script può riconoscerlo.
- **FR-013**: Il manifest DEVE riportare il **confronto tra i Target**: per ogni Target **rispetto al primo spuntato**, le entry diverse (con la loro natura: nome di un agent, `publishOnImport`) e la conferma che **tutte le altre** sono identiche byte per byte. Il confronto è col primo, non a coppie: tutti gli zip partono dallo stesso export, quindi la differenza fra due Target qualsiasi è l'unione delle due liste. Se un'entry diversa non è nell'elenco atteso, la verifica DEVE fallire.
- **FR-014**: Lo storico DEVE registrare **un'operazione** con N Target, non N operazioni scollegate.
- **FR-015**: Nessuna scrittura in DEV oltre alla versione (invariata); nessun import (invariato).

## Matrice di test prevista (per quando si implementa)
Dimensioni: numero di Target spuntati (1, 2, 3) × presenza di un Target con suffisso vuoto × publish on import per Target (uguale / diverso) × agent esclusi (nessuno / uno). Oracolo scritto dalla spec: numero di zip, un solo export, una sola scrittura di versione, differenze del manifest limitate ai nomi e al publish. Test negativi: nome duplicato, lista illeggibile, salvataggio fallito, Target tolto che era spuntato.

## Domande aperte
Nessuna: tutte decise (D1–D8). Un'idea per dopo, fuori dalla 016: collegare ogni Target all'URL dell'ambiente di destinazione, per avvisare se si importa lo zip sbagliato (oggi la corrispondenza nome-ambiente è responsabilità di chi importa).

## Da ricordare al rilascio
Cambia il formato del manifest e come si leggono i dati salvati (nuova lista di Target nelle impostazioni): è un **MINOR con Upgrade notes**, o un MAJOR se si decide che rompe gli script esistenti. Prima di rilasciare: avvisare dell'impatto (CLAUDE.md) e leggere `../PPTB-PUBLISHING-RULES.md`.

## Fuori ambito
- Import nelle destinazioni (resta un passo manuale: il tool usa solo la connessione attiva).
- Rinominare dopo l'import nell'ambiente di destinazione: ricreerebbe il layer unmanaged che il tool esiste per evitare.
- Compatibilità con le Power Platform Pipelines (già esclusa nel README).
- Condividere la lista tra persone o tra macchine: resta nelle impostazioni locali del tool.
