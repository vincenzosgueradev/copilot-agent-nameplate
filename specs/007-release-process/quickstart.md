# Quickstart: validare il processo di rilascio

**Feature**: `007-release-process`

## R1 — La voce del changelog

1. Aprire `CHANGELOG.md`.

**Atteso**: ✅ in alto la versione da rilasciare, con data; ✅ sezioni Added/Changed/Fixed; ✅ Upgrade notes se la release chiede qualcosa; ✅ ogni fix dice il sintomo.

## R2 — Una bozza dai commit

1. Eseguire `/custom-changelog`.

**Atteso**: ✅ dice quale dei tre casi ha riconosciuto (maggiore/uguale/minore) e perché sceglie quel numero; ✅ mostra la bozza e **non scrive** prima della conferma; ✅ non committa né alza `package.json`.

## R3 — Pubblicare

1. Con il changelog committato e l'albero pulito, eseguire `/custom-publish`.

**Atteso**: ✅ legge `V` dalla prima voce; ✅ mostra l'esito di ogni controllo; ✅ si ferma se un test o una mutazione fallisce; ✅ imposta `package.json` a `V`, compila, mostra `npm pack --dry-run`; ✅ **chiede conferma** prima di `npm publish`; ✅ con un codice a due fattori richiesto, ti dà il comando da eseguire.

## R4 — Dopo la pubblicazione

**Atteso**: ✅ la skill non committa e non fa push: ti indica il commit del bump (`build(config): bump version to V`) e il push.

## R5 — L'assistente propositivo

1. Concludere un blocco di lavoro verificato.

**Atteso**: ✅ l'assistente lancia `/custom-commit` da solo; ✅ dice "N commit visibili non rilasciati dalla X.Y.Z" e propone versione e motivo quando la tabella lo giustifica; ✅ **non** lancia mai `/custom-publish` né `git push`.

## Da fare al primo rilascio vero *(non provato)*

- Eseguire `/custom-publish` fino in fondo e annotare l'esito in research §8.
