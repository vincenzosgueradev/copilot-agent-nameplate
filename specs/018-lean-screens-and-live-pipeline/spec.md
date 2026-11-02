# Specifica 018 — Schermate sobrie, popup con icone e pipeline viva

**Estende**: 001 (la revisione), 013 (avviso «nessun suffisso»), 016 (Targets). **Nasce da**: la prova a mano della 016 (2026-11-02), con quattro segnalazioni dell'utente: «le schermate sono troppo verbose», «è ridondante, non solo in questa schermata», «il popup si può migliorare e arricchire con icone enterprise», «la pipeline di export è spenta e morta».
**Stato**: In corso.

## Il problema
1. La **revisione** ripete gli agent che l'utente ha già visto uno a uno nel passo Suffix (colonna «Name after the rename»), con un selettore di Target solo per cambiare quale elenco guardare. Sotto, quattro righe di «What happens next» che dicono cose già dette altrove.
2. Altre schermate dicono due volte la stessa cosa (stesso fatto in un riquadro, in un titolo e in una frase).
3. I **popup** sono blocchi di testo senza gerarchia: un elenco di righe nude, una tabella, un paragrafo lungo.
4. La **pipeline** di export è una riga di puntini piatti: non si capisce quanti passi sono, né a che punto si è.

## Decisioni (2026-11-02, scelte dell'utente)
- **D1**: la tabella degli agent esce dalla revisione; restano solo gli avvisi che servono. Il selettore dei Target esce dalla revisione (resta nell'anteprima e nei controlli, dove cambia davvero cosa si vede).
- **D2**: la pulizia dei testi riguarda **tutte** le schermate; ciò che si toglie è elencato in `research.md`.

## User Story
Chi arriva alla revisione vede subito quanti package escono e se c'è qualcosa di strano, senza rileggere gli agent. Chi conferma un popup capisce a colpo d'occhio dove scrive e che cosa cambia. Chi aspetta l'export vede i passi numerati e quello in corso che si ingrandisce.

## Requisiti
**Revisione**
- **FR-001**: La revisione NON DEVE elencare gli agent né mostrare il selettore dei Target. Mostra la solution, la tabella dei package (una riga per Target spuntato, anche se è uno solo) e le opzioni.
- **FR-002**: Per ogni Target spuntato la revisione DEVE dare, in una riga breve ciascuno, gli avvisi che restano: nomi oltre i 30 caratteri del manifest Teams (con il conto), nessun cambio di nome, suffissi misti nello stesso ambiente. Con più Target l'avviso dice di quale; con uno solo no. Nessun avviso se non c'è nulla di strano.
- **FR-003**: Le opzioni dicono la versione, quanti archivi escono e, in una sola riga, se si scrive su Dataverse. Niente elenco «What happens next».

**Popup**
- **FR-004**: Ogni popup ha nell'intestazione un'icona (maschera CSS come le altre icone: l'host non disegna l'SVG inline) scelta dal tipo (avviso, scrittura su un ambiente, conferma). Le righe «ambiente / solution / versione» hanno ciascuna la sua icona e un'etichetta. Il testo sotto è al massimo una frase di ambito e una di come tornare indietro.
- **FR-005**: Il popup «un Target senza suffisso» e quello «cambia la versione» NON DEVONO ripetere la tabella dei package se la revisione la mostra già un passo prima: la sostituiscono con una riga («3 package, uno per Target»).

**Pipeline**
- **FR-006**: I passi dell'export sono **numerati** in cerchi collegati da una linea. Il passo in corso è più grande e pulsa; i passi fatti mostrano la spunta e la linea che li lega si riempie. Il tempo trascorso resta visibile.
- **FR-007**: Con `prefers-reduced-motion` le animazioni si spengono e resta il cambio di stato.
- **FR-008**: Il passo in corso, quelli fatti e quelli da fare restano riconoscibili anche senza colore (numero, spunta, dimensione).

**Pulizia**
- **FR-009**: Nessuna schermata ripete lo stesso fatto in due punti. Le frasi tolte sono in `research.md`.

## Fuori ambito
- Cambiare cosa fa il tool, i dati salvati, il package o il manifest.
- I pixel (spaziature, colori, animazioni): prova a mano, vedi `quickstart.md`.
- Cambiare il passo Suffix, che è dove l'utente verifica i nomi.
