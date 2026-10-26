---
name: "custom-types"
description: "Analysis-only TypeScript audit of src: any usage, ts-ignore, missing or loose types, strict-mode violations, unsafe XML/JSON handling. Reports findings; does not modify code."
user-invocable: true
disable-model-invocation: false
---

# TypeScript audit (read-only)

Read `.specify/memory/constitution.md` and `tsconfig.json` (strict, noUnusedLocals, noUnusedParameters) first. Scan `src/**/*.ts` and `scripts/*.mts`.

Check:
1. **`any` usage** — `: any`, `as any`, `any[]`, implicit any, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`.
2. **Missing / loose types** — shapes in `types.ts` typed as `string` where a literal union fits; exported functions without return types; untyped JSON/XML parse results (`JSON.parse`, `@xmldom/xmldom` nodes, Dataverse responses) that should be validated or narrowed.
3. **PPTB API typing** — usages of the PPTB toolbox/dataverse APIs not covered by `@pptb/types` or `globals.d.ts`.
4. **Strict mode** — unused locals/params, unchecked nulls (`querySelector`, `getElementById`, `Map.get`) used without guards, non-null assertions (`!`) hiding real nulls.
5. **Error handling** — `catch (e)` using `e` without `unknown` narrowing.

Report: `[TS-001] file:line — description · Code: <line> · Type: any|loose-type|api-typing|strict|error-handling · Action: <fix>`.
If none: `TS AUDIT: PASS — no violations found`.

Do not modify any file. Afterwards, offer to fix and verify with `npm run build` from ``.
