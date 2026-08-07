// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure rules for Environmental Integrity Credits (EIC).

export const CREDIT_NAME = 'Environmental Integrity Credit';
export const CREDIT_SYMBOL = 'EIC';
export const CONVERSION_RATE = 10.0; // 1 EIC = 0.10 delta EIS
export const MIN_DELTA_THRESHOLD = 0.1;
export const MAX_CREDITS_PER_PERIOD = 50.0;
export const DEFAULT_PERIOD_DAYS = 30;
export const EXPIRY_MONTHS = 24;

export const CREDIT_QUALITY = {
    GOLD: 'EIC-Gold',
    SILVER: 'EIC-Silver',
    BRONZE: 'EIC-Bronze',
};

export const CREDIT_TRANSITIONS = {
    generated: ['verified', 'rejected'],
    verified: ['minted', 'rejected'],
    minted: ['listed', 'held', 'retired', 'revoked'],
    listed: ['traded', 'delisted', 'expired', 'revoked'],
    held: ['listed', 'retired', 'transferred', 'revoked'],
    traded: ['held', 'listed', 'retired'],
    transferred: ['held', 'listed', 'retired'],
    delisted: ['listed', 'held', 'retired'],
    retired: [],
    expired: [],
    rejected: [],
    revoked: [],
};

/**
 * @param {string} currentState
 * @param {string} nextState
 * @returns {boolean}
 */
export function canCreditTransition(currentState: string, nextState: string): boolean {
    const allowed = (CREDIT_TRANSITIONS as Record<string, string[]>)[currentState] || [];
    return allowed.includes(nextState);
}
