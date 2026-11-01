# Data model 015

Nessun dato nuovo. Nessuna impostazione salvata, nessun campo nel package, nel manifest o nello storico.

La nota e il banner leggono lo stato già in memoria:

| Dato | Da dove | Uso |
|---|---|---|
| `Solution.isManaged` / `exportable` | `services/solutions.ts` (lettura di `ismanaged`) | conteggi per tipo, tooltip, banner |
| conteggi per tipo (`unmanaged`, `managed`, `all`) | `typeCounts()` sul pool visibile (con agent, non di sistema) | quale nota |
| filtro attivo | `effectiveFilter()` | quale nota |
| `state.connectionName` | `toolbox.connections.getActiveConnection()` | nome dell'ambiente nel testo |
