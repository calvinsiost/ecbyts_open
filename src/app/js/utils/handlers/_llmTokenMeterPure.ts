// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic extraction (Wave PPP1 Q5 playbook P1 applied to llmChat).
// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Phase 1 P1 strategy.
//
// Strategy: extract DOM-free token meter math from utils/handlers/llmChat.js
// (2236 LOC). Caller mantém DOM access; pure module faz a math determinística.
//
// Spec NOT:
// - NÃO referenciar document/window/localStorage aqui
// - NÃO importar quota/credits — pure math only
// - NÃO emoji

import { toFiniteNumber } from '../helpers/toFiniteNumber.js';

/**
 * Compute token usage percent clamped [0..100].
 *
 * @param {number} used
 * @param {number} limit
 * @returns {number}
 */
export function computeTokenPercent(used: any, limit: any) {
    if (!Number.isFinite(used) || used < 0) return 0;
    if (!Number.isFinite(limit) || limit <= 0) return 0;
    return Math.min((used / limit) * 100, 100);
}

/**
 * Classify token usage severity for visual indicator.
 * - critical: pct >= 90
 * - warning: pct >= 70 && < 90
 * - normal: pct < 70
 *
 * @param {number} pct
 * @returns {'normal'|'warning'|'critical'}
 */
export function classifyTokenSeverity(pct: any) {
    if (!Number.isFinite(pct)) return 'normal';
    if (pct >= 90) return 'critical';
    if (pct >= 70) return 'warning';
    return 'normal';
}

/**
 * Format token percent as display label.
 * - '<1%' if pct < 1
 * - 'N%' else (rounded)
 *
 * @param {number} pct
 * @returns {string}
 */
export function formatTokenLabel(pct: any) {
    if (!Number.isFinite(pct) || pct < 0) return '0%';
    if (pct < 1) return '<1%';
    return Math.round(pct) + '%';
}

/**
 * Format token tooltip string with localized digits.
 *
 * @param {number} used
 * @param {number} limit
 * @returns {string}
 */
export function formatTokenTooltip(used: any, limit: any) {
    const u = toFiniteNumber(used, 0);
    const l = toFiniteNumber(limit, 0);
    return `Tokens: ${u.toLocaleString()} / ${l.toLocaleString()}`;
}

/**
 * Compute credits remaining percent for display.
 * Inverse of usage: 100 - usagePct, clamped [0..100].
 *
 * @param {number} usagePct
 * @returns {number}
 */
export function computeCreditsRemainingPercent(usagePct: any) {
    if (!Number.isFinite(usagePct)) return 100;
    return Math.max(0, Math.min(100, 100 - usagePct));
}

/**
 * Format credits remaining label as 'NN%'.
 *
 * @param {number} remainingPct
 * @returns {string}
 */
export function formatCreditsLabel(remainingPct: any) {
    if (!Number.isFinite(remainingPct)) return '--';
    return Math.round(Math.max(0, Math.min(100, remainingPct))) + '%';
}

/**
 * Format credits tooltip.
 *
 * @param {number} used
 * @param {number} limit
 * @returns {string}
 */
export function formatCreditsTooltip(used: any, limit: any) {
    const u = toFiniteNumber(used, 0);
    const l = toFiniteNumber(limit, 0);
    return `Credits: ${u.toLocaleString()} / ${l.toLocaleString()}`;
}

/**
 * Canonical token limit (1M tokens per session) — exposed for caller reuse.
 */
export const TOKEN_LIMIT_DEFAULT = 1_000_000;
