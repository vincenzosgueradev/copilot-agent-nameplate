# Data model 017

`Target` = `{ name, publishOnImport, production? }`.

- `production` è salvato solo quando è `true` (nella lista `releaseTargets` dell'ambiente, impostazioni locali di PPTB). Assente = `false`.
- Vale solo con `name === ''`. `renameTarget` verso un nome non vuoto lo toglie; `parseTargets` lo scarta se il nome non è vuoto.
- Non entra nel package, nel manifest, nello storico né in `TargetRun`.
