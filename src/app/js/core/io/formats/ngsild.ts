// Generated from src/app/js/core/io/formats/ngsild.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: NGSI-LD Export - Smart Data Models / FIWARE interop
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

// @ts-check

/* ================================================================
   EXPORTADOR NGSI-LD (Smart Data Models / FIWARE)
   ================================================================

   Gera entidades NGSI-LD compativeis com o ecossistema FIWARE
   de Smart Cities e IoT, seguindo os padroes:
   - NGSI-LD (ETSI GS CIM 009 V1.6.1)
   - Smart Data Models (smartdatamodels.org)
   - Schema.org para metadados de projeto

   DECISOES DE DESIGN:

   1. @context EMBUTIDO: Operacao offline obrigatoria. Sem fetch
      externo de contextos JSON-LD. O @context e inline (~2KB).

   2. NAMESPACE ecbyts: FIWARE nao possui equivalentes para
      MonitoringWell, ContaminationPlume, StorageTank, etc.
      Definimos um namespace custom como contribuicao academica.

   3. EXPORT-ONLY: Importacao de NGSI-LD requer mapeamento reverso
      complexo e esta fora do escopo inicial.

   4. UNIDADES UN/CEFACT Rec 20: Mapeamento de unidades internas
      para codigos padrao (mg/L → GL, °C → CEL, m → MTR).

   5. PROPERTY-OF-PROPERTY: Metadados EDD (detect_flag, method,
      detection_limit) seguem o padrao NGSI-LD de sub-propriedades.

   REFERENCIAS:
   - https://smartdatamodels.org
   - https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/
   - https://schema.org
   - https://unece.org/trade/uncefact/cl-recommendations

   ================================================================ */

import { registerFormat } from './registry.js';
import { relativeToWGS84, getElementPosition, getOrigin, getEPSG } from '../geo/coordinates.js';

/**
 * @typedef {Record<string, any>} NGSILDRecord
 * @typedef {{ x: number, y?: number, z: number }} RelativePosition
 * @typedef {{ zone?: number, hemisphere?: string }} CoordinateOrigin
 * @typedef {{ id: string, name?: string, family: string, visible?: boolean, data?: NGSILDRecord }} EnvironmentalElement
 * @typedef {{ parameterId?: string, date?: string, value?: any, unitId?: string, detect_flag?: string, detection_limit?: number, analytical_method?: string, cas_number?: string, campaignId?: string, x?: number, y?: number, z?: number, credentialLevel?: string, variables?: NGSILDRecord }} EnvironmentalObservation
 * @typedef {{ sourceId?: string, targetId?: string, type?: string, label?: string }} EnvironmentalEdge
 * @typedef {{ name?: string, description?: string, author?: string }} ProjectMetadata
 * @typedef {{ project?: ProjectMetadata, elements?: EnvironmentalElement[], edges?: EnvironmentalEdge[], ecbyts?: string }} NGSILDModel
 * @typedef {{ scope?: 'elements' | 'observations' | 'full', format?: 'normalized' | 'keyValues', precision?: number }} ExportNGSILDOptions
 * @typedef {Record<string, any>} NGSILDEntity
 */

// ----------------------------------------------------------------
// REGISTRO NO FORMAT REGISTRY
// ----------------------------------------------------------------

registerFormat({
    id: 'ngsild',
    name: 'NGSI-LD (Smart Data Models)',
    extensions: ['.jsonld', '.ngsild.json'],
    mimeType: 'application/ld+json',
    canExport: true,
    canImport: false,
    needsOrigin: true,
    exportScopes: ['elements', 'observations', 'full'],
});

// ----------------------------------------------------------------
// @CONTEXT (EMBUTIDO - OFFLINE)
// ----------------------------------------------------------------

/**
 * JSON-LD @context embutido para operacao offline.
 * Combina termos NGSI-LD core, Schema.org e namespace ecbyts custom.
 */
const EMBEDDED_CONTEXT = [
    'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.6.jsonld',
    {
        schema: 'https://schema.org/',
        fiware: 'https://uri.fiware.org/ns/data-models#',
        ecbyts: 'https://ecbyts.com/ns/environmental-twin#',

        // NGSI-LD core terms
        Property: 'ngsi-ld:Property',
        GeoProperty: 'ngsi-ld:GeoProperty',
        Relationship: 'ngsi-ld:Relationship',
        observedAt: 'ngsi-ld:observedAt',
        unitCode: 'ngsi-ld:unitCode',

        // Schema.org terms (metadados de projeto)
        name: 'schema:name',
        description: 'schema:description',

        // FIWARE Smart Environment
        WaterQualityObserved: 'fiware:WaterQualityObserved',
        AirQualityObserved: 'fiware:AirQualityObserved',
        WaterBody: 'fiware:WaterBody',
        Device: 'fiware:Device',

        // ecbyts custom types (contribuicao PhD)
        MonitoringWell: 'ecbyts:MonitoringWell',
        ContaminationPlume: 'ecbyts:ContaminationPlume',
        StorageTank: 'ecbyts:StorageTank',
        StudyAreaBoundary: 'ecbyts:StudyAreaBoundary',
        EmissionSource: 'ecbyts:EmissionSource',
        WasteStream: 'ecbyts:WasteStream',
        EffluentPoint: 'ecbyts:EffluentPoint',
        EnvironmentalHabitat: 'ecbyts:EnvironmentalHabitat',
        EnvironmentalMarker: 'ecbyts:EnvironmentalMarker',
        SamplePoint: 'ecbyts:SamplePoint',
        GeologicalStratum: 'ecbyts:GeologicalStratum',
        SpringSource: 'ecbyts:SpringSource',
    },
];

// ----------------------------------------------------------------
// MAPEAMENTO FAMILIA → TIPO NGSI-LD
// ----------------------------------------------------------------

const FAMILY_TYPE_MAP: Record<string, string> = {
    well: 'MonitoringWell',
    plume: 'ContaminationPlume',
    lake: 'WaterBody',
    river: 'WaterBody',
    spring: 'SpringSource',
    sensor: 'Device',
    building: 'schema:Place',
    tank: 'StorageTank',
    boundary: 'StudyAreaBoundary',
    emission_source: 'EmissionSource',
    waste_stream: 'WasteStream',
    effluent_point: 'EffluentPoint',
    habitat: 'EnvironmentalHabitat',
    marker: 'EnvironmentalMarker',
    sample: 'SamplePoint',
    stratum: 'GeologicalStratum',
    individual: 'schema:Person',
    incident: 'ecbyts:EnvironmentalIncident',
    area: 'StudyAreaBoundary',
    blueprint: 'ecbyts:SiteBlueprint',
};

// ----------------------------------------------------------------
// MAPEAMENTO UNIDADES → UN/CEFACT Rec 20
// ----------------------------------------------------------------

const UNIT_MAP: Record<string, string> = {
    mg_L: 'GL', // milligrams per litre
    ug_L: 'GK', // micrograms per litre
    pH: 'Q30', // pH (dimensionless)
    celsius: 'CEL', // degree Celsius
    fahrenheit: 'FAH', // degree Fahrenheit
    m: 'MTR', // metre
    cm: 'CMT', // centimetre
    mm: 'MMT', // millimetre
    km: 'KMT', // kilometre
    ft: 'FOT', // foot
    in: 'INH', // inch
    m_s: 'MTS', // metres per second
    L_s: 'G51', // litres per second
    m3_s: 'G56', // cubic metres per second
    mg_kg: 'J33', // milligrams per kilogram
    uS_cm: 'D10', // microsiemens per centimetre
    mS_cm: 'H61', // millisiemens per centimetre
    NTU: 'FNU', // nephelometric turbidity unit
    bar: 'BAR', // bar
    kPa: 'KPA', // kilopascal
    atm: 'ATM', // standard atmosphere
    mg_m3: 'GP', // milligrams per cubic metre
    ppm: '59', // parts per million
    ppb: '61', // parts per billion
    '%': 'P1', // percent
    Bq_L: 'A27', // becquerel per litre
    adimensional: 'C62', // dimensionless
    mg_L_CaCO3: 'GL', // mg/L (calcium carbonate)
    m_day: 'G62', // metres per day (approx)
};

// ----------------------------------------------------------------
// FAMILIAS DE AGUA (observacoes → WaterQualityObserved)
// ----------------------------------------------------------------

const WATER_FAMILIES = new Set(['well', 'lake', 'river', 'spring', 'plume', 'sample', 'effluent_point']);

const AIR_FAMILIES = new Set(['emission_source']);

// ----------------------------------------------------------------
// FUNCAO PRINCIPAL DE EXPORTACAO
// ----------------------------------------------------------------

/**
 * Exporta modelo como colecao de entidades NGSI-LD.
 *
 * @param {NGSILDModel} model - Modelo completo do ecbyts
 * @param {ExportNGSILDOptions} [options]
 * @returns {Blob} - Blob com application/ld+json
 */
export function exportNGSILD(model: any, options: any = {}) {
    const { scope = 'full', format = 'normalized', precision = 7 } = options;

    const entities = [];
    const origin = getOrigin();

    // 1. Entidade raiz: projeto como schema:Place
    if (scope === 'full' && model.project) {
        entities.push(buildProjectEntity(model, origin));
    }

    // 2. Elementos → entidades NGSI-LD
    if (scope !== 'observations') {
        for (const el of model.elements || []) {
            const entity = elementToEntity(el, precision, format);
            if (entity) entities.push(entity);
        }
    }

    // 3. Observacoes → WaterQualityObserved / AirQualityObserved
    if (scope !== 'elements') {
        for (const el of model.elements || []) {
            const obs = el.data?.observations || [];
            for (const o of obs) {
                const obsEntity = observationToEntity(el, o, precision, format);
                if (obsEntity) entities.push(obsEntity);
            }
        }
    }

    // 4. Edges → Relationship entities
    if (scope === 'full' && Array.isArray(model.edges)) {
        for (const edge of model.edges) {
            const relEntity = edgeToRelationship(edge);
            if (relEntity) entities.push(relEntity);
        }
    }

    // Monta documento final
    const doc =
        entities.length === 1
            ? { '@context': EMBEDDED_CONTEXT, ...entities[0] }
            : entities.map((e: any) => ({ '@context': EMBEDDED_CONTEXT, ...e }));

    const json = JSON.stringify(doc, null, 2);
    return new Blob([json], { type: 'application/ld+json' });
}

// ----------------------------------------------------------------
// BUILDERS
// ----------------------------------------------------------------

/**
 * Constroi entidade NGSI-LD para o projeto (schema:Place).
 *
 * @param {NGSILDModel} model
 * @param {CoordinateOrigin} origin
 * @returns {NGSILDEntity}
 */
function buildProjectEntity(model: any, origin: any) {
    const proj = model.project || {};
    const zone = origin.zone || 0;
    const hemisphere = origin.hemisphere || 'S';

    return {
        id: `urn:ngsi-ld:Place:${sanitizeId(proj.name || 'ecbyts-project')}`,
        type: 'schema:Place',
        name: prop(proj.name || 'Unnamed Project'),
        description: prop(proj.description || ''),
        'schema:author': prop(proj.author || ''),
        'ecbyts:coordinateSystem': prop({
            system: 'UTM',
            zone,
            hemisphere,
            epsg: getEPSG(zone, hemisphere),
        }),
        'ecbyts:elementCount': prop((model.elements || []).length),
        'ecbyts:exportedAt': prop(new Date().toISOString()),
        'ecbyts:version': prop(model.ecbyts || '2.0.0'),
    };
}

/**
 * Converte elemento para entidade NGSI-LD.
 *
 * @param {EnvironmentalElement} el
 * @param {number} precision
 * @param {'normalized' | 'keyValues'} format
 * @returns {NGSILDEntity}
 */
function elementToEntity(el: any, precision: any, format: any) {
    const family = el.family;
    const ngsildType = FAMILY_TYPE_MAP[family] || 'ecbyts:EnvironmentalElement';
    const data = el.data || {};

    const entity: any = {
        id: `urn:ngsi-ld:${ngsildType.replace('schema:', '').replace('ecbyts:', '')}:${el.id}`,
        type: ngsildType,
        name: prop(el.name || el.id),
    };

    // GeoProperty - localizacao
    const geo = buildGeoProperty(el, precision);
    if (geo) {
        entity.location = {
            type: 'GeoProperty',
            value: geo,
        };
    }

    // Propriedades especificas por familia
    addNGSILDFamilyProps(entity, el, format);

    // Metadata: familia original, visibilidade
    entity['ecbyts:family'] = prop(family);
    if (el.visible === false) {
        entity['ecbyts:visible'] = prop(false);
    }

    // Contagem de observacoes
    const obsCount = data.observations?.length || 0;
    if (obsCount > 0) {
        entity['ecbyts:observationCount'] = prop(obsCount);
    }

    return entity;
}

/**
 * Converte observacao para entidade WaterQualityObserved / AirQualityObserved.
 *
 * @param {EnvironmentalElement} el
 * @param {EnvironmentalObservation} obs
 * @param {number} precision
 * @param {'normalized' | 'keyValues'} _format
 * @returns {NGSILDEntity}
 */
function observationToEntity(el: any, obs: any, precision: any, _format: any) {
    const family = el.family;

    // Determina tipo de observacao
    let obsType;
    if (WATER_FAMILIES.has(family)) {
        obsType = 'WaterQualityObserved';
    } else if (AIR_FAMILIES.has(family)) {
        obsType = 'AirQualityObserved';
    } else {
        obsType = 'ecbyts:EnvironmentalObservation';
    }

    const parameterId = obs.parameterId || 'unknown';
    const date = obs.date || new Date().toISOString().split('T')[0];
    const obsId = `${el.id}-${parameterId}-${date}`.replace(/[^a-zA-Z0-9_-]/g, '_');

    const entity: any = {
        id: `urn:ngsi-ld:${obsType}:${obsId}`,
        type: obsType,
        dateObserved: prop(date),
        'ecbyts:parameterId': prop(parameterId),
    };

    // Valor principal com unidade e timestamp
    if (obs.value !== null && obs.value !== undefined) {
        const unitCode = (obs.unitId && UNIT_MAP[obs.unitId]) || obs.unitId || 'C62';
        entity[parameterId] = {
            type: 'Property',
            value: obs.value,
            unitCode: unitCode,
            observedAt: `${date}T00:00:00Z`,
        };

        // Property-of-Property: metadados EDD
        if (obs.detect_flag) {
            entity[parameterId]['ecbyts:detectFlag'] = {
                type: 'Property',
                value: obs.detect_flag,
            };
        }
        if (obs.detection_limit !== null && obs.detection_limit !== undefined) {
            entity[parameterId]['ecbyts:detectionLimit'] = {
                type: 'Property',
                value: obs.detection_limit,
            };
        }
        if (obs.analytical_method) {
            entity[parameterId]['ecbyts:analyticalMethod'] = {
                type: 'Property',
                value: obs.analytical_method,
            };
        }
        if (obs.cas_number) {
            entity[parameterId]['ecbyts:casNumber'] = {
                type: 'Property',
                value: obs.cas_number,
            };
        }
    }

    // Relacao com o elemento monitorado
    entity['ecbyts:monitoredBy'] = {
        type: 'Relationship',
        object: `urn:ngsi-ld:${(FAMILY_TYPE_MAP[family] || 'EnvironmentalElement').replace('schema:', '').replace('ecbyts:', '')}:${el.id}`,
    };

    // Campanha
    if (obs.campaignId) {
        entity['ecbyts:campaignId'] = prop(obs.campaignId);
    }

    // Coordenadas da observacao (se diferentes do elemento)
    if (obs.x !== undefined && obs.y !== undefined && obs.z !== undefined) {
        const wgs = relativeToWGS84({ x: obs.x, y: obs.y, z: obs.z });
        entity.location = {
            type: 'GeoProperty',
            value: {
                type: 'Point',
                coordinates: [round(wgs.longitude, precision), round(wgs.latitude, precision)],
            },
        };
    }

    // Credential level (qualidade do dado)
    if (obs.credentialLevel) {
        entity['ecbyts:credentialLevel'] = prop(obs.credentialLevel);
    }

    // Variaveis contextuais (matriz, fracao, etc.)
    if (obs.variables && Object.keys(obs.variables).length > 0) {
        entity['ecbyts:contextVariables'] = prop(obs.variables);
    }

    return entity;
}

/**
 * Converte edge para entidade Relationship NGSI-LD.
 *
 * @param {EnvironmentalEdge} edge
 * @returns {NGSILDEntity | null}
 */
function edgeToRelationship(edge: any) {
    if (!edge.sourceId || !edge.targetId) return null;

    return {
        id: `urn:ngsi-ld:Relationship:${edge.sourceId}-${edge.type || 'relatedTo'}-${edge.targetId}`,
        type: 'ecbyts:EnvironmentalRelationship',
        'ecbyts:relationshipType': prop(edge.type || 'relatedTo'),
        'ecbyts:source': {
            type: 'Relationship',
            object: `urn:ngsi-ld:EnvironmentalElement:${edge.sourceId}`,
        },
        'ecbyts:target': {
            type: 'Relationship',
            object: `urn:ngsi-ld:EnvironmentalElement:${edge.targetId}`,
        },
        name: prop(edge.label || edge.type || 'relationship'),
    };
}

// ----------------------------------------------------------------
// GEO PROPERTIES
// ----------------------------------------------------------------

/**
 * Constroi GeoJSON geometry para um elemento.
 *
 * @param {EnvironmentalElement} el
 * @param {number} precision
 * @returns {NGSILDRecord | null}
 */
function buildGeoProperty(el: any, precision: any) {
    const data = el.data || {};

    // Polygon: vertices explicitos (boundary, plume com shape)
    if (data.vertices && data.vertices.length >= 3) {
        const vertices = (data.vertices) as any[];
        const coords = vertices.map((v: any) => {
            const wgs = relativeToWGS84(v);
            return [round(wgs.longitude, precision), round(wgs.latitude, precision)];
        });
        coords.push(coords[0]!); // fechar anel
        return { type: 'Polygon', coordinates: [coords] };
    }

    // LineString: rio com path
    if (data.path && data.path.length >= 2) {
        const pathPoints = (data.path) as any[];
        const coords = pathPoints.map((p: any) => {
            const wgs = relativeToWGS84(p);
            return [round(wgs.longitude, precision), round(wgs.latitude, precision)];
        });
        return { type: 'LineString', coordinates: coords };
    }

    // Point: default
    try {
        const pos = getElementPosition(el);
        const wgs = relativeToWGS84(pos);
        return {
            type: 'Point',
            coordinates: [round(wgs.longitude, precision), round(wgs.latitude, precision)],
        };
    } catch {
        return null;
    }
}

// ----------------------------------------------------------------
// PROPRIEDADES ESPECIFICAS POR FAMILIA
// ----------------------------------------------------------------

/**
 * @param {NGSILDEntity} entity
 * @param {EnvironmentalElement} el
 * @param {'normalized' | 'keyValues'} _format
 * @returns {void}
 */
function addNGSILDFamilyProps(entity: any, el: any, _format: any) {
    const d = el.data || {};

    switch (el.family) {
        case 'well':
            if (d.construction?.totalDepth)
                entity['ecbyts:totalDepth'] = propWithUnit(d.construction.totalDepth, 'MTR');
            if (d.construction?.diameter) entity['ecbyts:diameter'] = propWithUnit(d.construction.diameter, 'INH');
            if (d.construction?.screenTop) entity['ecbyts:screenTop'] = propWithUnit(d.construction.screenTop, 'MTR');
            if (d.construction?.screenBottom)
                entity['ecbyts:screenBottom'] = propWithUnit(d.construction.screenBottom, 'MTR');
            break;

        case 'plume':
            if (d.depth?.level) entity['ecbyts:depthLevel'] = prop(d.depth.level);
            if (d.depth?.top != null) entity['ecbyts:depthTop'] = propWithUnit(d.depth.top, 'MTR');
            if (d.depth?.bottom != null) entity['ecbyts:depthBottom'] = propWithUnit(d.depth.bottom, 'MTR');
            break;

        case 'building':
            if (d.footprint?.width) entity['ecbyts:width'] = propWithUnit(d.footprint.width, 'MTR');
            if (d.footprint?.length) entity['ecbyts:length'] = propWithUnit(d.footprint.length, 'MTR');
            if (d.height) entity['ecbyts:height'] = propWithUnit(d.height, 'MTR');
            break;

        case 'tank':
            if (d.type) entity['ecbyts:tankType'] = prop(d.type);
            if (d.contents) entity['ecbyts:contents'] = prop(d.contents);
            if (d.capacity) entity['ecbyts:capacity'] = propWithUnit(d.capacity, 'LTR');
            break;

        case 'lake':
            if (d.shape?.depth) entity['ecbyts:depth'] = propWithUnit(d.shape.depth, 'MTR');
            break;

        case 'river':
            if (d.width) entity['ecbyts:width'] = propWithUnit(d.width, 'MTR');
            entity['ecbyts:waterBodyType'] = prop('river');
            break;

        case 'habitat':
            if (d.habitatType) entity['ecbyts:habitatType'] = prop(d.habitatType);
            if (d.protectionStatus) entity['ecbyts:protectionStatus'] = prop(d.protectionStatus);
            if (d.area) entity['ecbyts:area'] = propWithUnit(d.area, 'MTK'); // m²
            break;

        case 'emission_source':
            if (d.type) entity['ecbyts:sourceType'] = prop(d.type);
            if (d.sourceCategory) entity['ecbyts:sourceCategory'] = prop(d.sourceCategory);
            break;

        case 'effluent_point':
            if (d.effluentType) entity['ecbyts:effluentType'] = prop(d.effluentType);
            if (d.receivingBody) entity['ecbyts:receivingBody'] = prop(d.receivingBody);
            break;

        case 'sensor':
            if (d.sensorType) entity['ecbyts:sensorType'] = prop(d.sensorType);
            if (d.protocol) entity['ecbyts:communicationProtocol'] = prop(d.protocol);
            break;
    }
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

/**
 * Cria propriedade NGSI-LD normalizada.
 *
 * @param {any} value
 * @returns {{ type: 'Property', value: any }}
 */
function prop(value: any) {
    return { type: 'Property', value };
}

/**
 * Cria propriedade NGSI-LD com unitCode.
 *
 * @param {any} value
 * @param {string} unitCode
 * @returns {{ type: 'Property', value: any, unitCode: string }}
 */
function propWithUnit(value: any, unitCode: any) {
    return { type: 'Property', value, unitCode };
}

/**
 * Sanitiza string para uso como ID de entidade.
 *
 * @param {string} str
 * @returns {string}
 */
function sanitizeId(str: any) {
    return str.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64);
}

/**
 * @param {number} n
 * @param {number} prec
 * @returns {number}
 */
function round(n: any, prec: any) {
    const factor = Math.pow(10, prec);
    return Math.round(n * factor) / factor;
}
