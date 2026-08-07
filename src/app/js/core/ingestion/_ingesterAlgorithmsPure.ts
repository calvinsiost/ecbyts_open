// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   INGESTER ALGORITHMS PURE (Module C extraction)
   ================================================================

   2 algoritmos clássicos extraídos de core/ingestion/ingester.ts:
     - pseudonymize: LGPD pseudonymization via FNV-1a hash → 4-hex label.
     - convexHull2D: Andrew's monotone chain (Sedgewick) — útil para
       calcular footprints de áreas a partir de pontos observacionais.

   Pure-logic determinísticos. Testáveis sem subir IDB/state.
   ================================================================ */

export interface Point2D {
    x: number;
    z: number;
    [key: string]: any;
}

/**
 * LGPD pseudonymization via FNV-1a hash 32-bit.
 *
 * Input (ex: CPF, employee_id) → label estável `Trab-XXXX` (4 hex chars
 * do hash). Mesma string → mesmo label (determinístico). Diferentes
 * strings podem colidir em ~1/65536 chance (acceptable para LGPD usage
 * onde re-identificação não é objetivo).
 *
 * @param input — string a pseudonimizar (qualquer length)
 * @returns label `Trab-XXXX` ou `Trab-0000` se input vazio/null
 */
export function pseudonymize(input: any): string {
    if (!input) return 'Trab-0000';
    const s = String(input);
    let hash = 0x811c9dc5; // FNV-1a offset basis (32-bit)
    for (let i = 0; i < s.length; i++) {
        hash ^= s.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0; // FNV-1a prime, unsigned
    }
    return `Trab-${hash.toString(16).toUpperCase().slice(-4).padStart(4, '0')}`;
}

/**
 * Convex hull 2D via Andrew's monotone chain (Sedgewick, Computational
 * Geometry §33.7). O(n log n) sort + O(n) construction.
 *
 * Convenção plane: x = horizontal, z = horizontal (Three.js style, y
 * vertical). cross product 2D em XZ plane.
 *
 * @param points — array de pontos {x, z} (extras preservadas)
 * @returns vertices do hull em ordem CCW (counterclockwise);
 *   array vazio se < 3 pontos retorna [...input]
 */
export function convexHull2D<P extends Point2D>(points: P[]): P[] {
    if (!Array.isArray(points) || points.length < 3) return [...(points || [])];
    const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
    const cross = (o: P, a: P, b: P): number => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
    const lower: P[] = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }
    const upper: P[] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i]!;
        while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
}
