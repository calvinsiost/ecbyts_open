// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   NOTIFICATIONS — channel preference filter (pure, node-testable)
   ARCH-MONOLITH-ATOMIZATION-001

   Fatia PURA extraída inline de manager.ts createNotification().
   NÃO faz IDB/rede/DOM — só decisão sobre quais canais sobrevivem
   às preferências do usuário.

   - resolveCategoryPrefs: escolhe o bucket de prefs por type→tier→{}
   - filterChannelsByPrefs: mantém canais não explicitamente desligados

   Comportamento idêntico ao código que substitui em manager.ts:
     const categoryPrefs = (prefsByKey[type] || prefsByKey[tier] || {});
     channels.filter((ch) => {
       if (categoryPrefs[ch] === false) return false;
       if (categoryPrefs[ch] === true) return true;
       return true;
     });
   ================================================================ */

/** Mapa de preferências do usuário, indexado por type ou tier. */
export type PrefsByKey = Record<string, unknown>;

/** Bucket de preferências de uma categoria: canal → boolean (ou ausente). */
export type CategoryPrefs = Record<string, unknown>;

/**
 * Resolve o bucket de preferências aplicável a uma notificação.
 * Precedência: prefs[type] → prefs[tier] → {} (objeto vazio).
 *
 * @param prefsByKey - preferências do usuário (pode ser null/undefined)
 * @param type - tipo da notificação (ex: 'comment.mention')
 * @param tier - tier resolvido (ex: 'P1')
 * @returns o bucket de preferências (sempre um objeto)
 */
export function resolveCategoryPrefs(
    prefsByKey: PrefsByKey | null | undefined,
    type: string | undefined,
    tier: string | undefined,
): CategoryPrefs {
    const prefs = (prefsByKey && typeof prefsByKey === 'object' ? prefsByKey : {}) as PrefsByKey;
    const byType = type != null ? prefs[type] : undefined;
    const byTier = tier != null ? prefs[tier] : undefined;
    const bucket = byType ?? byTier ?? {};
    return (bucket && typeof bucket === 'object' ? bucket : {}) as CategoryPrefs;
}

/**
 * Filtra os canais candidatos pelas preferências da categoria.
 * Um canal é removido apenas quando explicitamente desligado (=== false);
 * `true` e ausência mantêm o canal (opt-out, não opt-in).
 *
 * @param channels - canais candidatos (ex: ['in_app', 'email'])
 * @param categoryPrefs - bucket de prefs resolvido por resolveCategoryPrefs
 * @returns subconjunto de channels que sobrevivem às prefs
 */
export function filterChannelsByPrefs(
    channels: ReadonlyArray<string> | null | undefined,
    categoryPrefs: CategoryPrefs | null | undefined,
): string[] {
    if (!Array.isArray(channels)) return [];
    const prefs = (categoryPrefs && typeof categoryPrefs === 'object' ? categoryPrefs : {}) as CategoryPrefs;
    return channels.filter((ch) => {
        if (prefs[ch] === false) return false;
        if (prefs[ch] === true) return true;
        return true;
    });
}

/**
 * Atalho que combina resolução + filtro: dado o conjunto de canais,
 * as prefs do usuário, o type e o tier, devolve os canais permitidos.
 *
 * @param channels - canais candidatos
 * @param prefsByKey - preferências do usuário
 * @param type - tipo da notificação
 * @param tier - tier resolvido
 * @returns canais permitidos pelas preferências
 */
export function resolveAllowedChannels(
    channels: ReadonlyArray<string> | null | undefined,
    prefsByKey: PrefsByKey | null | undefined,
    type: string | undefined,
    tier: string | undefined,
): string[] {
    const categoryPrefs = resolveCategoryPrefs(prefsByKey, type, tier);
    return filterChannelsByPrefs(channels, categoryPrefs);
}
