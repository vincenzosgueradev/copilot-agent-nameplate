# Agent Rename Manager — istruzioni per Claude

## Usare le skill al momento giusto

L'utente si dimentica quando usare le skill custom: decidi tu quando servono, secondo la tabella sotto.

- **Automatiche (le lanci tu senza chiedere)**: `/custom-commit`, `/custom-ampush`, `/custom-types`, `/custom-dedup`. `custom-ampush`, `custom-types` e `custom-dedup` sono di sola analisi/lettura; `custom-commit` chiede comunque conferma del messaggio.
- **Solo su via libera**: `/custom-cleanup` modifica i file, quindi suggeriscila con "secondo me conviene lanciare `/custom-cleanup` perché …" e aspetta l'ok.
- Dì sempre in una riga quale skill hai usato e perché. Non rilanciare la stessa skill se i file non sono cambiati dall'ultima esecuzione.
- Mai fare push automaticamente: `/custom-ampush` dice solo se sei pronto.

| Situazione | Skill da suggerire |
|---|---|
| L'utente vuole committare, o un blocco di lavoro è concluso e ci sono modifiche non committate | `/custom-commit` (questa si può invocare in automatico) |
| Sta per fare push, o ha appena committato e parla di push/PR/consegna | `/custom-ampush` |
| Sono stati cancellati, rinominati o spostati file/moduli (anche da te) | `/custom-cleanup`, poi `/custom-ampush` |
| Refactoring, nuove funzionalità in `tools/src/services/` o più file toccati con logica simile | `/custom-dedup` |
| Modificati `types.ts`, parsing XML/JSON, chiamate alle API PPTB/Dataverse, o comparsi `any`/`@ts-ignore`/errori `tsc` | `/custom-types` |
| Fine di una fase di implementazione speckit | `/custom-types` + `/custom-dedup`, poi `/custom-ampush` e `/custom-commit` |

Ordine tipico a fine lavoro: `/custom-cleanup` (se ci sono stati file rimossi) → `/custom-types` → `/custom-dedup` → `/custom-ampush` → `/custom-commit`.

## Regole di commit

- Mai `git push`, amend o reset senza richiesta esplicita.
- Messaggi in Conventional Commits, con gli scope definiti in `/custom-commit`.

## Proporre nuove skill

Tieni d'occhio i pattern ripetuti. Se noti uno di questi casi, **proponi tu** una nuova skill, a fine risposta e senza crearla finché l'utente non dice di sì:

- l'utente lancia a mano più volte (2-3+) lo stesso comando o la stessa sequenza di comandi/prompt;
- tu stesso ripeti ogni volta gli stessi passaggi (es. build + smoke + controllo di un file);
- durante il lavoro emerge un'attività ricorrente che oggi non è coperta da nessuna skill.

Formato: "Secondo me conviene creare la skill `/custom-xxx` perché …" con una riga su cosa farebbe e se la renderesti automatica o manuale. Non riproporre una skill già rifiutata.
