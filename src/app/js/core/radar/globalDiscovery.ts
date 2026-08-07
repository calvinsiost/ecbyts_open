// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

interface Bbox {
    minLat: number;
    minLon: number;
    maxLat: number;
    maxLon: number;
}
interface GeoPoint {
    lat: number;
    lon: number;
}
interface DiscoveryModel {
    id?: string;
    title?: string;
    type?: string;
    temporalCoverage?: unknown;
    visibilityTier?: string;
    lastUpdatedAt?: unknown;
    bbox?: Bbox;
    centerPoint?: GeoPoint;
    summary?: unknown;
    elementCount?: number;
    [key: string]: unknown;
}
interface Viewer {
    userId?: string;
    hasAccess?: boolean;
}
interface NftClaim {
    modelId?: string;
    state?: string;
    tokenId?: string;
}

/* ================================================================
   RADAR GLOBAL DISCOVERY — SPEC_RADAR_GLOBAL_MODEL_DISCOVERY_9_67

   Pure helpers para descoberta global + transparência seletiva:
   - Metadata visibility tiers §Q1 (public/summary/protected/private)
   - EIS transparency multiplier §Q2 (1.0-1.2x)
   - Geographic discovery filter (bbox/polygon)
   - NFT claim state §Q3

   Supabase query + map rendering em handler.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Visibility tiers §Q1
// ──────────────────────────────────────────────────────────────────────

export const VISIBILITY_TIERS = Object.freeze({
    PUBLIC: 'public', // Metadata + conteúdo liberado
    SUMMARY: 'summary', // Metadata + resumo (sem dados brutos)
    PROTECTED: 'protected', // Metadata apenas (existência visível)
    PRIVATE: 'private', // Invisível exceto para owner/members
});

export const TIER_LIST = Object.freeze(Object.values(VISIBILITY_TIERS));

// Metadata sempre visível (§Q1 transparência seletiva)
export const ALWAYS_VISIBLE_METADATA = Object.freeze([
    'id',
    'title',
    'type',
    'temporalCoverage',
    'visibilityTier',
    'lastUpdatedAt',
]);

// ──────────────────────────────────────────────────────────────────────
// Transparency multiplier §Q2
// ──────────────────────────────────────────────────────────────────────

export const MIN_TRANSPARENCY_MULTIPLIER = 1.0;
export const MAX_TRANSPARENCY_MULTIPLIER = 1.2;

/**
 * Computa multiplier de transparência para EIS (§Q2).
 * Premiar abertura, não penalizar fechamento.
 *
 * @param tier
 * @returns 1.0 to 1.2
 */
export function computeTransparencyMultiplier(tier: string): number {
    if (tier === VISIBILITY_TIERS.PUBLIC) return MAX_TRANSPARENCY_MULTIPLIER;
    if (tier === VISIBILITY_TIERS.SUMMARY) return 1.1;
    if (tier === VISIBILITY_TIERS.PROTECTED) return 1.05;
    return MIN_TRANSPARENCY_MULTIPLIER; // PRIVATE ou desconhecido
}

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

/**
 * @param tier
 */
export function isValidTier(tier: unknown): boolean {
    return typeof tier === 'string' && (TIER_LIST as readonly string[]).includes(tier);
}

/**
 * Valida shape de modelo público (descoberta global).
 * @param model
 */
export function validateDiscoveryModel(model: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!model || typeof model !== 'object') return { valid: false, errors: ['model not object'] };
    const m = model as DiscoveryModel;
    if (!m.id) errors.push('id required');
    if (!m.title || typeof m.title !== 'string') errors.push('title required');
    if (!isValidTier(m.visibilityTier)) errors.push('visibilityTier required');
    if (!m.bbox && !m.centerPoint) {
        errors.push('bbox or centerPoint required for geographic indexing');
    }
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Metadata projection (tier-aware)
// ──────────────────────────────────────────────────────────────────────

/**
 * Projeta modelo respeitando visibility tier + user permissions.
 *
 * @param model
 * @param viewer - { userId, hasAccess: boolean }
 */
export function projectModelForViewer(
    model: DiscoveryModel,
    viewer: Viewer = {},
): Record<string, unknown> | null {
    if (!validateDiscoveryModel(model).valid) return null;
    const tier = model.visibilityTier;
    const hasAccess = viewer?.hasAccess === true;

    // PRIVATE → null se não tem acesso
    if (tier === VISIBILITY_TIERS.PRIVATE && !hasAccess) return null;

    // Base projection: sempre metadata canônica
    const projection: Record<string, unknown> = {};
    for (const key of ALWAYS_VISIBLE_METADATA) {
        if (model[key] !== undefined) projection[key] = model[key];
    }

    // Tiers crescentes de exposição
    if (hasAccess || tier === VISIBILITY_TIERS.PUBLIC) {
        // Full access
        return { ...model, _projection: 'full' };
    }
    if (tier === VISIBILITY_TIERS.SUMMARY) {
        if (model.summary) projection.summary = model.summary;
        if (model.elementCount) projection.elementCount = model.elementCount;
        return { ...projection, _projection: 'summary' };
    }
    if (tier === VISIBILITY_TIERS.PROTECTED) {
        if (model.bbox) projection.bbox = model.bbox;
        return { ...projection, _projection: 'protected_metadata' };
    }
    return { ...projection, _projection: 'minimal' };
}

// ──────────────────────────────────────────────────────────────────────
// Geographic filter
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida bbox.
 * @param bbox - { minLat, minLon, maxLat, maxLon }
 */
export function isValidBbox(bbox: unknown): boolean {
    if (!bbox || typeof bbox !== 'object') return false;
    const b = bbox as Record<string, unknown>;
    const keys = ['minLat', 'minLon', 'maxLat', 'maxLon'] as const;
    if (!keys.every((k) => Number.isFinite(b[k]))) return false;
    const bb = b as unknown as Bbox;
    if (bb.minLat > bb.maxLat) return false;
    if (bb.minLon > bb.maxLon) return false;
    if (bb.minLat < -90 || bb.maxLat > 90) return false;
    if (bb.minLon < -180 || bb.maxLon > 180) return false;
    return true;
}

/**
 * Testa se um ponto está dentro do bbox.
 * @param point
 * @param bbox
 */
export function isPointInBbox(point: GeoPoint, bbox: Bbox): boolean {
    if (!isValidBbox(bbox) || !point) return false;
    const lat = Number(point.lat);
    const lon = Number(point.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}

/**
 * Filtra modelos que intersectam bbox (via centerPoint ou bbox próprio).
 * @param models
 * @param bbox
 */
export function filterModelsByBbox(models: DiscoveryModel[], bbox: Bbox): DiscoveryModel[] {
    if (!Array.isArray(models) || !isValidBbox(bbox)) return [];
    return models.filter((m) => {
        if (!m) return false;
        if (m.centerPoint) return isPointInBbox(m.centerPoint, bbox);
        if (m.bbox) {
            return !(
                m.bbox.maxLat < bbox.minLat ||
                m.bbox.minLat > bbox.maxLat ||
                m.bbox.maxLon < bbox.minLon ||
                m.bbox.minLon > bbox.maxLon
            );
        }
        return false;
    });
}

// ──────────────────────────────────────────────────────────────────────
// Geographic proximity (Haversine) — 2026-05-14
// ──────────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371.0088;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Distância em km entre dois pontos geográficos (fórmula de Haversine).
 * Math.atan2 dá precisão boa para todos os ângulos (incl. antípodas).
 *
 * @param a
 * @param b
 * @returns distância em km (NaN se inputs inválidos)
 */
export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
    if (!a || !b) return NaN;
    const lat1 = Number(a.lat);
    const lon1 = Number(a.lon);
    const lat2 = Number(b.lat);
    const lon2 = Number(b.lon);
    if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
        return NaN;
    }
    const dLat = (lat2 - lat1) * DEG_TO_RAD;
    const dLon = (lon2 - lon1) * DEG_TO_RAD;
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * sinDLon * sinDLon;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Filtra modelos dentro de raio (km) de um ponto.
 * Modelos sem centerPoint OU sem bbox são excluídos.
 * Quando há bbox sem centerPoint, usa centroide do bbox.
 *
 * @param models
 * @param center
 * @param radiusKm
 * @returns modelos ordenados por distância ascendente (centroide)
 */
export function filterModelsByRadius(
    models: DiscoveryModel[],
    center: GeoPoint,
    radiusKm: number,
): DiscoveryModel[] {
    if (!Array.isArray(models)) return [];
    if (!center || !Number.isFinite(radiusKm) || radiusKm <= 0) return [];

    const annotated: Array<{ model: DiscoveryModel; distance: number }> = [];
    for (const m of models) {
        if (!m) continue;
        let point = m.centerPoint;
        if (!point && m.bbox && isValidBbox(m.bbox)) {
            point = {
                lat: (m.bbox.minLat + m.bbox.maxLat) / 2,
                lon: (m.bbox.minLon + m.bbox.maxLon) / 2,
            };
        }
        if (!point) continue;
        const distance = haversineDistanceKm(center, point);
        if (!Number.isFinite(distance) || distance > radiusKm) continue;
        annotated.push({ model: m, distance });
    }
    annotated.sort((x, y) => x.distance - y.distance);
    return annotated.map((entry) => entry.model);
}

/**
 * Computa razão de slices públicas vs total — 2026-05-14 (Calvin diretiva EIS T).
 * Considera tier === 'public' como exposto a todo o público.
 * Slices com tier 'summary' contam como 0.5 (parcialmente públicas).
 *
 * @param slices
 */
export function computePublicShareRatio(slices: Array<{ tier?: string; visibility?: string }>): {
    ratio: number;
    publicCount: number;
    summaryCount: number;
    total: number;
} {
    if (!Array.isArray(slices) || slices.length === 0) {
        return { ratio: 0, publicCount: 0, summaryCount: 0, total: 0 };
    }
    let publicCount = 0;
    let summaryCount = 0;
    for (const s of slices) {
        if (!s) continue;
        const tier = String(s.tier || s.visibility || '').toLowerCase();
        if (tier === VISIBILITY_TIERS.PUBLIC) publicCount++;
        else if (tier === VISIBILITY_TIERS.SUMMARY) summaryCount++;
    }
    const total = slices.length;
    const weightedExposed = publicCount + summaryCount * 0.5;
    return {
        ratio: total > 0 ? weightedExposed / total : 0,
        publicCount,
        summaryCount,
        total,
    };
}

/**
 * Aplica bônus de transparência no eixo T do EIS baseado em % público no radar.
 * Calvin diretiva 2026-05-14: "a nota de transparencia no EIS score vira do %
 * da fatia do modelo disponível para todo o publico no radar".
 *
 * Mapeamento:
 * - ratio = 0 → bonus 0
 * - ratio = 1 (100% público) → bonus 1.0 (sobe um nível inteiro no T)
 * - Linear entre 0 e 1
 *
 * Score final capeado em 5 (max EIS).
 *
 * @param baseTScore - score T computado por credencial+rastreabilidade
 * @param publicShareRatio - 0..1 (de computePublicShareRatio)
 */
export function applyRadarTransparencyBonus(
    baseTScore: number,
    publicShareRatio: number,
): { score: number; baseScore: number; bonus: number; ratio: number } {
    const base = Number.isFinite(baseTScore) ? Number(baseTScore) : 0;
    const ratio = Number.isFinite(publicShareRatio) ? Math.max(0, Math.min(1, publicShareRatio)) : 0;
    const bonus = ratio; // 0..1
    const score = Math.min(5, base + bonus);
    return {
        score: parseFloat(score.toFixed(2)),
        baseScore: parseFloat(base.toFixed(2)),
        bonus: parseFloat(bonus.toFixed(2)),
        ratio: parseFloat(ratio.toFixed(4)),
    };
}

/**
 * Computa bounding box que circunda raio (km) de um ponto.
 * Aproximação rápida (ignora curvatura), suficiente para query Supabase pré-filtro.
 *
 * @param center
 * @param radiusKm
 */
export function radiusToBbox(center: GeoPoint, radiusKm: number): Bbox | null {
    if (!center || !Number.isFinite(radiusKm) || radiusKm <= 0) return null;
    const lat = Number(center.lat);
    const lon = Number(center.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const dLat = radiusKm / 111.0;
    const cosLat = Math.cos(lat * DEG_TO_RAD);
    const dLon = Math.abs(cosLat) < 1e-6 ? 180 : radiusKm / (111.0 * cosLat);
    return {
        minLat: Math.max(-90, lat - dLat),
        maxLat: Math.min(90, lat + dLat),
        minLon: Math.max(-180, lon - dLon),
        maxLon: Math.min(180, lon + dLon),
    };
}

// ──────────────────────────────────────────────────────────────────────
// NFT claim state §Q3
// ──────────────────────────────────────────────────────────────────────

export const NFT_CLAIM_STATES = Object.freeze(['unclaimed', 'pending', 'claimed', 'disputed']);

/**
 * Valida NFT claim.
 * @param claim
 */
export function isValidNftClaim(claim: unknown): boolean {
    if (!claim || typeof claim !== 'object') return false;
    const c = claim as NftClaim;
    if (!c.modelId) return false;
    if (!c.state || !(NFT_CLAIM_STATES as readonly string[]).includes(c.state)) return false;
    if (c.state === 'claimed' && !c.tokenId) return false;
    return true;
}
