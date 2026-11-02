# Specifica 019 — Interfaccia enterprise: stepper, sezioni ripiegabili con info e diff del package

**Estende**: 018 (schermate sobrie e pipeline viva), 001 (l'anteprima: «What gets changed»). **Nasce da**: la prova a mano della 018 (2026-11-02): l'utente ha apprezzato la pipeline numerata e ha chiesto «un ultra upgrade» dello stile: più bello, più immediato, più facile da capire e da usare.
**Stato**: In corso.

## Il problema
1. L'indicatore dei passi in alto (Suffix · Review · Preview · Checks · Result) ha cerchi piccoli e la pagina corrente si distingue poco.
2. Ogni schermata è una pila di riquadri sempre aperti: lunga da scorrere, e nulla dice a cosa serve ciascun riquadro.
3. «What gets changed» elenca i cambi in una tabella (Before / After). Chi conosce l'editor di diff di Visual Studio Code si aspetta di vedere **il file com'era e com'è**, a sinistra e a destra, con rosso e verde.

## Decisioni (2026-11-02, richieste dell'utente)
- **D1**: sezioni **ripiegabili** (accordion) su tutte le schermate; dove ci sono due viste dello stesso dato (diff e tabella) una **scheda** (tab).
- **D2**: un'**icona info** su ogni sezione spiega in una o due frasi cosa fa.
- **D3**: la pagina corrente dello stepper è la più evidente (cerchio più grande, anello e bagliore), come nel Package Developer.
- **D4**: il diff mostra i file **veri**: il contenuto originale dell'export e quello dopo la patch, riga per riga, in due colonne.

## User Story
Chi apre l'anteprima vede subito dove si trova (stepper), apre solo le sezioni che gli servono, legge nell'icona info a cosa serve ciascuna e, per ogni agent, vede nel diff esattamente quale riga del file cambia, in rosso prima e in verde dopo.

## Requisiti
**Stepper**
- **FR-001**: Lo stepper mostra cinque cerchi numerati, collegati da una linea. Il passo corrente ha il cerchio **più grande**, con anello e bagliore e l'etichetta in evidenza; i passi fatti hanno la spunta verde e la linea che li lega è piena; quelli da fare sono spenti.
- **FR-002**: Il passo corrente è riconoscibile anche senza colore (dimensione, numero, `aria-current="step"`). Con `prefers-reduced-motion` nessuna animazione.

**Sezioni ripiegabili**
- **FR-003**: Ogni riquadro con titolo ha un'intestazione cliccabile che lo ripiega e lo riapre, con un chevron che ruota e `aria-expanded`. I controlli dentro l'intestazione (pulsanti, interruttori, selettori) NON ripiegano il riquadro.
- **FR-004**: Lo stato aperto/chiuso di ogni sezione si conserva mentre l'utente cambia schermata e torna indietro, nella stessa sessione. Di partenza sono ripiegate solo le sezioni di sola consultazione: «Artifacts» (Suffix) e «Package contents» (Controlli) se non ci sono componenti extra.
- **FR-005**: Ogni riquadro ha un'icona info accanto al titolo. Il clic apre sotto l'intestazione una striscia con la spiegazione (una o due frasi) e lo richiude al clic successivo; `aria-expanded` e `aria-controls`. Il testo è testo, mai HTML.
- **FR-006**: Ripiegare non perde nulla: il contenuto resta nella pagina (nascosto), quindi i dati inseriti e i controlli mantengono il loro stato.

**Diff del package**
- **FR-007**: In «What gets changed» ogni agent ha una scheda **Diff** (di partenza) e una scheda **Table** (la tabella Before / After / State di prima, invariata).
- **FR-008**: Il diff mostra, per ogni file modificato dell'agent, le righe del file originale (sinistra) e del file patchato (destra), **numerate**, con le righe tolte in **rosso** e quelle aggiunte in **verde**, e il tratto che differisce evidenziato dentro la riga. Le righe non modificate intorno al cambio (tre per lato) sono grigie; le altre sono sostituite da una riga «N unchanged lines».
- **FR-009**: Il diff è calcolato sui byte veri dell'export e del patch (`applyPatch`), non ricostruito dalla tabella.
- **FR-010**: Un interruttore **Split | Unified** passa dalle due colonne a una sola colonna con le righe tolte sopra quelle aggiunte.
- **FR-011**: Il diff di un file lungo mostra al massimo 80 righe di modifica; il resto è riassunto con «N more changed lines». Una riga più lunga di 220 caratteri si scorre in orizzontale dentro il suo riquadro, senza allargare la pagina.
- **FR-012**: Un cambio con stato «no-change» non produce diff: la scheda dice che il file non cambia. Il testo del file è sempre trattato come testo (nessun HTML eseguibile).
- **FR-013**: Il diff e la tabella parlano dello stesso Target mostrato (selettore dei Target dell'anteprima).

**Aspetto**
- **FR-014**: Riquadri, tessere di riepilogo e diff usano gli stessi colori e raggi, in tema scuro e chiaro; il diff usa i colori dell'editor (rosso/verde) leggibili in entrambi i temi.

## Fuori ambito
- Cambiare cosa fa il tool, i dati salvati, il package, il manifest o Dataverse.
- Un editor di diff completo (ricerca, navigazione tra i cambi, modifica): è sola lettura.
- I pixel, i colori esatti e le animazioni: prova a mano, vedi `quickstart.md`.
