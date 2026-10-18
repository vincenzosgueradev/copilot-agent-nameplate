# Research: pin delle solution

- **Dove salvare** — Decisione: `settings` di PPTB (come `packagingHistory`). Alternative scartate: `localStorage` (legato al pannello, usato solo per lo stato del log); Dataverse (vietato: nessuna scrittura, e il pin è personale).
- **Come ordinare** — Decisione: partizione stabile dopo `compareSolutions`. Alternativa scartata: dare peso al pin dentro il comparatore, che però inverte il segno con la direzione `desc` e farebbe scendere i pin.
- **Identità** — Decisione: `uniqueName`. Alternativa scartata: `solutionId`, diverso per ambiente e perso se la solution viene reimportata.
- **Chiave d'ambiente** — Decisione: nome della connessione attiva (già in `state.connectionName`). Alternativa: URL dell'ambiente, non letto oggi dallo strumento. Da confermare in T001.
- **Indicatore** — Decisione: icona a maschera CSS con `currentColor` (come la 010), niente emoji.
