# Agent Rename Manager — istruzioni per Claude

## Suggerire le skill al momento giusto

L'utente si dimentica quando usare le skill custom. Quando il contesto lo rende opportuno, **dillo tu**, a fine risposta, con una riga tipo:
"Secondo me ora conviene lanciare `/custom-xxx` perché …" (se serve, anche più skill in ordine).

Non lanciare tu le skill manuali: suggeriscile e aspetta il via dell'utente. Non ripetere lo stesso suggerimento se è già stato ignorato nella stessa sessione.

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
