# Quickstart: validare la versione in DEV

**Feature**: `004-source-version-in-dev` | Prerequisito: una solution unmanaged in DEV (es. `1.0.0.2`), un utente con privilegio di modificarla.

## V1 — Il caso normale ✅ *verificato il 2026-10-18 su un DEV reale*

1. Aprire la solution → *Set the suffix* → suffisso `UAT`. L'opzione **Raise the version in DEV** è accesa e propone `1.0.0.3`.
2. Proseguire fino al salvataggio.

**Atteso**: ✅ in DEV la solution è `1.0.0.3` (da guardare nella lista delle solution); ✅ il package ha `<Version>1.0.0.3</Version>`; ✅ il file si chiama `…_1_0_0_3_managed_UAT.zip`; ✅ il manifest ha `versionChange`.

## V2 — L'errore originale non si ripresenta

1. Importare il package in UAT come **Upgrade**: riesce.
2. Rifare l'operazione in DEV: il campo propone `1.0.0.4`, non `1.0.0.3`.

**Atteso**: ✅ nessun errore "must have a higher version"; ✅ gli agent cancellati in DEV spariscono da UAT.

## V3 — Versione sbagliata

1. Scrivere `1.0.0.2`, poi `abc`, poi vuoto.

**Atteso**: ✅ Next spento, messaggio sotto il campo, il testo sotto l'opzione invita a correggere; ✅ con una versione valida si riabilita.

## V4 — Non esportare se non si riesce a scrivere

1. Con un utente senza il privilegio, o alzando la versione in DEV da un'altra scheda subito prima di *Build the package*.

**Atteso**: ✅ messaggio chiaro nell'anteprima; ✅ nessun export; ✅ nessun artefatto.

## V5 — Non alzare due volte

1. Costruire; tornare indietro di due passi; cambiare una scelta; ricostruire.

**Atteso**: ✅ DEV resta a `1.0.0.3`; ✅ la nota dice *"DEV was already at 1.0.0.3: nothing was written"*.

## V6 — Lo stesso package per PROD

1. Dopo UAT, nuova operazione con suffisso `PROD` e l'opzione **spenta**.

**Atteso**: ✅ nessuna nuova scrittura; ✅ `…_1_0_0_3_managed_PROD.zip`.

## Verifica automatica

`npm test` copre V1–V6 con un DEV finto (ordine scrittura→export, una sola scrittura, errori, manifest, storico, zip). Resta manuale il privilegio reale.
