// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic helpers for homeGrid reputation + credential + workspace date formatters.
// DOM-free, i18n-free (returns i18n keys + fallbacks for caller to resolve via t()).
// Extracted Wave UUUU1 from src/app/js/utils/ui/homeGrid.ts (#1 monolito, 4646L).

export type ReputationTier = {
    readonly min: number;
    readonly threshold: number;
    readonly class: string;
    readonly i18nKey: string;
    readonly fallback: string;
};

export const REPUTATION_TIERS: readonly ReputationTier[] = Object.freeze([
    Object.freeze({ min: 0, threshold: 40, class: 'seed', i18nKey: 'repSeed', fallback: 'Seed' }),
    Object.freeze({ min: 40, threshold: 60, class: 'rising', i18nKey: 'repRising', fallback: 'Rising' }),
    Object.freeze({ min: 60, threshold: 75, class: 'active', i18nKey: 'repActive', fallback: 'Active' }),
    Object.freeze({ min: 75, threshold: 90, class: 'trusted', i18nKey: 'repTrusted', fallback: 'Trusted' }),
    Object.freeze({ min: 90, threshold: 101, class: 'vanguard', i18nKey: 'repVanguard', fallback: 'Vanguard' }),
]) as readonly ReputationTier[];

export type CredentialKey = {
    readonly i18nKey: string;
    readonly fallback: string;
};

export const CREDENTIAL_LABEL_KEYS: Readonly<Record<string, CredentialKey>> = Object.freeze({
    common: Object.freeze({ i18nKey: 'credCommon', fallback: 'Member' }),
    professional: Object.freeze({ i18nKey: 'credProfessional', fallback: 'Professional' }),
    pos_graduado: Object.freeze({ i18nKey: 'credPostGrad', fallback: 'Postgraduate' }),
    mestre: Object.freeze({ i18nKey: 'credMaster', fallback: 'Master' }),
    doutor: Object.freeze({ i18nKey: 'credDoctor', fallback: 'PhD' }),
}) as Readonly<Record<string, CredentialKey>>;

export function clampScore(score: unknown): number {
    const n = Number(score);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
}

export type ReputationLevelMeta = {
    class: string;
    i18nKey: string;
    fallback: string;
    min: number;
};

export function getReputationLevelMeta(score: unknown): ReputationLevelMeta {
    const s = clampScore(score);
    for (let i = REPUTATION_TIERS.length - 1; i >= 0; i--) {
        const tier = REPUTATION_TIERS[i];
        if (tier && s >= tier.min) {
            return { class: tier.class, i18nKey: tier.i18nKey, fallback: tier.fallback, min: tier.min };
        }
    }
    return { class: 'seed', i18nKey: 'repSeed', fallback: 'Seed', min: 0 };
}

export type NextLevelMeta = {
    threshold: number;
    i18nKey: string;
    fallback: string;
};

export function getNextLevelMeta(score: unknown): NextLevelMeta | null {
    const s = clampScore(score);
    for (const tier of REPUTATION_TIERS) {
        if (s < tier.threshold && tier.threshold <= 100) {
            return { threshold: tier.threshold, i18nKey: tier.i18nKey, fallback: tier.fallback };
        }
    }
    return null;
}

export function getCredentialLabelMeta(level: unknown): CredentialKey {
    const key = typeof level === 'string' ? level : 'common';
    return CREDENTIAL_LABEL_KEYS[key] ?? CREDENTIAL_LABEL_KEYS.common!;
}

export function formatWorkspaceDate(
    dateLike: unknown,
    locale: string = 'pt-BR',
    fallback: string = 'Sem data',
): string {
    if (dateLike === null || dateLike === undefined || dateLike === '') return fallback;
    try {
        const parsed = new Date(dateLike as string | number | Date);
        if (Number.isNaN(parsed.getTime())) return fallback;
        return parsed.toLocaleString(locale, {
            dateStyle: 'short',
            timeStyle: 'short',
        });
    } catch {
        return fallback;
    }
}

export function getProgressToNextLevel(score: unknown): number {
    const s = clampScore(score);
    const next = getNextLevelMeta(s);
    if (!next) return 100;
    const current = getReputationLevelMeta(s);
    const span = next.threshold - current.min;
    if (span <= 0) return 0;
    const progressed = s - current.min;
    const ratio = (progressed / span) * 100;
    if (ratio < 0) return 0;
    if (ratio > 100) return 100;
    return ratio;
}
