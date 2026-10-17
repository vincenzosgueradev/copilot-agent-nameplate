# Quickstart: usare i cancelli di qualità

**Feature**: `006-quality-gates` | Da `tools/`.

## Q1 — La suite veloce

```bash
npx tsc --noEmit && npm run build && npm test
```

**Atteso**: ✅ nessun errore di tipo; ✅ build verde; ✅ ≈150 test passano in ≈40 s (alcuni saltati: sono quelli esaustivi).

## Q2 — La suite esaustiva

```bash
npm run test:full
```

**Atteso**: ✅ tutto verde, comprese le matrici cartesiane (746.496 piani a 2 agent) e la pipeline esaustiva a 1 agent.

## Q3 — Il controllo per mutazione

```bash
npm run test:mutation              # tutto
node scripts/mutation-check.mjs versione   # solo le mutazioni con "versione" nel file o nel perché
```

**Atteso**: ✅ `N/N difetti scoperti dalla suite`; ✅ l'elenco "Da sistemare" è assente; ✅ `git status` non mostra file di `src/` alterati dallo script.

**Se ne sopravvive uno**: il difetto è un test mancante. Scrivere il test, rilanciare solo quella mutazione, poi tutte.

## Q4 — Un test deve poter fallire

1. Aprire un file di `src/` (es. `services/patch.ts`) e invertire a mano un confronto.
2. Eseguire `npm test`.

**Atteso**: ✅ almeno un test cade con un messaggio che riporta il caso (`caso {…}`); ripristinare il file.

## Q5 — Una nuova funzione

1. Aggiungere la matrice (oracolo in `helpers/oracle.ts`, casi in un `*.test.ts`).
2. Aggiungere i test negativi di ciò che verifica.
3. Aggiungere le mutazioni a `scripts/mutation-check.mjs` e lanciarle.
4. Riportare la tabella requisito → codice → test nel `tasks.md` della specifica.

## Q6 — Prima di un rilascio

`/custom-publish` esegue `tsc`, `npm test`, `npm run test:full`, `npm run test:mutation`, `npm run validate` e gli smoke; si ferma al primo fallimento.

## Non coperto dai test (controllo manuale)

| Che cosa | Dove si verifica |
|---|---|
| Pixel e aspetto reale | spec 005, quickstart L1–L6 |
| Effetto di `publishOnImport` all'import | spec 003, quickstart P5 |
| Privilegio reale sulla solution | spec 004, research §6 |
