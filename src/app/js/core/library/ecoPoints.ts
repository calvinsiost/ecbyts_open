// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   ECO POINTS - Tier 3 B4 core policy
   Pure helpers for complexity scoring, review gates, decay, discounts,
   and reputation contribution. No browser or persistence dependencies.
   ================================================================ */

export const ECO_POINTS_POLICY_VERSION = 'eco-points-v1';

export const ECO_POINTS_POLICY = Object.freeze({
    weights: Object.freeze({
        assetMb: 0.3,
        configurableParams: 0.4,
        components: 0.2,
        docScore: 0.1,
    }),
    maxPointsPerItem: 500,
    humanReviewThreshold: 300,
    annualDecayRate: 0.1,
    pointsPerDiscountStep: 1000,
    discountStepPercent: 10,
    maxDiscountPercent: 50,
    cashRedeemable: false,
    internalDiscountEligible: true,
    reputationEligible: true,
});

function finiteNonNegative(value: unknown): number {
    if (value === null || value === undefined || value === '') {
        return 0;
    }

    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
        return 0;
    }

    return n;
}

function roundPoints(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Computes the Tier 3 B4 complexity score using the Calvin default formula:
 * mb * 0.3 + params * 0.4 + components * 0.2 + docScore * 0.1.
 */
export function calculateEcoPoints(
    item: {
        assetMb?: number;
        mb?: number;
        configurableParams?: number;
        params?: number;
        components?: number;
        docScore?: number;
    } = {},
): {
    policyVersion: string;
    rawComplexity: number;
    points: number;
    capped: boolean;
    requiresHumanReview: boolean;
    factors: { assetMb: number; configurableParams: number; components: number; docScore: number };
    benefits: { cashRedeemable: boolean; internalDiscountEligible: boolean; reputationEligible: boolean };
} {
    const factors = {
        assetMb: finiteNonNegative(item.assetMb ?? item.mb),
        configurableParams: finiteNonNegative(item.configurableParams ?? item.params),
        components: finiteNonNegative(item.components),
        docScore: finiteNonNegative(item.docScore),
    };

    const rawComplexity =
        factors.assetMb * ECO_POINTS_POLICY.weights.assetMb +
        factors.configurableParams * ECO_POINTS_POLICY.weights.configurableParams +
        factors.components * ECO_POINTS_POLICY.weights.components +
        factors.docScore * ECO_POINTS_POLICY.weights.docScore;

    const points = Math.min(roundPoints(rawComplexity), ECO_POINTS_POLICY.maxPointsPerItem);

    return {
        policyVersion: ECO_POINTS_POLICY_VERSION,
        rawComplexity: roundPoints(rawComplexity),
        points,
        capped: points < roundPoints(rawComplexity),
        requiresHumanReview: points > ECO_POINTS_POLICY.humanReviewThreshold,
        factors,
        benefits: {
            cashRedeemable: ECO_POINTS_POLICY.cashRedeemable,
            internalDiscountEligible: ECO_POINTS_POLICY.internalDiscountEligible,
            reputationEligible: ECO_POINTS_POLICY.reputationEligible,
        },
    };
}

/**
 * Applies 10% annual decay for stale items. Decay is compound by full elapsed
 * years and never increases the balance.
 */
export function applyEcoPointDecay({
    points,
    lastUpdatedAt,
    asOf = new Date(),
}: {
    points?: number;
    lastUpdatedAt?: string | number | Date;
    asOf?: string | number | Date;
} = {}): { points: number; yearsElapsed: number; decayed: boolean } {
    const basePoints = finiteNonNegative(points);
    const lastUpdated = new Date((lastUpdatedAt ?? NaN) as string | number | Date).getTime();
    const now = new Date(asOf as string | number | Date).getTime();

    if (!Number.isFinite(lastUpdated) || !Number.isFinite(now) || now <= lastUpdated) {
        return { points: roundPoints(basePoints), yearsElapsed: 0, decayed: false };
    }

    const millisPerYear = 365 * 24 * 60 * 60 * 1000;
    const yearsElapsed = Math.floor((now - lastUpdated) / millisPerYear);
    if (yearsElapsed <= 0) {
        return { points: roundPoints(basePoints), yearsElapsed: 0, decayed: false };
    }

    const decayedPoints = basePoints * Math.pow(1 - ECO_POINTS_POLICY.annualDecayRate, yearsElapsed);
    return {
        points: roundPoints(decayedPoints),
        yearsElapsed,
        decayed: true,
    };
}

/**
 * Internal marketplace discount: 1000 points = 10%, capped at 50%.
 * Points are not cash redeemable.
 */
export function calculateEcoDiscount(points: number): {
    discountPercent: number;
    cashRedeemable: false;
    internalOnly: true;
} {
    const steps = Math.floor(finiteNonNegative(points) / ECO_POINTS_POLICY.pointsPerDiscountStep);
    return {
        discountPercent: Math.min(steps * ECO_POINTS_POLICY.discountStepPercent, ECO_POINTS_POLICY.maxDiscountPercent),
        cashRedeemable: false,
        internalOnly: true,
    };
}

/**
 * Reputation contribution from Eco Points plus social/platform signals.
 */
export function calculateEcoReputationScore({
    ecoPoints = 0,
    positiveReviews = 0,
    platformMonths = 0,
}: { ecoPoints?: number; positiveReviews?: number; platformMonths?: number } = {}): {
    score: number;
    components: { ecoPoints: number; positiveReviews: number; platformMonths: number };
} {
    const components = {
        ecoPoints: finiteNonNegative(ecoPoints) * 0.4,
        positiveReviews: finiteNonNegative(positiveReviews) * 0.4,
        platformMonths: finiteNonNegative(platformMonths) * 0.2,
    };

    return {
        score: roundPoints(components.ecoPoints + components.positiveReviews + components.platformMonths),
        components,
    };
}
