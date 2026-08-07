// Generated from src/app/js/core/spatial/compliance.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: SpatialBlueprint - Environmental Compliance Checking
// ADR: ADR-021

// ================================================================
// compliance.js - Verificacao de compliance ambiental via overlay
// Usa turf.js para intersecao fisica (nao booleana) entre o
// blueprint e zonas de referencia ambiental.
//
// REGRA DE OURO #3: NUNCA usar .intersects() booleano.
// Flutuacoes milimetricas de reprojecao geram falsos positivos.
// Usar overlay fisico + limiar de area minima.
// ================================================================

import { importCDN } from '../../utils/helpers/cdnLoader.js';

/** @type {any} cache do modulo turf */
let _turf: any = null;

/**
 * Carrega turf.js sob demanda via CDN.
 * @returns {Promise<any>}
 */
async function loadTurf() {
    if (_turf) return _turf;
    const mod = await importCDN('https://esm.sh/@turf/turf@7.1.0', { name: 'turf.js' });
    _turf = mod;
    return _turf;
}

/**
 * Zonas de referencia ambiental brasileiras (defaults).
 * Baseadas em legislacao CONAMA.
 */
export const REFERENCE_ZONES = {
    APP: {
        name: 'APP — Área de Preservação Permanente',
        regulation: 'CONAMA 303/2002',
        bufferMeters: 30,
        description: "Faixa marginal de cursos d'água, nascentes, topos de morro",
    },
    risk: {
        name: 'Zona de Risco de Contaminação',
        regulation: 'CONAMA 420/2009',
        bufferMeters: 50,
        description: 'Área com valores de referência excedidos para solo/água subterrânea',
    },
    buffer: {
        name: 'Faixa de Proteção Ambiental',
        regulation: 'CONAMA 369/2006',
        bufferMeters: 100,
        description: 'Buffer de proteção em entorno de unidades de conservação',
    },
    operational: {
        name: 'Zona Operacional',
        regulation: 'NR-15 / NR-25',
        bufferMeters: 0,
        description: 'Perímetro de operação industrial com controle ocupacional',
    },
};

/**
 * @typedef {Object} ComplianceResult
 * @property {string} regulation - Codigo da regulamentacao
 * @property {string} zone_type - Tipo da zona (APP, risk, buffer, operational)
 * @property {'compliant'|'non_compliant'|'warning'} status
 * @property {number} overlapAreaM2 - Area real de sobreposicao em m2
 * @property {Object|null} overlapGeometry - GeoJSON da intersecao (se houver)
 */

/**
 * Normaliza um GeoJSON cru para um Feature do turf.
 * @param {any} geojson - GeoJSON Polygon ou Feature
 * @returns {any} Feature do turf
 */
function toFeature(geojson: any): any {
    if (geojson && geojson.type === 'Feature') return geojson;
    return { type: 'Feature', properties: {}, geometry: geojson };
}

type ComplianceStatus = 'compliant' | 'non_compliant' | 'warning';

/**
 * Monta um objeto de resultado de compliance.
 * @param {any} zone - Zona de referencia
 * @param {ComplianceStatus} status - Status da avaliacao
 * @param {number} overlapAreaM2 - Area de sobreposicao em m2
 * @param {any|null} overlapGeometry - Geometria da intersecao
 * @returns {ComplianceResult}
 */
function makeComplianceResult(
    zone: any,
    status: ComplianceStatus,
    overlapAreaM2: number,
    overlapGeometry: any,
): any {
    return {
        regulation: zone.regulation || 'unknown',
        zone_type: zone.type || 'unknown',
        status,
        overlapAreaM2,
        overlapGeometry,
    };
}

/**
 * Processa uma unica zona de referencia contra o blueprint.
 * @param {any} blueprintFeature - Feature do blueprint
 * @param {any} zone - Zona de referencia
 * @param {any} turf - Modulo turf carregado
 * @param {number} minOverlapM2 - Limiar minimo de area
 * @returns {ComplianceResult}
 */
function processComplianceZone(blueprintFeature: any, zone: any, turf: any, minOverlapM2: number): any {
    const zoneFeature = toFeature(zone.geometry);

    try {
        const intersection = turf.intersect(turf.featureCollection([blueprintFeature, zoneFeature]));

        if (!intersection) {
            return makeComplianceResult(zone, 'compliant', 0, null);
        }

        const overlapAreaM2 = turf.area(intersection);

        if (overlapAreaM2 < minOverlapM2) {
            return makeComplianceResult(zone, 'compliant', overlapAreaM2, null);
        }

        return makeComplianceResult(zone, 'non_compliant', overlapAreaM2, intersection.geometry);
    } catch (e: any) {
        console.warn(`[Spatial] Compliance check falhou para zona ${zone.type}:`, /** @type {Error} */ (e).message);
        return makeComplianceResult(zone, 'warning', 0, null);
    }
}

/**
 * Verifica compliance de um blueprint contra zonas de referencia.
 * Implementa Regra de Ouro #3 - overlay fisico, nao booleano.
 *
 * Estrategia:
 * 1. Computa intersecao geometrica (overlay fisico) com turf.intersect()
 * 2. Calcula area real da intersecao com turf.area()
 * 3. Compara contra limiar minimo para evitar falsos positivos
 *
 * @param {any} blueprintGeoJSON - GeoJSON Polygon do blueprint (WGS84)
 * @param {any[]} referenceZones - Array de {geometry: GeoJSON, type: string, regulation: string}
 * @param {number} [minOverlapM2=1.0] - Area minima de sobreposicao para declarar nao-conformidade
 * @returns {Promise<ComplianceResult[]>}
 */
export async function checkCompliance(blueprintGeoJSON: any, referenceZones: any[] = [], minOverlapM2 = 1.0) {
    if (!referenceZones || referenceZones.length === 0) return [];

    const turf = await loadTurf();
    const blueprintFeature = toFeature(blueprintGeoJSON);

    return referenceZones.map((zone) => processComplianceZone(blueprintFeature, zone, turf, minOverlapM2));
}
