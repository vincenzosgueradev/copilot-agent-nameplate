# Ricerca 013

- **Comportamento di partenza**: il campo vuoto è ammesso e significa "togli il suffisso" (testo già in pagina: "Leave it empty to remove the existing suffix"). Resta valido: l'avviso non lo vieta, lo rende consapevole.
- **Dialogo**: `askConfirm` già usato per conferme esplicite (FR-074, FR-091, FR-096). Riusarlo mantiene tastiera (Escape, focus) e stile coerenti.
- **Esempi**: si prendono gli agent selezionati che hanno davvero un suffisso (`splitSuffix`), perché sono quelli che cambiano; se nessuno ne ha, si dice che i nomi restano.
- **Nessuna fonte esterna**: nessun valore Dataverse coinvolto.
