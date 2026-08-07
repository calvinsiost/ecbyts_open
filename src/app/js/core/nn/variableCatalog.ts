// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   VARIABLE CATALOG — Available variables for NN mapping
   Catalogo de variaveis disponiveis para mapeamento de redes neurais

   Constroi lista categorizada a partir de CONFIG.PARAMETERS e
   PARAMETER_RANGES. Inclui pseudo-variaveis geometricas para
   conectar saidas da rede a parametros 3D de plumas.
   ================================================================ */
import { CONFIG } from '../../config.js';
import { PARAMETER_RANGES, FAMILY_PARAMETERS } from '../elements/randomModel.js';
import { getCalculatorItems } from '../calculator/manager.js';
type AnyRecord = Record<string, any>;
type CatalogRange = { min: number; max: number; unitId?: string; category?: string };
/**
 * @typedef {{ id: string, name?: string, names?: Record<string, string>, defaultUnitId?: string, category?: string }} CatalogParameter
 * @typedef {{ unitId?: string, min: number, max: number, category?: string }} CatalogRange
 * @typedef {{ id: string, enabled?: boolean, label?: string, unitId?: string, type?: string }} CalculatorCatalogItem
 */
// ----------------------------------------------------------------
// GEOMETRIC PSEUDO-VARIABLES - Plume shape & position
// Variaveis sinteticas para conectar saidas da rede a geometria 3D
// ----------------------------------------------------------------
const GEOMETRIC_VARIABLES = [
    {
        id: 'plume_radiusX',
        name: 'Plume Radius X',
        names: { en: 'Plume Radius X', pt: 'Raio X da Pluma', es: 'Radio X de Pluma' },
        unitId: 'm',
        category: 'geometry',
        min: 1,
        max: 50,
    },
    {
        id: 'plume_radiusY',
        name: 'Plume Radius Y',
        names: { en: 'Plume Radius Y', pt: 'Raio Y da Pluma', es: 'Radio Y de Pluma' },
        unitId: 'm',
        category: 'geometry',
        min: 1,
        max: 50,
    },
    {
        id: 'plume_radiusZ',
        name: 'Plume Radius Z',
        names: { en: 'Plume Radius Z', pt: 'Raio Z da Pluma', es: 'Radio Z de Pluma' },
        unitId: 'm',
        category: 'geometry',
        min: 1,
        max: 30,
    },
    {
        id: 'plume_centerX',
        name: 'Plume Center X',
        names: { en: 'Plume Center X', pt: 'Centro X da Pluma', es: 'Centro X de Pluma' },
        unitId: 'm',
        category: 'geometry',
        min: -100,
        max: 100,
    },
    {
        id: 'plume_centerY',
        name: 'Plume Center Y',
        names: { en: 'Plume Center Y', pt: 'Centro Y da Pluma', es: 'Centro Y de Pluma' },
        unitId: 'm',
        category: 'geometry',
        min: -80,
        max: 0,
    },
    {
        id: 'plume_centerZ',
        name: 'Plume Center Z',
        names: { en: 'Plume Center Z', pt: 'Centro Z da Pluma', es: 'Centro Z de Pluma' },
        unitId: 'm',
        category: 'geometry',
        min: -100,
        max: 100,
    },
];
// ----------------------------------------------------------------
// CATEGORY METADATA - Display names and colors
// Categorias com nomes e cores para o painel de catalogo
// ----------------------------------------------------------------
const CATEGORY_META: AnyRecord = {
    physical: { label: { en: 'Physical', pt: 'Físicos', es: 'Físicos' }, color: '#3498db' },
    chemical: { label: { en: 'Chemical', pt: 'Químicos', es: 'Químicos' }, color: '#e67e22' },
    contaminant: { label: { en: 'Contaminants', pt: 'Contaminantes', es: 'Contaminantes' }, color: '#e74c3c' },
    emission: { label: { en: 'Emissions', pt: 'Emissões', es: 'Emisiones' }, color: '#95a5a6' },
    air_quality: { label: { en: 'Air Quality', pt: 'Qualidade do Ar', es: 'Calidad del Aire' }, color: '#1abc9c' },
    waste: { label: { en: 'Waste', pt: 'Resíduos', es: 'Residuos' }, color: '#8e44ad' },
    effluent: { label: { en: 'Effluent', pt: 'Efluentes', es: 'Efluentes' }, color: '#2980b9' },
    safety: { label: { en: 'Health & Safety', pt: 'Saúde e Segurança', es: 'Salud y Seguridad' }, color: '#f39c12' },
    occupational: { label: { en: 'Occupational', pt: 'Ocupacional', es: 'Ocupacional' }, color: '#d35400' },
    biodiversity: { label: { en: 'Biodiversity', pt: 'Biodiversidade', es: 'Biodiversidad' }, color: '#27ae60' },
    geometry: { label: { en: 'Plume Geometry', pt: 'Geometria da Pluma', es: 'Geometría de Pluma' }, color: '#9b59b6' },
    calculated: { label: { en: 'Calculated', pt: 'Calculados', es: 'Calculados' }, color: '#16a085' },
};
/**
 * Get category display label for current language.
 * @param {string} categoryId
 * @param {string} [lang='en']
 * @returns {string}
 */
export function getCategoryLabel(categoryId: any, lang: any = 'en') {
    const meta = /** @type {Record<string, { label: Record<string, string>, color: string }>} */ (CATEGORY_META)[categoryId];
    return meta ? meta.label[lang] || meta.label.en : categoryId;
}
/**
 * Get category color for a given category.
 * @param {string} categoryId
 * @returns {string}
 */
export function getCategoryColor(categoryId: any) {
    return (
    /** @type {Record<string, { label: Record<string, string>, color: string }>} */ (CATEGORY_META)[categoryId]
        ?.color || '#7f8c8d');
}
/**
 * Build the full variable catalog.
 * Constroi catalogo completo de variaveis com bounds de normalizacao.
 *
 * @returns {Array<{ id: string, name: string, unitId: string, category: string, min: number, max: number }>}
 */
function buildEnvironmentalParameters(): any[] {
    const parameters: any[] = [];
    for (const rawParam of CONFIG.PARAMETERS) {
        const param = /** @type {CatalogParameter} */ (rawParam);
        const range = (PARAMETER_RANGES as AnyRecord)[param.id] as CatalogRange | undefined;
        if (!range)
            continue;
        // Determine category from range or param
        const category = range.category || param.category || 'chemical';
        parameters.push({
            id: param.id,
            name: param.names?.en || param.name || param.id,
            unitId: range.unitId || param.defaultUnitId || '',
            category,
            min: range.min,
            max: range.max,
        });
    }
    return parameters;
}

function buildGeometricVariables(): any[] {
    return GEOMETRIC_VARIABLES.map((gv) => ({
        id: gv.id,
        name: gv.names?.en || gv.name,
        unitId: gv.unitId,
        category: gv.category,
        min: gv.min,
        max: gv.max,
    }));
}

function buildCalculatorVariables(): any[] {
    const variables: any[] = [];
    try {
        const calcItems = getCalculatorItems() as any[];
        for (const item of calcItems) {
            if (!item.enabled)
                continue;
            variables.push({
                id: `calc:${item.id}`,
                name: item.label || item.id,
                unitId: item.unitId || '',
                category: 'calculated',
                min: 0,
                max: 1,
                _calcType: item.type,
            });
        }
    }
    catch (e: any) {
        console.debug('[variableCatalog] calculatorMod:', e?.message || e);
        /* calculator module not initialized yet */
    }
    return variables;
}

export function buildVariableCatalog() {
    return [
        ...buildEnvironmentalParameters(),
        ...buildGeometricVariables(),
        ...buildCalculatorVariables(),
    ];
}
/**
 * Get variables relevant to a specific element family.
 * Retorna variaveis aplicaveis a familia do elemento.
 *
 * @param {string} familyId
 * @returns {Array<{ id: string, name: string, unitId: string, category: string, min: number, max: number }>}
 */
export function getVariablesForFamily(familyId: any) {
    const params = /** @type {string[] | undefined} */ (FAMILY_PARAMETERS[familyId]);
    if (!params || params.length === 0)
        return [];
    const catalog = buildVariableCatalog();
    return catalog.filter((v: any) => params.includes(v.id));
}
/**
 * Group catalog variables by category.
 * Agrupa catalogo por categoria para exibicao no painel.
 *
 * @param {Array<any>} catalog - From buildVariableCatalog()
 * @returns {Object<string, Array<any>>} Grouped by category
 */
export function groupByCategory(catalog: any) {
    /** @type {Object<string, Array<any>>} */
    const groups: AnyRecord = {};
    for (const v of catalog) {
        if (!groups[v.category])
            groups[v.category] = [];
        groups[v.category].push(v);
    }
    return groups;
}
/**
 * Check if a variable is a geometric pseudo-variable (plume shape/position).
 * @param {string} variableId
 * @returns {boolean}
 */
export function isGeometricVariable(variableId: any) {
    return variableId.startsWith('plume_');
}
/**
 * Check if a variable is derived from a Calculator item.
 * @param {string} variableId
 * @returns {boolean}
 */
export function isCalculatorVariable(variableId: any) {
    return typeof variableId === 'string' && variableId.startsWith('calc:');
}
/**
 * Extract the Calculator item ID from a variable ID.
 * @param {string} variableId - e.g. 'calc:avg-benzene'
 * @returns {string} e.g. 'avg-benzene'
 */
export function getCalculatorItemId(variableId: any) {
    return variableId.replace(/^calc:/, '');
}
//# sourceMappingURL=variableCatalog.js.map
