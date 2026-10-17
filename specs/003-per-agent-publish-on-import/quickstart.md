# Quickstart: validare il publish on import per agent

**Feature**: `003-per-agent-publish-on-import` | Prerequisito: solution con tre agent: uno già pubblicato (`true`), uno mai collegato a Teams, uno qualunque.

## P1 — Valori indipendenti

1. Nel passo del suffisso: primo agent *Force no*, secondo *Force yes*, terzo *Leave as is*.
2. Costruire e salvare il package.

**Atteso**: ✅ nello zip i tre `configuration.json` hanno `false`, `true` e il valore di partenza; ✅ nessun'altra chiave è cambiata; ✅ la verifica è tutta verde.

## P2 — "Per tutti" dice la verità

1. Premere *Force yes* nell'ultima riga della tabella.

**Atteso**: ✅ tutte le righe accese su *Force yes* e il toggle "per tutti" acceso; ✅ cambiando una riga il toggle "per tutti" si spegne; ✅ togliendo la spunta all'agent diverso si riaccende.

## P3 — L'anteprima mostra il valore finale

1. *Force yes* su un agent con `publishOnImport` assente → anteprima.

**Atteso**: ✅ `Publish on import: yes` (non `not specified → yes`); ✅ l'avviso su Teams/M365 nomina solo gli agent che non pubblicheranno.

## P4 — La verifica respinge

1. Con uno zip modificato a mano (valore scambiato tra due agent) eseguire `npm test`: i test di `verify.test.ts` lo coprono.

**Atteso**: ✅ `patchedValuesConfirmed = false`.

## P5 — Da fare in UAT *(non automatizzabile)*

1. Importare un package con valori diversi e osservare quali agent si ripubblicano.
2. Annotare l'esito in research §6.
