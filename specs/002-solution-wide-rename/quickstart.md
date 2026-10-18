# Quickstart: validare il rename a livello di solution

**Feature**: `002-solution-wide-rename` | Prerequisito: una solution unmanaged in DEV con almeno due agent.

## S1 — Il difetto originale non si riproduce

1. Creare `agente1 [DEV]` e `agente2 [DEV]` nella stessa solution.
2. Aprire la solution → *Set the suffix* → digitare `UAT` → proseguire fino al salvataggio.

**Atteso**: ✅ entrambi gli agent nel package sono `… [UAT]`; ✅ nessun agent da scegliere "uno alla volta".

## S2 — Esclusione esplicita

1. Nello step del suffisso togliere la spunta ad `agente2`.
2. Proseguire: la revisione ha una riga, l'anteprima un blocco e "Left as they are: agente2 [DEV]".

**Atteso**: ✅ al salvataggio compare la conferma *"The agents would have different suffixes"*; ✅ annullando non si scrive nulla; ✅ confermando, il manifest ha `excluded: true` per `agente2` e la conferma registrata.

## S3 — Nessun falso allarme

1. Creare un agent **già col suffisso** (`agente3 [DEV]` dal portale) e uno **mai collegato** a Teams.
2. Costruire il package.

**Atteso**: ✅ nessun avviso "il nome compare in posti sconosciuti"; ✅ nessun avviso "il formato differisce".

## S4 — La rete di sicurezza segnala davvero

1. In un export di prova, inserire il display name di un agent nell'elemento `<name>` di un topic.

**Atteso**: ✅ il tool lo segnala come posto sconosciuto e chiede conferma.

## S5 — Ricerca

1. Cercare per nome un agent dall'elenco, cliccare il risultato.

**Atteso**: ✅ si apre la sua solution con la riga evidenziata; ✅ una solution managed non offre il rename.

## S6 — Esclusi con un altro suffisso (a occhio)

1. Aprire una solution con agent `[DEV]`, scrivere il suffisso `UAT`, togliere la spunta ad almeno un agent.

**Atteso**: ✅ la riga di ogni escluso dice `left as it is — keeps [DEV]` in arancione e non va a capo male; ✅ l'avviso in fondo li nomina; ✅ togliendo la causa (suffisso uguale o agent riattivato) l'avviso e le note spariscono. I test non vedono colore e larghezza della cella.

## Verifica automatica

`npm test` (≈40 s) copre S1–S5; `npm run test:full` aggiunge la matrice esaustiva; `npm run test:mutation` controlla che i test scoprano i difetti (spec 006).
