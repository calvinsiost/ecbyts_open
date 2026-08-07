// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   LOD CONFIG — Pure-logic Level of Detail decision matrix
   ================================================================
   PERF-MASTER-001 S2 (Claude-owner per Decision 3 evaluation 2026-04-30)

   Decide qual variante geométrica usar para cada elemento baseado em
   distância da câmera. Pure-function, zero Three.js, zero DOM.

   Por que separar config de execução?
   - Threshold científico (distance/element-type) é decisão IP que pode
     mudar com pesquisa de UX (TUM InDash 2023, Three.js perf docs).
   - Engine-agnostic: mesmas regras servem Three.js, Babylon, WebGL puro.
   - Testável em Node sem JSDom — só matemática de distância.

   Inspiração:
   - Three.js LOD class: https://threejs.org/docs/#api/en/objects/LOD
   - "Real-Time Rendering" 4th ed. §19 Acceleration Algorithms

   Roadmap: §0.2 P1-2 PERF-MASTER S2
   ================================================================ */

console.debug('[mod:load]', 'app/js/core/scene/lodConfig.js');

/**
 * Níveis de detalhe canônicos. ORDER MATTERS — index 0 = mais detalhe.
 */
export const LOD_LEVEL = Object.freeze({
    HIGH: 'high', // Geometria completa, todas faces, materials full
    MEDIUM: 'medium', // Geometria reduzida (50-70% triangles)
    LOW: 'low', // Box ou cylinder simples, color flat
    SPRITE: 'sprite', // Plano 2D facing camera (billboard)
    HIDDEN: 'hidden', // Não renderizar (out of frustum extreme distance)
} as const);

export type LODLevel = (typeof LOD_LEVEL)[keyof typeof LOD_LEVEL];

export interface LODThreshold {
    readonly level: string;
    readonly maxDistance: number;
}

export interface LODFamilyConfig {
    readonly family?: string;
    readonly thresholds?: readonly LODThreshold[];
    readonly enabled?: boolean;
}

export type LODConfigMap = Readonly<Record<string, Readonly<LODFamilyConfig>>>;

export interface Point3D {
    readonly x?: unknown;
    readonly y?: unknown;
    readonly z?: unknown;
}

export interface LODConfigSummary {
    familyCount: number;
    enabledCount: number;
    levelsUsed: string[];
}

function isLODThresholdList(value: unknown): value is readonly LODThreshold[] {
    return Array.isArray(value);
}

/**
 * Configuração canônica por família de elemento ambiental.
 *
 * Decisões de threshold:
 * - Wells: alta densidade de detalhe (perfis litológicos), mas elementos
 *   pequenos. HIGH até 50m, MEDIUM até 200m, LOW além.
 * - Plumes: volumétricos grandes (50-500m extents). HIGH até 200m,
 *   MEDIUM até 1km, SPRITE além (esfera 2D ainda transmite escala).
 * - Buildings: blocos densos. HIGH até 100m, LOW além (não precisa MEDIUM).
 * - Boundaries: linhas — não escalam com distância (sempre line strip).
 * - Spring/Lake/River: water bodies. HIGH até 300m, MEDIUM até 2km.
 * - Tank: pequeno + textura. HIGH até 80m, LOW além.
 * - Waste stream: variável (lixões grandes, drenagens pequenos). HIGH 100m, MEDIUM 500m.
 * - Dam/Pit: estruturas grandes mining. HIGH até 500m, MEDIUM até 5km.
 *
 * Ranges fundamentados em screen-space coverage:
 * - Object coberto por <8 pixels = LOW ou SPRITE não-distinguível pelo olho
 * - Object coberto por 8-32 pixels = MEDIUM suficiente
 * - Object coberto por >32 pixels = HIGH justificado
 *
 * Cálculo simplificado: a 1080p, FOV 60°, objeto de 5m a 100m cobre ~30px
 * → MEDIUM justifica até 100-200m para objetos pequenos.
 */
export const DEFAULT_LOD_CONFIG = Object.freeze({
    well: Object.freeze({
        family: 'well',
        thresholds: Object.freeze([
            Object.freeze({ level: LOD_LEVEL.HIGH, maxDistance: 50 }),
            Object.freeze({ level: LOD_LEVEL.MEDIUM, maxDistance: 200 }),
            Object.freeze({ level: LOD_LEVEL.LOW, maxDistance: 1000 }),
            Object.freeze({ level: LOD_LEVEL.SPRITE, maxDistance: 5000 }),
            Object.freeze({ level: LOD_LEVEL.HIDDEN, maxDistance: Infinity }),
        ]),
        enabled: true,
    }),
    plume: Object.freeze({
        family: 'plume',
        thresholds: Object.freeze([
            Object.freeze({ level: LOD_LEVEL.HIGH, maxDistance: 200 }),
            Object.freeze({ level: LOD_LEVEL.MEDIUM, maxDistance: 1000 }),
            Object.freeze({ level: LOD_LEVEL.SPRITE, maxDistance: 10000 }),
            Object.freeze({ level: LOD_LEVEL.HIDDEN, maxDistance: Infinity }),
        ]),
        enabled: true,
    }),
    building: Object.freeze({
        family: 'building',
        thresholds: Object.freeze([
            Object.freeze({ level: LOD_LEVEL.HIGH, maxDistance: 100 }),
            Object.freeze({ level: LOD_LEVEL.LOW, maxDistance: 2000 }),
            Object.freeze({ level: LOD_LEVEL.HIDDEN, maxDistance: Infinity }),
        ]),
        enabled: true,
    }),
    tank: Object.freeze({
        family: 'tank',
        thresholds: Object.freeze([
            Object.freeze({ level: LOD_LEVEL.HIGH, maxDistance: 80 }),
            Object.freeze({ level: LOD_LEVEL.LOW, maxDistance: 1000 }),
            Object.freeze({ level: LOD_LEVEL.HIDDEN, maxDistance: Infinity }),
        ]),
        enabled: true,
    }),
    spring: Object.freeze({
        family: 'spring',
        thresholds: Object.freeze([
            Object.freeze({ level: LOD_LEVEL.HIGH, maxDistance: 300 }),
            Object.freeze({ level: LOD_LEVEL.MEDIUM, maxDistance: 2000 }),
            Object.freeze({ level: LOD_LEVEL.HIDDEN, maxDistance: Infinity }),
        ]),
        enabled: true,
    }),
    waste_stream: Object.freeze({
        family: 'waste_stream',
        thresholds: Object.freeze([
            Object.freeze({ level: LOD_LEVEL.HIGH, maxDistance: 100 }),
            Object.freeze({ level: LOD_LEVEL.MEDIUM, maxDistance: 500 }),
            Object.freeze({ level: LOD_LEVEL.LOW, maxDistance: 3000 }),
            Object.freeze({ level: LOD_LEVEL.HIDDEN, maxDistance: Infinity }),
        ]),
        enabled: true,
    }),
    dam: Object.freeze({
        family: 'dam',
        thresholds: Object.freeze([
            Object.freeze({ level: LOD_LEVEL.HIGH, maxDistance: 500 }),
            Object.freeze({ level: LOD_LEVEL.MEDIUM, maxDistance: 5000 }),
            Object.freeze({ level: LOD_LEVEL.LOW, maxDistance: 20000 }),
            Object.freeze({ level: LOD_LEVEL.HIDDEN, maxDistance: Infinity }),
        ]),
        enabled: true,
    }),
    pit: Object.freeze({
        family: 'pit',
        thresholds: Object.freeze([
            Object.freeze({ level: LOD_LEVEL.HIGH, maxDistance: 500 }),
            Object.freeze({ level: LOD_LEVEL.MEDIUM, maxDistance: 5000 }),
            Object.freeze({ level: LOD_LEVEL.LOW, maxDistance: 20000 }),
            Object.freeze({ level: LOD_LEVEL.HIDDEN, maxDistance: Infinity }),
        ]),
        enabled: true,
    }),
    boundary: Object.freeze({
        family: 'boundary',
        thresholds: Object.freeze([
            Object.freeze({ level: LOD_LEVEL.HIGH, maxDistance: Infinity }), // line strip não escala
        ]),
        enabled: false, // boundaries não usam LOD — sempre HIGH
    }),
    lake: Object.freeze({
        family: 'lake',
        thresholds: Object.freeze([
            Object.freeze({ level: LOD_LEVEL.HIGH, maxDistance: 300 }),
            Object.freeze({ level: LOD_LEVEL.MEDIUM, maxDistance: 2000 }),
            Object.freeze({ level: LOD_LEVEL.LOW, maxDistance: 10000 }),
            Object.freeze({ level: LOD_LEVEL.HIDDEN, maxDistance: Infinity }),
        ]),
        enabled: true,
    }),
    river: Object.freeze({
        family: 'river',
        thresholds: Object.freeze([
            Object.freeze({ level: LOD_LEVEL.HIGH, maxDistance: 300 }),
            Object.freeze({ level: LOD_LEVEL.MEDIUM, maxDistance: 2000 }),
            Object.freeze({ level: LOD_LEVEL.LOW, maxDistance: 10000 }),
            Object.freeze({ level: LOD_LEVEL.HIDDEN, maxDistance: Infinity }),
        ]),
        enabled: true,
    }),
}) satisfies LODConfigMap;

/**
 * Resolve nível LOD para distância dada da câmera ao elemento.
 * Pure function. Não throws — entrada inválida vira HIGH (degradação segura
 * — na dúvida, mais detalhe).
 *
 * Regra: percorre thresholds em ordem (low→high distance), retorna o primeiro
 * level cujo maxDistance >= distance.
 *
 * @param {number} distance - distância em scene units (≥0)
 * @param {LODFamilyConfig} familyConfig? - config da família (de DEFAULT_LOD_CONFIG)
 * @returns {string} LOD_LEVEL
 */
export function resolveLODLevel(distance: number, familyConfig?: LODFamilyConfig | null): string {
    if (!familyConfig || familyConfig.enabled === false) {
        return LOD_LEVEL.HIGH;
    }
    const thresholds = familyConfig.thresholds;
    if (!isLODThresholdList(thresholds) || thresholds.length === 0) {
        return LOD_LEVEL.HIGH;
    }
    const d = Number.isFinite(distance) && distance >= 0 ? distance : 0;
    for (const t of thresholds) {
        if (d <= t.maxDistance) return t.level;
    }
    // Distância maior que todos os thresholds (não deveria acontecer pois
    // último deveria ser Infinity, mas defesa)
    return thresholds[thresholds.length - 1]?.level ?? LOD_LEVEL.HIGH;
}

/**
 * Resolve LOD level para um elemento usando config canônico.
 * Convenience wrapper sobre resolveLODLevel.
 *
 * @param {number} distance
 * @param {string} family
 * @param {Object} [customConfig=DEFAULT_LOD_CONFIG]
 * @returns {string}
 */
export function resolveLODLevelForFamily(distance: number, family: string, customConfig?: LODConfigMap | null): string {
    const config: LODConfigMap = customConfig || DEFAULT_LOD_CONFIG;
    const familyConfig = config[family];
    if (!familyConfig) {
        // Família desconhecida → sempre HIGH (não há config para reduzir)
        return LOD_LEVEL.HIGH;
    }
    return resolveLODLevel(distance, familyConfig);
}

/**
 * Calcula distância euclidiana 3D entre dois pontos.
 * Pure helper — pode ser substituído por THREE.Vector3.distanceTo no
 * consumer Three.js, mas mantemos aqui para testes Node.
 *
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 * @returns {number}
 */
export function distance3D(a?: Point3D | null, b?: Point3D | null): number {
    if (!a || !b) return 0;
    const dx = (Number(a.x) || 0) - (Number(b.x) || 0);
    const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
    const dz = (Number(a.z) || 0) - (Number(b.z) || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Decide se mudança de LOD level deve ser aplicada (hysteresis).
 * Evita "popping" quando câmera oscila ao redor de threshold.
 *
 * @param {string} currentLevel - LOD atual
 * @param {string} computedLevel - LOD calculado pela distância
 * @param {number} hysteresisRatio - margem de tolerância (0.05 = 5%)
 * @param {number} distance - distância atual
 * @param {LODFamilyConfig} familyConfig?
 * @returns {boolean} true se deve mudar
 */
export function shouldSwitchLevel(
    currentLevel: string,
    computedLevel: string,
    hysteresisRatio: number,
    distance: number,
    familyConfig?: LODFamilyConfig | null,
): boolean {
    if (currentLevel === computedLevel) return false;
    const thresholds = familyConfig?.thresholds;
    if (!isLODThresholdList(thresholds)) return true;

    const ratio = Number.isFinite(hysteresisRatio) ? Math.max(0, Math.min(0.5, hysteresisRatio)) : 0.05;

    // Encontra o threshold do level atual
    const currentThreshold = thresholds.find((t) => t.level === currentLevel);
    if (!currentThreshold) return true;

    // Se distância está dentro de N% do threshold atual, NÃO trocar (hysteresis)
    const buffer = currentThreshold.maxDistance * ratio;
    if (distance <= currentThreshold.maxDistance + buffer && distance >= currentThreshold.maxDistance - buffer) {
        return false; // dentro da zona de hysteresis
    }

    return true;
}

/**
 * Sumariza config para diagnóstico/HUD.
 *
 * @param {Object} config?
 * @returns {{familyCount:number, enabledCount:number, levelsUsed:Array<string>}}
 */
export function summarizeLODConfig(config?: LODConfigMap | null): LODConfigSummary {
    const c: LODConfigMap = config || DEFAULT_LOD_CONFIG;
    const families = Object.keys(c);
    const enabled = families.filter((f) => c[f]?.enabled !== false);
    const levelsSet = new Set<string>();
    for (const f of enabled) {
        const fc = c[f];
        if (fc && isLODThresholdList(fc.thresholds)) {
            for (const t of fc.thresholds) levelsSet.add(t.level);
        }
    }
    return {
        familyCount: families.length,
        enabledCount: enabled.length,
        levelsUsed: Array.from(levelsSet).sort(),
    };
}

console.debug('[mod:end]', 'app/js/core/scene/lodConfig.js');
