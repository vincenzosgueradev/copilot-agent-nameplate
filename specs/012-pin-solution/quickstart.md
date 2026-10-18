# Quickstart: pin delle solution

**Automatici** (in `tools/`): `npx tsc --noEmit`, `npm run build`, `npm test`, `node scripts/mutation-check.mjs pin`.

**A mano su un DEV vero** (i test non coprono pixel, hover/touch e lo store reale):

1. Apri la lista Solutions e fissa `SmartTable AI`: sale in cima con l'indicatore.
2. Clicca ogni intestazione due volte: resta sempre prima.
3. Fissa una seconda solution e ordina per Created: dentro il gruppo fissato vale la data.
4. Cambia tab e cerca un testo che non la contiene: sparisce; azzera: torna in cima.
5. Chiudi e riapri lo strumento: i pin ci sono. Cambia ambiente: non ce n'è nessuno.
6. Togli il pin da tastiera (Tab + Invio/Spazio): la solution torna al suo posto.
7. Verifica che il click sul pin non apra la solution e che tema scuro e chiaro siano leggibili.
