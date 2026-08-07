/**
 * _balanceHubFlagPure.ts — decisão PURA da flag BALANCE_HUB_ENABLED (CBMD-001 F4).
 *
 * SPEC_CUSTOMER_BALANCE_METERING_DISPLAY §8 (Rollback):
 *   - `CONFIG.FEATURES.BALANCE_HUB_ENABLED` é o rollback hatch do Balance Hub.
 *   - Off restaura o comportamento legacy: badge simples (F3) sem Hub modal.
 *   - §8.2: override de runtime via localStorage key 'ecbyts-feature-overrides'
 *     (JSON `{ BALANCE_HUB_ENABLED: false }`) vence o CONFIG estático —
 *     rollback em produção sem redeploy.
 *
 * Módulo 100% puro (zero DOM/localStorage direto): recebe o objeto FEATURES e a
 * string crua do override e devolve 'hub' | 'legacy'. O wire (F4, futuro) lê
 * localStorage e chama resolveBalanceHubMode(); os testes exercitam a decisão
 * sem browser. Precedente: balanceBadge.isBalanceBadgeEnabled (F3).
 *
 * Regras (default OFF defensivo, mesmo padrão de BALANCE_BADGE):
 *   1. Override presente e boolean → override decide (true=hub, false=legacy).
 *   2. Sem override utilizável → FEATURES.BALANCE_HUB_ENABLED === true → hub.
 *   3. Qualquer outro caso (ausente, null, string, JSON inválido…) → legacy.
 *
 * Cheap gate: tests/cbmd-001-balance-hub-flag-rollback.test.mjs
 */

/** Chave canônica da flag em CONFIG.FEATURES e no JSON de overrides. */
export const BALANCE_HUB_FLAG_KEY = 'BALANCE_HUB_ENABLED';

/** Chave localStorage dos overrides de runtime (spec §8.2). */
export const FEATURE_OVERRIDES_STORAGE_KEY = 'ecbyts-feature-overrides';

export type BalanceHubMode = 'hub' | 'legacy';

/**
 * Parseia a string crua do localStorage 'ecbyts-feature-overrides'.
 * Só aceita um objeto JSON plano; qualquer lixo (JSON inválido, array,
 * primitivo, null) degrada para `{}` — nunca lança.
 */
export function parseFeatureOverrides(raw: string | null | undefined): Record<string, unknown> {
    if (typeof raw !== 'string' || raw.trim() === '') return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {}; // JSON inválido → sem override (fail-soft, nunca lança)
    }
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
    }
    return {};
}

/**
 * Predicado puro: o Balance Hub está habilitado?
 * @param features  objeto CONFIG.FEATURES (ou qualquer coisa — defensivo).
 * @param overridesRaw  string crua de localStorage 'ecbyts-feature-overrides'.
 */
export function isBalanceHubEnabled(features: unknown, overridesRaw?: string | null): boolean {
    const overrides = parseFeatureOverrides(overridesRaw);
    const override = overrides[BALANCE_HUB_FLAG_KEY];
    if (typeof override === 'boolean') return override;
    if (features !== null && typeof features === 'object') {
        return (features as Record<string, unknown>)[BALANCE_HUB_FLAG_KEY] === true;
    }
    return false;
}

/**
 * Decisão de renderização: 'hub' (F4 Balance Hub) ou 'legacy' (badge F3 sem Hub).
 * É ESTA função que o wire do F4 deve consultar — remover o gate quebra o
 * cheap test de rollback (gate-proven-non-no-op).
 */
export function resolveBalanceHubMode(features: unknown, overridesRaw?: string | null): BalanceHubMode {
    return isBalanceHubEnabled(features, overridesRaw) ? 'hub' : 'legacy';
}
