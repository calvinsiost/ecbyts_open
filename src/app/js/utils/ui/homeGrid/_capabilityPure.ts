// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — lógica PURA da decisão de capability premium da home.
 * claude (refactor) 2026-06-20.
 *
 * EN: Pure premium-capability gate for the Actions shell. No DOM, no globals, no
 *     module state, no session lookup. Mirrors the legacy inline
 *     `_canUseCapability(capability)` in homeGrid.ts EXACTLY:
 *       - derive `tier` from `user.tier || user.user_metadata?.tier ||
 *         user.app_metadata?.tier || 'free'`, lower-cased;
 *       - derive `subscriptionStatus` from `user.subscriptionStatus`, lower-cased;
 *       - `isPremium` when tier is one of pro/scale/enterprise/premium OR
 *         subscriptionStatus === 'active';
 *       - gated capabilities (`cap_graph_relations`, `cap_ai_context_panel`)
 *         return `isPremium`; ANY OTHER capability returns `true` (open).
 *     The barrel (`homeGrid.ts`) keeps the `getCurrentUser()` I/O and passes the
 *     resolved user object in — behaviour identical.
 *
 * PT (leigo): decide, sem mexer na tela nem buscar sessão, SE um recurso premium
 *     (grafo de relações, painel de IA) pode ser usado. Olha o "plano" (tier) e o
 *     status da assinatura do usuário: se for um plano pago ou assinatura ativa, é
 *     premium e libera. Recursos não-premium ficam sempre liberados. É exatamente
 *     a mesma regra que estava embutida no homeGrid — agora isolada e testável.
 *
 * Pure: entradas → saída determinística, sem efeitos colaterais. Cheap tests:
 * tests/ui/homeGrid/capability.test.mjs.
 */

/** Minimal shape of the session user consumed by the capability gate. */
export interface CapabilityUser {
    readonly tier?: unknown;
    readonly subscriptionStatus?: unknown;
    readonly user_metadata?: { readonly tier?: unknown } | null;
    readonly app_metadata?: { readonly tier?: unknown } | null;
    readonly [key: string]: unknown;
}

/** Capabilities that are gated behind a premium tier/subscription. */
const PREMIUM_GATED_CAPABILITIES = Object.freeze(['cap_graph_relations', 'cap_ai_context_panel']);

/**
 * True when the user is on a premium tier OR has an active subscription.
 *
 * Byte-identical to the legacy inline derivation in `_canUseCapability`.
 *
 * @param user the resolved session user (may be null/undefined → treated as free)
 */
export function isPremiumUser(user: CapabilityUser | null | undefined): boolean {
    const u = (user || {}) as CapabilityUser;
    const tierRaw = u.tier || u.user_metadata?.tier || u.app_metadata?.tier || 'free';
    const tier = String(tierRaw).toLowerCase();
    const subscriptionStatus = String(u.subscriptionStatus || '').toLowerCase();
    return (
        tier === 'pro' ||
        tier === 'scale' ||
        tier === 'enterprise' ||
        tier === 'premium' ||
        subscriptionStatus === 'active'
    );
}

/**
 * Decide whether a given capability is usable for the supplied user.
 *
 * Gated capabilities require {@link isPremiumUser}; every other capability is
 * open (returns `true`). Mirrors the legacy inline `_canUseCapability` exactly.
 *
 * @param user       the resolved session user (may be null/undefined)
 * @param capability the capability id to check
 */
export function resolveCapability(user: CapabilityUser | null | undefined, capability: unknown): boolean {
    if (PREMIUM_GATED_CAPABILITIES.includes(capability as string)) {
        return isPremiumUser(user);
    }
    return true;
}
