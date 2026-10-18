# Data model: pin delle solution

Chiave di impostazione `solutionPins`:

```json
{ "<nome connessione>": ["SmartTableAI", "testAgentTool"] }
```

- Valore: elenco di `uniqueName`, senza duplicati. L'ordine dell'elenco non conta per la lista.
- Un ambiente senza pin non ha chiave; l'ultimo pin tolto rimuove la chiave.
- Dati non validi (non è un oggetto, o l'elenco non è di stringhe) = nessun pin, avviso nel log, nessuna cancellazione.
- Non compare nel package, nel manifest né nello storico.
