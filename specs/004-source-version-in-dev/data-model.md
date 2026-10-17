# Data Model: La versione si alza in DEV

**Feature**: `004-source-version-in-dev` | **Date**: 2026-10-18

## Opzioni di packaging

| Campo | Tipo | Default | Note |
|---|---|---|---|
| `newVersion` | `string \| null` | `null` | Versione a cui portare la solution **in DEV** prima dell'export. `null` = non si tocca. Sostituisce `bumpVersion` (rimosso) |

I record storici precedenti hanno `bumpVersion` nelle opzioni: il campo non è più letto e non causa errori.

## Formato e confronto

| Regola | Valore |
|---|---|
| Formato | `^\d+\.\d+\.\d+\.\d+$` dopo aver tolto gli spazi attorno |
| Confronto | numerico, segmento per segmento (`1.0.0.10 > 1.0.0.9`) |
| Proposta | ultimo segmento + 1; una versione non valida resta com'è |
| Problema | vuoto → "Enter a version." · formato → "Use four numbers separated by dots, for example 1.0.0.3." · non più alta → "It must be higher than the version in DEV (X)." |

## VersionChange

```ts
interface VersionChange {
    from: string;        // versione di DEV prima della scrittura
    to: string;          // versione scritta (o già presente)
    changed: boolean;    // false se DEV aveva già `to`: non si riscrive
}
```

## Esito di `raiseSolutionVersion(uniqueName, newVersion)`

| Situazione in DEV | Esito |
|---|---|
| `newVersion` non valida | errore, nessuna chiamata a Dataverse |
| solution non trovata o più di una | errore |
| solution managed | errore |
| versione = `newVersion` | `{ changed: false }`, nessuna scrittura |
| versione > `newVersion` | errore "DEV is already at X, higher than Y" |
| versione < `newVersion` | scrive, rilegge; se la rilettura ≠ `newVersion` → errore "… The export was not started." |

## Stato della schermata

| Campo | Significato |
|---|---|
| `versionFrom` | Versione di DEV all'inizio dell'operazione; **fissa** (FR-003) |
| `raiseVersion` | Opzione accesa (default `true`) |
| `versionInput` / `versionTouched` | Cosa ha scritto l'utente; se non toccato si usa la proposta |
| `options.newVersion` | `raiseVersion && !problema ? scelta : null` |

## Ordine delle chiamate (verificato)

```text
[opzione accesa] write solution.version  →  read back  →  export managed  →  export unmanaged
[opzione spenta] export managed  →  export unmanaged                    (nessuna scrittura)
```

## Manifest e storico

```jsonc
"options": { "newVersion": "1.0.0.3", … },
"versionChange": { "from": "1.0.0.2", "to": "1.0.0.3", "changed": true }   // null se non toccata
```
