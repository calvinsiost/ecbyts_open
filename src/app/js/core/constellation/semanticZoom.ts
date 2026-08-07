// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Semantic Zoom / LOD - Phase 1.32 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S32
 *
 * Phase 1.32 (2026-05-02) - pure-logic semantic zoom: define o que
 * deve aparecer em cada nível de zoom (overview → detail). Combina
 * com cameraState.zoom para esconder/mostrar nodes/edges/labels
 * baseado em viewport scale.
 *
 * Estratégia:
 *   - 5 zoom levels: overview (<0.3), summary (<0.6), normal (<1.5),
 *     detail (<3.0), microscope (>=3.0)
 *   - Cada level define: showLabels, showEdges, minNodeSize, edgeOpacity
 *   - filterByZoom: aplica filtro a nodes baseado em metric importance
 *   - computeLodLevel: mapeia zoom (number) → level (string)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */
// --- scout: typedef -> TS declarations (runtime-noop) ---
type LodLevel = 'overview' | 'summary' | 'normal' | 'detail' | 'microscope';
type LodLevelConfig = {threshold: number, showLabels: boolean, showEdges: boolean, minNodeSize: number, edgeOpacity: number, topK: number | null};
type LodConfigMap = Readonly<Record<LodLevel, Readonly<LodLevelConfig>>>;
type ResolvedLodConfig = Readonly<LodLevelConfig & {level: LodLevel}>;
// --- end scout declarations ---


/** Zoom levels canônicos (ordem ascending de detalhe). */
/**
 * @typedef {'overview' | 'summary' | 'normal' | 'detail' | 'microscope'} LodLevel
 * @typedef {{threshold: number, showLabels: boolean, showEdges: boolean, minNodeSize: number, edgeOpacity: number, topK: number | null}} LodLevelConfig
 * @typedef {Readonly<Record<LodLevel, Readonly<LodLevelConfig>>>} LodConfigMap
 * @typedef {Readonly<LodLevelConfig & {level: LodLevel}>} ResolvedLodConfig
 */

/** @type {ReadonlyArray<LodLevel>} */
export const ZOOM_LEVELS = Object.freeze(['overview', 'summary', 'normal', 'detail', 'microscope']);

/** Default LOD config por zoom level. */
/** @satisfies {LodConfigMap} */
export const DEFAULT_LOD_CONFIG = Object.freeze({
    overview: Object.freeze({
        threshold: 0.3,
        showLabels: false,
        showEdges: false,
        minNodeSize: 4,
        edgeOpacity: 0,
        topK: 20,
    }),
    summary: Object.freeze({
        threshold: 0.6,
        showLabels: false,
        showEdges: true,
        minNodeSize: 3,
        edgeOpacity: 0.3,
        topK: 50,
    }),
    normal: Object.freeze({
        threshold: 1.5,
        showLabels: true,
        showEdges: true,
        minNodeSize: 2,
        edgeOpacity: 0.6,
        topK: null,
    }),
    detail: Object.freeze({
        threshold: 3.0,
        showLabels: true,
        showEdges: true,
        minNodeSize: 1,
        edgeOpacity: 0.85,
        topK: null,
    }),
    microscope: Object.freeze({
        threshold: Infinity,
        showLabels: true,
        showEdges: true,
        minNodeSize: 0,
        edgeOpacity: 1.0,
        topK: null,
    }),
});

/** Identidade do módulo. */
export const SEMANTIC_ZOOM_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.32',
    deliveredAt: '2026-05-02',
    levels: ZOOM_LEVELS,
});

/**
 * Verifica se level é canônico.
 *
 * @param {unknown} l
 * @returns {boolean}
 */
export function isValidLevel(l: unknown): boolean {
    return typeof l === 'string' && (ZOOM_LEVELS as ReadonlyArray<string>).includes(l);
}

/**
 * Mapeia zoom numérico → level name.
 *
 * @param {number} zoom
 * @returns {LodLevel}
 */
export function computeLodLevel(zoom: number): LodLevel {
    if (!Number.isFinite(zoom)) return 'normal';
    if (zoom < DEFAULT_LOD_CONFIG.overview.threshold) return 'overview';
    if (zoom < DEFAULT_LOD_CONFIG.summary.threshold) return 'summary';
    if (zoom < DEFAULT_LOD_CONFIG.normal.threshold) return 'normal';
    if (zoom < DEFAULT_LOD_CONFIG.detail.threshold) return 'detail';
    return 'microscope';
}

/**
 * Resolve config completa para zoom.
 *
 * @param {number} zoom
 * @param {LodConfigMap} [config=DEFAULT_LOD_CONFIG]
 * @returns {ResolvedLodConfig}
 */
export function resolveLodConfig(zoom: number, config: LodConfigMap = DEFAULT_LOD_CONFIG): ResolvedLodConfig {
    const level = computeLodLevel(zoom);
    return (Object.freeze({ level, ...config[level] }) as ResolvedLodConfig);
}

/**
 * Top-K filter por importance metric (greedy, descending).
 *
 * @param {ReadonlyArray<Record<string, any>>} nodes
 * @param {string} [any>>]
 * @param {number} [metricField]
 * @returns {ReadonlyArray<Record<string, any>>}
 */
export function topKByMetric(nodes: ReadonlyArray<Record<string, any>>, metricField: string = 'importance', k: number = 20): ReadonlyArray<Record<string, any>> {
    if (!Array.isArray(nodes) || !Number.isInteger(k) || k <= 0) return [];
    const sorted = [...nodes]
        .filter(
            /** @param {Record<string, any> | null | undefined} n */
            (n) => !!n && Number.isFinite(n[metricField]),
        )
        .sort(
            /**
             * @param {Record<string, any>} a
             * @param {Record<string, any>} b
             */
            (a, b) => b[metricField] - a[metricField],
        );
    return Object.freeze(sorted.slice(0, k));
}

/**
 * Filtra nodes por zoom level (top-K se aplicável).
 *
 * @param {ReadonlyArray<Record<string, any>>} nodes
 * @param {number} zoom
 * @param {{metricField?: string}} [options]
 * @returns {ReadonlyArray<Record<string, any>>}
 */
export function filterNodesByZoom(nodes: ReadonlyArray<Record<string, any>>, zoom: number, options: {metricField?: string} = {}): ReadonlyArray<Record<string, any>> {
    if (!Array.isArray(nodes)) return [];
    const cfg = resolveLodConfig(zoom);
    const metricField = options.metricField || 'importance';
    if (cfg.topK && nodes.length > cfg.topK) {
        return topKByMetric(nodes, metricField, cfg.topK);
    }
    return Object.freeze([...nodes]);
}

/**
 * Filtra edges por zoom level (oculta se !showEdges).
 *
 * @param {ReadonlyArray<Record<string, any>>} edges
 * @param {number} any>>
 * @returns {ReadonlyArray<Record<string, any>>}
 */
export function filterEdgesByZoom(edges: ReadonlyArray<Record<string, any>>, zoom: number): ReadonlyArray<Record<string, any>> {
    if (!Array.isArray(edges)) return [];
    const cfg = resolveLodConfig(zoom);
    if (!cfg.showEdges) return Object.freeze([]);
    return Object.freeze([...edges]);
}

/**
 * Computa estilo aplicado por zoom level.
 *
 * @param {number} zoom
 * @returns {Object}
 */
export function computeStyleAtZoom(zoom: number): Object {
    const cfg = resolveLodConfig(zoom);
    return Object.freeze({
        level: cfg.level,
        showLabels: cfg.showLabels,
        showEdges: cfg.showEdges,
        minNodeSize: cfg.minNodeSize,
        edgeOpacity: cfg.edgeOpacity,
    });
}

/**
 * Detecta transição entre 2 zoom values (cross threshold).
 *
 * @param {number} fromZoom
 * @param {number} toZoom
 * @returns {Readonly<{from: string, to: string, changed: boolean, direction: 'none' | 'zoom_in' | 'zoom_out'}>}
 */
export function detectLevelTransition(fromZoom: number, toZoom: number): Readonly<{from: string, to: string, changed: boolean, direction: 'none' | 'zoom_in' | 'zoom_out'}> {
    const fromLevel = computeLodLevel(fromZoom);
    const toLevel = computeLodLevel(toZoom);
    return Object.freeze({
        from: fromLevel,
        to: toLevel,
        changed: fromLevel !== toLevel,
        direction: fromLevel === toLevel ? 'none' : toZoom > fromZoom ? 'zoom_in' : 'zoom_out',
    });
}

/**
 * Sumariza state at zoom.
 *
 * @param {ReadonlyArray<Record<string, any>>} nodes
 * @param {ReadonlyArray<Record<string, any>>} any>>
 * @param {number} edges
 * @returns {Readonly<{zoom: number, level: string, totalNodes: number, visibleNodes: number, totalEdges: number, visibleEdges: number, showLabels: boolean}>}
 */
export function summarizeZoomState(nodes: ReadonlyArray<Record<string, any>>, edges: ReadonlyArray<Record<string, any>>, zoom: number): Readonly<{zoom: number, level: string, totalNodes: number, visibleNodes: number, totalEdges: number, visibleEdges: number, showLabels: boolean}> {
    const cfg = resolveLodConfig(zoom);
    const filteredNodes = filterNodesByZoom(nodes, zoom);
    const filteredEdges = filterEdgesByZoom(edges, zoom);
    return Object.freeze({
        zoom,
        level: cfg.level,
        totalNodes: Array.isArray(nodes) ? nodes.length : 0,
        visibleNodes: filteredNodes.length,
        totalEdges: Array.isArray(edges) ? edges.length : 0,
        visibleEdges: filteredEdges.length,
        showLabels: cfg.showLabels,
    });
}

/**
 * Module identity export.
 */
export const semanticZoomMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.32',
    deliveredAt: '2026-05-02',
    levels: ZOOM_LEVELS,
    exports: [
        'ZOOM_LEVELS',
        'DEFAULT_LOD_CONFIG',
        'SEMANTIC_ZOOM_META',
        'isValidLevel',
        'computeLodLevel',
        'resolveLodConfig',
        'topKByMetric',
        'filterNodesByZoom',
        'filterEdgesByZoom',
        'computeStyleAtZoom',
        'detectLevelTransition',
        'summarizeZoomState',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
