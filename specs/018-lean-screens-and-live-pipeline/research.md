# Ricerca 018

- **Perche' la tabella degli agent esce dalla revisione**: il passo Suffix ha, per ogni Target, la tabella con il nome prima e dopo. La revisione la riproponeva identica (più la lunghezza). Cio' che la revisione dava in più era solo la lunghezza e gli avvisi: restano gli avvisi.
- **Perche' il selettore resta altrove**: nell'anteprima e nei controlli cambia davvero la vista (le modifiche di un Target, i controlli di un Target); nella revisione serviva solo a scegliere quale elenco guardare.
- **Icone**: l'host del tool non disegna l'SVG inline; il progetto usa maschere CSS (`icons.ts`). Le icone nuove seguono lo stesso schema, quindi seguono il colore del testo e il tema.
- **Animazioni**: solo `transform`, `opacity` e `background-size`, che non forzano il layout; `prefers-reduced-motion` le spegne.

## Frasi tolte nella pulizia (FR-009)

### Revisione (blocco A)
- «what you are about to change» (sotto il titolo «Rename»): sostituito dal conto dei package.
- «chosen in the previous step» (sotto «Options»).
- La riga «Targets» / «Suffix»: la dice già la tabella dei package.
- «This run builds N packages from one export, one for each target»: nel titolo del riquadro.
- «Left as they are: …»: gli agent esclusi si vedono nel passo Suffix e il conto sta nella colonna «Agents renamed».
- «What happens next» (4 punti): «Two exports…» (la pipeline lo mostra), «On disk N archives…» (ripete «Artifacts produced»), «From a few seconds to a few minutes» (generico). Resta solo la riga su Dataverse.

### Suffix (blocco D)
- Sottotitolo dei Target «tick the environments to build for; under each one, choose its agents and publish option» → «tick the targets to build for»: il resto lo dicono le tabelle sotto ogni Target.
- «Drag the handle or use the arrows to reorder»: la maniglia ha il tooltip «Drag to reorder» e le frecce hanno la loro etichetta.
- «Publish on import carries the new name to Teams and Microsoft 365 Copilot», sotto **ogni** tabella di agent (tre Target = tre volte): la conseguenza di non pubblicare la dice l'anteprima, solo quando serve.
- «Nothing to rename»: da quattro frasi a due («with no agent ticked the package would be identical to the solution in DEV; tick at least one»). Tolto il rimando al «native solution export or your ALM pipeline».
- Sottotitolo «what lands on disk» del riquadro Artifacts: lo dice l'elenco.
- Descrizioni dei file in Artifacts, da due frasi a una: «The one to import into UAT or PROD. Managed: no unmanaged layer.», «The same patch, unmanaged, for source control. Never import it downstream.», «The original managed export, unpatched. Re-import it to go back.», «The original unmanaged export, untouched.», «Who, when, from where, the suffix applied and every file hash.».

### Anteprima e controlli (blocco D)
- «grouped by agent» e «what the package will carry, per agent»: ripetevano il titolo del riquadro.
- «what travels on import» e «managed and unmanaged side by side»: idem.
- La nota «The artifact is the whole solution: everything above travels on import, not just the agent»: la dice il popup di conferma del salvataggio, che e' dove serve l'assenso.

### Popup (blocco D)
- Nessun testo tolto: tutti i popup hanno ora l'icona (suffissi diversi = tag, nome in posti inattesi = search, piu' del solo agent = package, cartella esistente = folder, esporta il log = download).
