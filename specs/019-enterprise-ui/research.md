# Ricerca 019

- **Il diff si fa sui file veri**: `PackageContents.entries` ha i byte dell'export e `applyPatch(pkg, plan)` produce i file dopo la patch: due testi, nessuna ricostruzione. `bot.xml` cambia in una sola riga (`replaceElementText` conserva il resto); `configuration.json` e' l'unico file riserializzato (`JSON.stringify(cfg, null, 2)`), quindi il suo diff puo' mostrare piu' righe: e' la verita', e il limite di 80 righe lo tiene leggibile.
- **Algoritmo**: le modifiche sono poche e il file e' piccolo. Si tolgono prefisso e suffisso comuni, poi LCS a programmazione dinamica sulla parte centrale; se il prodotto delle righe supera 4 milioni si ripiega su «tutto sostituito». Nessuna dipendenza nuova.
- **Pezzo evidenziato**: per una coppia riga tolta/riga aggiunta si calcolano prefisso e suffisso comuni e si allarga ai confini di parola, cosi' `[DEV]` → `[UAT]` evidenzia `DEV` e `UAT`, non una lettera.
- **Sezioni ripiegabili senza riscrivere i riquadri**: i riquadri hanno gia' tutti `<section class="panel">` con `.panel-head`; `decoratePanels` li arricchisce da fuori. Il contenuto ripiegato resta nel DOM, quindi i test e i controlli non perdono nulla.
- **Info in una striscia, non in un popup**: una striscia sotto l'intestazione non ha bisogno di posizionamento, non esce dallo schermo e si legge con la tastiera.
- **Icone**: maschere CSS come le altre (l'host non disegna l'SVG inline). Nuove: chevron gia' esiste; si aggiungono `info`, gia' presente, e `file-diff`, `columns`, `rows` se servono.
- **Animazioni**: solo `transform`, `opacity` e `background-size`; `prefers-reduced-motion` le spegne.
