# Research: Processo di rilascio

**Feature**: `007-release-process` | **Date**: 2026-10-18

## §1 — Che cosa faceva `publish-package`

`"publish-package": "npm run build && npm run version-stable && npm publish --access public"` con `version-stable = npm version patch --no-git-tag-version`. Alza **sempre** la patch, a prescindere dal contenuto: il numero non racconta niente, e non c'è un posto dove l'utente legga che cosa porta una versione. **Decision**: la versione si decide dal contenuto (changelog) e il comando di pubblicazione la usa; lo script resta ma non si usa.

## §2 — Stato reale delle versioni

Il 2026-10-16 il pacchetto è stato rinominato (`@vincenzosgueradev/copilot-agent-nameplate` → `…/pptb-copilot-nameplate`) e la versione è tornata a 1.0.0 (nome nuovo, prima pubblicazione). Per questo il changelog inizia con 1.0.0 e la 1.1.0 è la prima voce "in avanti". La 1.0.1 prevista inizialmente è diventata **1.1.0**: dentro c'era una funzione nuova e compatibile (SemVer: MINOR), non solo fix.

## §3 — Tre casi per decidere cosa scrivere

Quando `/custom-changelog` parte, `package.json` rispetto all'ultima voce può essere:

| Caso | Significato | Azione |
|---|---|---|
| maggiore | la versione da rilasciare non ha ancora la voce | nuova sezione |
| uguale | quella versione è già pubblicata | nuova sezione con **numero deciso** dalla skill |
| minore | la voce è stata scritta in anticipo, non ancora pubblicata | **aggiorna** la voce |

Il terzo caso era stato dimenticato nella prima stesura della skill e corretto subito dopo, quando si è visto che la voce 1.1.0 sarebbe stata già "avanti" rispetto a `package.json`.

## §4 — L'intervallo dei commit

Nel repository non ci sono tag. Si ricava il commit che ha introdotto l'ultima intestazione con `git log -S"## [x.y.z]" -- CHANGELOG.md`, e da lì `git log <hash>..HEAD`. Per il terzo caso si parte dall'intestazione *precedente*. **Decision**: nessun tag per ora; se si introducono, la skill si semplifica.

## §5 — Quando proporre un rilascio

Una tabella (in `CLAUDE.md`) che lega il tipo di cambio alla versione e al momento: un bug che produce **risultati sbagliati o incoerenti** merita PATCH subito; una funzione completa e visibile MINOR; un cambio che tocca dati salvati, formato o un'opzione esistente MAJOR (o MINOR con Upgrade notes se compatibile); più fix piccoli o la fine di una fase PATCH; solo documentazione, chore, refactor interno nessun rilascio. Se il codice è stato **stravolto**: prima `/custom-types` e `/custom-dedup`, poi commit, poi la proposta, con una prova a mano consigliata.

## §6 — Perché non automatizzare la pubblicazione

Pubblicare su npm è irreversibile e ha effetti all'esterno; in più può richiedere un codice a due fattori che non si deve aggirare. **Decision**: la skill prepara e verifica, e l'utente preme il pulsante finale (conferma esplicita). Il push segue la stessa regola (preferenza del progetto: push su entrambi i remote, deciso dall'utente).

## §7 — Collegamento con la qualità

Dal 2026-10-18 i controlli di `/custom-publish` includono `npm test`, `npm run test:full` e `npm run test:mutation` (spec 006): una pubblicazione non parte con un test rosso o con un difetto che i test non scoprono.

## §8 — Non verificato

- L'esecuzione di `/custom-publish` end-to-end non è stata ancora provata su una vera pubblicazione.
- Il percorso dal pacchetto npm al marketplace PPTB non è descritto nella documentazione del progetto.
