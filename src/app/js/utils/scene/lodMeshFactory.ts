// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   LOD MESH FACTORY — Three.js wire-up for pure-logic LOD config
   ================================================================
   PERF-MASTER-001 S2 closure (Claude-owner per Decision 3 evaluation 2026-04-30)

   Cola engine-agnostic (`core/scene/lodConfig.js`) + Three.js `LOD` class.
   Pure-logic decide *quando* trocar nivel; este modulo decide *como*
   construir o LOD object e *quais* meshes (HIGH/MEDIUM/LOW/SPRITE)
   alocar para cada nivel.

   Por que separar da meshFactory?
   - meshFactory.js ja tem 1800+ linhas. Adicionar wrapping inline
     polui a fabrica com decisoes de LOD que sao ortogonais.
   - Wrapping aplicado pos-construcao permite feature-flag granular:
     desligado, mesh sai inalterado e Three.js nao paga overhead de
     `lod.update(camera)` por frame.
   - Testavel em Node com mock minimal de THREE (sem jsdom, sem GPU).

   Escolha de design:
   - Three.js `LOD` class (https://threejs.org/docs/#api/en/objects/LOD)
     gerencia automaticamente o nivel ativo no render loop quando
     `lod.autoUpdate = true` (default) e `renderer.render(scene, cam)`
     chama `lod.update(cam)` internamente via WebGLRenderer pipeline.
   - Alternativa rejeitada: switching manual via animate loop.
     Motivo da rejeicao: duplica trabalho que Three.js ja faz, exige
     manter state externo de "qual mesh esta ativo", e o overhead
     de `lod.update` e O(levels) por LOD (~5 comparacoes/frame),
     desprezivel comparado ao custo de raycast/render do mesh.

   Roadmap: §0.2 P1-2 PERF-MASTER S2
   ================================================================ */

console.debug('[mod:load]', 'app/js/utils/scene/lodMeshFactory.js');

import { DEFAULT_LOD_CONFIG, LOD_LEVEL } from '../../core/scene/lodConfig.js';

/**
 * Classes Three.js minimas requeridas para construir um LOD wrapper.
 * Validacao early-exit evita criar LOD parcial em ambientes sem THREE
 * carregado (ex.: tests Node sem mock).
 */
const REQUIRED_THREE_CLASSES = ['LOD', 'Mesh', 'Group', 'Object3D'];

/**
 * Verifica se o namespace THREE tem o minimo necessario.
 *
 * @param {any} THREE - namespace Three.js
 * @returns {{ok:boolean, missing?:string[]}}
 */
export function validateTHREE(THREE: any): { ok: boolean; missing?: string[] | undefined } {
    if (!THREE || typeof THREE !== 'object') {
        return { ok: false, missing: REQUIRED_THREE_CLASSES };
    }
    const missing = REQUIRED_THREE_CLASSES.filter((c) => typeof THREE[c] !== 'function');
    return { ok: missing.length === 0, missing: missing.length ? missing : undefined };
}

/**
 * Extrai os thresholds de uma familia, ja filtrados (sem HIDDEN no fim
 * para evitar empty-mesh placeholder no infinity).
 *
 * Three.js LOD trata "alem do ultimo distance" mantendo o ultimo level
 * visivel. Nosso modelo trata HIDDEN como "nao renderizar". Para preservar
 * isso, pulamos HIDDEN aqui - Three.js renderiza o LOW/SPRITE e cabe
 * ao caller (viz settings) reduzir o far plane se quiser corte real.
 *
 * @param {string} family
 * @param {any} [config=DEFAULT_LOD_CONFIG]
 * @returns {Array<{level:string, maxDistance:number}>}
 */
export function getRenderableThresholds(family: string, config?: any): Array<{ level: string; maxDistance: number }> {
    const cfg = config || DEFAULT_LOD_CONFIG;
    const familyConfig = cfg[family];
    if (!familyConfig || familyConfig.enabled === false) return [];
    const thresholds = familyConfig.thresholds;
    if (!Array.isArray(thresholds) || thresholds.length === 0) return [];
    return thresholds.filter((t: any) => t && t.level && t.level !== LOD_LEVEL.HIDDEN);
}

/**
 * Decide se uma familia deve participar do pipeline LOD.
 * Retorna false se familia desconhecida, desabilitada, ou tem apenas
 * 1 threshold renderizavel (LOD com 1 level == mesh sem LOD == overhead toa).
 *
 * @param {string} family
 * @param {any} [config=DEFAULT_LOD_CONFIG]
 * @returns {boolean}
 */
export function familyParticipatesInLOD(family: string, config?: any): boolean {
    const renderable = getRenderableThresholds(family, config);
    return renderable.length >= 2;
}

/**
 * Hook chamado pelo caller para construir um mesh especifico de um nivel
 * LOD. Sera chamado uma vez por nivel (HIGH, MEDIUM, LOW, SPRITE conforme
 * a familia exigir).
 *
 * Retornar null/undefined indica "fallback ao baseMesh" - o wrapper nao
 * adiciona um level vazio.
 *
 * @callback LevelMeshBuilder
 * @param {string} family - LOD_LEVEL value
 * @param {any} opts? - { family, element, baseMesh, THREE }
 * @returns {Object|null} mesh Three.js (ou clone do baseMesh) ou null para skip
 */
type LevelMeshBuilder = (level: string, ctx: any) => any;

/**
 * Builder default: clona o baseMesh para todos os niveis. Three.js calcula
 * frustum/visibility por level via `lod.update(camera)`, entao mesmo mesh
 * funciona - ganho vem quando caller fornece simplificacoes reais.
 *
 * @type {LevelMeshBuilder}
 */
export const defaultLevelMeshBuilder: LevelMeshBuilder = function defaultLevelMeshBuilder(level, ctx) {
    const { baseMesh, THREE } = ctx;
    if (!baseMesh) return null;
    if (level === LOD_LEVEL.HIGH) return baseMesh; // mesh original
    // Para outros niveis sem builder real, retornamos null - caller deveria
    // fornecer um builder customizado se quer mesh simplificado.
    // Default: nao adicionamos clone (evita duplicar VRAM sem ganho real).
    if (typeof baseMesh.clone === 'function' && THREE) {
        // Clone shallow preserva geometry/material reference - Three.js
        // tolera multiplos Mesh apontando para mesma geometry/material.
        // Util quando caller quer testar pipeline sem implementar builders.
        return baseMesh.clone();
    }
    return null;
};

/**
 * Envolve um mesh existente em um THREE.LOD com niveis derivados de
 * DEFAULT_LOD_CONFIG para a familia.
 *
 * Comportamento se `familyParticipatesInLOD(family) === false`:
 *   retorna `{ ok: true, lod: null, mesh: baseMesh, skipped: true }` -
 *   caller decide se injeta mesh original na cena (sem wrapper).
 *
 * @param {any} family - namespace Three.js
 * @param {any} opts? - mesh original (HIGH-detail)
 * @param {string} family - familia do elemento
 * @param {object} [baseMesh]
 * @param {any} [opts.element] - element inteiro (passado ao builder)
 * @param {LevelMeshBuilder} [opts.levelMeshBuilder=defaultLevelMeshBuilder]
 * @param {any} [opts.config=DEFAULT_LOD_CONFIG]
 * @param {number} [opts.hysteresis=0] - margem de tolerancia em scene units
 *                                       repassada ao THREE.LOD.addLevel.
 *                                       0 = comportamento default Three.js.
 * @returns {{ok:boolean, lod?:any, mesh?:any, skipped?:boolean, error?:string, levelsAdded?:number}}
 */
export function wrapWithLOD(
    THREE: any,
    baseMesh: any,
    family: string,
    opts?: any,
): { ok: boolean; lod?: any; mesh?: any; skipped?: boolean; error?: string; levelsAdded?: number } {
    const validation = validateTHREE(THREE);
    if (!validation.ok) {
        return { ok: false, error: 'three_missing_required_classes:' + (validation.missing || []).join(',') };
    }
    if (!baseMesh) {
        return { ok: false, error: 'base_mesh_required' };
    }
    if (typeof family !== 'string' || !family) {
        return { ok: false, error: 'family_required' };
    }

    const options = opts || {};
    const config = options.config || DEFAULT_LOD_CONFIG;
    const builder = options.levelMeshBuilder || defaultLevelMeshBuilder;
    const element = options.element || null;
    const hysteresis =
        Number.isFinite(options.hysteresis) && (options.hysteresis as number) >= 0 ? options.hysteresis : 0;

    if (!familyParticipatesInLOD(family, config)) {
        return { ok: true, lod: null, mesh: baseMesh, skipped: true };
    }

    const renderable = getRenderableThresholds(family, config);
    const lod = new THREE.LOD();
    lod.name = baseMesh.name ? baseMesh.name + ':lod' : family + ':lod';

    const ctx = { family, element, baseMesh, THREE };
    let levelsAdded = 0;

    for (const t of renderable) {
        const levelMesh = builder(t.level, ctx);
        if (!levelMesh) continue;
        // THREE.LOD.addLevel(object, distance, hysteresis) - distance e o
        // limiar a partir do qual aquele level se torna ativo. Three.js
        // ordena internamente por distance, entao podemos passar em qq ordem.
        // maxDistance == Infinity vira max-safe-integer (LOD nao aceita Infinity)
        // eslint-disable-next-line
        const distance = Number.isFinite(t.maxDistance) ? Math.max(0, t.maxDistance) : Number.MAX_SAFE_INTEGER;
        // Convencao Three.js: o level com distance==0 e o "mais detalhado"
        // (HIGH). Como nosso `t.maxDistance` e o limite ATE onde o nivel
        // vale (low→high), usamos a regra: distance Three.js = limite
        // INFERIOR do range, ou seja, o anterior. Para o primeiro nivel
        // (HIGH ate 50m), distance=0 (camera proxima); para MEDIUM
        // (50→200m), distance=50.
        // Logo, a transformacao certa e: usar maxDistance do level ANTERIOR
        // como distance Three.js. Faremos isso construindo um array com
        // limites inferiores explicitos.
        levelsAdded += 0; // contagem real abaixo
    }

    // Construir array de levels Three.js: { mesh, lowerBound }
    // lowerBound do level i = maxDistance do level i-1 (0 para o primeiro)
    const threeLevels = [];
    let prevMax = 0;
    for (const t of renderable) {
        const levelMesh = builder(t.level, ctx);
        if (levelMesh) {
            threeLevels.push({ mesh: levelMesh, lowerBound: prevMax, level: t.level });
        }
        if (Number.isFinite(t.maxDistance)) {
            prevMax = Math.max(prevMax, t.maxDistance);
        }
    }

    if (threeLevels.length === 0) {
        // Nenhum builder retornou mesh - degrada para mesh original sem wrapper
        return { ok: true, lod: null, mesh: baseMesh, skipped: true };
    }

    for (const tl of threeLevels) {
        lod.addLevel(tl.mesh, tl.lowerBound, hysteresis);
        levelsAdded += 1;
    }

    // Preserva metadata de userData/position do baseMesh - caller espera
    // que o objeto inserido na cena tenha posicao/rotacao do original.
    if (baseMesh.position && lod.position && typeof lod.position.copy === 'function') {
        lod.position.copy(baseMesh.position);
    }
    if (baseMesh.quaternion && lod.quaternion && typeof lod.quaternion.copy === 'function') {
        lod.quaternion.copy(baseMesh.quaternion);
    }
    if (baseMesh.scale && lod.scale && typeof lod.scale.copy === 'function') {
        lod.scale.copy(baseMesh.scale);
    }
    if (baseMesh.userData && typeof baseMesh.userData === 'object') {
        lod.userData = Object.assign({}, baseMesh.userData, { _lodFamily: family });
    } else {
        lod.userData = { _lodFamily: family };
    }

    return { ok: true, lod, mesh: lod, skipped: false, levelsAdded };
}

/**
 * Dispose chain - libera meshes/levels do LOD object.
 * Three.js LOD nao tem dispose() proprio; precisamos iterar levels
 * e disposar geometry/material de cada mesh nao-compartilhado.
 *
 * Nao disposa o baseMesh original se ele for o mesh do level HIGH
 * (caller pode estar reutilizando) - usar opt `disposeBase=true` para forcar.
 *
 * @param {any} lod - THREE.LOD instance
 * @param {object} [opts?]
 * @param {boolean} [opts.disposeBase=false]
 * @returns {{disposed:number}}
 */
export function disposeLOD(lod: any, opts?: any): { disposed: number } {
    if (!lod || !Array.isArray(lod.levels)) return { disposed: 0 };
    const options = opts || {};
    const disposeBase = options.disposeBase === true;
    const seen = new Set();
    let disposed = 0;
    const levels = lod.levels.slice();
    for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        const mesh = level && level.object;
        if (!mesh) continue;
        // Nao disposar HIGH (lower-bound 0) se disposeBase=false
        if (i === 0 && !disposeBase) continue;
        if (seen.has(mesh)) continue;
        seen.add(mesh);
        if (mesh.geometry && typeof mesh.geometry.dispose === 'function') {
            mesh.geometry.dispose();
            disposed += 1;
        }
        if (mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
                if (m && typeof m.dispose === 'function') {
                    m.dispose();
                    disposed += 1;
                }
            }
        }
    }
    return { disposed };
}

console.debug('[mod:end]', 'app/js/utils/scene/lodMeshFactory.js');
