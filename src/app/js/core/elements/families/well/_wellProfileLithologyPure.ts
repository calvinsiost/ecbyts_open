// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Well Family - Profile Lithology (PURE-LOGIC)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   WELL PROFILE LITHOLOGY — Domínio puro de tipos de solo.

   Extraído de WellProfileModule.ts (ARCH-MONOLITH-ATOMIZATION-001,
   modo REFACTOR). Contém SOMENTE lógica pura de domínio de solo (sem
   DOM, sem SVG, sem THREE.js): catálogo canônico cor/rótulo por tipo
   de solo (ABGE simplificado), resolução do id do <pattern> hatch,
   vocabulário de consistência/compacidade conforme o tipo de solo
   (argila vs granular) e detecção de gap/overlap entre camadas.

   O renderer (WellProfileModule._buildDefs / _addLithology / a legenda
   / o editor de camadas) e o validador (WellProfileModule.validate)
   consomem estas funções. Comportamento IDÊNTICO ao código inline
   original.

   NOTA: NÃO duplica core/geology/wellLithology.ts — aquele cobre o
   catálogo geológico canônico (sandstone/shale/...) usado pela
   trajetória/mesh; este cobre os tipos de solo de engenharia
   (clay/sand/silt/...) da coluna construtiva 2D do perfil de poço.
   São catálogos distintos com finalidades distintas.
   ================================================================ */

// ----------------------------------------------------------------
// CONSTANTS - Catálogo de solos (ABGE simplificado)
// ----------------------------------------------------------------

/** Cores dos tipos de solo (ABGE simplificado). */
export const SOIL_COLORS: Readonly<Record<string, string>> = Object.freeze({
    clay: '#C8946E',
    sand: '#F5E6B8',
    silt: '#D4C5A0',
    gravel: '#B0B0B0',
    rock: '#8C8C8C',
    sandy_clay: '#D4A87A',
    clayey_sand: '#E6D29E',
    silty_sand: '#E0D4B4',
    fill: '#A0907A',
    topsoil: '#6B4E37',
    peat: '#3D2B1F',
});

/** Rótulos (PT) para tipos de solo. */
export const SOIL_LABELS: Readonly<Record<string, string>> = Object.freeze({
    clay: 'Argila',
    sand: 'Areia',
    silt: 'Silte',
    gravel: 'Cascalho',
    rock: 'Rocha',
    sandy_clay: 'Argila arenosa',
    clayey_sand: 'Areia argilosa',
    silty_sand: 'Areia siltosa',
    fill: 'Aterro',
    topsoil: 'Solo orgânico',
    peat: 'Turfa',
});

/**
 * Tipos de solo cuja consistência é descrita pelo vocabulário de
 * coesivos (Mole → M. duro). Os demais usam o de granulares
 * (Fofo → M. compacto). Preserva exatamente a lista inline original.
 */
export const CLAY_LIKE_SOIL_TYPES: ReadonlyArray<string> = Object.freeze([
    'clay',
    'sandy_clay',
    'silt',
    'silty_sand',
    'peat',
    'topsoil',
]);

/** Tipo de solo usado como fallback de cor/pattern quando desconhecido. */
export const FALLBACK_SOIL_TYPE = 'clay';

// ----------------------------------------------------------------
// PURE LOGIC - acessores e decisões determinísticas (sem DOM)
// ----------------------------------------------------------------

/**
 * Cor canônica de um tipo de solo. Não cai em fallback — retorna
 * undefined quando desconhecido (o renderer aplica seu próprio '#ccc').
 * @param {unknown} soilType tipo de solo
 * @returns {string | undefined} cor hex ou undefined
 */
export function getSoilColor(soilType: unknown): string | undefined {
    return SOIL_COLORS[String(soilType)];
}

/**
 * Rótulo (PT) de um tipo de solo; cai no próprio valor quando
 * desconhecido (comportamento `SOIL_LABELS[type] || type`).
 * @param {unknown} soilType tipo de solo
 * @returns {string} rótulo
 */
export function getSoilLabel(soilType: unknown): string {
    return SOIL_LABELS[String(soilType)] || String(soilType);
}

/**
 * Id do <pattern> hatch para um tipo de solo: `soil-<tipo>` quando
 * conhecido (presente em SOIL_COLORS), senão `soil-clay`. Equivale a
 * `SOIL_COLORS[String(soilType)] ? 'soil-' + soilType : 'soil-clay'`.
 * @param {unknown} soilType tipo de solo
 * @returns {string} id de pattern SVG (sem '#')
 */
export function resolveSoilPatternId(soilType: unknown): string {
    return SOIL_COLORS[String(soilType)] ? `soil-${soilType}` : `soil-${FALLBACK_SOIL_TYPE}`;
}

/** Uma opção de consistência: par [valor, rótulo]. */
export type ConsistencyChoice = readonly [value: string, label: string];

/** Vocabulário de consistência para solos coesivos (argila). */
const CLAY_CONSISTENCY: ReadonlyArray<ConsistencyChoice> = Object.freeze([
    ['', '—'],
    ['soft', 'Mole'],
    ['medium', 'Médio'],
    ['stiff', 'Duro'],
    ['hard', 'M. duro'],
] as ConsistencyChoice[]);

/** Vocabulário de compacidade para solos granulares (areia). */
const GRANULAR_CONSISTENCY: ReadonlyArray<ConsistencyChoice> = Object.freeze([
    ['', '—'],
    ['loose', 'Fofo'],
    ['medium_dense', 'Médio'],
    ['dense', 'Compacto'],
    ['very_dense', 'M. compacto'],
] as ConsistencyChoice[]);

/**
 * Lista de opções de consistência/compacidade conforme o tipo de solo.
 * Argilas/coesivos: Mole → M. duro | Areias/granulares: Fofo → M. compacto.
 * Slice PURO de `_getConsistencyOptions` (o renderer faz o `.map` → HTML).
 * @param {unknown} soilType tipo de solo
 * @returns {ReadonlyArray<ConsistencyChoice>} opções [valor, rótulo]
 */
export function getConsistencyChoices(soilType: unknown): ReadonlyArray<ConsistencyChoice> {
    return CLAY_LIKE_SOIL_TYPES.includes(String(soilType)) ? CLAY_CONSISTENCY : GRANULAR_CONSISTENCY;
}

/** Camada litológica (apenas os campos usados pela validação de gap/overlap). */
export interface LithoLayer {
    from: number;
    to: number;
}

/**
 * Detecta gaps/overlaps entre camadas litológicas consecutivas após
 * ordená-las por profundidade de topo (`from`). Uma divergência maior
 * que 1 cm (|gap| > 0.01) entre a base de uma camada e o topo da
 * seguinte gera uma mensagem de erro. Equivale ao núcleo puro de
 * `WellProfileModule.validate` (o branch de profundidade construtiva
 * permanece no módulo). Comportamento IDÊNTICO ao inline original.
 * @param {ReadonlyArray<LithoLayer> | null | undefined} layers camadas
 * @returns {string[]} mensagens de erro (vazio = sem gaps/overlaps)
 */
export function computeLayerGapOverlapErrors(
    layers: ReadonlyArray<LithoLayer> | null | undefined,
): string[] {
    const errors: string[] = [];
    if (!Array.isArray(layers) || layers.length === 0) return errors;
    const sorted = [...layers].sort((a, b) => a.from - b.from);
    for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1]!.from - sorted[i]!.to;
        if (Math.abs(gap) > 0.01) {
            errors.push(`Gap/overlap between layers at ${sorted[i]!.to}m`);
        }
    }
    return errors;
}
