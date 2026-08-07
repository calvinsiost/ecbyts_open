// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.1.6
/* ================================================================
   BOUNDARY LOD RUNTIME SWITCHING — P4 (re-LOD sem re-import)
   ================================================================

   Permite trocar o nivel de detalhe (LOD) de boundary meshes em
   runtime, regenerando Line (outline) + ShapeGeometry (overlay)
   a partir dos vertices originais preservados em
   group.userData.originalVertices (introduzido em P2 e2066b39).

   Casos de uso:
   - Zoom out → MEDIUM (50m tolerance, menos vertices = render rapido)
   - Zoom in  → HIGH (vertices originais, fidelidade total)
   - Camera distante → LOW (500m) ou SPRITE

   Sem re-import: reusa rebuildBoundaryGeometry() do meshFactory,
   que ja faz dispose() correto das BufferGeometry antigas.

   Sem dependencias externas (zero deps).

   ================================================================ */
import { simplifyForLOD } from '../geometry/polygonSimplify.js';
import { getElementById, getMeshByElementId, getAllElements } from './manager.js';
import { rebuildBoundaryGeometry } from './meshFactory.js';
import { requestRender } from '../../utils/scene/setup.js';
import { yieldToMain } from '../../utils/performance/yielding.js';
/**
 * Niveis LOD validos. Alinhado com lodConfig.js (PERF-MASTER S2)
 * e polygonSimplify.toleranceForLOD().
 * @type {ReadonlyArray<string>}
 */
const VALID_LOD_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'SPRITE'];
/**
 * Regenera geometria de um boundary group para o LOD alvo.
 * Operacao in-place: substitui geometries de outline + overlay,
 * dispose das antigas (delegado a rebuildBoundaryGeometry).
 *
 * @param {any} group - THREE.Group do boundary (mesh)
 * @param {string} lodLevel - HIGH | MEDIUM | LOW | SPRITE
 * @returns {boolean} true se regenerou, false se skip (no originalVertices)
 */
function _regenerateBoundaryGeometry(group: any, lodLevel: string) {
    if (!group || !group.userData)
        return false;
    const originalVertices = group.userData.originalVertices;
    if (!Array.isArray(originalVertices) || originalVertices.length < 3) {
        // Boundary criado antes do P2 (sem stash) — nao da pra re-LOD
        return false;
    }
    // HIGH = vertices originais sem simplify; demais aplicam tolerance
    const renderVerts = lodLevel === 'HIGH' || originalVertices.length <= 8
        ? originalVertices
        : simplifyForLOD(originalVertices, lodLevel);
    if (!Array.isArray(renderVerts) || renderVerts.length < 3)
        return false;
    // Reusa helper canonico do meshFactory: dispose antigos + reconstroi
    // outline (Line + BufferGeometry) + overlay (Mesh + ShapeGeometry)
    rebuildBoundaryGeometry(group, renderVerts, {});
    // Atualiza marker de LOD atual (para inspecao + idempotencia)
    group.userData.lodHint = lodLevel;
    return true;
}
/**
 * Atualiza o LOD de um boundary mesh em runtime.
 * Regenera Line + ShapeGeometry usando originalVertices preservados.
 * Pure addition: nao modifica API existente.
 *
 * Skip silencioso (retorna false) se:
 * - elementId nao encontrado
 * - elemento nao e family='boundary'
 * - mesh nao tem userData.originalVertices (boundary pre-P2)
 * - lodLevel invalido
 *
 * @param {string} elementId
 * @param {string} lodLevel - 'HIGH' | 'MEDIUM' | 'LOW' | 'SPRITE'
 * @returns {boolean} true se aplicou, false se skipped
 */
export function setBoundaryLOD(elementId: string, lodLevel: string) {
    if (!elementId || typeof elementId !== 'string')
        return false;
    if (!VALID_LOD_LEVELS.includes(lodLevel))
        return false;
    const element = getElementById(elementId);
    if (!element || element.family !== 'boundary')
        return false;
    const mesh = getMeshByElementId(elementId);
    if (!mesh)
        return false;
    // Idempotencia: skip se ja esta no LOD alvo
    /** @type {any} */
    const group = mesh;
    if (group.userData && group.userData.lodHint === lodLevel) {
        return true;
    }
    const applied = _regenerateBoundaryGeometry(group, lodLevel);
    if (applied)
        requestRender();
    return applied;
}
/**
 * Aplica LOD em massa para todos os boundaries da scene.
 * Usa chunked rAF (chunkSize=100) para evitar freeze em cenas grandes.
 * onProgress callback opcional emitido a cada chunk concluido.
 *
 * Retorna contadores: { applied, skipped }.
 * - applied: meshes que tiveram geometria regenerada
 * - skipped: boundaries sem originalVertices ou ja no LOD alvo
 *
 * @param {string} lodLevel - 'HIGH' | 'MEDIUM' | 'LOW' | 'SPRITE'
 * @param {(progress: { done: number, total: number }) => void} [onProgress]
 * @returns {Promise<{ applied: number, skipped: number }>}
 */
export async function setBoundaryLODBatch(lodLevel: string, onProgress?: (progress: { done: number; total: number }) => void) {
    if (!VALID_LOD_LEVELS.includes(lodLevel)) {
        return { applied: 0, skipped: 0 };
    }
    const all = getAllElements();
    const boundaries = all.filter((e: any) => e && e.family === 'boundary');
    const total = boundaries.length;
    if (total === 0)
        return { applied: 0, skipped: 0 };
    const CHUNK_SIZE = 100;
    let applied = 0;
    let skipped = 0;
    let done = 0;
    /** @returns {Promise<void>} */
    const nextFrame = () => new Promise<void>((resolve: any) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => resolve());
        }
        else {
            yieldToMain({ timeoutMs: 0 }).then(resolve);
        }
    });
    for (let i = 0; i < boundaries.length; i += CHUNK_SIZE) {
        const slice = boundaries.slice(i, i + CHUNK_SIZE);
        for (const element of slice) {
            const mesh = getMeshByElementId(element.id);
            /** @type {any} */
            const group = mesh;
            if (!group) {
                skipped++;
                continue;
            }
            if (group.userData && group.userData.lodHint === lodLevel) {
                // Ja esta no LOD alvo — count como applied (estado desejado)
                applied++;
                continue;
            }
            const ok = _regenerateBoundaryGeometry(group, lodLevel);
            if (ok)
                applied++;
            else
                skipped++;
        }
        done += slice.length;
        if (typeof onProgress === 'function') {
            try {
                onProgress({ done, total });
            }
            catch (e) {
                console.debug('[boundaryLOD:onProgress]', e instanceof Error ? e.message : String(e));
            }
        }
        // Cede o thread entre chunks para evitar freeze
        if (i + CHUNK_SIZE < boundaries.length) {
            await nextFrame();
        }
    }
    if (applied > 0)
        requestRender();
    return { applied, skipped };
}
//# sourceMappingURL=boundaryLOD.js.map
