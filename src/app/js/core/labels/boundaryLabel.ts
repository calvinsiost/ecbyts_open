// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// src/app/js/core/labels/boundaryLabel.ts
// SPEC_BOUNDARY_3D_LABELS_AUTO — pure logic para labels 3D de boundaries.
//
// Auto-cria uma label flutuante no centróide do polígono para boundaries
// com `meta.label` ou `name`. Separado do labelManager para:
//   - TS-first policy (núcleo de cálculo testável sem DOM/Three)
//   - Reuso por outros módulos que precisem de centróide+visibilidade
//   - Cheap tests em Node sem mock Three
//
// Sem dependência de Three/DOM. Integração faz-se em
// `app/js/utils/labels/manager.js::attachBoundaryLabel`.

/* ============================================================ *
 * TYPES                                                        *
 * ============================================================ */

export interface Vertex {
    x: number;
    y?: number;
    z: number;
}

export interface Centroid {
    x: number;
    y: number;
    z: number;
}

/* ============================================================ *
 * CONSTANTS                                                    *
 * ============================================================ */

/** Distância máxima câmera→centróide para mostrar label (world units = metros). */
export const DEFAULT_BOUNDARY_LABEL_THRESHOLD_M = 50000;

/** Tamanho máximo do texto da label antes de truncate com ellipsis. */
export const DEFAULT_BOUNDARY_LABEL_MAX_LEN = 28;

/** Offset Y (acima do plano do polígono) onde a label flutua. */
export const DEFAULT_BOUNDARY_LABEL_Y_OFFSET_M = 5;

/** Duração da animação fade-in (ms) — usado pelo manager.js ao aplicar transition. */
export const DEFAULT_BOUNDARY_LABEL_FADE_MS = 200;

/** Polígonos com área menor que isto são considerados degenerados → null. */
const MIN_POLYGON_AREA = 1e-9;

/* ============================================================ *
 * CENTROID — shoelace ponderado por área no plano XZ           *
 * ============================================================ */

/**
 * Computa centróide ponderado por área (shoelace formula) de polígono no
 * plano XZ. Y do centróide = média aritmética dos Y dos vértices (boundary
 * pode ter relevo).
 *
 * Implementação canônica: para polígonos não-convexos (ilhas, contornos
 * orgânicos como municípios), shoelace dá o resultado correto enquanto
 * "bbox center" ou "median vertex" enviesam.
 *
 * @param vertices Array de vértices `{x, y?, z}`. Mínimo 3 vértices.
 * @returns Centróide `{x, y, z}` ou `null` se polígono degenerado/inválido.
 *
 * @example
 *   computeBoundaryCentroid([
 *     {x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}
 *   ]) // {x: 5, y: 0, z: 5}
 */
export function computeBoundaryCentroid(vertices: readonly Vertex[]): Centroid | null {
    if (!Array.isArray(vertices) || vertices.length < 3) return null;

    let cx = 0;
    let cz = 0;
    let areaTwice = 0;
    let ySum = 0;
    let yCount = 0;

    const n = vertices.length;
    for (let i = 0; i < n; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % n];
        if (!Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) {
            return null;
        }
        const f = a.x * b.z - b.x * a.z;
        cx += (a.x + b.x) * f;
        cz += (a.z + b.z) * f;
        areaTwice += f;

        if (typeof a.y === 'number' && Number.isFinite(a.y)) {
            ySum += a.y;
            yCount += 1;
        }
    }

    const area = areaTwice * 0.5;
    if (Math.abs(area) < MIN_POLYGON_AREA) return null;

    return {
        x: cx / (6 * area),
        y: yCount > 0 ? ySum / yCount : 0,
        z: cz / (6 * area),
    };
}

/* ============================================================ *
 * LOD — decisão de mostrar/ocultar pela distância              *
 * ============================================================ */

/**
 * Decide se label deve ser visível com base na distância câmera→centróide.
 *
 * Decisão de design (ADR-A2): 50km cobre demos cidade-escala (RMSP=~80km
 * diagonal — labels do centro visíveis, periferia oculta quando câmera
 * está sobre periferia oposta) e site-escala (<1km, sempre visível).
 *
 * @param cameraDistM Distância em metros (world units).
 * @param thresholdM Threshold custom (default 50000m).
 * @returns true se label deve renderizar.
 */
export function shouldShowBoundaryLabel(
    cameraDistM: number,
    thresholdM: number = DEFAULT_BOUNDARY_LABEL_THRESHOLD_M,
): boolean {
    if (!Number.isFinite(cameraDistM) || cameraDistM < 0) return false;
    if (!Number.isFinite(thresholdM) || thresholdM <= 0) return false;
    return cameraDistM <= thresholdM;
}

/* ============================================================ *
 * FORMAT — truncate com ellipsis preservando legibilidade      *
 * ============================================================ */

/**
 * Trunca texto para `maxLen` caracteres, adicionando ellipsis `...` quando
 * cortado. Preserva palavra completa quando possível (recua até último
 * espaço dentro dos primeiros maxLen-3 chars).
 *
 * @param label Texto bruto (pode ser undefined/null → "").
 * @param maxLen Comprimento máximo (default 28 — boundary label).
 * @returns Texto truncado, sempre ≤ maxLen.
 *
 * @example
 *   formatLabelText("São Paulo") // "São Paulo"
 *   formatLabelText("Município Extremamente Longo de Teste", 20) // "Município Extreman..."
 */
export function formatLabelText(label: string | null | undefined, maxLen: number = DEFAULT_BOUNDARY_LABEL_MAX_LEN): string {
    if (label == null) return '';
    const s = String(label).trim();
    if (s.length === 0) return '';
    if (!Number.isFinite(maxLen) || maxLen <= 3) return s.slice(0, Math.max(0, Math.floor(maxLen)));
    if (s.length <= maxLen) return s;

    const limit = maxLen - 3; // espaço para "..."
    // Tenta recuar até último espaço para não cortar palavra
    const head = s.slice(0, limit);
    const lastSpace = head.lastIndexOf(' ');
    // Só recua se palavra parcial tiver >= 4 chars (evita "S..." em "São Paulo")
    if (lastSpace > limit - 8 && lastSpace > 0) {
        return head.slice(0, lastSpace).trimEnd() + '...';
    }
    return head + '...';
}

/* ============================================================ *
 * BUILD POSITION — combina centróide + offset Y                *
 * ============================================================ */

/**
 * Computa posição final da label (centróide + offset Y).
 * Conveniência para reduzir alocações no callsite.
 *
 * @param centroid Saída de `computeBoundaryCentroid`.
 * @param yOffsetM Altura acima do plano (default 5m).
 * @returns Posição mundo `{x, y, z}`.
 */
export function buildBoundaryLabelPosition(
    centroid: Centroid,
    yOffsetM: number = DEFAULT_BOUNDARY_LABEL_Y_OFFSET_M,
): Centroid {
    return {
        x: centroid.x,
        y: centroid.y + yOffsetM,
        z: centroid.z,
    };
}
