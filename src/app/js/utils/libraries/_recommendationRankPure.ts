// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// ARCH-MONOLITH-ATOMIZATION-001 — pure-logic slice extracted from
// utils/libraries/supabaseMarketplace.ts fetchRecommendations() (lines ~739-787).
//
// Extracts the DETERMINISTIC ranking core of the recommendation algorithm:
// filter-out-installed → score → sort → split top/rest. The Supabase fetch and
// the per-call decorations (_creatorName, _isRemote...) stay in the caller; only
// the math is extracted so behavior is provably identical.
//
// The 80/20 top-vs-random split uses an INJECTED rng (default Math.random) so the
// pure function is testable while preserving identical runtime behavior when the
// caller passes Math.random — i.e. supabaseMarketplace continues to call
// rng = Math.random implicitly.
//
// Spec NOT:
// - NÃO ler module state, NÃO chamar Supabase, NÃO decorar com _creatorName etc.
// - NÃO duplicar core/library/ecoPoints (reputação) nem marketV2Rules (pricing).
// - NÃO emoji.
//
// Extracted helpers:
//   - RankableLibrary                  (minimal shape the math touches)
//   - recommendationScore(lib)         pure: rating*2 + log10(installs+1)
//   - filterNotInstalled(all, ids)     pure: drop libraries already installed
//   - scoreAndSortCandidates(cands)    pure: attach _score, sort desc (stable-ish)
//   - splitTopAndRandom(scored, limit, rng)  pure-with-injected-rng: 80% top + 20% random

export interface RankableLibrary {
    library_id?: string;
    avg_rating_overall?: number | null;
    install_count?: number | null;
    [key: string]: unknown;
}

export interface ScoredLibrary extends RankableLibrary {
    _score: number;
}

/**
 * Recommendation score for one library.
 * Matches inline formula @ supabaseMarketplace.ts:765
 *   (avg_rating_overall || 0) * 2 + Math.log10((install_count || 0) + 1)
 */
export function recommendationScore(lib: RankableLibrary): number {
    const rating = lib.avg_rating_overall || 0;
    const installs = lib.install_count || 0;
    return rating * 2 + Math.log10(installs + 1);
}

/**
 * Drop libraries whose library_id is in the installed set.
 * Matches inline filter @ supabaseMarketplace.ts:759-760.
 */
export function filterNotInstalled<T extends RankableLibrary>(
    all: ReadonlyArray<T>,
    installedIds: ReadonlyArray<string>,
): T[] {
    const installed = new Set<string>(installedIds);
    return all.filter((l) => !installed.has(l.library_id as string));
}

/**
 * Attach _score to each candidate and sort by score descending.
 * Matches inline `scored.map(...)` + `scored.sort(...)` @ 763-772, minus the
 * caller-owned decorations (_creatorName / _isRemote / _isRecommended).
 *
 * Returns a NEW array; inputs are not mutated.
 */
export function scoreAndSortCandidates<T extends RankableLibrary>(
    candidates: ReadonlyArray<T>,
): Array<T & { _score: number }> {
    const scored = candidates.map((c) => ({ ...c, _score: recommendationScore(c) }));
    scored.sort((a, b) => b._score - a._score);
    return scored;
}

/**
 * Split a scored, sorted list into 80% top + 20% random-from-the-rest, capped at
 * limit. Matches inline split @ supabaseMarketplace.ts:773-782.
 *
 * The rng (default Math.random) is injected for testability; passing Math.random
 * reproduces the original runtime behavior exactly.
 *
 * Note: this mutates a local copy of `rest` only (splice on a slice), never the
 * caller's array.
 */
export function splitTopAndRandom<T>(
    scored: ReadonlyArray<T>,
    limit: number,
    rng: () => number = Math.random,
): T[] {
    const topCount = Math.ceil(limit * 0.8);
    const randCount = limit - topCount;
    const top = scored.slice(0, topCount);
    const rest = scored.slice(topCount);
    const random: T[] = [];
    for (let i = 0; i < randCount && rest.length > 0; i++) {
        const idx = Math.floor(rng() * rest.length);
        const [picked] = rest.splice(idx, 1);
        if (picked !== undefined) random.push(picked);
    }
    return [...top, ...random].slice(0, limit);
}
