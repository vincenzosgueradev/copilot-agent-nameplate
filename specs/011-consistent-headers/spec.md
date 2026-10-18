# Feature Specification: Intestazioni uniformi e senza ripetizioni

**Feature Branch**: `011-consistent-headers`

**Created**: 2026-10-18

**Status**: **Implementata** (2026-10-18)

**Input**: Richiesta dell'utente (2026-10-18), con tre screenshot (anteprima del package, elenco delle solution, solution aperta): *"sistema migliora e standardizza un po' header e controlla su app se ci sono info stra ridondanti"*. Regole già in memoria: niente dati ripetuti nella stessa schermata, etichette esplicite (spec 005).

## Il problema

Le tre intestazioni a tile avevano **etichette diverse per lo stesso dato** e **dicevano due volte la stessa cosa**, e una parte era in italiano in un'interfaccia inglese.

| Dove | Cosa non andava |
|---|---|
| Elenco delle solution | tile **Managed 0** + scheda **Managed 0**; tile **Solution 24** + scheda **All 24** |
| Solution aperta | `Versione` e `Creata` in italiano; sottotitolo "5 agents · testAgentTool" che ripete il numero di agent (tile **Agent 5**) e il nome della solution (titolo identico) |
| Anteprima | `Versione` in italiano; tile **Solution** che ripete il nome già nel percorso e nel titolo; `Entry` e `Export` poco chiari |
| Percorso (breadcrumb) | `Verifica` e `Risultato` in italiano, mentre il passo si chiama **Checks** e **Result** |

## Audit: cosa si è guardato e cosa si è lasciato

| Controllo | Esito |
|---|---|
| Etichette delle tile in tre posti | **uniformate** (stesso componente, inglese) |
| Conteggi ripetuti elenco ↔ schede | **tolta** la tile *Managed*; restano i totali Solutions e Agents |
| Nome e numero ripetuti nella solution aperta | **tolti** dal sottotitolo |
| Solution ripetuta in anteprima | **tolta** la tile |
| Lingua del percorso | **uniformata** ai nomi dei passi |
| Schermata del risultato: nome del file di importazione in evidenza *e* nella tabella, chip "managed" due volte | **lasciato**: la sintesi in alto e il dettaglio sotto servono a due letture diverse |
| Testi del log in italiano ("completato in", "modifiche") | **non toccati** (fuori ambito, vedi sotto) |

## Requisiti

- **FR-001**: Tutte le intestazioni a tile (elenco delle solution, solution aperta, anteprima) DEVONO essere prodotte dallo stesso componente (`statsHtml`), che mette in escape ogni campo.
- **FR-002**: Le etichette DEVONO essere in inglese: elenco **Solutions, Agents**; solution aperta **Version, Publisher, Agents, Created**; anteprima **Version, Publisher, Entries, Export time**.
- **FR-003**: Un dato NON DEVE comparire due volte nella stessa schermata: il tipo (managed/unmanaged) non si ripete nelle tile dell'elenco; il numero di agent non sta nel sottotitolo della solution aperta; il nome della solution non sta nelle tile dell'anteprima.
- **FR-004**: Il sottotitolo della solution aperta DEVE dire il tipo (*Managed solution* / *Unmanaged solution*) e, solo se diverso dal titolo, il nome univoco. Un gruppo di agent senza solution, che non ha tile, DEVE dire quanti agent sono.
- **FR-005**: Le voci del percorso DEVONO avere gli stessi nomi dei passi (**Checks**, **Result**).
- **FR-006**: Nessuna schermata del flusso DEVE contenere parole italiane di interfaccia.

## Criteri di successo

- **SC-001**: Le etichette delle tre intestazioni sono quelle di FR-002 in ogni test di schermata.
- **SC-002**: Nessuna ripetizione di FR-003 in nessun caso: nome univoco uguale o diverso dal titolo, solution managed, agent senza solution.
- **SC-003**: Un valore con HTML in una tile resta testo.
- **SC-004**: Le 8 mutazioni (011) sono scoperte.

## Fuori ambito

- I testi del **log** (in parte italiani): da decidere a parte, perché il log è anche un'esportazione (CSV/JSON).
- Il layout, i colori e la dimensione delle tile.
- La schermata di risultato (vedi audit).
