# Quickstart: validare icona e descrizione

> **Aggiornamento 2026-10-18**: la descrizione dell'agent è stata **tolta dal requisito** (spec.md, FR-004/FR-010 ritirati). Dove questo documento parla di descrizione, la parte non è implementata: resta come riferimento.

**Feature**: `008-agent-icon-and-description` | Prerequisito: una solution con almeno tre agent: uno con icona personalizzata, uno con quella predefinita, uno con una **descrizione** scritta in Copilot Studio.

## D0 — Dove sta la descrizione ✅ *fatto il 2026-10-18*

Scritta una descrizione su `agenteTool2` e `agenteTool3`, export, ricerca del testo in tutti i file.

**Risultato**: ✅ compare solo in `botcomponents/<agent>.gpt.default/botcomponent.xml`, elemento `<description>` (research §2). Resta da provare la **lettura via Web API** (T002).

## I1 — L'icona

1. Aprire la solution nel tool.

**Atteso**: ✅ accanto al nome compare l'icona di Copilot Studio; ✅ per l'agent senza icona valida, quella generica; ✅ le righe non si spostano quando le icone si riempiono.

## I2 — La descrizione

**Atteso**: ✅ sotto il nome, una riga troncata; ✅ passando il mouse, il testo intero; ✅ senza descrizione "No description" in grigio.

## I3 — Lo stesso aspetto in tutte le liste

1. Aprire il rename.

**Atteso**: ✅ la tabella degli agent ha le stesse icone; ✅ la revisione mostra l'icona piccola; ✅ i risultati di ricerca la mostrano nel chip.

## I4 — Costo

1. Con il log aperto, aprire una solution di 3 agent in un ambiente con molti agent.

**Atteso**: ✅ una sola lettura, solo per quei 3 agent; ✅ riaprendo la stessa solution senza modifiche non si rilegge.

## I5 — Se la lettura fallisce

1. Togliere temporaneamente il permesso di lettura della colonna, o simulare l'errore.

**Atteso**: ✅ le liste funzionano con icone generiche e "No description"; ✅ un avviso nel log; ✅ il rename non cambia.

## I6 — Nessuna traccia nel package

**Atteso**: ✅ `bot.xml` dell'artefatto ha l'`<iconbase64>` identico a quello dell'export; ✅ manifest e storico non contengono né immagini né descrizioni.

## Verifica automatica

`npm test` coprirà: la matrice di validazione (icona buona, vuota, non PNG, base64 non valido, troppo lunga, con prefisso `data:`, con a capo), la normalizzazione della descrizione (HTML, a capo, lunghezza), l'`<img>` presente solo per icone valide, la lettura limitata alla solution aperta, la cache, il fallimento della lettura.

## Non coperto dai test (manuale)

| Che cosa | Dove |
|---|---|
| L'icona coincide con quella di Copilot Studio | I1 |
| La lettura reale via Web API di icona e descrizione | T002 |
| L'aspetto (dimensioni, troncatura) | I1–I3 |
