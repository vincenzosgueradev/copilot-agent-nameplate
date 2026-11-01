# Specifica 015 — Guida sulle solution managed

**Estende**: 001 (FR-068, solution managed non esportabile) e 005 (elenco delle solution). **Nasce da**: una domanda dell'utente aprendo il tool su UAT, dove la solution è managed: «da DEV vai su UAT e testano; se non puoi esportare, come vai in PROD?».

## Il problema
Nell'ambiente a valle (UAT, PROD) le solution sono **managed**, e Microsoft non permette di esportarle. Il tool lo diceva solo **dopo** aver aperto la solution, e senza spiegare che è la situazione normale né come uscirne. Chi non conosce l'ALM di Dataverse concludeva che il tool non funzionasse, o che fosse sbagliato avere una managed in UAT.

## User Story
Chi apre il tool su un ambiente dove le solution sono managed capisce **subito** che è normale, che da lì non si costruisce il package, e **che cosa fare**: aprire il tool con una connessione a DEV (per esempio in un'altra scheda del tool) e importare poi il package nell'ambiente a valle.

## Requisiti
- **FR-001**: Il banner della solution managed DEVE dire che non si può esportare, **nominare l'ambiente connesso**, spiegare che una managed a valle è normale (è ciò che lascia un import), dire di aprire il tool con una connessione all'ambiente dove la solution è unmanaged (di solito DEV, in un'altra scheda del tool) e che il package si importa poi nell'ambiente a valle. Il rename NON è offerto (resta valido FR-068).
- **FR-002**: Nell'elenco, ogni riga managed DEVE avere un tooltip che dice che non può essere sorgente di un package; nella vista **All** DEVE inoltre distinguersi dalle unmanaged (testo attenuato). Nelle viste Managed e Unmanaged l'elenco NON si attenua. La riga resta **cliccabile** (serve a vedere gli agent).
- **FR-003**: Se l'ambiente contiene solo solution managed (con agent), l'elenco DEVE mostrare sopra la tabella una nota che dice il nome dell'ambiente connesso, che è atteso in UAT o PROD, che le managed non si esportano e dove andare (il tool su una connessione a DEV). La nota compare nelle viste Managed e All, mai nella vista Unmanaged.
- **FR-004**: Se l'ambiente contiene sia unmanaged sia managed, la nota compare **solo** nella vista Managed e dice che le managed non possono essere sorgente e che quelle da cui si parte stanno sotto Unmanaged. Nelle viste All e Unmanaged NON compare. Se non ci sono solution managed, non compare mai.
- **FR-005**: Il nome dell'ambiente è testo, mai HTML (nota e banner).
- **FR-006**: Nessuna scrittura su Dataverse né nel package; nessuna impostazione salvata; nessuna chiamata di rete in più.

## Tabella della nota (FR-003, FR-004)
| L'ambiente contiene | Vista Unmanaged | Vista Managed | Vista All |
|---|---|---|---|
| solo managed | nessuna nota | nota «a valle» | nota «a valle» |
| solo unmanaged | nessuna nota | nessuna nota | nessuna nota |
| entrambe | nessuna nota | nota «managed non sorgente» | nessuna nota |

## Fuori ambito
- Il tool **non cambia connessione** da solo e non conosce altri ambienti: usa solo la connessione attiva (1.1.2).
- Non si rende la riga managed non cliccabile: perderebbe la lista degli agent.
- Il comportamento vero di PPTB nel cambio di connessione e l'aspetto (attenuazione, bordo della nota, tema chiaro/scuro): prova a mano, vedi `quickstart.md`.
