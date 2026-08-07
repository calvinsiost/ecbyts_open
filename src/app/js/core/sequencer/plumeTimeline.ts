// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PLUME ANIMATION TIMELINE — SPEC_G5_PLUME_ANIMATION

   Pure helpers para timeline de plumas temporais:
   - Campaign markers (data point timestamps)
   - Linear interpolation entre campanhas (§Q1)
   - Frame generation para playback
   - LOD decisão (§Q3 performance)

   Three.js mesh + Chart timeline em handler.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

export const INTERPOLATION_METHODS = ['linear', 'step', 'smooth'] as const;
export type InterpolationMethod = (typeof INTERPOLATION_METHODS)[number];

export const DEFAULT_INTERPOLATION: InterpolationMethod = 'linear';

// LOD thresholds §Q3
export const LOD_THRESHOLDS = {
    full: 20, // ≤20 campanhas → carrega tudo
    lazy: 50, // 21-50 → lazy load
    summary: Infinity, // >50 → summary only
} as const;

// ──────────────────────────────────────────────────────────────────────
// Campaign validation
// ──────────────────────────────────────────────────────────────────────

export interface Campaign {
    id: string;
    timestamp: string | number | Date;
    plumeData?: unknown;
}

/**
 * Valida shape de campanha com plume data.
 *
 * @param {unknown} campaign - { id, timestamp, plumeData }
 * @returns {campaign is Campaign}
 */
export function isValidCampaign(campaign: unknown): campaign is Campaign {
    if (!campaign || typeof campaign !== 'object') return false;
    const c = campaign as Record<string, unknown>;
    if (!c.id || typeof c.id !== 'string') return false;
    const tsRaw = c.timestamp;
    if (tsRaw === undefined || tsRaw === null) return false;
    const ts = new Date(tsRaw as string | number | Date).getTime();
    if (!Number.isFinite(ts)) return false;
    return true;
}

/**
 * Ordena campanhas por timestamp asc.
 * @param {ReadonlyArray<unknown>} campaigns
 * @returns {Array<Campaign>}
 */
export function sortCampaignsByTime(campaigns: ReadonlyArray<unknown>): Array<Campaign> {
    if (!Array.isArray(campaigns)) return [];
    const valid = campaigns.filter(isValidCampaign);
    return valid.slice().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

// ──────────────────────────────────────────────────────────────────────
// LOD decision §Q3
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide nível de detalhe baseado em N campanhas.
 * @param {number} count
 * @returns {'full'|'lazy'|'summary'}
 */
export function resolveLOD(count: number): 'full' | 'lazy' | 'summary' {
    if (!Number.isFinite(count) || count <= 0) return 'full';
    if (count <= LOD_THRESHOLDS.full) return 'full';
    if (count <= LOD_THRESHOLDS.lazy) return 'lazy';
    return 'summary';
}

// ──────────────────────────────────────────────────────────────────────
// Linear interpolation §Q1
// ──────────────────────────────────────────────────────────────────────

/**
 * Interpola valor entre 2 campanhas no timestamp alvo.
 * Linear: α = (t - t0) / (t1 - t0).
 *
 * @param {number} valA - valor em tA
 * @param {number} valB - valor em tB
 * @param {number} tA - timestamp A
 * @param {number} tB - timestamp B
 * @param {number} tTarget - timestamp alvo
 * @returns {number}
 */
export function interpolateLinear(valA: number, valB: number, tA: number, tB: number, tTarget: number): number {
    if (!Number.isFinite(valA) || !Number.isFinite(valB)) return 0;
    if (!Number.isFinite(tA) || !Number.isFinite(tB) || !Number.isFinite(tTarget)) return 0;
    if (tA === tB) return valA;
    const alpha = (tTarget - tA) / (tB - tA);
    const clamped = Math.max(0, Math.min(1, alpha));
    return valA + (valB - valA) * clamped;
}

/**
 * Encontra duas campanhas adjacentes ao timestamp alvo (para interp).
 *
 * @param {ReadonlyArray<Campaign>} sortedCampaigns
 * @param {number} targetTs
 * @returns {{ prev: Campaign|null, next: Campaign|null, alpha: number }}
 */
export function findAdjacentCampaigns(
    sortedCampaigns: ReadonlyArray<Campaign>,
    targetTs: number,
): { prev: Campaign | null; next: Campaign | null; alpha: number } {
    if (!Array.isArray(sortedCampaigns) || sortedCampaigns.length === 0) {
        return { prev: null, next: null, alpha: 0 };
    }
    let prev: Campaign | null = null;
    let next: Campaign | null = null;
    for (const c of sortedCampaigns) {
        const ct = new Date(c.timestamp).getTime();
        if (ct <= targetTs) prev = c;
        else {
            next = c;
            break;
        }
    }

    // Target antes da primeira campanha
    if (!prev && next) return { prev: null, next, alpha: 0 };
    // Target depois da última
    if (prev && !next) return { prev, next: null, alpha: 1 };
    if (!prev || !next) return { prev: null, next: null, alpha: 0 };

    const pt = new Date(prev.timestamp).getTime();
    const nt = new Date(next.timestamp).getTime();
    const alpha = nt > pt ? (targetTs - pt) / (nt - pt) : 0;
    return { prev, next, alpha: Math.max(0, Math.min(1, alpha)) };
}

// ──────────────────────────────────────────────────────────────────────
// Frame generation
// ──────────────────────────────────────────────────────────────────────

export interface Frame {
    timestamp: number;
    alpha: number;
    prev: Campaign | null;
    next: Campaign | null;
    method: string;
}

/**
 * Gera array de frames para playback entre primeiro e último timestamp.
 *
 * @param {ReadonlyArray<unknown>} campaigns
 * @param {{ frameCount?: number, method?: string }} [opts]
 * @returns {Array<Frame>}
 */
export function generateFrames(
    campaigns: ReadonlyArray<unknown>,
    opts: { frameCount?: number; method?: string } = {},
): Array<Frame> {
    const sorted = sortCampaignsByTime(campaigns);
    if (sorted.length < 2) return [];

    const rawCount = opts.frameCount;
    const frameCount =
        typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount >= 2 ? Math.floor(rawCount) : 30;
    const rawMethod = opts.method;
    const method =
        typeof rawMethod === 'string' && (INTERPOLATION_METHODS as readonly string[]).includes(rawMethod) ? rawMethod : DEFAULT_INTERPOLATION;

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) return [];
    const firstTs = new Date(first.timestamp).getTime();
    const lastTs = new Date(last.timestamp).getTime();
    const totalDuration = lastTs - firstTs;
    if (totalDuration <= 0) return [];

    const frames: Array<Frame> = [];
    for (let i = 0; i < frameCount; i++) {
        const t = firstTs + (i / (frameCount - 1)) * totalDuration;
        const { prev, next, alpha } = findAdjacentCampaigns(sorted, t);
        frames.push({
            timestamp: t,
            alpha: method === 'step' ? (alpha < 0.5 ? 0 : 1) : alpha,
            prev,
            next,
            method,
        });
    }
    return frames;
}

// ──────────────────────────────────────────────────────────────────────
// Playback state (pure reducer)
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa próximo frame index de playback.
 *
 * @param {number} currentIdx
 * @param {number} total
 * @param {number} [direction=1]
 * @param {boolean} [loop=true]
 * @returns {number}
 */
export function nextFrameIndex(
    currentIdx: number,
    total: number,
    direction: number = 1,
    loop: boolean = true,
): number {
    if (!Number.isFinite(currentIdx) || !Number.isFinite(total) || total <= 0) return 0;
    const step = direction >= 0 ? 1 : -1;
    const next = currentIdx + step;
    if (loop) {
        return ((next % total) + total) % total;
    }
    return Math.max(0, Math.min(total - 1, next));
}