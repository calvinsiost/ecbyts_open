// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic helpers for handlers/hypothesisTest.ts (verdict meta + interpretation + stat formatting).
// DOM-free, i18n-free (returns i18n keys + fallbacks for caller to resolve via t()).
// Extracted Wave YYYY1 from src/app/js/utils/handlers/hypothesisTest.ts (724L handler).

export type VerdictMeta = {
    rejected: boolean;
    cls: string;
    icon: string;
    titleKey: string;
    titleFallback: string;
    subtitleKey: string;
    subtitleFallback: string;
};

export const VERDICT_REJECT: Readonly<Omit<VerdictMeta, 'rejected'>> = Object.freeze({
    cls: 'hypothesis-verdict-reject',
    icon: '&#10007;',
    titleKey: 'hypothesisVerdictRejectTitle',
    titleFallback: 'Houve mudanca significativa',
    subtitleKey: 'hypothesisVerdictRejectSubtitle',
    subtitleFallback:
        'As concentracoes mudaram de forma que nao pode ser explicada por variacao aleatoria.',
});

export const VERDICT_ACCEPT: Readonly<Omit<VerdictMeta, 'rejected'>> = Object.freeze({
    cls: 'hypothesis-verdict-accept',
    icon: '&#10003;',
    titleKey: 'hypothesisVerdictAcceptTitle',
    titleFallback: 'Sem mudanca significativa detectada',
    subtitleKey: 'hypothesisVerdictAcceptSubtitle',
    subtitleFallback:
        'As concentracoes sao compativeis com variacao natural entre campanhas.',
});

export function getVerdictMeta(reject: unknown): VerdictMeta {
    const rejected = Boolean(reject);
    const base = rejected ? VERDICT_REJECT : VERDICT_ACCEPT;
    return { rejected, ...base };
}

export function formatStat(value: unknown, decimals: number = 4, dash: string = '—'): string {
    if (value === null || value === undefined) return dash;
    const n = Number(value);
    if (!Number.isFinite(n)) return dash;
    const d = Number.isFinite(decimals) && decimals >= 0 && decimals <= 20
        ? Math.floor(decimals as number)
        : 4;
    return n.toFixed(d);
}

export function computeConfidencePercent(alpha: unknown, fallbackAlpha: number = 0.05): number {
    const a = Number(alpha);
    const safe = Number.isFinite(a) && a > 0 && a < 1 ? a : fallbackAlpha;
    return Math.round((1 - safe) * 100);
}

export function clampPValue(pValue: unknown): number | null {
    if (pValue === null || pValue === undefined) return null;
    const n = Number(pValue);
    if (!Number.isFinite(n)) return null;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

export type InterpretationBullet = {
    key: string;
    fallback: string;
    params?: Record<string, unknown>;
};

export function getInterpretationBullets(
    reject: unknown,
    alpha: unknown,
    pValue: unknown,
): ReadonlyArray<InterpretationBullet> {
    const rejected = Boolean(reject);
    const pFormatted = formatStat(pValue, 4);
    const confidence = computeConfidencePercent(alpha);
    if (rejected) {
        return Object.freeze([
            Object.freeze({
                key: 'hypothesisInterpretReject1',
                fallback:
                    'A remediacao (ou outro fator) teve efeito mensuravel nas concentracoes',
            }),
            Object.freeze({
                key: 'hypothesisInterpretReject2',
                fallback: `p = ${pFormatted}`,
                params: Object.freeze({ p: pFormatted }),
            }),
            Object.freeze({
                key: 'hypothesisInterpretReject3',
                fallback: `Confianca ${confidence}%`,
                params: Object.freeze({ c: confidence }),
            }),
        ]);
    }
    return Object.freeze([
        Object.freeze({
            key: 'hypothesisInterpretAccept1',
            fallback:
                'Nao ha evidencia de que houve alteracao significativa nas concentracoes',
        }),
        Object.freeze({
            key: 'hypothesisInterpretAccept2',
            fallback: 'A variacao observada e compativel com flutuacao natural',
        }),
        Object.freeze({
            key: 'hypothesisInterpretAccept3',
            fallback:
                'Pode ser necessario mais tempo, mais amostras, ou sensibilidade do metodo',
        }),
    ]);
}

export function canRunTest(state: unknown): boolean {
    const s = state as { campaignA?: unknown; campaignB?: unknown } | null | undefined;
    if (!s || typeof s !== 'object') return false;
    return Boolean(s.campaignA) && Boolean(s.campaignB);
}
