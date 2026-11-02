# Data model 019

Nessun dato salvato, nessun campo nel package, nel manifest o nello storico.

- `state.collapsedPanels: Set<string>`: gli id dei riquadri ripiegati, solo in memoria, per la sessione.
- `DiffRow` (in `services/diff.ts`): `{ kind: 'context' | 'removed' | 'added' | 'changed' | 'gap', oldNo, newNo, oldText, newText, oldSpan, newSpan, skipped }`. `changed` e' una riga tolta e una aggiunta affiancate; `gap` porta il numero di righe omesse.
- `FileDiff`: `{ file, rows, added, removed, truncated }`.
