# Feature Specification: Pin delle solution in cima alla lista

**Feature Branch**: `012-pin-solution`

**Created**: 2026-10-18

**Status**: **Implementata** (2026-10-18) · da provare a mano su un DEV vero (T001, T011)

**Input**: Richiesta dell'utente (2026-10-18): *"nuova specifica pin solution cosi anche se cambi ordinamento sta sempre su"*, con lo screenshot della lista Solutions (24 solution unmanaged, ordinate per numero di agent).

## Il problema

Chi lavora ogni giorno su due o tre solution deve ritrovarle a ogni cambio di ordinamento, di tab (Unmanaged / Managed / All) o di ricerca: con 24 solution e più, la solution di lavoro finisce fuori vista.

## User Stories

### US1 — Fissare una solution in cima (P1)
Su ogni riga c'è un controllo pin. Cliccandolo la solution passa al gruppo "fissate", mostrato **sopra** tutte le altre, con l'indicatore di pin visibile.

**Independent Test**: fisso `SmartTable AI`, poi cambio l'ordinamento su ogni colonna in entrambe le direzioni: resta sempre prima delle non fissate.

### US2 — L'ordinamento vale dentro ciascun gruppo (P1)
Con più solution fissate, l'ordinamento scelto si applica **separatamente** al gruppo fissato e a quello non fissato.

**Independent Test**: fisso due solution, ordino per Created: le due fissate sono in ordine di data tra loro, poi le altre in ordine di data.

### US3 — Resta anche con filtri e ricerca (P1)
Il pin non è un filtro: tab e ricerca restano quelli di sempre. Una solution fissata che non corrisponde al tab o alla ricerca non compare, ma resta fissata e riappare in cima quando torna visibile.

### US4 — Togliere il pin (P2)
Lo stesso controllo toglie il pin; la solution torna al suo posto secondo l'ordinamento corrente.

### US5 — Il pin si ricorda (P2)
Dopo aver chiuso e riaperto lo strumento, le solution fissate sono ancora fissate. I pin sono **per ambiente**: fissare in DEV non fissa nulla in UAT.

## Casi limite

- Solution fissata che non esiste più (cancellata, o ambiente diverso): non compare e non produce errori; il pin orfano è ignorato.
- Nessuna solution fissata: la lista è identica a oggi.
- Tutte le solution visibili sono fissate: nessun separatore vuoto.
- Il pin non cambia i conteggi dei tab né i totali della testata.
- Lettura o scrittura della preferenza fallita: la lista funziona senza pin e il log riporta un avviso, senza bloccare.

## Requisiti

- **FR-001**: Ogni riga della lista Solutions DEVE avere un controllo pin/unpin, raggiungibile da tastiera, con etichetta accessibile che dice l'azione ("Pin solution" / "Unpin solution") e `aria-pressed` coerente.
- **FR-002**: Le solution fissate DEVONO precedere sempre quelle non fissate, per qualsiasi colonna e direzione di ordinamento.
- **FR-003**: All'interno di ciascun gruppo DEVE valere l'ordinamento scelto, compreso il criterio di spareggio già in uso.
- **FR-004**: Una solution fissata DEVE avere un indicatore visivo distinto (icona pin con cerchi CSS/glifi base, mai emoji); il controllo su una riga non fissata compare al passaggio del mouse o al focus, e DEVE essere sempre visibile su touch.
- **FR-005**: Il pin NON DEVE alterare filtri, ricerca, conteggi o il contenuto della solution; il click sul pin NON DEVE aprire la solution.
- **FR-006**: I pin DEVONO persistere tra le sessioni, per ambiente, identificando la solution dal nome univoco (stabile tra rinomine del nome visibile).
- **FR-007**: Un pin che non corrisponde a nessuna solution dell'ambiente DEVE essere ignorato in silenzio e NON DEVE essere cancellato finché la solution non è confermata assente da una lista completa.
- **FR-008**: Il pin NON DEVE comparire nel package, nel manifest o nello storico e NON si scrive nulla su Dataverse.
- **FR-009**: L'ordine delle righe NON DEVE saltare né ricaricare i dati quando si fissa o si toglie un pin: la riga si sposta sul posto, con la selezione e lo scorrimento coerenti.

## Key Entities

- **Pin**: l'associazione tra un ambiente e il nome univoco di una solution; nessun altro attributo. L'insieme dei pin è locale a questo dispositivo.

## Criteri di successo

- **SC-001**: In una lista di 24 solution, una solution fissata è la prima riga con ognuna delle 6 colonne di ordinamento, in entrambe le direzioni (12 combinazioni su 12).
- **SC-002**: Fissare o togliere un pin richiede un solo click e la riga si sposta in meno di un secondo percepibile, senza ricaricare la lista.
- **SC-003**: Dopo il riavvio dello strumento, il 100% dei pin dell'ambiente è ancora presente; in un altro ambiente non ce n'è nessuno.
- **SC-004**: Con zero pin la lista è identica, riga per riga, a quella della versione precedente.

## Assumptions

- Il numero di pin non ha un limite: l'uso reale è di poche solution.
- La preferenza vive nelle impostazioni dello strumento (le stesse dello storico), non su Dataverse: è personale e del dispositivo.
- Il pin vale per la lista delle solution; la lista degli agent dentro una solution non cambia.
- Il gruppo fissato non ha un'intestazione propria: bastano l'indicatore e la posizione (nessuna ridondanza in schermata).
- Non coperto dai test automatici: l'aspetto reale del controllo e il passaggio mouse/touch (i pixel); resta nel quickstart.
