// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SMART LABEL CORE — SPEC_SMART_LABELS (9.48)

   Pure helpers para sistema de labels contextuais 3D:
   - Display modes (hover-only/proximity/always-on/clustered) §Q2
   - DBSCAN-simplificado clustering §Q3
   - Adaptive orientation (flip near edges)
   - Priority hierarchy + category filters
   - LOD (level of detail) por zoom §Q3
   - Collision detection (AABB)

   UI (DOM labels, Three.js CSS2DRenderer) fica em handler/ui/.
   Core só faz matemática pura em pixel coords.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §Q2
// ──────────────────────────────────────────────────────────────────────

export const DISPLAY_MODES = Object.freeze(['hover-only', 'proximity', 'always-on', 'clustered']);

export const ORIENTATIONS = Object.freeze(['horizontal', 'vertical', 'auto']);

export const FAMILY_PROFILES = Object.freeze({
    well: Object.freeze({ mode: 'proximity', orientation: 'horizontal', priority: 10 }),
    geology_layer: Object.freeze({ mode: 'clustered', orientation: 'horizontal', priority: 5 }),
    equipment: Object.freeze({ mode: 'always-on', maxDistance: 500, priority: 8 }),
    sample: Object.freeze({ mode: 'hover-only', orientation: 'vertical', priority: 3 }),
    anomaly: Object.freeze({ mode: 'always-on', pulse: true, priority: 10 }),
    route: Object.freeze({ mode: 'proximity', orientation: 'horizontal', priority: 6 }),
});

export const DEFAULT_CONFIG = Object.freeze({
    hoverRadius: 100, // px
    hoverDelay: 200, // ms
    hoverPersist: 2000, // ms
    clusterRadius: 50, // px
    clusterThreshold: 3, // min elements to form cluster
    edgeMargin: 100, // px — flip orientation near edges
    xrayMaxLabels: 20, // §Q3 blind spot 3
});

// ──────────────────────────────────────────────────────────────────────
// Profile lookup
// ──────────────────────────────────────────────────────────────────────

export function getFamilyProfile(familyId: string): object | null {
    return ((FAMILY_PROFILES as any)[familyId] || null) as Record<string, any>;
}

export function isValidDisplayMode(mode: string): boolean {
    return typeof mode === 'string' && DISPLAY_MODES.includes(mode);
}

// ──────────────────────────────────────────────────────────────────────
// Geometry helpers
// ──────────────────────────────────────────────────────────────────────

/**
 * Distância 2D em pixels.
 */
export function distance2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
    if (!a || !b) return Infinity;
    const dx = Number(a.x) - Number(b.x);
    const dy = Number(a.y) - Number(b.y);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return Infinity;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Retorna true se o elemento está dentro do hoverRadius do mouse.
 */
export function isWithinHoverRadius(
    elementPos: { x: number; y: number },
    mousePos: { x: number; y: number },
    radius: number,
): boolean {
    return distance2D(elementPos, mousePos) <= Number(radius);
}

// ──────────────────────────────────────────────────────────────────────
// Orientation (adaptive flip near edges)
// ──────────────────────────────────────────────────────────────────────

/**
 * Retorna orientação efetiva. Se auto + near edge, flip de horizontal→vertical
 * ou adjusts offset side (left vs right).
 *
 * @param screenPos - posição do elemento em pixels
 * @param viewport - dimensões da viewport
 * @param profileOrientation - 'horizontal'/'vertical'/'auto'
 */
export function determineOrientation(
    screenPos: { x: number; y: number },
    viewport: { width: number; height: number },
    profileOrientation: string = 'auto',
    edgeMargin: number = DEFAULT_CONFIG.edgeMargin,
): { orientation: 'horizontal' | 'vertical'; side: 'left' | 'right' | 'top' | 'bottom' } {
    const margin = Number(edgeMargin) || DEFAULT_CONFIG.edgeMargin;
    const w = Number(viewport?.width) || 1920;
    const h = Number(viewport?.height) || 1080;
    const x = Number(screenPos?.x) || 0;
    const y = Number(screenPos?.y) || 0;

    const nearRight = x > w - margin;
    const nearLeft = x < margin;
    const nearTop = y < margin;
    const nearBottom = y > h - margin;

    // Explicit orientation (não auto)
    if (profileOrientation === 'horizontal') {
        return { orientation: 'horizontal', side: nearRight ? 'left' : 'right' };
    }
    if (profileOrientation === 'vertical') {
        return { orientation: 'vertical', side: nearBottom ? 'top' : 'bottom' };
    }

    // Auto: prefere horizontal, mas flipa se ambos os lados horizontais estão apertados
    if (nearRight && nearLeft) {
        return { orientation: 'vertical', side: nearBottom ? 'top' : 'bottom' };
    }
    if (nearRight) return { orientation: 'horizontal', side: 'left' };
    if (nearLeft) return { orientation: 'horizontal', side: 'right' };
    if (nearTop) return { orientation: 'vertical', side: 'bottom' };
    if (nearBottom) return { orientation: 'vertical', side: 'top' };

    return { orientation: 'horizontal', side: 'right' };
}

// ──────────────────────────────────────────────────────────────────────
// Clustering (simple greedy spatial clustering)
// ──────────────────────────────────────────────────────────────────────

/**
 * Agrupa elementos próximos em pixel coords.
 * Greedy single-linkage: cada elemento se junta ao primeiro cluster cuja
 * distância ao centroide <= clusterRadius.
 *
 * @returns clusters (pode conter clusters de tamanho 1)
 */
export function clusterElements(
    elements: Array<{ id: any; x: number; y: number }>,
    radius: number = DEFAULT_CONFIG.clusterRadius,
): Array<Array<any>> {
    if (!Array.isArray(elements) || elements.length === 0) return [];
    const r = Number(radius) || DEFAULT_CONFIG.clusterRadius;
    const clusters: Array<Array<any>> = [];

    for (const el of elements) {
        if (!el || !Number.isFinite(el.x) || !Number.isFinite(el.y)) continue;
        let attached = false;
        for (const cluster of clusters) {
            const centroid = clusterCentroid(cluster);
            if (distance2D(centroid, el) <= r) {
                cluster.push(el);
                attached = true;
                break;
            }
        }
        if (!attached) {
            clusters.push([el]);
        }
    }
    return clusters;
}

export function clusterCentroid(cluster: Array<{ x: number; y: number }>): { x: number; y: number } {
    if (!Array.isArray(cluster) || cluster.length === 0) return { x: 0, y: 0 };
    let sx = 0,
        sy = 0;
    for (const el of cluster) {
        sx += Number(el.x) || 0;
        sy += Number(el.y) || 0;
    }
    return { x: sx / cluster.length, y: sy / cluster.length };
}

/**
 * Decide se um cluster deve ser renderizado como single "grupo" ou
 * como labels individuais baseado no threshold.
 */
export function clusterRenderMode(
    cluster: Array<any>,
    threshold: number = DEFAULT_CONFIG.clusterThreshold,
): 'single' | 'expanded' {
    const t = Number(threshold) || DEFAULT_CONFIG.clusterThreshold;
    if (!Array.isArray(cluster)) return 'expanded';
    return cluster.length >= t ? 'single' : 'expanded';
}

// ──────────────────────────────────────────────────────────────────────
// Priority filter §Q3
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide se um label deve ser mostrado dado o display mode ativo e
 * o priority do elemento.
 *
 * @param priority - 0..10
 * @param filterMode - 'all' | 'critical-only' | 'priority-{N}+'
 */
export function shouldShowByPriority(priority: number, filterMode: string = 'all'): boolean {
    const p = Number(priority);
    if (!Number.isFinite(p)) return filterMode === 'all';
    if (filterMode === 'all') return true;
    if (filterMode === 'critical-only') return p >= 10;
    const match = /^priority-(\d+)\+$/.exec(filterMode);
    if (match) return p >= Number(match[1]);
    return true;
}

// ──────────────────────────────────────────────────────────────────────
// LOD (Level of Detail) §Q3
// ──────────────────────────────────────────────────────────────────────

/**
 * Retorna número máximo de labels baseado no zoom level e tamanho
 * da área visível. Zoom alto = mais labels; zoom baixo = menos.
 *
 * @param zoomLevel - 0..1 (0=zoom out máximo, 1=zoom in máximo)
 * @param elementCount - total de elementos visíveis
 */
export function computeMaxLabelsForLOD(zoomLevel: number, elementCount: number): number {
    const z = Math.max(0, Math.min(1, Number(zoomLevel) || 0));
    const n = Math.max(0, Number(elementCount) || 0);
    // Zoom 0 → 10 labels; zoom 0.5 → 30; zoom 1 → 100+
    const base = Math.round(10 + z * 90);
    return Math.min(base, n);
}

/**
 * Deriva zoomLevel 0..1 a partir da distância da câmera ao alvo (world units).
 * Próximo (near) → 1 (zoom in, mostra muitas labels); longe (far) → 0 (zoom out,
 * declutter agressivo). Mapeamento linear clampado entre near e far.
 * (Calvin 2026-06-17: declutter de labels 3D — conecta o LOD ao renderer.)
 *
 * @param distance - distância câmera→alvo (Three world units / metros)
 * @param near - distância considerada "zoom máximo" (default 50m → z=1)
 * @param far - distância considerada "zoom out máximo" (default 800m → z=0)
 */
export function zoomLevelFromCameraDistance(distance: number, near = 50, far = 800): number {
    const d = Number(distance);
    if (!Number.isFinite(d)) return 1; // sem dado → não restringe (fail-open p/ não esconder tudo)
    const lo = Math.min(near, far);
    const hi = Math.max(near, far);
    if (d <= lo) return 1;
    if (d >= hi) return 0;
    return 1 - (d - lo) / (hi - lo);
}

// ──────────────────────────────────────────────────────────────────────
// Collision (AABB overlap detection) §Q3 blind spot 5
// ──────────────────────────────────────────────────────────────────────

/**
 * Retorna true se dois retângulos AABB se sobrepõem.
 */
export function aabbOverlaps(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
): boolean {
    if (!a || !b) return false;
    const ax1 = Number(a.x) || 0,
        ay1 = Number(a.y) || 0;
    const ax2 = ax1 + (Number(a.width) || 0);
    const ay2 = ay1 + (Number(a.height) || 0);
    const bx1 = Number(b.x) || 0,
        by1 = Number(b.y) || 0;
    const bx2 = bx1 + (Number(b.width) || 0);
    const by2 = by1 + (Number(b.height) || 0);
    return ax1 < bx2 && bx1 < ax2 && ay1 < by2 && by1 < ay2;
}

/**
 * Filtra labels removendo colisões, preservando os de maior priority.
 */
export function resolveCollisions(
    labels: Array<{ id: any; rect: { x: number; y: number; width: number; height: number }; priority: number }>,
): Array<any> {
    if (!Array.isArray(labels)) return [];
    // Sort by priority desc - high priority ganha primeiro
    const sorted = [...labels].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const kept: any[] = [];
    for (const label of sorted) {
        if (!label.rect) continue;
        const collides = kept.some((k) => aabbOverlaps(k.rect, label.rect));
        if (!collides) kept.push(label);
    }
    return kept;
}

// ──────────────────────────────────────────────────────────────────────
// Hover state machine (pure state transitions)
// ──────────────────────────────────────────────────────────────────────

export function hoverTick(
    current: { state: 'idle' | 'delaying' | 'visible' | 'persisting'; enteredAt?: number; leftAt?: number },
    event: string,
    nowMs: number,
    hoverDelay: number = DEFAULT_CONFIG.hoverDelay,
    hoverPersist: number = DEFAULT_CONFIG.hoverPersist,
): {
    state: 'idle' | 'delaying' | 'visible' | 'persisting';
    enteredAt?: number | undefined;
    leftAt?: number | undefined;
    shouldShow: boolean;
} {
    const s = current || { state: 'idle' };
    const now = Number(nowMs) || 0;

    if (event === 'mouseenter') {
        return { state: 'delaying', enteredAt: now, shouldShow: false };
    }
    if (event === 'mouseleave') {
        if (s.state === 'visible') {
            return { state: 'persisting', leftAt: now, enteredAt: s.enteredAt, shouldShow: true };
        }
        return { state: 'idle', shouldShow: false };
    }
    // tick
    if (s.state === 'delaying' && s.enteredAt != null) {
        if (now - s.enteredAt >= Number(hoverDelay)) {
            return { state: 'visible', enteredAt: s.enteredAt, shouldShow: true };
        }
        return { ...s, shouldShow: false };
    }
    if (s.state === 'persisting' && s.leftAt != null) {
        if (now - s.leftAt >= Number(hoverPersist)) {
            return { state: 'idle', shouldShow: false };
        }
        return { ...s, shouldShow: true };
    }
    return { ...s, shouldShow: s.state === 'visible' };
}
