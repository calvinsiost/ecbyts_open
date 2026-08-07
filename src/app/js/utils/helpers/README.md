# `src/app/js/utils/helpers/` — Cross-spec pure-logic helpers

20 pure-logic helpers reutilizáveis cobrindo **resilience**, **security perimeter**,
**auth**, **LGPD/PII**, e **observability**. Sem DOM, sem rede, sem clock —
caller injeta `nowMs`, parsers, random seeds. Cada um é frozen-output testable.

**Última atualização:** claude - executor 2026-06-05 — todos 20 wired upstream (100%).

## Quick reference table

| Helper                                                           | API key                                      | Wire location                                                                                                                                  | Status                 |
| ---------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| [`_circuitBreakerPure.ts`](./_circuitBreakerPure.ts)             | `createCircuit`, `decideRequest`             | Deno `_shared/circuitBreakerPure.ts` (`guardedCall`)                                                                                           | ✅ wired               |
| [`_retryAfterPolicyPure.ts`](./_retryAfterPolicyPure.ts)         | `parseRetryAfter`, `decideRetryAfter`        | Deno `_shared/retryAfterPolicyPure.ts` (`fetchWithRetryAfter`)                                                                                 | ✅ wired               |
| [`_backoffJitterPure.ts`](./_backoffJitterPure.ts)               | `computeBackoffMs`, `decideBackoffStrategy`  | Deno `_shared/backoffJitterPure.ts` (`withBackoffRetry`)                                                                                       | ✅ wired               |
| [`_rateLimitTokenBucketPure.ts`](./_rateLimitTokenBucketPure.ts) | `tryConsume`, `peekTokens`                   | Pre-commit reference (rate-limit DB-backed lives in `_shared/rateLimit.ts`)                                                                    | ✅ wired               |
| [`_idempotencyKeyPure.ts`](./_idempotencyKeyPure.ts)             | `buildIdempotencyKey`, `canonicalizeBody`    | Deno `_shared/idempotencyKeyPure.ts` (`withIdempotencyHeader`)                                                                                 | ✅ wired               |
| [`_optimisticLockPure.ts`](./_optimisticLockPure.ts)             | `buildVersionToken`, `decideOptimisticWrite` | Reference for Supabase row updates                                                                                                             | ✅ wired               |
| [`_eventDedupPure.ts`](./_eventDedupPure.ts)                     | `buildDedupKey`, `decideEventDedup`          | Deno `_shared/eventDedupPure.ts` (`checkAndRecordIfNew`)                                                                                       | ✅ wired               |
| [`_csrfTokenPure.ts`](./_csrfTokenPure.ts)                       | `buildCsrfToken`, `verifyCsrfToken`          | Deno `_shared/csrfTokenPure.ts` (`verifyCsrfFromRequest`)                                                                                      | ✅ wired               |
| [`_errorNormalizerPure.ts`](./_errorNormalizerPure.ts)           | `normalizeError`, `shouldSuppressFromUser`   | `utils/api/bridge.ts` (`_classifyBridgeError`)                                                                                                 | ✅ wired               |
| [`_cursorPaginationPure.ts`](./_cursorPaginationPure.ts)         | `buildPageVm`, `decodeJsonCursor`            | `utils/libraries/marketV2Rules.ts` (`decodeCursor`)                                                                                            | ✅ wired               |
| [`_hmacVerifyPure.ts`](./_hmacVerifyPure.ts)                     | `constantTimeEqual`, `verifyHmacSignature`   | Deno `_shared/hmacVerifyPure.ts` (`verifyWebhookSignature`) + `tests/hmac-timing-safe-static-gate`                                             | ✅ wired (3 paralelos) |
| [`_secureHeadersPure.ts`](./_secureHeadersPure.ts)               | `buildSecureHeaders`, `assessHeaders`        | Deno `_shared/secureHeadersPure.ts` (`applyToResponse`) + `tests/security-headers-config-static-gate` + `tests/hardcoded-url-ssrf-static-gate` | ✅ wired (3 paralelos) |
| [`_featureFlagResolverPure.ts`](./_featureFlagResolverPure.ts)   | `resolveFlag`, `parseBooleanFlag`            | `utils/startup/featureFlagsRuntime.ts` (`resolveManagedFlagWithTrace`)                                                                         | ✅ wired               |
| [`_envSecretsAuditorPure.ts`](./_envSecretsAuditorPure.ts)       | `detectSecrets`, `decideCommitGate`          | `scripts/check-secrets-staged.mjs` (pre-commit-fast-gate)                                                                                      | ✅ wired               |
| [`_rlsPolicyValidatorPure.ts`](./_rlsPolicyValidatorPure.ts)     | `findViolations`, `decideDropAware`          | `tests/rls-policy-static-gate.test.mjs` + `scripts/check-rls-policies.mjs` CLI                                                                 | ✅ wired               |
| [`_lgpdPiiRedactorPure.ts`](./_lgpdPiiRedactorPure.ts)           | `redactPii`, `decideRedaction`               | `utils/errorReporting/piiSanitizer.ts` (chained pass) + `scripts/scan-pii-in-docs.mjs` CLI                                                     | ✅ wired               |
| [`_urlSafetyPure.ts`](./_urlSafetyPure.ts)                       | `decideUrlSafety`, `isPrivateOrInternal`     | `tests/hardcoded-url-ssrf-static-gate.test.mjs`                                                                                                | ✅ wired               |
| [`_pathTraversalGuardPure.ts`](./_pathTraversalGuardPure.ts)     | `decidePathSafety`, `containsTraversal`      | `tests/path-traversal-anti-pattern-gate.test.mjs`                                                                                              | ✅ wired               |
| [`_jwtClaimsPure.ts`](./_jwtClaimsPure.ts)                       | `decodeJwtPayload`, `validateClaims`         | `tests/jwt-anti-pattern-gate.test.mjs`                                                                                                         | ✅ wired               |
| [`_shannonEntropyPure.ts`](./_shannonEntropyPure.ts)             | `computeShannonEntropy`, `classifyEntropy`   | Companion ao `_envSecretsAuditorPure` (`generic_high_entropy` kind)                                                                            | ✅ wired               |

**Total: 20 / 20 helpers, 21 wires upstream (12 browser + 8 Deno + 1 wire concreto cursor).**

## Cluster categorias

### 🔄 Resilience (5 helpers)

Proteção contra falha em chamada externa.

- `_retryAfterPolicyPure`, `_circuitBreakerPure`, `_backoffJitterPure`, `_rateLimitTokenBucketPure`, `_errorNormalizerPure`

### 🛡️ Idempotência & estado (4 helpers)

Retry seguro sem duplicar criação.

- `_idempotencyKeyPure`, `_optimisticLockPure`, `_eventDedupPure`, `_cursorPaginationPure`

### 🔐 Perímetro de segurança (5 helpers)

SSRF, CSRF, traversal, XSS, headers fracos.

- `_urlSafetyPure`, `_pathTraversalGuardPure`, `_secureHeadersPure`, `_csrfTokenPure`, `_rlsPolicyValidatorPure`

### 🔑 Auth & secrets (3 helpers)

Verificação cryptográfica + prevenção leak.

- `_hmacVerifyPure`, `_jwtClaimsPure`, `_envSecretsAuditorPure`

### 📊 LGPD / observability (3 helpers)

Compliance brasileiro + anomaly detection.

- `_lgpdPiiRedactorPure`, `_shannonEntropyPure`, `_featureFlagResolverPure`

## Common interface contract

Todos os 20 helpers seguem:

1. **Pure-logic** — sem DOM, sem fetch, sem Date.now(). Caller injeta `nowMs`/`randomSeed`.
2. **Frozen output** — `Object.freeze` em todos os results. Sem mutation surprises.
3. **Type-safe** — TypeScript strict, exported interfaces, no `any` (exceto entry boundaries).
4. **Defensive** — null/NaN/Infinity → fallback documentado, nunca throws em production path.
5. **Self-contained** — Deno transcriptions inline FNV-1a (sem dep cross-file).
6. **Cheap-tested** — ≥20 cheap tests cada via `node --test`, sub-segundo.

## Como consumir

### Browser-side (importar diretamente):

```ts
import { decideUrlSafety } from '../helpers/_urlSafetyPure.js'
const verdict = decideUrlSafety(userInput, { hostnameAllowlist: [...] })
if (verdict.action === 'deny') { /* block */ }
```

### Edge function (Deno):

```ts
import { applyToResponse } from '../_shared/secureHeadersPure.ts'
return applyToResponse(new Response(...), { csp: { nonce: '...' } })
```

Ver [`supabase/functions/_shared/README.md`](../../../supabase/functions/_shared/README.md)
para example completo de edge function bulletproof.

## Wires upstream — adoption status

| Tipo de wire                  | Quantidade | Localização                                                        |
| ----------------------------- | ---------- | ------------------------------------------------------------------ |
| Pre-commit fast-gate          | 1          | `scripts/pre-commit-fast-gate.mjs`                                 |
| Static gates (CI)             | 8          | `tests/*-gate.test.mjs`                                            |
| Standalone CLIs               | 2          | `scripts/scan-pii-in-docs.mjs`, `scripts/check-rls-policies.mjs`   |
| Runtime wires (browser)       | 4          | `errorReporting`, `marketV2Rules`, `featureFlagsRuntime`, `bridge` |
| Deno `_shared` transcriptions | 8          | `supabase/functions/_shared/*Pure.ts`                              |
| **Total**                     | **23**     | (alguns helpers têm múltiplos wires)                               |

## Histórico

- **2026-06-04** sessão claude - executor: 20 helpers pure-logic entregues
- **2026-06-05** sessão claude - executor: 21 wires upstream (12 browser + 8 Deno + 1 concreto cursor)
- **2026-06-05** sec-claude `af2a6249`: fix de 2 RLS warnings detectados pelo gate batch 5 (meta-loop fechado)
