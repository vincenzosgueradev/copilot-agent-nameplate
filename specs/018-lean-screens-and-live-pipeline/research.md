# Ricerca 018

- **Perche' la tabella degli agent esce dalla revisione**: il passo Suffix ha, per ogni Target, la tabella con il nome prima e dopo. La revisione la riproponeva identica (più la lunghezza). Cio' che la revisione dava in più era solo la lunghezza e gli avvisi: restano gli avvisi.
- **Perche' il selettore resta altrove**: nell'anteprima e nei controlli cambia davvero la vista (le modifiche di un Target, i controlli di un Target); nella revisione serviva solo a scegliere quale elenco guardare.
- **Icone**: l'host del tool non disegna l'SVG inline; il progetto usa maschere CSS (`icons.ts`). Le icone nuove seguono lo stesso schema, quindi seguono il colore del testo e il tema.
- **Animazioni**: solo `transform`, `opacity` e `background-size`, che non forzano il layout; `prefers-reduced-motion` le spegne.

## Frasi tolte nella pulizia (FR-009)
_Si compila durante il blocco D._

### Revisione (blocco A)
- «what you are about to change» (sotto il titolo «Rename»): sostituito dal conto dei package.
- «chosen in the previous step» (sotto «Options»).
- La riga «Targets» / «Suffix»: la dice già la tabella dei package.
- «This run builds N packages from one export, one for each target»: nel titolo del riquadro.
- «Left as they are: …»: gli agent esclusi si vedono nel passo Suffix e il conto sta nella colonna «Agents renamed».
- «What happens next» (4 punti): «Two exports…» (la pipeline lo mostra), «On disk N archives…» (ripete «Artifacts produced»), «From a few seconds to a few minutes» (generico). Resta solo la riga su Dataverse.
