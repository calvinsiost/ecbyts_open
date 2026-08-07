// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import {
    CONVERSION_RATE,
    CREDIT_QUALITY,
    DEFAULT_PERIOD_DAYS,
    MAX_CREDITS_PER_PERIOD,
    MIN_DELTA_THRESHOLD,
} from './creditRules.js';

function round2(value: unknown): number {
    return Math.round(Number(value || 0) * 100) / 100;
}

function clampPct(value: unknown): number {
    const v = Number(value || 0);
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, v));
}

export function validateCreditSplit(
    split: { contractor?: number; contracted?: number } = {},
):
    | { valid: false; error: string; contractor: number; contracted: number; sum: number }
    | { valid: true; contractor: number; contracted: number; sum: number } {
    const contractor = clampPct(split.contractor);
    const contracted = clampPct(split.contracted);
    const sum = round2(contractor + contracted);
    if (sum !== 100) {
        return {
            valid: false,
            error: 'credit_split_must_sum_100',
            contractor,
            contracted,
            sum,
        };
    }
    return { valid: true, contractor, contracted, sum };
}

export function computeGrossEic(
    deltaEis: unknown,
    conversionRate: number = CONVERSION_RATE,
    cap: number = MAX_CREDITS_PER_PERIOD,
): number {
    const delta = Number(deltaEis || 0);
    if (!Number.isFinite(delta) || delta < MIN_DELTA_THRESHOLD) return 0;
    const gross = round2(delta * Number(conversionRate || CONVERSION_RATE));
    return Math.min(gross, Number(cap || MAX_CREDITS_PER_PERIOD));
}

export function splitEic(grossEic: number, split: { contractor?: number; contracted?: number } = {}) {
    const splitCheck = validateCreditSplit(split);
    if (!splitCheck.valid) throw new Error((splitCheck as { error: string }).error);

    const gross = round2(grossEic);
    const contractorEic = round2(gross * (splitCheck.contractor / 100));
    const contractedEic = round2(gross * (splitCheck.contracted / 100));
    const residual = round2(gross - contractorEic - contractedEic);

    return {
        grossEic: gross,
        contractorEic,
        contractedEic: round2(contractedEic + residual),
        residualEic: residual,
    };
}

export function calculateCreditAllocation(
    params: {
        deltaEis?: unknown;
        conversionRate?: number;
        cap?: number;
        creditSplit?: { contractor?: number; contracted?: number };
        periodDays?: number;
    } = {},
) {
    const grossEic = computeGrossEic(params.deltaEis, params.conversionRate, params.cap);
    return {
        ...splitEic(grossEic, params.creditSplit || {}),
        eligible: grossEic >= 1,
        periodDays: Number(params.periodDays || DEFAULT_PERIOD_DAYS),
    };
}

export function classifyCreditQuality(
    input: {
        hasContract?: boolean;
        hasAuditor?: boolean;
        hasVetoClearance?: boolean;
        verificationMethod?: string;
    } = {},
): string {
    const hasContract = Boolean(input.hasContract);
    const hasAuditor = Boolean(input.hasAuditor);
    const hasVetoClearance = input.hasVetoClearance !== false;
    const verificationMethod = String(input.verificationMethod || '').toLowerCase();
    if (hasContract && hasVetoClearance && hasAuditor && verificationMethod === 'auditor') return CREDIT_QUALITY.GOLD;
    if (hasContract && hasVetoClearance) return CREDIT_QUALITY.SILVER;
    return CREDIT_QUALITY.BRONZE;
}

export function isExternallyListable(qualityClass: string): boolean {
    return qualityClass === CREDIT_QUALITY.GOLD || qualityClass === CREDIT_QUALITY.SILVER;
}

export function computeDeficitState(currentEis: unknown, lastMintEis: unknown, deficitSince: string | null = null) {
    const current = Number(currentEis || 0);
    const lastMint = Number(lastMintEis || 0);
    const inDeficit = Number.isFinite(current) && Number.isFinite(lastMint) && current < lastMint;
    return {
        inDeficit,
        blockNewMint: inDeficit,
        deficitSince: inDeficit ? deficitSince || new Date().toISOString() : null,
    };
}
