# Research: Publish on import per agent

**Feature**: `003-per-agent-publish-on-import` | **Date**: 2026-10-18

## §1 — Perché per agent

Il valore dipende dalla storia dell'agent: uno già pubblicato in DEV ha `publishOnImport: true`; uno appena creato non ha la chiave né i canali. Un valore unico per la solution obbliga a scegliere il compromesso peggiore per qualcuno. **Decision**: una scelta per agent; il "per tutti" è un gesto di comodo, non un modello diverso.

## §2 — Dal menu a tendina al toggle

Tre iterazioni, ciascuna scaturita da un'osservazione reale dell'utente:

1. **Menu a tendina per riga + interruttore generale in Options** → scartato: la scelta è nascosta dietro un clic, e l'interruttore in fondo aveva perso significato ("Default (Leave as is)" nelle righe era un concetto in più).
2. **Toggle per riga + "all:" nell'intestazione della colonna** → scartato: le azioni globali stavano *sopra* e a destra, mentre le colonne restavano a sinistra.
3. **Toggle per riga + ultima riga della stessa tabella** → adottato. Essendo nella stessa tabella a layout fisso e nella stessa colonna, l'allineamento è garantito **per costruzione**, non per padding.

## §3 — Il toggle "per tutti" deve dire la verità

Primo tentativo: pulsanti di sola azione, mai accesi. L'utente: *"non si illuminano e non si vede la selezione se clicchi, non rimane selezionato"*. **Decision**: acceso quando tutti gli agent **spuntati** hanno lo stesso valore; gli esclusi non contano; spento se misti o nessuno spuntato. Il modello della suite ne ricalcola lo stato a ogni passo.

## §4 — L'anteprima mostrava il valore sbagliato

Il pannello leggeva il valore del package **come esportato**: con *Force yes* un agent con chiave assente mostrava `not specified` mentre la tabella dei cambi diceva `true`, sembrava che l'opzione fosse ignorata. Poi, mostrando `not specified → yes`, il pannello leggeva come un diff duplicato. **Decision**: mostrare **solo il valore finale**; il valore di partenza è già nella tabella dei cambi (regola del progetto: mai ripetere un dato già visibile nella stessa schermata).

## §5 — La verifica non rileggeva il valore

`verifyZip` confermava solo i nomi in `bot.xml`. Un `publishOnImport` finito nel file sbagliato, scambiato tra due agent o non scritto sarebbe passato. **Decision**: `verifyZip` riceve i valori attesi per `configuration.json` e li riconfronta; la suite include i casi che deve respingere.

Lo stesso lavoro ha scoperto che il confronto byte-per-byte ignorava una differenza di lunghezza quando la più corta era prefisso dell'altra (entry con byte in coda contata come identica): corretto e coperto.

## §6 — Non verificato

- Come Dataverse tratta `publishOnImport` assente o forzato all'import: non documentato da Microsoft. Verifica da fare in UAT con un package a valori diversi.
