# Research: Perfezionamenti di flusso e layout

**Feature**: `005-flow-and-layout-refinements` | **Date**: 2026-10-18

Ogni voce nasce da una segnalazione con screenshot e ha prodotto una **regola strutturale** verificabile.

## §1 — Piede della tabella e allineamento

*"Li voglio allineati: i pulsanti di sotto sulle tre colonne centrali."* Una barra separata sotto la tabella, con il suo layout, non può allinearsi ai toggle di riga se non per caso. **Decision**: la riga "per tutti" è un `<tr>` in `<tfoot>`: stessa tabella, stessa colonna, stesse classi. Verificato dalla suite: stessi tre pulsanti, stessa classe, `colspan=3` sulla cella a sinistra.

## §2 — Tabella a tutta larghezza

*"Sfrutta full width, è troppo appiccicato."* La tabella era al 100% ma le colonne in `auto` si raggruppavano a sinistra. **Decision**: layout fisso, `colgroup` con 48px / 30% / 30% / resto; il toggle riempie la colonna. **Non misurabile in jsdom**: le quote sono testate, i pixel sono a vista.

## §3 — Revisione a due colonne

*"Fai i componenti full width, non dividere più in due a metà schermata, come in altre pagine: uno sotto l'altro."* `.two-col` tagliava anche la colonna "Length". **Decision**: `.stack`, lo stesso contenitore del passo del suffisso.

## §4 — "What gets changed" per agent

*"Migliora What gets changed per raggruppamenti per agente, più visibilmente organizzato."* La tabella piatta aveva colonne `File / Element / Before / After / State` mescolando agent e solution. **Decision**: un blocco per agent (titolo, schema, numero di cambi) con righe *What / Before / After / State* e il file sotto la riga; la versione diventa una nota perché non è un cambio del package (spec 004).

## §5 — Le fasi che "scattano insieme"

*"Tra gli ultimi due step metti un delay visivo, perché scattano insieme."* Lettura e patch sono calcoli sincroni di pochi millisecondi: il render non ha il tempo di mostrarli. **Decision**: pausa di 700 ms dopo ciascuna fase, **solo** quando c'è un ascoltatore dell'avanzamento; "completed" resta 1,8 s (era 900 ms: *"la transizione è brusca"*).

## §6 — Lo scorrimento ereditato

*"Se avevi fatto scroll down e torni poi non si resetta, voglio che parta dal top."* Il contenitore che scorre è lo stesso per tutti gli step. **Decision**: `scrollToTop` in `navigateTo`, **una volta** per cambio di schermata. Un ridisegno sul posto (digitare, cliccare) non passa da lì e conserva la posizione: verificato con un test dedicato.

Tecnica di test: jsdom non fa layout, quindi si **sostituisce `scrollTop`** con un valore memorizzato per simulare l'utente in fondo alla pagina.

## §7 — A capo e margini

- *"Perché uno va a capo?"*: il nome `agenteTool4 [TEST]` superava di pochi pixel una colonna stretta e si spezzava sullo spazio. **Decision**: `white-space: nowrap; max-width: none` sulla cella del nome risultante.
- Il piede del pannello della solution non aveva margini (*"attenzione ai bordi e spazi"*): `.panel-foot` con lo stesso padding dell'intestazione.
- Le descrizioni degli artefatti avevano `max-width: 78ch`: tolto.

## §8 — Lezioni di metodo

- Un test strutturale non sostituisce l'occhio, ma impedisce di perdere una correzione fatta: ogni regola qui sopra ha una mutazione che la rompe (spec 006).
- Vitest sostituisce i `.css` con una stringa vuota anche con `?raw`: i controlli sul CSS leggono il file dal disco.
