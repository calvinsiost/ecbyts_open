// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

export const VALID_STORYBOARD_EASINGS = new Set(['linear', 'ease-in', 'ease-out', 'ease-in-out']);
export const VALID_STORYBOARD_SPEEDS = new Set([0.25, 0.5, 1, 2, 4]);

export const DEFAULT_LANE = { id: 'lane-default', name: 'Raia 1', order: 0, color: '#4f8ef7' };

export function computeStoryboardTotalDuration(
    keyframes: ReadonlyArray<{ duration?: number; transition?: number }> = [],
): number {
    if (!Array.isArray(keyframes) || keyframes.length === 0) return 0;
    let total = 0;
    for (const kf of keyframes) {
        total +=
            (Number.isFinite(kf?.duration) ? (kf.duration as number) : 3000) +
            (Number.isFinite(kf?.transition) ? (kf.transition as number) : 1000);
    }
    return total;
}

export function serializeStoryboardState(
    keyframes: ReadonlyArray<unknown> = [],
    playback: { speed?: number; loop?: boolean } = {},
    lanes: ReadonlyArray<unknown> = [],
): {
    keyframes: ReadonlyArray<unknown>;
    lanes: ReadonlyArray<unknown>;
    playback: { speed: number | undefined; loop: boolean | undefined };
} {
    return {
        keyframes: Array.isArray(keyframes) ? keyframes : [],
        lanes: Array.isArray(lanes) && lanes.length > 0 ? lanes : [{ ...DEFAULT_LANE }],
        playback: {
            speed: playback?.speed,
            loop: playback?.loop,
        },
    };
}

interface RawKeyframe {
    id?: string;
    itemId?: string;
    position?: number;
    duration?: number;
    transition?: number;
    easing?: string;
    annotation?: string;
    cameraOverride?: unknown;
    campaignIds?: ReadonlyArray<string>;
    elementVisibility?: Record<string, boolean>;
    laneId?: string;
}

interface NormalizedKeyframe {
    id: string;
    itemId: string;
    position: number;
    duration: number;
    transition: number;
    easing: string;
    cameraOverride: unknown;
    campaignIds: ReadonlyArray<string> | null;
    elementVisibility: Record<string, boolean> | null;
    annotation: string | null;
    laneId: string;
}

export function normalizeStoryboardKeyframe(
    raw: unknown,
    index: number,
    options: { now?: () => number } = {},
): NormalizedKeyframe | null {
    const now = typeof options.now === 'function' ? options.now : Date.now;
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as RawKeyframe;
    if (typeof r.itemId !== 'string' || !r.itemId) return null;

    const position = Number.isFinite(r.position) ? Math.max(0, Math.min(1, r.position as number)) : 0;
    const duration =
        Number.isFinite(r.duration) && (r.duration as number) >= 0 ? (r.duration as number) : 3000;
    const transition =
        Number.isFinite(r.transition) && (r.transition as number) >= 0 ? (r.transition as number) : 1000;
    const easing = typeof r.easing === 'string' && VALID_STORYBOARD_EASINGS.has(r.easing) ? r.easing : 'ease-out';
    const annotation = typeof r.annotation === 'string' ? r.annotation.slice(0, 500) : null;

    return {
        id: typeof r.id === 'string' && r.id ? r.id : `kf-import-${now()}-${index}`,
        itemId: r.itemId,
        position,
        duration,
        transition,
        easing,
        cameraOverride: r.cameraOverride || null,
        campaignIds: Array.isArray(r.campaignIds) ? r.campaignIds : null,
        elementVisibility: r.elementVisibility && typeof r.elementVisibility === 'object' ? r.elementVisibility : null,
        annotation,
        laneId: typeof r.laneId === 'string' && r.laneId ? r.laneId : 'lane-default',
    };
}

export function normalizeStoryboardRestore(
    data: unknown,
    options: {
        validItemIds?: Set<string>;
        legacyIdMap?: Map<string, string>;
        currentSpeed?: number;
        currentLoop?: boolean;
        now?: () => number;
    } = {},
): {
    keyframes: ReadonlyArray<NormalizedKeyframe>;
    lanes?: Array<{ id: string; name: string; order: number; color: string }>;
    playback: { speed: number; loop: boolean; totalDuration: number };
} {
    const validItemIds = options.validItemIds instanceof Set ? options.validItemIds : new Set();
    const legacyIdMap = options.legacyIdMap instanceof Map ? options.legacyIdMap : new Map();
    const currentSpeed =
        typeof options.currentSpeed === 'number' && VALID_STORYBOARD_SPEEDS.has(options.currentSpeed)
            ? options.currentSpeed
            : 1.0;
    const currentLoop = options.currentLoop === true;
    const now = typeof options.now === 'function' ? options.now : Date.now;

    if (!data || typeof data !== 'object') {
        return {
            keyframes: [],
            playback: {
                speed: 1.0,
                loop: false,
                totalDuration: 0,
            },
        };
    }

    const d = data as {
        keyframes?: ReadonlyArray<unknown>;
        playback?: { speed?: number; loop?: boolean };
        speed?: number;
        loop?: boolean;
        lanes?: ReadonlyArray<unknown>;
    };

    const importedKeyframes: NormalizedKeyframe[] = Array.isArray(d.keyframes)
        ? (d.keyframes.map((kf, i) => normalizeStoryboardKeyframe(kf, i, { now })).filter(Boolean) as NormalizedKeyframe[])
        : [];

    const seenIds: Set<string> = new Set();
    const deduped: NormalizedKeyframe[] = importedKeyframes.map((kf: NormalizedKeyframe, i: number) => {
        if (seenIds.has(kf.id)) {
            return { ...kf, id: `kf-dedup-${now()}-${i}` };
        }
        seenIds.add(kf.id);
        return kf;
    });

    const remapped: NormalizedKeyframe[] = deduped.map((kf: NormalizedKeyframe) => {
        const mappedId = legacyIdMap.get(kf.itemId);
        if (!mappedId || mappedId === kf.itemId) return kf;
        return { ...kf, itemId: mappedId };
    });

    const filtered =
        validItemIds.size > 0
            ? remapped.filter((kf: NormalizedKeyframe) => validItemIds.has(kf.itemId))
            : remapped;
    filtered.sort((a: NormalizedKeyframe, b: NormalizedKeyframe) => a.position - b.position);

    const candidateSpeed = d.playback?.speed ?? d.speed;
    const speed =
        typeof candidateSpeed === 'number' && VALID_STORYBOARD_SPEEDS.has(candidateSpeed)
            ? candidateSpeed
            : currentSpeed;
    const loop = d.playback?.loop ?? d.loop;

    // Normalizar raias: se ausente, usar raia padrao
    let lanes: Array<{ id: string; name: string; order: number; color: string }> = [{ ...DEFAULT_LANE }];
    if (Array.isArray(d.lanes) && d.lanes.length > 0) {
        lanes = d.lanes
            .filter(
                (l: unknown) =>
                    !!l &&
                    typeof l === 'object' &&
                    typeof (l as { id?: unknown }).id === 'string' &&
                    !!(l as { id?: string }).id,
            )
            .map((l: unknown, i: number) => {
                const lo = l as { id: string; name?: unknown; order?: unknown; color?: unknown };
                return {
                    id: lo.id,
                    name: typeof lo.name === 'string' && lo.name ? lo.name : `Raia ${i + 1}`,
                    order: Number.isFinite(lo.order) ? (lo.order as number) : i,
                    color: typeof lo.color === 'string' && lo.color ? lo.color : DEFAULT_LANE.color,
                };
            }) as Array<{ id: string; name: string; order: number; color: string }>;
        if (lanes.length === 0) lanes = [{ ...DEFAULT_LANE }];
    }

    return {
        keyframes: filtered,
        lanes,
        playback: {
            speed,
            loop: loop != null ? !!loop : currentLoop,
            totalDuration: computeStoryboardTotalDuration(filtered),
        },
    };
}
