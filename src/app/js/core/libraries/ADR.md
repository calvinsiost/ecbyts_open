# ADR — Library Trust Model (CONSIST-OBS-001 §15 B1)

**Status:** accepted
**Date:** 2026-06-11
**Spec:** docs/specs/_archived/SPEC_CONSISTENCY_OBSERVABILITY_PROGRAM.md §15.B1
**Calvin diretiva:** "seguir" (2026-06-11, autorização autônoma)
**Author:** claude - executor

## Context

CONSIST-OBS-001 S4 propõe abrir 4 APIs library-facing
(`registerAction`, `registerReportTemplate`, `registerBroadcastPreset`,
`registerFieldMeta`) para que módulos produzidos por usuários na
Libraries Marketplace possam estender o ecbyts sem PR no repositório.

Sem decisão arquitetural prévia, isso vira vetor crítico de:
- **Execução remota de código** (S4 aceita `Function` no manifest)
- **Supply chain attack** (módulo malicioso publicado lê PII via XSS)
- **DoS** (manifest gigante consome RAM/CPU)
- **Privilege escalation** (módulo invoca handler privilegiado)

B1 é gate de bloqueio: S4 NÃO sai do papel sem B1 decidido.

## Decision

**DECLARATIVO > EXECUTÁVEL.**

Módulos de library são manifests JSON puros, validados contra
schema canônico. Toda lógica vive no código do ecbyts (em `core/*`);
módulo apenas REFERENCIA handlers canônicos via `handler_key`.

Precedente READY (M2 matrix): `registerTaxonomy` + `registerFamilyModule`
já operam desta forma — só metadados, zero código executável.

### Esquema do manifest (v1.0.0)

```json
{
  "schema_version": "1.0.0",
  "module_id": "user-custom-xyz",
  "module_name": "Custom Action Pack",
  "author": { "name": "...", "contact": "..." },
  "capabilities": ["register_action", "register_report_template"],
  "declarations": {
    "actions": [
      {
        "id": "ext.audit.export-csv",
        "label_i18n": "ext.audit.exportCsv",
        "intent": "export_audit_trail_csv",
        "handler_key": "handleExportAuditCsv",
        "params_schema": { "campaignId": "string" }
      }
    ],
    "report_templates": [
      {
        "id": "ext.cetesb.fase-2",
        "name": "CETESB Fase II — modelo Calvin",
        "markdown": "## Fase II ... {{observationTable}}",
        "bindings": ["observationTable", "exceedanceTable"]
      }
    ]
  },
  "signature": "fnv1a32-fingerprint"
}
```

### Capabilities whitelist (frozen)

- `register_action`
- `register_report_template`
- `register_broadcast_preset`
- `register_field_meta`
- `register_taxonomy`
- `register_family_module`

Adicionar capability = ADR amendment (não pode ser dinâmico em runtime).

### Proibições absolutas

1. `typeof === 'function'` em qualquer campo → rejected
2. Strings >30 chars contendo `eval/Function/setTimeout/setInterval/
   require/import(/process./globalThis/window./document.` seguido de
   `(` → rejected
3. `handler_key` não registrado em ACTION_REGISTRY → rejected
4. Capability fora da whitelist → rejected
5. `schema_version` não suportada → rejected
6. Manifest > 100KB → rejected (anti-DoS)
7. Referência circular → rejected

### Validação (pure-logic)

`_libraryTrustModelPure.ts` exporta:
- `validateLibraryManifest(manifest, canonicalHandlerKeys) → TrustVerdict`
- `filterAllowedCapabilities(declared, supported) → Capability[]`
- `computeManifestFingerprint(manifest) → fnv1a-hex8`
- `getCanonicalCapabilities() → ReadonlySet<Capability>`

Verdict é **frozen** (Object.freeze) — verificação imutável, audit-safe.

## Alternativas consideradas

### A) Sandboxed iframe + postMessage (rejeitada)
Permitiria JS executável isolado, mas:
- Aumenta superfície de ataque (iframe + bridge bidireccional)
- Complexidade de DX (módulo precisa empacotar como iframe HTML)
- Performance overhead (cada módulo = 1 iframe)
- Não resolve o problema central (manifest ainda é texto opaco)

### B) WASM sandbox (rejeitada)
Mesmo problema da A + curva de aprendizado para criadores de módulos.

### C) Pre-compiled bundle assinado por master (rejeitada)
Vira "PR disfarçado" — sem ganho real vs. abrir PR no repo.

### D) Declarativo + handler_key canônico (ACEITA)
Trade-off ótimo:
- Criadores de módulo escrevem JSON (DX simples)
- Zero execução de código de terceiros
- handler_keys conhecidos = audit trail trivial
- Schema versionado = upgrade path claro

## Consequences

### Positivas
- S4 destravado: 4 APIs registerXxx podem ser implementadas com
  confiança
- MOD-LIB-MIG-001 destravado: built-ins migram para library modules
  usando o mesmo padrão
- Auditoria contínua: cada manifest tem fingerprint + verdict logado
- Pilar 1 (usabilidade) + Pilar 2 (confiança) do North Star v2

### Negativas (aceitas)
- Módulos da library não podem implementar lógica nova — só
  combinam handlers existentes
- Casos avançados (custom solver, custom UI) viram PR no repo (não
  na library) — alinhado com filosofia AGPL-3.0

### Mitigações
- `register_action` aceita `params_schema` simplificado para que
  handler canônico saiba validar input do módulo
- Cada subsistema (S4) declara qual subset de capabilities aceita
  (via `filterAllowedCapabilities`)

## Validation

- 21 cheap tests em `tests/library-trust-model-pure.test.mjs`
- Cobre: schema valido / inválido, capabilities whitelist, executable
  code (function, string suspect), handler_key canonical, size cap,
  fingerprint estável, frozen verdict
- Wire de S4 (quando feito) deve consumir `validateLibraryManifest`
  antes de aceitar qualquer manifesto

## References

- OWASP Top 10 LLM Apps (LLM02 Insecure Output Handling)
- VS Code Extension API Manifest (contributes.* declarativo)
- Chrome MV3 manifest.json (declarativo > MV2 background pages)
- npm package-lock (integrity SRI hash)
- CONSIST-OBS-001 §15 (Calvin "todas" diretiva 2026-05-28)
