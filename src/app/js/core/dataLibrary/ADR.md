# ADR — core/dataLibrary/

**Status**: Active (proposed M3+M7+M8 pure-logic done 2026-06-07; deploy real pendente Calvin)
**Spec**: [SPEC_IP_DATA_CONSOLIDATION_CLI_TO_SUPABASE](../../../../../docs/specs/arch/SPEC_IP_DATA_CONSOLIDATION_CLI_TO_SUPABASE.md)
**Author**: claude - adm 2026-06-07
**Related**: [core/library/](../library/ADR.md) (marketplace consumer), [utils/dataLibrary/](../../utils/dataLibrary/) (runtime adapter)

## Contexto

Catálogos de IP do produto (CONAMA/CETESB regulatory thresholds, IPCC/GWP/EMISSION_FACTORS, datasets geo ANA/IBGE/SIGAM, modelos 3D, fixtures) estão hoje embarcados no repo (`app/`, `scripts/`, `src/app/js/core/`). Deploy Bluehost+Vercel propaga TODO esse acervo público — qualquer fork captura o IP em texto plano. Audit trail = git blame line-level. Catálogo curado proprietário (EIS bands, uncertainty libraries) mistura com código.

IP-DATA-CONSOL-001 propõe consolidar para Supabase como source-of-truth com tier gates (free/pro/enterprise), audit row-level (signed by Calvin), e cache cliente com integrity verify.

## Decisão

Criar `core/dataLibrary/` como módulo pure-logic (sem DOM/IDB/network), com 3 responsabilidades:

1. **Decisor de fetch** (`_dataFetcherPure.ts`) — state machine 5 verdicts (`use_cache_fresh` / `use_cache_stale_offline` / `fetch_remote` / `denied_tier` / `fail_no_data`) baseado em (catalog meta, cache state, tier, online status).

2. **Gate de feature flag** (`_featureFlagGatePure.ts`) — resolve `IP_DATA_REMOTE` precedência canônica `remote_admin > query_param > local_storage > config_default`, com kill-switch Calvin que vence tudo.

3. **VM do badge de proveniência** (`_provenanceBadgePure.ts`) — FAIR landing page (license + DOI por versão + integrity hash + cache freshness + citation string), reusable em qualquer painel UI.

Runtime adapter (IDB get/set + Supabase REST fetch) fica em `utils/dataLibrary/dataFetcherRuntime.ts` (não core/) — segregação canonical pure-logic vs IO.

## Alternativas consideradas

### A1 — Object Storage + manifest signed

- **Rejeitada**: query rica + RLS + transactions ausentes; toda lógica de tier/audit teria que viver no cliente (vazamento de critério).

### A2 — Apenas Edge Function gateando todo acesso

- **Rejeitada parcial**: defense-in-depth com RLS no banco + edge function é melhor que edge solo (RLS é fallback se edge cai/é bypassed).

### A3 — Manter código embarcado + ofuscação JS

- **Rejeitada**: ofuscação não protege IP (decompilável); FAIR principles requerem identificação clara de proveniência.

### A4 — Blockchain on-chain dos catálogos

- **Rejeitada (Won't-Have explícito na spec)**: overkill para varredura inicial. Hash off-chain + ECDSA signature Calvin atende auditoria.

## Decisões Arquiteturais (ADRs A1-A10 da spec)

| ID | Decisão | Aplicação em core/dataLibrary |
|---|---|---|
| **A1** | Postgres source-of-truth | Schema externo, módulo só consome |
| **A2** | RLS default-deny + tier-gate | Cliente respeita tier antes de chamar |
| **A3** | Hash SHA-256 + ECDSA Calvin | `_dataFetcherPure` integrity verify pós-fetch |
| **A4** | Cache IDB TTL diferenciado | `_dataFetcherPure.resolveTtlMs` por categoria |
| **A5/A10** | Signed URL reusable warm-cache | `buildSignedUrlNonce` retorna 16 chars prefix hash |
| **A6** | Canonical JSON hash | Helper em `scripts/ip-data-c1-migrator.mjs` (não core/) |
| **A7** | DOI por versão (FAIR) | `_provenanceBadgePure` prioriza `version_doi` |
| **A8** | License enum constraint | `_provenanceBadgePure` 5 license badges + fallback proprietary |
| **A9** | FORCE ROW LEVEL SECURITY | Não aplicável a core/ — schema SQL |

## Invariantes

1. **Pure-logic only** — nenhum import de DOM, IDB, fetch, localStorage, navigator
2. **Immutable contracts** — todas as estruturas retornadas `Object.freeze`
3. **Dependency injection** — `now()`, `isOnline()`, `userTier()` injetados (testáveis sem mock global)
4. **Exhaustive types** — `FetchVerdict` union com `never` no switch default (compile-time exhaustiveness)
5. **No magic numbers** — TTL constants em `DEFAULT_TTL_BY_CATEGORY`, override via `meta.ttl_ms`
6. **Integrity over availability** — `IntegrityError` thrown se hash não bater (não silently use stale)

## Cobertura de testes

- `tests/ip-data-fetcher-pure.test.mjs` — 24 tests cobrindo 5 verdicts × tiers × cache states
- `tests/ip-data-feature-flag-gate.test.mjs` — 13 tests cobrindo 4 fontes × precedência × kill-switch
- `tests/ip-data-provenance-badge.test.mjs` — 20 tests cobrindo 5 licenças × DOI prioridade × cache stale

Total 57/57 cheap tests em pure-logic core/. Outros 58 tests cobrem migrators + runtime + edge static + inventory.

## Trade-offs

- **+**: IP migrado é auditável (row-level com `updated_by`/`source_doi`), versionado (FAIR), gateable por tier
- **+**: Cache cliente reduz latência + permite offline funcional para catálogos frescos
- **+**: Rollback trivial via feature flag (kill-switch Calvin)
- **-**: Catálogos públicos (CC0/CC-BY) viram requisição rede onde antes eram literal import — latência cold start
- **-**: Bandwidth Supabase Storage para datasets >10MB (mitigado por signed URL TTL 1h + CDN smart cache)
- **-**: Sincronização entre `app/js/core/validation/profiles/*.json` (legacy) e `ip_regulatory_thresholds` (novo) durante rollout gradual

## Referências

- [SPEC_IP_DATA_CONSOLIDATION_CLI_TO_SUPABASE.md](../../../../../docs/specs/arch/SPEC_IP_DATA_CONSOLIDATION_CLI_TO_SUPABASE.md) — spec completa A1-A10
- [research note](../../../../../.runtime/research/ip-data-consol-001-best-practices-2026-06-07.md) — 14 sources online (RLS multi-tenant, FAIR, Supabase Smart CDN, provenance)
- [docs/LESSONS.md `rls-default-deny`](../../../../../docs/LESSONS.md) — incidente 2026-04-10 motivando ADR A9 FORCE RLS
- [memory/project_supabase_extensions.md] — extensões pg habilitadas (pgcrypto, pg_jsonschema usadas no schema M1)
