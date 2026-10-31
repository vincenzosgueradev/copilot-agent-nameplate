# Agent Rename Manager — istruzioni per Claude

## Usare le skill al momento giusto

L'utente si dimentica quando usare le skill custom: decidi tu quando servono, secondo la tabella sotto.

- **Automatiche (le lanci tu senza chiedere)**: `/custom-commit`, `/custom-ampush`, `/custom-types`, `/custom-dedup`. `custom-ampush`, `custom-types` e `custom-dedup` sono di sola analisi/lettura; `custom-commit` chiede comunque conferma del messaggio.
- **Solo su via libera**: `/custom-cleanup` e `/custom-changelog` modificano i file, quindi suggeriscile con "secondo me conviene lanciare `/custom-cleanup` perché …" e aspetta l'ok.
- **Solo manuali, mai da te**: `/custom-publish` pubblica su npm (irreversibile). Non lanciarla: quando la versione è pronta, dì all'utente di lanciarla. Non usare mai `npm run publish-package`: alza sempre la patch ignorando il changelog.
- Dì sempre in una riga quale skill hai usato e perché. Non rilanciare la stessa skill se i file non sono cambiati dall'ultima esecuzione.
- Mai fare push automaticamente: `/custom-ampush` dice solo se sei pronto.

| Situazione | Skill da suggerire |
|---|---|
| L'utente vuole committare, o un blocco di lavoro è concluso e ci sono modifiche non committate | `/custom-commit` (questa si può invocare in automatico) |
| Sta per fare push, o ha appena committato e parla di push/PR/consegna | `/custom-ampush` |
| Sono stati cancellati, rinominati o spostati file/moduli (anche da te) | `/custom-cleanup`, poi `/custom-ampush` |
| Refactoring, nuove funzionalità in `src/services/` o più file toccati con logica simile | `/custom-dedup` |
| Modificati `types.ts`, parsing XML/JSON, chiamate alle API PPTB/Dataverse, o comparsi `any`/`@ts-ignore`/errori `tsc` | `/custom-types` |
| Si parla di pubblicare/rilasciare una versione (`publish-package`, bump di versione), o `package.json` ha una versione senza voce in `CHANGELOG.md` | `/custom-changelog` (la constitution richiede la voce prima della pubblicazione) |
| Fine di una fase di implementazione speckit | `/custom-types` + `/custom-dedup`, poi `/custom-ampush` e `/custom-commit` |

Ordine tipico a fine lavoro: `/custom-cleanup` (se ci sono stati file rimossi) → `/custom-types` → `/custom-dedup` → `/custom-ampush` → `/custom-commit`. Per rilasciare una versione: `/custom-changelog` → `/custom-commit` (la voce) → `/custom-ampush` → `/custom-publish` → `/custom-commit` (il bump di versione) → push su entrambi i remote.

## Essere propositivi su commit e rilasci

Non aspettare che l'utente chieda: a fine di ogni blocco di lavoro valuta tu cosa serve e dillo in 2-3 righe.

**Commit — a ogni blocco concluso.** Un blocco è concluso quando una correzione o una funzione è completa e verificata (`tsc` + build + smoke passano). Lancia `/custom-commit` subito, senza accumulare: un commit per questione, anche se l'utente non l'ha chiesto. Non committare codice che non compila o che non hai verificato. Se il lavoro tocca cose non collegate, proponi di dividerlo in più commit.

**Rilascio — dopo ogni commit, guarda cosa non è ancora uscito.** Conta i commit utente-visibili dall'ultima voce del `CHANGELOG.md` (non `docs`, `chore`, `ci`, `style`, `test` o `refactor` senza effetto visibile) e di' a che punto sei: "N commit non rilasciati dalla X.Y.Z". Poi proponi un rilascio quando c'è almeno uno di questi motivi, indicando la versione e il perché:

| Motivo | Versione proposta | Quando |
|---|---|---|
| Fix di un bug che produce **risultati sbagliati o dati inconsistenti** (es. nomi misti nel package) | PATCH | Subito: non lasciarlo in giro |
| Funzione nuova, completa, che l'utente vede | MINOR | Quando è chiusa e verificata, non a metà |
| Cambia come si leggono i dati salvati, il formato del package o un'opzione esistente | MAJOR (o MINOR con Upgrade notes se compatibile) | Prima di rilasciare, avvisa dell'impatto |
| Più fix piccoli e indipendenti (circa 3-5) o fine di una fase speckit | PATCH | A fine fase |
| Solo docs/chore/refactor interno | nessuno | Non proporre il rilascio |

Se il codice è stato **stravolto** (molti file, flusso riscritto, tipi o contratti cambiati): prima `/custom-types` + `/custom-dedup`, poi commit, poi proponi il rilascio con una prova a mano consigliata, perché lo smoke test non copre la UI.

Quando proponi il rilascio, scrivi la sequenza: `/custom-changelog` → `/custom-commit` → `/custom-ampush` → `/custom-publish` → commit del bump → push. **`/custom-publish` e il push li lancia sempre l'utente**: tu li prepari e li ricordi, non li esegui.

**Dopo la pubblicazione su npm** ricorda all'utente il passo sul marketplace (`docs/marketplace-page-standard.md`, sezione 6): in **My Tools** (powerplatformtoolbox.com/tools) la riga del tool deve mostrare la nuova versione; se dopo circa 30 minuti mostra ancora la vecchia, **More → Trigger Update**; poi controllare logo, descrizione e README sulla pagina pubblica. Un tool in "Needs Changes" si sistema con una nuova versione e **Resubmit**. La sezione Updates del README si aggiorna solo dopo la pubblicazione.

## Test: niente è finito senza (Constitution — Testing Standard)

Non dichiarare finita una modifica al codice finché non l'hai provata tu, con questi passi (in ``):

- **A ogni modifica al codice**: `npx tsc --noEmit`, `npm run build` e `npm test` (≈40 s). Se falliscono, lo dici così com'è: mai "dovrebbe funzionare".
- **Una funzione o un comportamento nuovo** ha la sua **matrice di test** (tutte le combinazioni delle sue dimensioni, oppure tutte le coppie + campioni con seme fisso), con un **oracolo scritto dalla spec**, e i **test negativi** di tutto ciò che verifica. Se tocca la schermata, anche il percorso in jsdom.
- **Un difetto segnalato dall'utente** si riproduce con un test che fallisce **prima** della correzione; il test resta.
- **Dopo aver cambiato logica**: `npm run test:mutation` (filtrabile per parola, es. `node scripts/mutation-check.mjs versione`). Un difetto che sopravvive vuol dire un test mancante: lo aggiungi e lo rilanci. Aggiungi le mutazioni della funzione nuova a `scripts/mutation-check.mjs`.
- **Prima di proporre un rilascio**: `npm run test:full` e `npm run test:mutation` interi.
- Dì sempre **che cosa i test non coprono** (i pixel, il comportamento vero di Dataverse) e metti quel controllo nel quickstart della specifica.
- Mentre gira `test:mutation` non toccare `src`: lo script altera i file e li ripristina.

## Specifiche per ogni funzione

Ogni funzione nuova ha la sua cartella `specs/NNN-nome/` (spec, plan, research, data-model, quickstart, tasks, checklist, contracts se serve) e una riga in `specs/README.md`. Se nasce da una segnalazione, la spec la cita; ogni requisito ha codice e test nella tabella di tracciabilità di `tasks.md`. Una funzione costruita prima della specifica si documenta subito dopo, senza chiedere.

## Regole di commit

- Mai `git push`, amend o reset senza richiesta esplicita.
- Messaggi in Conventional Commits, con gli scope definiti in `/custom-commit`.

## Proporre nuove skill

Tieni d'occhio i pattern ripetuti. Se noti uno di questi casi, **proponi tu** una nuova skill, a fine risposta e senza crearla finché l'utente non dice di sì:

- l'utente lancia a mano più volte (2-3+) lo stesso comando o la stessa sequenza di comandi/prompt;
- tu stesso ripeti ogni volta gli stessi passaggi (es. build + smoke + controllo di un file);
- durante il lavoro emerge un'attività ricorrente che oggi non è coperta da nessuna skill.

Formato: "Secondo me conviene creare la skill `/custom-xxx` perché …" con una riga su cosa farebbe e se la renderesti automatica o manuale. Non riproporre una skill già rifiutata.
