# Specification Quality Checklist: Cancelli di qualità

**Purpose**: Validare completezza e qualità della specifica
**Created**: 2026-10-18
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] Requisiti verificabili, ciascuno riportato alla regola della constitution
- [x] Il valore è dichiarato: scoprire i difetti prima dell'utente
- [x] Sezioni obbligatorie complete

## Requirement Completeness

- [x] Nessun marcatore [NEEDS CLARIFICATION]
- [x] Criteri di successo misurabili (tempo, numero di test, percentuale di mutazioni scoperte)
- [x] Edge case: realm di jsdom, CSS svuotati, layout assente, `src/` non toccabile durante le mutazioni
- [x] Il limite è esplicito: ciò che i test non vedono sta in un elenco manuale (FR-009)

## Feature Readiness

- [x] Ogni requisito è tracciato a un artefatto (tasks.md)
- [x] La regola è nella constitution (1.3.0), in CLAUDE.md e nelle skill di rilascio
- [x] Le dipendenze nuove sono solo di sviluppo e non entrano nel pacchetto

## Notes

- Specifica retroattiva, nata da una critica dell'utente sul modo di testare.
- Aperto: un test di schermata con un browser vero, se serve (research §3).
