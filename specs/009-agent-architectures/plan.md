# Implementation Plan: architetture di agent

**Spec**: [spec.md](spec.md)

## Approccio

Dati, non codice: l'architettura è un profilo nel baseline JSON. `compat.ts` raggruppa le chiavi per `recognizer.$kind`, confronta ciascun gruppo col suo profilo e unisce gli elementi XML su tutti i file.

## File

```text
tools/src/baseline/package-format.json   # configurationJson.profiles; botComponentXml.optionalElements += name
tools/src/services/compat.ts             # architectureOf, elementsOf, configurationDriftAgainstBaseline/Previous
tools/src/types.ts                       # FormatFingerprint.configurationByArchitecture?
tools/test/helpers/fixture.ts            # AgentSpec.architecture: 'standard' | 'harness'
tools/test/architectures.test.ts         # matrice, negativi, precedente, rename
tools/scripts/mutation-check.mjs         # 6 mutazioni (009)
```

## Decisioni

| # | Decisione | Perché |
|---|---|---|
| D1 | Profilo per `recognizer.$kind` | Sta già nel file confrontato; identifica l'architettura senza altre letture |
| D2 | Un'architettura sconosciuta = una riga | Non si inonda l'utente di chiavi per un'architettura che non si conosce |
| D3 | Elementi XML uniti su tutti i file | Stesso difetto già risolto per le chiavi: il "primo file" dipende dall'ordine dello zip |
| D4 | `name` opzionale nei componenti | Il componente di feedback non lo ha (verificato) |
| D5 | Registrazioni vecchie: nessun confronto sulle chiavi | Evita un avviso una tantum senza valore; il baseline copre già il caso |

## Constitution Check

Testing Standard 1.3.0: matrice, negativi, mutazioni, prova sugli export reali ✅. Nessuna scrittura su Dataverse ✅.
