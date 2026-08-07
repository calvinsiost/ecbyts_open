// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Stratigraphic interpretation engine for geological cross-sections.

const MIN_THICKNESS_M = 0.05;

const SOIL_GROUP = {
    clay: 'fine',
    silt: 'fine',
    sandy_clay: 'fine',
    topsoil: 'organic',
    peat: 'organic',
    sand: 'coarse',
    silty_sand: 'coarse',
    clayey_sand: 'coarse',
    gravel: 'coarse',
    fill: 'anthropic',
    rock: 'rock',
};

function toNum(v: any, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeLayer(layer: any, idx: any): any {
    const from = Math.max(0, toNum(layer?.from, 0));
    const to = Math.max(from + MIN_THICKNESS_M, toNum(layer?.to, from + MIN_THICKNESS_M));
    const soilType = String(layer?.soilType || layer?.type || 'clay');
    return {
        idx,
        from,
        to,
        thickness: Math.max(MIN_THICKNESS_M, to - from),
        mid: (from + to) / 2,
        soilType,
        sucs: String(layer?.sucs || '')
            .trim()
            .toUpperCase(),
        consistency: String(layer?.consistency || '')
            .trim()
            .toLowerCase(),
        description: String(layer?.description || '')
            .trim()
            .toLowerCase(),
        raw: layer,
    };
}

export function normalizeWellProfile(well: any): any[] {
    const input = Array.isArray(well?.data?.profile?.lithologic) ? well.data.profile.lithologic : [];
    const sorted = input
        .map((l: any, idx: any) => normalizeLayer(l, idx))
        .sort((a: any, b: any) => a.from - b.from || a.to - b.to);

    const layers: any[] = [];
    for (const layer of sorted) {
        if (layers.length === 0) {
            layers.push(layer);
            continue;
        }
        const prev: any = layers[layers.length - 1];
        if (layer.from < prev.to) {
            // overlap: clip start to previous end
            const clippedFrom: any = prev.to;
            if (layer.to - clippedFrom >= MIN_THICKNESS_M) {
                layers.push({
                    ...layer,
                    from: clippedFrom,
                    thickness: layer.to - clippedFrom,
                    mid: (clippedFrom + layer.to) / 2,
                });
            }
            continue;
        }
        if (layer.from - prev.to > MIN_THICKNESS_M) {
            // explicit gap
            layers.push({
                idx: -1,
                from: prev.to,
                to: layer.from,
                thickness: layer.from - prev.to,
                mid: (prev.to + layer.from) / 2,
                soilType: '__gap__',
                sucs: '',
                consistency: '',
                description: 'gap',
                raw: null,
            });
        }
        layers.push(layer);
    }

    return layers;
}

function textSim(a: any, b: any): number {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const aa = new Set(a.split(/\s+/g).filter(Boolean));
    const bb = new Set(b.split(/\s+/g).filter(Boolean));
    if (!aa.size || !bb.size) return 0;
    let inter = 0;
    for (const t of aa) if (bb.has(t)) inter += 1;
    return inter / Math.max(aa.size, bb.size);
}

function depthScore(a: any, b: any, maxDepth: any): number {
    const d = Math.abs(a.mid - b.mid);
    const norm = maxDepth > 0 ? d / maxDepth : 0;
    return Math.max(0, 1 - norm * 1.8);
}

function signatureScore(a: any, b: any, maxDepth: any): number {
    if (!a || !b) return 0;
    if (a.soilType === '__gap__' || b.soilType === '__gap__') return 0;

    const soilExact = a.soilType === b.soilType ? 1 : 0;
    const groupEq =
        (SOIL_GROUP as Record<string, string>)[a.soilType] &&
        (SOIL_GROUP as Record<string, string>)[a.soilType] === (SOIL_GROUP as Record<string, string>)[b.soilType]
            ? 1
            : 0;
    const sucsEq = a.sucs && b.sucs ? (a.sucs === b.sucs ? 1 : 0) : 0;
    const consEq = a.consistency && b.consistency ? (a.consistency === b.consistency ? 1 : 0) : 0;
    const desc = textSim(a.description, b.description);
    const dep = depthScore(a, b, maxDepth);

    const score = soilExact * 0.3 + groupEq * 0.22 + sucsEq * 0.1 + consEq * 0.08 + desc * 0.08 + dep * 0.22;

    return Math.max(0, Math.min(1, score));
}

/**
 * Monotonic maximum-score pairing to avoid invalid crossing links.
 */
export function matchHorizons(leftLayers: any, rightLayers: any, opts: any = {}): any {
    const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 0.55;
    const maxDepth = Math.max(
        ...leftLayers.map((l: any) => l.to),
        ...rightLayers.map((l: any) => l.to),
        1,
    );

    const n = leftLayers.length;
    const m = rightLayers.length;
    const dp: any = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    const choice: any = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));

    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const l = leftLayers[i - 1];
            const r = rightLayers[j - 1];
            const s = signatureScore(l, r, maxDepth);

            let best = dp[i - 1][j];
            let ch: any = { type: 'up' };

            if (dp[i][j - 1] > best) {
                best = dp[i][j - 1];
                ch = { type: 'left' };
            }

            if (s >= threshold) {
                const v = dp[i - 1][j - 1] + s;
                if (v >= best) {
                    best = v;
                    ch = { type: 'diag', score: s };
                }
            }

            dp[i][j] = best;
            choice[i][j] = ch;
        }
    }

    const links: any[] = [];
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
        const ch = choice[i][j];
        if (!ch) break;
        if (ch.type === 'diag') {
            links.push({
                leftIndex: i - 1,
                rightIndex: j - 1,
                score: ch.score,
            });
            i -= 1;
            j -= 1;
        } else if (ch.type === 'up') {
            i -= 1;
        } else {
            j -= 1;
        }
    }
    links.reverse();

    const matchedLeft = new Set(links.map((l: any) => l.leftIndex));
    const matchedRight = new Set(links.map((l: any) => l.rightIndex));

    return {
        links,
        unmatchedLeft: leftLayers
            .map((_: any, idx: any) => idx)
            .filter((idx: any) => !matchedLeft.has(idx)),
        unmatchedRight: rightLayers
            .map((_: any, idx: any) => idx)
            .filter((idx: any) => !matchedRight.has(idx)),
    };
}

export function computeUncertainty(score: any, distanceMeters: any): number {
    const s = Math.max(0, Math.min(1, Number(score) || 0));
    const d = Math.max(0, Number(distanceMeters) || 0);
    const distComponent = Math.min(6, Math.max(0.3, d * 0.012));
    const scoreComponent = (1 - s) * 3.2;
    return Math.max(0.25, distComponent + scoreComponent);
}

function pairDistance(leftWell: any, rightWell: any): number {
    const ax = toNum(leftWell?.position?.x, 0);
    const az = toNum(leftWell?.position?.z, 0);
    const bx = toNum(rightWell?.position?.x, 0);
    const bz = toNum(rightWell?.position?.z, 0);
    return Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
}

/**
 * Build correlations for each adjacent well pair.
 */
export function buildInterpretation(wells: any, opts: any = {}): any {
    const threshold = Number.isFinite(opts.confidenceThreshold) ? opts.confidenceThreshold : 0.55;
    const normalized = wells.map((w: any) => ({
        well: w,
        layers: normalizeWellProfile(w),
    }));

    const pairs = [];
    let confidenceSum = 0;
    let confidenceN = 0;

    for (let i = 0; i < normalized.length - 1; i++) {
        const left = normalized[i];
        const right = normalized[i + 1];
        const dist = pairDistance(left.well, right.well);
        const match = matchHorizons(left.layers, right.layers, { threshold });

        const segments: any[] = match.links.map((lnk: any) => {
            const l = left.layers[lnk.leftIndex];
            const r = right.layers[lnk.rightIndex];
            const uncert = computeUncertainty(lnk.score, dist);
            confidenceSum += lnk.score;
            confidenceN += 1;
            return {
                leftIndex: lnk.leftIndex,
                rightIndex: lnk.rightIndex,
                score: lnk.score,
                discontinuity: false,
                soilType: l.soilType,
                left: l,
                right: r,
                uncertaintyTop: uncert,
                uncertaintyBottom: uncert,
            };
        });

        for (const idx of match.unmatchedLeft) {
            const l = left.layers[idx];
            segments.push({
                leftIndex: idx,
                rightIndex: null,
                score: 0,
                discontinuity: true,
                soilType: l.soilType,
                left: l,
                right: null,
                uncertaintyTop: computeUncertainty(0.1, dist),
                uncertaintyBottom: computeUncertainty(0.1, dist),
            });
        }
        for (const idx of match.unmatchedRight) {
            const r = right.layers[idx];
            segments.push({
                leftIndex: null,
                rightIndex: idx,
                score: 0,
                discontinuity: true,
                soilType: r.soilType,
                left: null,
                right: r,
                uncertaintyTop: computeUncertainty(0.1, dist),
                uncertaintyBottom: computeUncertainty(0.1, dist),
            });
        }

        segments.sort((a, b) => {
            const aMid = a.left?.mid ?? a.right?.mid ?? 0;
            const bMid = b.left?.mid ?? b.right?.mid ?? 0;
            return aMid - bMid;
        });

        pairs.push({
            pairIndex: i,
            leftWell: left.well,
            rightWell: right.well,
            distanceMeters: dist,
            segments,
            unmatchedLeft: match.unmatchedLeft,
            unmatchedRight: match.unmatchedRight,
        });
    }

    return {
        wells: normalized,
        pairs,
        confidenceMean: confidenceN > 0 ? confidenceSum / confidenceN : 0,
        confidenceThreshold: threshold,
    };
}
