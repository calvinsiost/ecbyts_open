// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Node Symbology - Phase 1.43 pure-logic helpers.
 * Spec: docs/specs/features/SPEC_CONSTELLATION_HUD_9_75.md (extension)
 *
 * Phase 1.43 (2026-05-01) - mapeamento family → símbolo visual canônico
 * para nós do graph constellation. Define forma (shape), cor base e tag
 * curta por família, alinhado com app/js/config/families.js.
 *
 * Funções:
 *   - symbologyForFamily(familyId): { shape, color, tag, family }
 *   - applyFamilyStyle(node, opts?): node enriquecido com style aplicado
 *   - summarizeSymbology(nodes): { total, byShape, byFamily, unknown }
 *
 * Determinístico, pure-logic. NÃO depende de DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador)
 */

/** Identidade do módulo. */
export const NODE_SYMBOLOGY_META = Object.freeze({
    spec: 'CONSTELLATION_HUD_9_75',
    phase: '1.43',
    deliveredAt: '2026-05-01',
});

/** Shapes canônicos suportados. */
export const SHAPES = Object.freeze({
    CIRCLE: 'circle',
    SQUARE: 'square',
    TRIANGLE: 'triangle',
    DIAMOND: 'diamond',
    HEXAGON: 'hexagon',
    PENTAGON: 'pentagon',
    STAR: 'star',
    CROSS: 'cross',
});

/** Default symbol para famílias desconhecidas. */
const DEFAULT_SYMBOL = Object.freeze({
    shape: SHAPES.CIRCLE,
    color: '#888888',
    tag: '?',
});

/**
 * Tabela canônica family → símbolo. Cores em hex; alinhar com famílias do
 * registry (`app/js/config/families.js`). Cobertura completa de 34 famílias.
 */
const FAMILY_TABLE: Readonly<Record<string, { shape: string; color: string; tag: string }>> = Object.freeze({
    // Containers
    site_project: { shape: SHAPES.SQUARE, color: '#2c3e50', tag: 'PRJ' },
    site_area: { shape: SHAPES.SQUARE, color: '#34495e', tag: 'ARE' },
    site_zone: { shape: SHAPES.SQUARE, color: '#5d6d7e', tag: 'ZON' },
    // Hidrologia / águas
    plume: { shape: SHAPES.HEXAGON, color: '#d35400', tag: 'PLU' },
    lake: { shape: SHAPES.HEXAGON, color: '#3498db', tag: 'LAK' },
    river: { shape: SHAPES.HEXAGON, color: '#2980b9', tag: 'RIV' },
    spring: { shape: SHAPES.DIAMOND, color: '#5dade2', tag: 'SPR' },
    effluent_point: { shape: SHAPES.TRIANGLE, color: '#1abc9c', tag: 'EFF' },
    // Monitoramento
    well: { shape: SHAPES.CIRCLE, color: '#16a085', tag: 'WEL' },
    sensor: { shape: SHAPES.CIRCLE, color: '#27ae60', tag: 'SEN' },
    sample: { shape: SHAPES.CIRCLE, color: '#229954', tag: 'SAM' },
    marker: { shape: SHAPES.CROSS, color: '#7f8c8d', tag: 'MRK' },
    // Infraestrutura
    building: { shape: SHAPES.SQUARE, color: '#7d6608', tag: 'BLD' },
    tank: { shape: SHAPES.PENTAGON, color: '#a04000', tag: 'TNK' },
    infra_linear: { shape: SHAPES.SQUARE, color: '#6c3483', tag: 'INF' },
    treatment_system: { shape: SHAPES.PENTAGON, color: '#117864', tag: 'TRS' },
    blueprint: { shape: SHAPES.SQUARE, color: '#566573', tag: 'BLP' },
    // Mineração
    dam: { shape: SHAPES.PENTAGON, color: '#922b21', tag: 'DAM' },
    pit: { shape: SHAPES.HEXAGON, color: '#7e5109', tag: 'PIT' },
    // Ambiental
    waste_stream: { shape: SHAPES.TRIANGLE, color: '#7d6608', tag: 'WAS' },
    emission_source: { shape: SHAPES.TRIANGLE, color: '#b03a2e', tag: 'EMI' },
    atmosphere: { shape: SHAPES.HEXAGON, color: '#85c1e9', tag: 'ATM' },
    habitat: { shape: SHAPES.STAR, color: '#52be80', tag: 'HAB' },
    boundary: { shape: SHAPES.SQUARE, color: '#909497', tag: 'BND' },
    // Frota
    vehicle: { shape: SHAPES.DIAMOND, color: '#5499c7', tag: 'VEH' },
    equipment: { shape: SHAPES.DIAMOND, color: '#48c9b0', tag: 'EQP' },
    // Geológico
    stratum: { shape: SHAPES.HEXAGON, color: '#a04000', tag: 'STR' },
    fault: { shape: SHAPES.CROSS, color: '#641e16', tag: 'FLT' },
    // Eventos / outros
    incident: { shape: SHAPES.STAR, color: '#c0392b', tag: 'INC' },
    individual: { shape: SHAPES.CIRCLE, color: '#af7ac5', tag: 'IND' },
    area: { shape: SHAPES.SQUARE, color: '#bdc3c7', tag: 'ARE' },
    intangible: { shape: SHAPES.STAR, color: '#aab7b8', tag: 'INT' },
    generic: { shape: SHAPES.CIRCLE, color: '#95a5a6', tag: 'GEN' },
    route_flow: { shape: SHAPES.TRIANGLE, color: '#2874a6', tag: 'RTE' },
});

/**
 * Resolve símbolo canônico para uma família.
 * Retorna sempre objeto frozen - desconhecido cai em DEFAULT_SYMBOL.
 */
export function symbologyForFamily(
    familyId: string,
): { shape: string; color: string; tag: string; family: string } {
    if (typeof familyId !== 'string' || familyId.length === 0) {
        return Object.freeze({ ...DEFAULT_SYMBOL, family: 'unknown' });
    }
    const entry = FAMILY_TABLE[familyId];
    if (!entry) {
        return Object.freeze({ ...DEFAULT_SYMBOL, family: familyId });
    }
    return Object.freeze({ ...entry, family: familyId });
}

/**
 * Enriquece um node com style baseado em sua família.
 * Não muta input - retorna shallow clone com `style` aplicado.
 * Style explícito em `node.style` tem precedência (override permitido).
 */
export function applyFamilyStyle(
    node: { id: string; family?: string; style?: object },
    opts: { override?: boolean } = {},
): { id: string; family?: string; style: object } {
    if (!node || typeof node !== 'object') {
        throw new TypeError('applyFamilyStyle: node must be an object');
    }
    const sym = symbologyForFamily(node.family || '');
    const override = opts.override === true;
    const existing = node.style && typeof node.style === 'object' ? node.style : {};
    const baseStyle = {
        shape: sym.shape,
        color: sym.color,
        tag: sym.tag,
    };
    const style = override ? { ...existing, ...baseStyle } : { ...baseStyle, ...existing };
    return { ...node, style };
}

/**
 * Sumariza distribuição de símbolos em uma lista de nodes.
 */
export function summarizeSymbology(
    nodes: Array<{ family?: string }>,
): { total: number; byShape: Record<string, number>; byFamily: Record<string, number>; unknown: number } {
    const summary: {
        total: number;
        byShape: Record<string, number>;
        byFamily: Record<string, number>;
        unknown: number;
    } = { total: 0, byShape: {}, byFamily: {}, unknown: 0 };
    if (!Array.isArray(nodes)) return summary;
    for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const sym = symbologyForFamily(node.family || '');
        summary.total += 1;
        summary.byShape[sym.shape] = (summary.byShape[sym.shape] || 0) + 1;
        summary.byFamily[sym.family] = (summary.byFamily[sym.family] || 0) + 1;
        if (!node.family || !FAMILY_TABLE[node.family]) summary.unknown += 1;
    }
    return summary;
}
