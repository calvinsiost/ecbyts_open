// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   EIS EXTERNAL CREDIBILITY — pure logic
   (SPEC_EIS_EXTERNAL_CREDIBILITY_SIGNALS — avaliação 2026-06-14)

   Sub-bônus de credibilidade EXTERNA VERIFICÁVEL no eixo T do EIS
   (Transparência/Evidência de origem). Mesma família do
   radarTransparencyBonus: aditivo, BOUNDED, capeado.

   Sinais avaliados (decisão Calvin 2026-06-14):
     - peer_reviewed_doi  +0.50  (DOI de revista, validação por pares)
     - arxiv_preprint     +0.25  (preprint; < peer-reviewed)
     - open_repo          +0.30  (repo público + license OSI + dataset versionado)
   "online/URL pública" NÃO entra aqui — já é o radarTransparencyBonus.
   "contexto LLM" NÃO entra — é disclosure (B3), não crédito.

   INVARIANTES (preservam o não-compensatório do EIS):
   - Só conta sinal `verified: true` (provado pelo resolver externo;
     link declarado sem prova = 0 — CCC-001).
   - Cada TYPE conta UMA vez (3 DOIs não viram +1.5).
   - Teto agregado +1.0 — o sinal REFINA o T, não o domina (evita
     "score de vaidade acadêmica"; o dado de campo continua mandando).

   Pure: sem DOM, sem rede. O resolver (edge/cron) faz a verificação e
   grava os sinais; esta função só LÊ o flag verificado e soma.
   ================================================================ */

export type ExternalCredibilityType = 'peer_reviewed_doi' | 'arxiv_preprint' | 'open_repo';

export interface ExternalCredibilitySignal {
    readonly type: ExternalCredibilityType;
    /** Só `true` (verificado pelo resolver) contribui. */
    readonly verified: boolean;
    readonly evidenceUrl?: string | null;
    readonly verifiedAt?: string | null;
}

export interface ExternalCredibilityContribution {
    readonly type: ExternalCredibilityType;
    readonly contribution: number;
    readonly evidenceUrl: string | null;
    readonly verifiedAt: string | null;
}

export interface ExternalCredibilityBonus {
    readonly bonus: number;
    readonly cappedAt: number;
    readonly breakdown: readonly ExternalCredibilityContribution[];
}

/** Pesos canônicos (avaliação §3). */
export const EXTERNAL_CREDIBILITY_WEIGHTS: Readonly<Record<ExternalCredibilityType, number>> = Object.freeze({
    peer_reviewed_doi: 0.5,
    arxiv_preprint: 0.25,
    open_repo: 0.3,
});

/** Teto agregado — preserva o não-compensatório do EIS. */
export const EXTERNAL_CREDIBILITY_CAP = 1.0;

const VALID_TYPES = new Set<string>(Object.keys(EXTERNAL_CREDIBILITY_WEIGHTS));

/**
 * Computa o bônus agregado de credibilidade externa a partir de sinais
 * VERIFICADOS. Cada type conta uma vez; total capeado em +1.0.
 *
 * @param signals lista de sinais (verificados ou não — só os verificados contam)
 * @returns bônus + breakdown auditável, ou bonus 0 se nada verificado.
 */
export function eisExternalCredibilityBonus(
    signals: readonly ExternalCredibilitySignal[] | null | undefined,
): ExternalCredibilityBonus {
    const breakdown: ExternalCredibilityContribution[] = [];
    if (Array.isArray(signals)) {
        const seen = new Set<ExternalCredibilityType>();
        for (const s of signals) {
            if (!s || s.verified !== true) continue;
            const type = s.type as ExternalCredibilityType;
            if (!VALID_TYPES.has(type) || seen.has(type)) continue;
            seen.add(type);
            breakdown.push(
                Object.freeze({
                    type,
                    contribution: EXTERNAL_CREDIBILITY_WEIGHTS[type],
                    evidenceUrl: typeof s.evidenceUrl === 'string' ? s.evidenceUrl : null,
                    verifiedAt: typeof s.verifiedAt === 'string' ? s.verifiedAt : null,
                }),
            );
        }
    }
    // Ordena por contribuição desc para um breakdown estável/legível.
    breakdown.sort((a, b) => b.contribution - a.contribution || a.type.localeCompare(b.type));
    const rawSum = breakdown.reduce((acc, b) => acc + b.contribution, 0);
    const bonus = Math.min(EXTERNAL_CREDIBILITY_CAP, parseFloat(rawSum.toFixed(2)));
    return Object.freeze({
        bonus,
        cappedAt: EXTERNAL_CREDIBILITY_CAP,
        breakdown: Object.freeze(breakdown),
    });
}
