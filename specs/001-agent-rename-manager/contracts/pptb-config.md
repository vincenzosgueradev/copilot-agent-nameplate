# Contract: manifesto del tool PPTB

**Tool**: Agent Rename Manager | **Date**: 2026-10-14 | **Revisione**: 2026-10-15 (schema reale)

> **⚠️ Correzione importante (2026-10-15).** La prima stesura di questo contratto descriveva un
> `pptb.config.json` con `id`, `name`, `version`, `permissions`, `features`, `marketplace`.
> **Quello schema non esiste.** Facendo girare `npm run validate` (`pptb-validate` 1.0.5) sul
> manifesto reale, il validatore ha risposto:
>
> ```text
> ⚠️  pptb.config.json contains unrecognised root keys: id, name, version, description,
>     author, category, tags, icon, entryPoint, permissions, features, marketplace
> ```
>
> Lo schema vero è in `@pptb/types/pptbConfig.d.ts` → `PPTBConfig`, e ammette **tre sole**
> chiavi di primo livello: `invocation`, `agents`, `workers`. Tutti i metadati di marketplace
> stanno in `package.json`. È il motivo per cui un contratto va verificato contro lo strumento
> che lo valida, non dedotto.

---

## `pptb.config.json`

```json
{
    "invocation": {
        "version": "1.0.0",
        "capabilities": ["solution-selector"],
        "prefill": {
            "properties": {
                "solutionUniqueName": { "type": "string" },
                "suffix": { "type": "string" },
                "outputDirectory": { "type": "string" }
            }
        },
        "returnTopic": {
            "properties": {
                "status": { "type": "string", "enum": ["ok", "error"] },
                "artifactSet": { "type": "object" },
                "changes": { "type": "array", "items": { "type": "object" } },
                "code": { "type": "string" },
                "message": { "type": "string" }
            }
        }
    },
    "agents": {
        "version": "1.0.0",
        "headless": true,
        "invokable": true,
        "modes": ["two-way"],
        "defaultMode": "two-way",
        "timeoutMS": 600000,
        "executionModes": ["windowed", "headless"],
        "defaultExecutionMode": "windowed",
        "headlessEntry": "dist/headless.js"
    }
}
```

**Stato**: ✅ `pptb-validate` → *All checks passed*.

### Scelte, e il perché

| Campo | Valore | Motivo |
|---|---|---|
| `agents.headless` | `true` | Le operazioni di `headless-api.md` si fermano al file: nessuna tocca un environment |
| `agents.defaultExecutionMode` | `windowed` | Il flusso normale ha due conferme esplicite (FR-091, FR-096). In headless diventano flag, ma il default resta quello con l'umano davanti |
| `agents.timeoutMS` | `600000` | Un packaging è due export: 13 s nel caso buono, fino a ~5 minuti con il fallback asincrono (research §13). Un timeout corto lo ucciderebbe a metà |
| `invocation.capabilities` | `solution-selector` | Il tool parte dalla scelta di una solution |

---

## `package.json` — i metadati che PPTB richiede davvero

```json
{
    "name": "agent-rename-manager",
    "displayName": "Agent Rename Manager",
    "description": "Produce the solution package with Copilot Studio agent display names already set for the target environment. No unmanaged layer, ever.",
    "main": "index.html",
    "contributors": [{ "name": "Vincenzo Sguera" }],
    "keywords": ["pptb", "power-platform", "copilot-studio", "agents", "alm", "solution", "package", "rename", "managed-layer"],
    "configurations": {
        "repository": "…",
        "readmeUrl": "…",
        "category": "Copilot Studio"
    },
    "features": { "connections": { "min": 1, "max": 2 } },
    "dependencies": { "fflate": "0.8.2" }
}
```

`features.connections` `min: 1, max: 2`: una connessione per leggere ed esportare dalla sorgente,
una seconda per il deploy opzionale nell'ambiente di destinazione (fase 2).

### Bloccante per la pubblicazione, non per l'uso

`pptb-validate` verifica che `configurations.repository` e `configurations.readmeUrl` siano
**raggiungibili pubblicamente**, e rifiuta `readmeUrl` ospitato su `github.com` (vuole
`raw.githubusercontent.com` o un altro dominio). Il repository attuale è un Azure DevOps
**privato**, quindi i due controlli falliscono:

```text
❌ configurations.repository URL is not accessible
❌ configurations.readmeUrl is not accessible
```

Non è un difetto del tool: è un prerequisito di marketplace. Prima di pubblicare servono un
repository pubblico e un readme raggiungibile. Finché il tool resta a uso interno, i due valori
puntano al repository reale e i controlli falliscono per progetto, non per errore.

Mancano anche, come **warning**: un'icona SVG bundlata e `configurations.website`.

---

## Permessi: dove sono finiti

La prima stesura dichiarava `permissions.dataverse` con `read`, `write` e `actions`. Nello schema
reale **quel blocco non esiste**: PPTB non fa dichiarare i permessi Dataverse nel manifesto.

Il vincolo resta comunque, ed è applicato **nel codice** invece che nel manifesto:

- `src/services/dataverse.ts` **non esporta alcun metodo di scrittura**, con il motivo scritto in
  testa al file: un `UPDATE` su un componente che proviene da una managed solution crea un
  unmanaged layer nell'environment di destinazione (FR-067, SC-010).
- Le azioni usate sono `ExportSolution`, `ExportSolutionAsync`, `DownloadSolutionExportData` e —
  solo in fase 2 — `ImportSolution` via `dataverseAPI.deploySolution`.
- La verifica dell'invariante è una `grep` sul sorgente, non una riga di configurazione:

```bash
grep -rn "\.update(\|\.create(\|\.deleteRecord" tools/src/   # deve non trovare nulla
```

Una dichiarazione di permessi che nessuno applica sarebbe stata una rassicurazione finta. Il
codice che non espone la scrittura è una garanzia vera.
