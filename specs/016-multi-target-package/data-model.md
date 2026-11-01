# Data model 016

Nessuna scrittura su Dataverse oltre alla versione (invariata). Nuovi dati: due chiavi dello store `settings` locale di PPTB (personali, di questo dispositivo, mai nel package) e il formato v2 del manifest.

## Entità

### Target
| Campo | Tipo | Regole |
|---|---|---|
| `name` | stringa | È il **suffisso** senza parentesi quadre. 0–20 caratteri (`SUFFIX_MAX`, spazi ai lati esclusi). Non ammessi: `[` `]` (romperebbero il riconoscimento del suffisso) e i caratteri che Windows rifiuta nei nomi di file (`\ / : * ? " < > |` e i caratteri di controllo), perché il nome finisce nel nome dello zip. Oggi il campo libero non rifiutava nulla oltre la lunghezza: la regola per i Target è più stretta. **Vuoto ammesso, una sola volta** nella lista («no suffix»). Unico nella lista, senza distinguere le maiuscole (FR-005). |
| `publishOnImport` | `'keep' \| 'force-true' \| 'force-false'` | Il valore di partenza per tutti gli agent di quel Target (D2). Default `'keep'`. |
| ordine | posizione nell'array | Non è un campo: è l'ordine della lista (FR-003). |

### Lista dei Target
Un array ordinato di `Target`, **per nome di connessione** (D1).

### Spunte
Per connessione e per solution (`uniqueName`): l'elenco dei **nomi** di Target usati l'ultima volta (D3).

## Chiavi di `settings`
```jsonc
// releaseTargets — assente = mai configurata (si usano i preset); presente, anche vuota = scelta dell'utente
{ "DEV-cliente-A": [ { "name": "UAT", "publishOnImport": "keep" },
                     { "name": "PROD", "publishOnImport": "force-true" } ] }

// targetSelection — per connessione, per solution
{ "DEV-cliente-A": { "testAgentTool": ["UAT", "PROD"] } }
```
`readTargets` ignora ciò che non ha la forma attesa (voci non oggetto, `name` non stringa o duplicato, `publishOnImport` fuori dai tre valori → `'keep'`); `reconcileSelection` toglie dalle spunte i nomi che non sono più nella lista.

## Preset di partenza (FR-002)
`DEV, TEST, UAT, STAGING, PREPROD, PROD`, tutti con `publishOnImport: 'keep'`: gli stessi di `SUFFIX_PRESETS` oggi.

## Runtime (non salvato)
```ts
Target          { name: string; publishOnImport: PublishMode }   // lo stesso tipo della lista salvata
TargetResult    { target: Target; plan: PatchChange[]; managed: BuiltArchive;
                  unmanaged: BuiltArchive; valid: boolean; comparison: TargetComparison | null }
TargetComparison{ against: string;                       // nome del Target di riferimento (il primo)
                  differing: { path: string; kind: 'agent-name' | 'publish-on-import' }[];
                  identicalEntries: number }             // tutte le altre entry
```
Il primo Target spuntato ha `comparison: null` (è il riferimento).

## Storico
`PackagingRecord` guadagna `targets?: { name: string; publishOnImport: PublishMode; files: {...}[]; verification: {...}; status }[]`. Un record **senza** `targets` è di una versione precedente e si legge come oggi. Il manifest completo è nei file; il record porta la copia ridotta per la ricerca. Retention invariata (30 giorni, 200 voci).

## Cosa non si salva
Le scelte per agent (esclusi, publish per agent): restano della sessione, come oggi.
