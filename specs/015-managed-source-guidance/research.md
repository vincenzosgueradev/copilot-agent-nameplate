# Ricerca 015

- **Perché una managed non si esporta**: lo dice l'API (`ExportSolution` rifiuta una managed) ed è già il comportamento di 001 (FR-068, `exportable = !isManaged`). Qui non cambia: si spiega meglio.
- **Il flusso ALM che l'utente non conosceva**: la solution si sviluppa **unmanaged in DEV**, si esporta managed da lì e **lo stesso file** si importa in UAT e poi in PROD; in UAT e PROD la solution risulta managed perché è il risultato dell'import. Non si esporta mai da UAT.
- **Stato di partenza**: l'elenco aveva già la colonna Type, il filtro Managed/Unmanaged/All e la scelta automatica del tipo che l'ambiente contiene (`effectiveFilter`); il banner esisteva ma non diceva che è normale né come cambiare connessione. Quindi non si ridisegna l'elenco: si aggiungono la nota e il tooltip.
- **Perché la riga resta cliccabile**: dalla riga si vedono gli agent della solution managed; renderla inerte toglierebbe informazione e cambierebbe un comportamento già provato.
- **Perché si attenua solo in All**: in un ambiente solo managed tutte le righe sarebbero attenuate e l'elenco sembrerebbe spento; la nota sopra spiega già la situazione.
- **Cambio di connessione**: il tool usa solo la connessione attiva (1.1.2). Verificato su PPTB il 2026-11-01: si possono avere **più schede** dello stesso tool, ognuna con la sua connessione (DEV e UAT insieme). Il testo dice quindi «open the tool on a connection to…, in another tool tab», non «cambia la connessione», che era fuorviante.
