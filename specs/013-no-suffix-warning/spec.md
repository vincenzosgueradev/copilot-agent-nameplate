# Specifica 013 — Avviso "nessun suffisso"

**Estende**: 002 (suffisso unico per la solution). **Nasce da**: richiesta dell'utente durante la prova su DEV.

## Il problema
Con il campo Suffix vuoto, "Review" andava avanti in silenzio e il suffisso esistente veniva **tolto** da tutti gli agent selezionati. È lecito, ma sorprende chi ha solo dimenticato di sceglierne uno.

## User Story
Chi preme Review senza suffisso vede un avviso chiaro: che cosa succede ai nomi (prima → dopo, con tutti gli agent) e due scelte, tornare a sceglierlo o continuare senza.

## Requisiti
- **FR-001**: Premendo Review con il suffisso vuoto (spazi compresi) DEVE comparire un dialogo di avviso prima di cambiare schermata.
- **FR-002**: Il dialogo DEVE dire se il suffisso esistente viene tolto (e da quanti agent) oppure se i nomi restano com'è, e elencare **tutti** gli agent interessati (prima → dopo); la lista scorre dentro il dialogo se è lunga.
- **FR-003**: "Go back and choose one" DEVE chiudere il dialogo e restare sul passo Suffix; Escape vale come annulla.
- **FR-004**: "Continue without suffix" DEVE proseguire alla revisione senza altro cambio di comportamento.
- **FR-005**: Con un suffisso scritto NON DEVE comparire alcun avviso.
- **FR-006**: Il dialogo usa il dialogo di conferma esistente in variante avviso (cerchio CSS con "!", mai emoji).

## Fuori ambito
I pixel del dialogo (colori, allineamento): prova a mano, vedi `quickstart.md`.
