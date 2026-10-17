# Implementation Plan: Processo di rilascio

**Branch**: `007-release-process` | **Date**: 2026-10-18 *(retroattivo)* | **Spec**: [spec.md](spec.md)

## Summary

Nessun codice del tool: cambia il **modo di lavorare**. Tre artefatti: il `CHANGELOG.md` con la sua regola (Constitution 1.2.0), due skill (`/custom-changelog`, `/custom-publish`) e le istruzioni proattive in `CLAUDE.md`.

## Technical Context

Skill di Claude Code (`.claude/skills/*/SKILL.md`), `git log -S` per l'intervallo, `npm version`, `npm pack --dry-run`, `npm publish --access public`. Nessuna dipendenza nuova.

## Constitution Check

| Regola | Esito |
|---|---|
| Release Changelog (1.2.0) | ✅ questa funzione la realizza |
| Testing Standard (1.3.0) | ✅ `/custom-publish` ne applica i cancelli |
| Tool Validation Gate | ✅ `npm run validate` fa parte dei controlli |

## Project Structure

```text
CHANGELOG.md                                  # Keep a Changelog; una voce per versione, la più recente in alto
.specify/memory/constitution.md               # Release Changelog (1.2.0), Testing Standard (1.3.0)
.claude/skills/custom-changelog/SKILL.md      # manuale; bozza dai commit, decide il numero, conferma, scrive
.claude/skills/custom-publish/SKILL.md        # solo manuale; controlli, versione dal changelog, conferma, publish
.claude/skills/custom-ampush/SKILL.md         # esegue anche npm test
CLAUDE.md                                     # quando proporre commit e rilascio; publish e push mai dell'assistente
```

## Decisions

| # | Decisione | Perché |
|---|---|---|
| D1 | La versione la decide il changelog, non `npm version patch` | Il numero deve dire cosa è cambiato; lo script alzava sempre la patch |
| D2 | Il numero lo sceglie `/custom-changelog` (PATCH/MINOR/MAJOR), e `/custom-publish` pubblica quello | Una sola fonte, e verificabile prima |
| D3 | Tre casi per `package.json` rispetto all'ultima voce | Una voce scritta in anticipo si aggiorna, una già pubblicata no |
| D4 | `/custom-publish` solo manuale | Pubblicare è irreversibile |
| D5 | Controlli prima della conferma, non dopo | Una conferma su un riepilogo non verificato non vale |
| D6 | Intervallo dei commit da `git log -S"## [x.y.z]"` | Non ci sono tag nel repository |
| D7 | Tabella di proposta nel `CLAUDE.md` | L'utente "si dimentica quando usare le skill": decide l'assistente |

## Complexity Tracking

Nessuna deroga.

## Rischi

- **Bozza sbagliata**: la bozza si mostra e si conferma; non si scrive da sola.
- **Versione sbagliata**: `/custom-publish` ferma salti anomali e numeri già presi.
- **Autenticazione**: l'OTP non si aggira; si dà il comando.
