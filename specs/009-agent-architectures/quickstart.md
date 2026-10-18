# Quickstart: validare le architetture

**Prerequisito**: una solution con almeno un agent classico e uno harness.

## A1 — Nessun avviso
Costruire un package. **Atteso** ✅ la schermata *Verifica* non mostra "Package format"; ✅ il log non ha avvisi di baseline.

## A2 — Il rename dell'harness
Rinominare con un suffisso. **Atteso** ✅ nome `<base> [<suffisso>]` anche per l'harness; ✅ `bot.xml` è l'unico file cambiato per quell'agent (più `configuration.json` se si forza `publishOnImport`).

## A3 — Import
Importare in UAT. **Atteso** ✅ l'agent harness ha il nome nuovo; ✅ risulta pubblicato dall'import. *(Fatto il 2026-10-18.)*

## Verifica automatica
`npm test`: `architectures.test.ts` (matrice 1-3 agent × architettura × collegato × publish, negativi, precedente, rename).

## Non coperto dai test
| Che cosa | Dove |
|---|---|
| Come il nome compare nei canali per l'agent harness | manuale in Teams / M365 Copilot |
| Una chiave di piattaforma davvero nuova | si vedrà al primo avviso, col nome dell'architettura |
