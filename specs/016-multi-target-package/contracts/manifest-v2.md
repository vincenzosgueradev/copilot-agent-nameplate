# Contratto — `manifest.json` v2

Cambia con la 016 (D6): il formato è **sempre** questo, anche con un solo Target. È un cambiamento visibile a chi legge il manifest con uno script: va nelle Upgrade notes del rilascio.

## Differenze rispetto al formato 1.x
| Campo | 1.x | v2 |
|---|---|---|
| `manifestVersion` | assente | `2` |
| `suffix` (alto) | stringa | **tolto**: sta in ogni `targets[]` |
| `agents` (alto) | esiti per agent | **tolto**: sta in ogni `targets[]` |
| `options` (alto) | tutte le opzioni | restano `newVersion` e `keepSourceArtifacts`; `publishOnImport` e `publishByAgent` stanno nei Target |
| `files` (alto) | tutti i file | **tolto**: i file dei Target stanno in `targets[].files`, gli export originali in `sharedFiles` |
| `targets` | assente | **nuovo**, elenco ordinato |
| `sharedFiles` | assente | **nuovo**: `source_managed.zip`, `source_unmanaged.zip` (ruolo `restore`) |
| `operationId`, `timestamp`, `user`, `notice`, `source`, `export`, `versionChange`, `fingerprint`, `drift`, `nameOccurrences`, `confirmations` | presenti | **invariati** |

## Forma
```jsonc
{
  "manifestVersion": 2,
  "operationId": "testAgentTool 1.0.0.2 [UAT, PROD] - 2026-11-01 15-30",
  "timestamp": "2026-11-01T15:30:12.000Z",
  "user": "DEV-cliente-A",
  "notice": "…",                       // invariato
  "source": { "environmentUrl": "…", "solutionUniqueName": "testAgentTool",
              "version": "1.0.0.2", "publisher": { "uniqueName": "…", "prefix": "…" } },
  "export": { "mode": "sync", "seconds": 4.2 },
  "options": { "newVersion": "1.0.0.2", "keepSourceArtifacts": false },
  "versionChange": { "from": "1.0.0.1", "to": "1.0.0.2", "changed": true },
  "fingerprint": { }, "drift": [], "nameOccurrences": [], "confirmations": [],
  "sharedFiles": [ { "fileName": "source_managed.zip", "role": "restore", "sha256": "…", "bytes": 0, "entryCount": 0 } ],
  "targets": [
    {
      "name": "UAT", "suffix": "UAT", "order": 0,
      "options": { "publishOnImport": "keep", "publishByAgent": {} },
      "agents": [ ],                    // come oggi: esito per agent
      "files": [ { "fileName": "testAgentTool_1_0_0_2_managed_UAT.zip", "role": "deploy", "managed": true,
                   "patched": true, "bytes": 0, "entryCount": 0, "sha256": "…", "verification": { } } ],
      "comparison": null                // il primo Target è il riferimento
    },
    {
      "name": "PROD", "suffix": "PROD", "order": 1,
      "options": { "publishOnImport": "force-true", "publishByAgent": {} },
      "agents": [ ],
      "files": [ ],
      "comparison": { "against": "UAT",
                      "differing": [ { "path": "bots/ava_agent/bot.xml", "kind": "agent-name" },
                                     { "path": "bots/ava_agent/configuration.json", "kind": "publish-on-import" } ],
                      "identicalEntries": 92 }
    }
  ]
}
```

## Regole
- `targets[].name` è unico; `order` è la posizione nella lista spuntata, da 0.
- Un Target con suffisso vuoto ha `"name": ""` e `"suffix": ""`; il nome del file usa `nosuffix` come oggi.
- `comparison.differing` contiene **solo** entry attese (nome dell'agent, `publishOnImport`); se una differenza non è attesa il risultato è non valido, con lo stesso trattamento che il tool dà oggi a una verifica fallita (FR-013, FR-085).
- `files[].warning` per il ruolo `source` resta com'è: l'unmanaged patchato non si importa a valle.
- Nessun dato nuovo sensibile: nomi e hash di file, come oggi.
