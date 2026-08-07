// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   RANDOM → RADAR COMMUNICATE — local broadcast previews
   (RND-RADAR-COMM-001)

   The cloud broadcast path (auth → save model → radar_broadcast_profiles)
   stays the real product. This module seeds LOCAL, offline-first preview
   broadcasts when a Random Model is generated, so Data Studio → Communicate
   → Radar → "My Broadcasts" is not empty for a fresh local model.

   Pure-logic core (buildRadarBroadcastPreviews) — no DOM, no network, no
   Supabase. The thin wiring (seedRadarBroadcastPreviews) resolves locale +
   model families and persists via safeSetItem. Reuses the 9 stakeholder
   profile templates from seedRadarProfiles.ts.
   ================================================================ */
// NOTE: zero top-level imports — keeps the pure core node-importable for cheap
// tests. The wiring (seedRadarBroadcastPreviews) dynamic-imports its deps so the
// browser-only chain (elements/manager → Three.js) never loads under Node.

/** localStorage key consumed by utils/ui/radarModal for the offline fallback. */
export const RADAR_PREVIEW_KEY = 'ecbyts-radar-previews';

/**
 * @typedef {Object} RadarBroadcastPreview
 * @property {string} id
 * @property {string} model_id
 * @property {{name:string, audience:string, visible_families:string[], rate_limit:any}} profile
 * @property {{families:string[], redaction:'none'|'partial'|'full'}} slice
 * @property {string} share_code  Always `preview-…` — NOT a real network link.
 * @property {'preview'} status
 */

/** @param {() => number} rng @returns {string} `preview-` + 6-char base36 code */
function _previewCode(rng: any) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 6; i++) {
        const r = typeof rng === 'function' ? rng() : 0;
        out += alphabet[Math.floor(r * alphabet.length) % alphabet.length];
    }
    return `preview-${out}`;
}

/**
 * Pure: build N deterministic local broadcast previews from profiles + families.
 * @param {{ profiles: any[], families?: string[], modelId?: string, rng?: () => number, count?: number }} opts
 * @returns {RadarBroadcastPreview[]}
 */
export function buildRadarBroadcastPreviews(opts: any = {}) {
    const rng = typeof opts.rng === 'function' ? opts.rng : () => 0.5;
    const profiles = Array.isArray(opts.profiles) ? opts.profiles : [];
    const families = Array.isArray(opts.families) ? opts.families.filter(Boolean) : [];
    const modelId = opts.modelId || 'local';
    if (profiles.length === 0) return [];
    const requested = Number.isFinite(opts.count) ? Number(opts.count) : 1 + Math.floor(rng() * 3); // 1..3
    const n = Math.max(1, Math.min(3, requested, profiles.length));
    /** @type {RadarBroadcastPreview[]} */
    const previews: any[] = [];
    for (let i = 0; i < n; i++) {
        const p = profiles[i];
        // visible families: deterministic subset (>=1) of the model's families
        let visible: string[] = [];
        if (families.length) {
            const take = Math.max(1, Math.ceil(families.length * (0.4 + 0.5 * rng())));
            visible = families.slice(0, Math.min(take, families.length));
        }
        const redaction = i === 0 ? 'none' : i === 1 ? 'partial' : 'full';
        previews.push({
            id: `preview-${p.slug || 'profile'}-${i}`,
            model_id: modelId,
            profile: {
                name: p.name || p.slug || 'Broadcast',
                audience: p.slug || 'stakeholder',
                visible_families: visible,
                rate_limit: p.default_rate_limit || { tokens_per_second: 10, max_tokens_per_request: 100 },
            },
            slice: { families: visible, redaction },
            share_code: _previewCode(rng),
            status: 'preview',
        });
    }
    return previews;
}

/**
 * Wiring: resolve locale + model families + modelId, build previews and persist
 * locally (safeSetItem). Offline-first, no cloud. Called from phase-finalize.
 * @param {any} [ctx]
 * @returns {RadarBroadcastPreview[]}
 */
export async function seedRadarBroadcastPreviews(ctx: any = {}) {
    try {
        const w = typeof window !== 'undefined' ? (window as any) : {};
        const locale = ctx?.locale || w.__ecbtLocale || 'pt-BR';
        const modelId = ctx?.modelId || w.__currentModelId || 'local';

        const { resolveSeedPack } = await import('./seedRadarProfiles.js');
        const profiles = (resolveSeedPack(locale) || []) as any[];

        let families: string[] = Array.isArray(ctx?.families) ? ctx.families : [];
        if (!families.length) {
            try {
                const { getAllElements } = await import('../../elements/manager.js');
                const els = (getAllElements() || []) as any[];
                families = [...new Set(els.map((e: any) => e?.familyId).filter(Boolean))] as string[];
            } catch (e: any) {
                console.debug('[random:radar-preview] families:', e?.message || e);
                families = [];
            }
        }

        let rng = ctx?.rng;
        if (typeof rng !== 'function') {
            try {
                const { runtimeRandom } = await import('../runtime.js');
                rng = () => runtimeRandom('radar');
            } catch (e: any) {
                console.debug('[random:radar-preview] rng:', e?.message || e);
                rng = Math.random;
            }
        }

        const previews = buildRadarBroadcastPreviews({ profiles, families, modelId, rng });
        try {
            const { safeSetItem } = await import('../../../utils/storage/storageMonitor.js');
            safeSetItem(RADAR_PREVIEW_KEY, JSON.stringify(previews));
        } catch (e: any) {
            console.debug('[random:radar-preview] persist fallback:', e?.message || e);
            if (typeof localStorage !== 'undefined') localStorage.setItem(RADAR_PREVIEW_KEY, JSON.stringify(previews));
        }
        return previews;
    } catch (err: any) {
        console.debug('[random:radar-preview] seed skipped:', err?.message || err);
        return [];
    }
}
