# Quickstart: validare perfezionamenti di flusso e layout

**Feature**: `005-flow-and-layout-refinements` | Prerequisito: solution con 4–5 agent. **Questi controlli sono a vista**: i test coprono le regole strutturali, non i pixel.

## L1 — Tabella e toggle

1. Aprire il passo del suffisso.

**Atteso**: ✅ le colonne Agent e Nome risultante occupano ~30% ciascuna; ✅ il toggle del publish riempie la sua colonna, con tre pulsanti uguali; ✅ a destra non resta un vuoto.

## L2 — Azioni per tutti

1. Guardare l'ultima riga della tabella.

**Atteso**: ✅ "Set for all ticked agents" a sinistra, il toggle **sotto** i toggle di riga e con gli stessi tre pulsanti; ✅ nessuna azione globale nell'intestazione.

## L3 — Revisione

1. Premere *Review*.

**Atteso**: ✅ *Rename* e *Options* uno sotto l'altro, a tutta larghezza; ✅ la colonna "Length" non è tagliata; ✅ nessun nome va a capo.

## L4 — Anteprima per agent

1. Escludere un agent, impostare un publish, costruire.

**Atteso**: ✅ un blocco per agent toccato col nome finale e il numero di cambi; ✅ "Left as they are: …" per l'escluso; ✅ la versione compare come nota, non come blocco; ✅ il percorso del file è sotto ogni riga.

## L5 — Le fasi

1. Costruire un package.

**Atteso**: ✅ "Read the packages" e "Patch and verify" si vedono passare una dopo l'altra; ✅ "completed" resta ~2 secondi prima dell'anteprima.

## L6 — Scorrimento

1. Scorrere in fondo una schermata, andare avanti e tornare indietro.

**Atteso**: ✅ ogni schermata riparte dall'alto; ✅ digitare nel suffisso a metà pagina non sposta la pagina.

## Verifica automatica

`npm test` verifica le regole strutturali (classi, colonne, regole CSS, ordine degli elementi, scorrimento simulato, fasi osservate) e `npm run test:mutation` verifica che rompendole i test falliscano.
