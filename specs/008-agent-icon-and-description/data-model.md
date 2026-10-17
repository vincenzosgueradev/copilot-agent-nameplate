# Data Model: Icona e descrizione dell'agent

> **Aggiornamento 2026-10-18**: la descrizione dell'agent è stata **tolta dal requisito** (spec.md, FR-004/FR-010 ritirati). Dove questo documento parla di descrizione, la parte non è implementata: resta come riferimento.

**Feature**: `008-agent-icon-and-description` | **Date**: 2026-10-18

## AgentCard *(types.ts)*

```ts
interface AgentCard {
    /** `data:image/png;base64,…` oppure `null` se assente o non valida. */
    iconDataUri: string | null;
    /** Testo normalizzato, oppure `null` se assente. */
    description: string | null;
}
```

Stato nella schermata: `cards: Map<agentId, { modifiedOn: string; card: AgentCard }>` — la voce è valida finché `modifiedOn` dell'agent coincide.

## Validazione dell'icona (`isValidIcon(raw)`)

| Passo | Regola | Esito se non rispettata |
|---|---|---|
| 1 | togliere spazi e a capo; togliere un eventuale prefisso `data:image/png;base64,` | — |
| 2 | non vuota | `null` |
| 3 | lunghezza ≤ 136.533 caratteri (limite della colonna) | `null` |
| 4 | solo caratteri `A–Z a–z 0–9 + / =` | `null` |
| 5 | inizia con `iVBORw0KGgo` (firma PNG) | `null` |
| 6 | → `data:image/png;base64,<pulita>` | — |

## Normalizzazione della descrizione (`normalizeDescription(raw)`)

| Ingresso | Uscita |
|---|---|
| `null`, `undefined`, vuota, soli spazi | `null` |
| testo con `\r\n`, tabulazioni, spazi multipli | a capo e spazi ridotti a uno, tolti gli spazi attorno |
| HTML (`<b>x</b>`) | invariato come **testo** (si mostra con `textContent`) |
| più lunga di 2000 caratteri | tagliata a 2000 con `…` |

## Lettura

Una sola query per solution aperta, con gli id degli agent (FetchXML, lo stesso schema delle altre liste):

```xml
<fetch>
  <entity name="bot">
    <attribute name="botid"/><attribute name="iconbase64"/><attribute name="modifiedon"/>
    <filter><condition attribute="botid" operator="in"><value>{id1}</value>…</condition></filter>
  </entity>
</fetch>
```

La descrizione sta in un'altra tabella: una seconda query, sempre una sola per solution aperta.

```xml
<fetch>
  <entity name="botcomponent">
    <attribute name="botcomponentid"/><attribute name="schemaname"/>
    <attribute name="description"/><attribute name="parentbotid"/>
    <filter><condition attribute="parentbotid" operator="in"><value>{id1}</value>…</condition></filter>
  </entity>
</fetch>
```

Lato client si tiene, per ogni agent, il componente con `schemaname` = `<schema dell'agent>.gpt.default` e si legge la sua `description`. Nessun filtro su `componenttype`.

## Dove si mostra

| Posto | Icona | Descrizione |
|---|---|---|
| Vista della solution | 24 px | sotto il nome, una riga troncata |
| Tabella del passo del suffisso | 24 px | sotto il nome, una riga troncata |
| Revisione | 20 px | no |
| Chip della ricerca | 16 px | no |
| Anteprima, manifest, storico, package | **no** | **no** |
