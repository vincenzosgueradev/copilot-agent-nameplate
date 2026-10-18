# Implementation Plan: colonna Agent type

**Spec**: [spec.md](spec.md) · **Stato**: implementata

## Approccio

Estendere il servizio di sola lettura già esistente (`agentCards.ts`, spec 008): la stessa query FetchXML su `bot` legge anche `template`; una funzione pura `agentKindOf(template)` lo traduce in `'harness' | 'standard' | 'unknown'`; la schermata disegna la cella.

## File (previsti)

```text
tools/src/types.ts                      # AgentCard.kind: 'standard' | 'harness' | 'unknown'
tools/src/services/agentCards.ts        # agentKindOf(raw), attribute template nella query
tools/src/app.ts                        # colonna "Agent type" (solution view), agentKindCellHtml
tools/src/icons.ts + styles.css         # icona 'github-copilot' (maschera, currentColor); stile della cella
tools/src/public/logo.svg               # riuso per lo standard (da confermare)
tools/test/agentCards.test.ts           # matrice di agentKindOf
tools/test/ui.cards.test.ts             # colonna: tre tipi, etichette, lettura fallita, nessuna query in piu', nessuna traccia nel package
tools/scripts/mutation-check.mjs        # mutazioni (010)
```

## Decisioni

| # | Decisione | Perché |
|---|---|---|
| D1 | Il tipo sta in `AgentCard`, letto con l'icona | Una sola query, una sola cache, nessuna lettura in più (008) |
| D2 | `template` e non `configuration.recognizer` | `configuration` è un Memo fino a 1 MB: leggerlo per ogni agent sarebbe costoso; `template` è breve e documentato |
| D3 | Prefisso `cliagent-` / `default-`, tutto il resto sconosciuto | Regge a nuove versioni, e non si dichiara classico ciò che non si conosce |
| D4 | Icona harness come maschera CSS | Una maschera è un normale elemento, segue tema e colore; gli SVG inline non si disegnano nell'host |
| D5 | Etichetta accessibile + `title` | L'icona da sola non basta a chi non la riconosce |

## Rischi

- **La lettura reale di `template` via Web API non è provata** (la colonna è documentata e il valore è osservato nei package): primo compito, come T002 della 008. Se non risponde, tutti gli agent risultano "sconosciuti" e il log avvisa.
- **Un solo valore osservato per tipo**: vedi domanda 3.

## Constitution Check

Testing Standard 1.3.0 (matrice di `agentKindOf`, scenari della schermata, mutazioni), UI senza emoji e senza ridondanze (il tipo non si ripete nel nome), nessuna scrittura su Dataverse.
