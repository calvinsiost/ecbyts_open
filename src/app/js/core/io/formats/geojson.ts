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
// @ts-check

/* ================================================================
   GEOJSON FORMAT — Exportação e importação GIS
   ================================================================

   Gera FeatureCollection compatível com QGIS, geojson.io, Mapbox.
   Padrão RFC 7946 — coordenadas em WGS84 [longitude, latitude].

   MAPEAMENTO DE FAMÍLIAS:
   - Point: well, spring, marker, sample, tank, emission_source, effluent_point
   - Polygon: building, boundary, lake, plume, habitat, area
   - LineString: river

   Propriedades incluem metadados do elemento e resumo de observações.

   ================================================================ */

import { registerFormat } from './registry.js';
import { relativeToWGS84, wgs84ToRelative, getElementPosition, getOrigin, getEPSG } from '../geo/coordinates.js';
import { generateId } from '../../../utils/helpers/id.js';
import { assignDatasetColor } from '../../symbology/datasetColors.js';
import { validatePolygonRing } from '../../boundary/polygonGeometry.js';
import { ringCrossesAntimeridian } from '../geo/antimeridianSplit.js';
import { epsgToDatum } from '../geo/epsgDatumMap.js';
import { reprojectFeatureCollectionToWgs84 } from '../geo/geojsonReproject.js';

/**
 * @typedef {Record<string, any>} GeoJSONRecord
 * @typedef {{ x: number, y?: number, z: number }} RelativePoint
 * @typedef {{ id?: string, family?: string, name?: string, visible?: boolean, data?: GeoJSONRecord }} ModelElement
 * @typedef {{ project?: { name?: string }, elements?: ModelElement[], ecbyts?: string }} GeoJSONModel
 * @typedef {{ type?: string, coordinates?: any }} GeoJSONGeometry
 * @typedef {{ type?: string, geometry?: GeoJSONGeometry | null, properties?: GeoJSONRecord }} GeoJSONFeature
 * @typedef {{ type?: string, features?: GeoJSONFeature[] }} GeoJSONFeatureCollection
 * @typedef {{ parameterId?: string, parameter?: string, value?: unknown, reading?: unknown, date?: string }} ObservationRecord
 */

// ----------------------------------------------------------------
// REGISTRO
// ----------------------------------------------------------------

registerFormat({
    id: 'geojson',
    name: 'GeoJSON',
    extensions: ['.geojson', '.json'],
    mimeType: 'application/geo+json',
    canExport: true,
    canImport: true,
    needsOrigin: true,
    exportScopes: ['elements'],
});

// ----------------------------------------------------------------
// MAPEAMENTO DE GEOMETRIA
// ----------------------------------------------------------------

const _POINT_FAMILIES = new Set([
    'well',
    'spring',
    'marker',
    'sample',
    'tank',
    'emission_source',
    'effluent_point',
    'incident',
    'individual',
    'waste_stream',
    'stratum',
]);

const POLYGON_FAMILIES = new Set(['building', 'boundary', 'lake', 'plume', 'habitat', 'area', 'blueprint']);

const LINE_FAMILIES = new Set(['river']);

// ----------------------------------------------------------------
// EXPORTAÇÃO
// ----------------------------------------------------------------

/**
 * Exporta modelo como GeoJSON FeatureCollection.
 *
 * @param {GeoJSONModel} model - Modelo completo
 * @param {object} [options]
 * @param {number} [options.precision=7] - Casas decimais nas coordenadas
 * @returns {Blob}
 */
export function exportGeoJSON(model: any, options: any = {}) {
    const { precision = 7 } = options;
    const origin = getOrigin();

    /** @type {GeoJSONFeature[]} */
    const features = [];

    for (const el of model.elements || []) {
        const feature = elementToFeature(el, precision);
        if (feature) {
            features.push(feature);
        }
    }

    const fc = {
        type: 'FeatureCollection',
        name: model.project?.name || 'ecbyts Export',
        crs: {
            type: 'name',
            properties: {
                name: `urn:ogc:def:crs:EPSG::4326`,
            },
        },
        metadata: {
            exported: new Date().toISOString(),
            source: 'ecbyts',
            version: model.ecbyts || '2.0.0',
            utmOrigin: {
                easting: origin.easting,
                northing: origin.northing,
                elevation: origin.elevation,
                zone: origin.zone,
                hemisphere: origin.hemisphere,
                epsg: getEPSG(origin.zone, origin.hemisphere || 'N'),
            },
        },
        features,
    };

    const json = JSON.stringify(fc, null, 2);
    return new Blob([json], { type: 'application/geo+json' });
}

/**
 * Converte um elemento para um GeoJSON Feature.
 *
 * @param {ModelElement} el - Elemento do modelo
 * @param {number} precision - Casas decimais
 * @returns {Object|null} - Feature ou null se não mapeável
 */
function elementToFeature(el: any, precision: any) {
    const family = el.family || 'marker';
    const data = el.data || {};

    /** @type {any} */
    let geometry: any;

    if (LINE_FAMILIES.has(family)) {
        geometry = elementToLineString(el, precision);
    } else if (POLYGON_FAMILIES.has(family)) {
        geometry = elementToPolygon(el, precision);
    } else {
        // Default: Point
        geometry = elementToPoint(el, precision);
    }

    if (!geometry) return null;

    // Propriedades - metadados do elemento
    /** @type {GeoJSONRecord} */
    const properties = {
        id: el.id,
        family,
        name: el.name,
        visible: el.visible !== false,
    };

    // Adiciona propriedades específicas por família
    addFamilyProperties(properties, el);

    // Adiciona resumo de observações
    addObservationSummary(properties, data.observations);

    return {
        type: 'Feature',
        geometry,
        properties,
    };
}

// ----------------------------------------------------------------
// GEOMETRIAS
// ----------------------------------------------------------------

/**
 * @param {ModelElement} el
 * @param {number} prec
 * @returns {GeoJSONGeometry}
 */
function elementToPoint(el: any, prec: any) {
    const pos = getElementPosition(el);
    const wgs = relativeToWGS84(pos);
    return {
        type: 'Point',
        coordinates: [round(wgs.longitude, prec), round(wgs.latitude, prec)],
    };
}

/**
 * @param {ModelElement} el
 * @param {number} prec
 * @returns {GeoJSONGeometry}
 */
function elementToPolygon(el: any, prec: any) {
    const data = el.data || {};

    // Boundary: vértices explícitos
    if (data.vertices && data.vertices.length >= 3) {
        const vertices = /** @type {RelativePoint[]} */ (data.vertices);
        const coords = vertices.map((v: any) => {
            const wgs = relativeToWGS84(v);
            return [round(wgs.longitude, prec), round(wgs.latitude, prec)];
        });
        // Fechar o anel
        coords.push(coords[0]!);
        return { type: 'Polygon', coordinates: [coords] };
    }

    // Building: retângulo a partir de posição + footprint
    if (data.footprint && data.position) {
        const p = /** @type {RelativePoint} */ (data.position);
        const hw = (data.footprint.width || 10) / 2;
        const hl = (data.footprint.length || 10) / 2;
        const corners = [
            { x: p.x - hw, y: p.y, z: p.z - hl },
            { x: p.x + hw, y: p.y, z: p.z - hl },
            { x: p.x + hw, y: p.y, z: p.z + hl },
            { x: p.x - hw, y: p.y, z: p.z + hl },
        ];
        const coords = corners.map((c) => {
            const wgs = relativeToWGS84(c);
            return [round(wgs.longitude, prec), round(wgs.latitude, prec)];
        });
        coords.push(coords[0]!);
        return { type: 'Polygon', coordinates: [coords] };
    }

    // Plume/Lake/Habitat: elipse aproximada
    const pos = getElementPosition(el);
    let rx = 10,
        rz = 10;

    if (data.shape) {
        rx = data.shape.radiusX || 10;
        rz = data.shape.radiusY || data.shape.radiusZ || 10;
    }
    if (data.area) {
        rx = rz = Math.sqrt((data.area || 100) / Math.PI);
    }

    return ellipseToPolygon(pos, rx, rz, prec);
}

/**
 * @param {ModelElement} el
 * @param {number} prec
 * @returns {GeoJSONGeometry}
 */
function elementToLineString(el: any, prec: any) {
    const data = el.data || {};
    if (!data.path || data.path.length < 2) {
        // Fallback: ponto
        return elementToPoint(el, prec);
    }

    const path = /** @type {RelativePoint[]} */ (data.path);
    const coords = path.map((p: any) => {
        const wgs = relativeToWGS84(p);
        return [round(wgs.longitude, prec), round(wgs.latitude, prec)];
    });

    return { type: 'LineString', coordinates: coords };
}

/**
 * Gera polígono aproximando uma elipse.
 *
 * @param {RelativePoint} center
 * @param {number} rx - Raio X (metros)
 * @param {number} rz - Raio Z (metros)
 * @param {number} prec - Precisão decimal
 * @param {number} [numPoints=32] - Número de vértices
 * @returns {GeoJSONGeometry} - GeoJSON Polygon geometry
 */
function ellipseToPolygon(center: any, rx: any, rz: any, prec: any, numPoints = 32) {
    const coords = [];
    for (let i = 0; i <= numPoints; i++) {
        const angle = (2 * Math.PI * i) / numPoints;
        const point = {
            x: center.x + rx * Math.cos(angle),
            y: center.y,
            z: center.z + rz * Math.sin(angle),
        };
        const wgs = relativeToWGS84(point);
        coords.push([round(wgs.longitude, prec), round(wgs.latitude, prec)]);
    }
    return { type: 'Polygon', coordinates: [coords] };
}

// ----------------------------------------------------------------
// PROPRIEDADES
// ----------------------------------------------------------------

/**
 * @param {GeoJSONRecord} props
 * @param {ModelElement} el
 * @returns {void}
 */
function addFamilyProperties(props: any, el: any) {
    const d = el.data || {};

    switch (el.family) {
        case 'well':
            props.totalDepth = d.construction?.totalDepth;
            props.diameter = d.construction?.diameter;
            break;
        case 'plume':
            props.depthLevel = d.depth?.level;
            props.depthTop = d.depth?.top;
            props.depthBottom = d.depth?.bottom;
            break;
        case 'building':
            props.width = d.footprint?.width;
            props.length = d.footprint?.length;
            props.height = d.height;
            break;
        case 'tank':
            props.tankType = d.type;
            props.contents = d.contents;
            break;
        case 'lake':
            props.depth = d.shape?.depth;
            break;
        case 'river':
            props.width = d.width;
            break;
        case 'habitat':
            props.habitatType = d.habitatType;
            props.protectionStatus = d.protectionStatus;
            props.area = d.area;
            break;
        case 'emission_source':
            props.sourceType = d.type;
            props.sourceCategory = d.sourceCategory;
            break;
        case 'effluent_point':
            props.effluentType = d.effluentType;
            props.receivingBody = d.receivingBody;
            break;
        case 'blueprint':
            props.category = d.category;
            props.area_m2 = d.area_m2;
            props.crs_source = d.crs_source;
            props.layer_count = d.layers?.length || 0;
            break;
    }
}

/**
 * @param {GeoJSONRecord} props
 * @param {ObservationRecord[] | null | undefined} observations
 * @returns {void}
 */
function addObservationSummary(props: any, observations: any) {
    if (!observations || observations.length === 0) return;

    props.observations_count = observations.length;

    // Último valor de cada parâmetro
    /** @type {Record<string, { value: unknown, date: string }>} */
    const latest: Record<string, { value: unknown; date: string }> = {};
    for (const o of observations) {
        const paramId = o.parameterId || o.parameter || 'unknown';
        const date = o.date || '';
        if (!latest[paramId] || date >= latest[paramId].date) {
            latest[paramId] = { value: o.value ?? o.reading, date };
        }
    }

    for (const [paramId, data] of Object.entries(latest)) {
        props[`latest_${paramId}`] = data.value;
    }
}

// ----------------------------------------------------------------
// IMPORTAÇÃO
// ----------------------------------------------------------------

/**
 * Importa GeoJSON FeatureCollection como elementos.
 *
 * @param {string} jsonText - Conteúdo do arquivo GeoJSON
 * @returns {{ elements: Object[], warnings: string[] }}
 */
export function importGeoJSON(jsonText: any) {
    const fc = /** @type {GeoJSONFeatureCollection} */ (JSON.parse(jsonText));
    return importGeoJSONObject(fc);
}

/**
 * TRUST-010 W9/G4: detecta se FeatureCollection declara CRS não-WGS84/CRS84.
 *
 * RFC 7946 (§ 4) deprecou `crs` member em GeoJSON e exige WGS84/CRS84 implícito.
 * Datasets legados (especialmente shapefiles convertidos) ainda declaram
 * `crs.name` como `EPSG:31983` (SIRGAS UTM-23S), `EPSG:4267` (NAD27),
 * `EPSG:4301` (Tokyo Datum), etc. Sem transformação, esses dados entram
 * silenciosamente com erro 200-500m.
 *
 * Retorna `{ isWGS84, sourceCrs?, warning? }`. `isWGS84=true` quando:
 *   - `fc.crs` ausente (RFC 7946 default)
 *   - `crs.type === 'name'` e nome canônico WGS84/CRS84 (4326, OGC::CRS84)
 *
 * Pure-logic; sem side effects. Usado por `importGeoJSONObject` p/ empilhar
 * warning. Quando proj4js for adicionado (W9 fix), helper retorna `transformFn`
 * para reprojetar.
 *
 * @param {GeoJSONFeatureCollection} fc
 * @returns {{ isWGS84: boolean, sourceCrs: string|null, warning: string|null }}
 */
export function detectNonWGS84Crs(fc: any): { isWGS84: boolean; sourceCrs: string | null; warning: string | null } {
    if (!fc || typeof fc !== 'object') {
        return { isWGS84: true, sourceCrs: null, warning: null };
    }
    const crs = fc.crs;
    if (!crs || typeof crs !== 'object') {
        // RFC 7946: ausência de crs = WGS84/CRS84 implícito.
        return { isWGS84: true, sourceCrs: null, warning: null };
    }
    // crs.type === 'name' (legacy GeoJSON 2008) ou 'EPSG' (raro)
    const name: string =
        (crs.properties && typeof crs.properties.name === 'string' && crs.properties.name) ||
        (typeof crs.name === 'string' && crs.name) ||
        '';
    if (!name) {
        return { isWGS84: true, sourceCrs: null, warning: null };
    }
    // Padrões WGS84 / CRS84 canônicos aceitos
    const WGS84_PATTERNS = [
        /EPSG[:_]+4326\b/i,
        /OGC[:_]+CRS84\b/i,
        /urn:ogc:def:crs:OGC[:_]+1\.3[:_]+CRS84/i,
        /urn:ogc:def:crs:EPSG[:_]*::?4326/i,
    ];
    const isWGS84 = WGS84_PATTERNS.some((re) => re.test(name));
    if (isWGS84) {
        return { isWGS84: true, sourceCrs: name, warning: null };
    }
    // TRUST-010 W9 wire-up: se EPSG conhecido, oferece reprojeção via helmert7Param
    const datum = epsgToDatum(name);
    if (datum) {
        return {
            isWGS84: false,
            sourceCrs: name,
            warning:
                `GeoJSON declara CRS ${name} (datum ${datum}). ` +
                `Reprojeção disponível via core/io/geo/helmert7Param.reprojectDatum(lat, lon, h, '${datum}', 'WGS84'). ` +
                `Sem reprojeção, erro de posição esperado: ${datum === 'SIRGAS2000' ? '<1m' : datum === 'NAD27' ? '~200m' : '~500m'}.`,
        };
    }
    return {
        isWGS84: false,
        sourceCrs: name,
        warning:
            `GeoJSON declara CRS não-WGS84 (${name}). Dados serão tratados como WGS84 sem reprojeção — ` +
            `erro de posição esperado: 200-500m (datums legados como NAD27, Tokyo Datum, SIRGAS UTM). ` +
            `Reprojete o dataset para EPSG:4326 antes de importar, ou aguarde TRUST-010 W9 (proj4js).`,
    };
}

/**
 * Importa GeoJSON FeatureCollection ja parseado (object).
 *
 * Usado pelo pipeline shapefile que recebe o objeto direto do shpjs
 * — evita stringify/parse desnecessario que estoura V8 string limit
 * (~512MB) em datasets grandes (ex: IBGE 5573 municipios = ~700MB texto).
 *
 * SPEC_GIS_AUTO_COLOR_DATASET: aceita `options.datasetId` opcional; quando
 * presente, cada elemento recebe `meta.color` automatica via
 * `assignDatasetColor(datasetId)` (paleta Tableau-10 estendida, hash FNV-1a).
 * Caller pode sobrescrever `meta.color` apos retorno.
 *
 * @param {GeoJSONFeatureCollection} fc - FeatureCollection ja parseado
 * @param {{ datasetId?: string }} [options]
 * @returns {{ elements: Object[], warnings: string[], datasetColor: string|null }}
 */
export function importGeoJSONObject(fc: any, options: any = {}) {
    const warnings: string[] = [];

    if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
        throw new Error('GeoJSON deve ser FeatureCollection');
    }

    // TRUST-010 W9 opt-in adoption: se autoReprojectKnownDatum=true E datum
    // reconhecido (NAD27/Tokyo/SIRGAS2000), reprojeta TODO o FC para WGS84
    // antes de processar. Caller decide opt-in (mudança comportamental).
    if (options?.autoReprojectKnownDatum === true) {
        const rj = reprojectFeatureCollectionToWgs84(fc);
        if (rj.reprojected && rj.featureCollection) {
            warnings.push(
                `Auto-reprojetado: ${rj.verticesTransformed} vértices de ${rj.sourceDatum} → WGS84 ` +
                    `(precisão Helmert ~${rj.accuracyM}m).`,
            );
            fc = rj.featureCollection;
        }
    }

    // TRUST-010 G4: detecta CRS não-WGS84 e empilha warning (não bloqueia).
    // Após auto-reprojection, fc.crs foi setado para CRS84 — warning não dispara.
    const crsCheck = detectNonWGS84Crs(fc);
    if (crsCheck.warning) {
        warnings.push(crsCheck.warning);
    }

    // TRUST-010 W-Antimeridian: detecta polygons cruzando ±180° (RFC 7946 § 3.1.9
    // violation). Não bloqueia — só avisa porque operações geométricas downstream
    // (area, buffer, centroide) precisarão chamar splitPolygonAtAntimeridian.
    let antimeridianCount = 0;
    for (const feat of fc.features) {
        const g = feat?.geometry;
        if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
        const rings: any[] = g.type === 'Polygon' ? [g.coordinates?.[0]] : (g.coordinates || []).map((p: any) => p?.[0]);
        for (const r of rings) {
            if (!Array.isArray(r)) continue;
            const ringPts = r.map(([lon, lat]: any) => ({ lon, lat }));
            if (ringCrossesAntimeridian(ringPts)) {
                antimeridianCount++;
                break;
            }
        }
    }
    if (antimeridianCount > 0) {
        warnings.push(
            `${antimeridianCount} polygon(s) cruzam o antimeridian (±180°) — RFC 7946 § 3.1.9. ` +
                `Operações de área/buffer/centroide nesses polígonos devem usar splitPolygonAtAntimeridian (core/io/geo/antimeridianSplit).`,
        );
    }

    /** @type {string|null} */
    let datasetColor: string | null = null;
    if (options && typeof options.datasetId === 'string' && options.datasetId.length > 0) {
        try {
            datasetColor = assignDatasetColor(options.datasetId);
        } catch (e) {
            console.debug('[geojson:datasetColor]', /** @type {any} */ (e as any)?.message || e);
        }
    }

    const elements = [];

    for (const feature of fc.features) {
        try {
            const el: any = featureToElement(feature);
            if (el) {
                if (datasetColor) {
                    el.meta = el.meta || {};
                    if (!el.meta.color) el.meta.color = datasetColor;
                }
                elements.push(el);
            }
        } catch (e) {
            warnings.push(`Feature ignorada: ${/** @type {any} */ (e as any).message}`);
        }
    }

    return { elements, warnings, datasetColor };
}

/**
 * Converte GeoJSON Feature para elemento do modelo.
 *
 * @param {GeoJSONFeature} feature
 * @returns {ModelElement|null}
 */
function featureToElement(feature: any) {
    const props = /** @type {GeoJSONRecord} */ (feature.properties || {});
    const geom = feature.geometry;
    if (!geom) return null;

    const family = String(props.family || inferFamily(geom.type || '', props));
    const id = String(props.id || generateId('import'));
    const name = String(props.name || id);

    /** @type {any} */
    let data: any;

    switch (geom.type) {
        case 'Point': {
            const [lon, lat] = /** @type {[number, number]} */ (geom.coordinates);
            const rel = wgs84ToRelative({ latitude: lat, longitude: lon });
            if (family === 'well') {
                data = {
                    coordinates: { easting: rel.x, northing: rel.z, elevation: rel.y },
                    construction: { totalDepth: props.totalDepth || 50, diameter: props.diameter || 4 },
                };
            } else {
                data = { position: rel };
            }
            break;
        }
        case 'Polygon': {
            const ring = /** @type {Array<[number, number]>} */ ((geom.coordinates && geom.coordinates[0]) || []);
            // TRUST-009 G3: valida topologia do ring antes de aceitar (self-intersect,
            // ring closure, degenerate area, vertex count). Ring inválido → throw,
            // capturado por importGeoJSONObject que empilha em warnings[].
            const validationRing = ring.map(([lon, lat]: any) => ({ x: lon, y: lat }));
            const v = validatePolygonRing(validationRing);
            if (!v.valid) {
                const codes = v.errors.map((e: any) => e.code).join(',');
                throw new Error(`Polígono inválido (${codes}) — TRUST-009 G3`);
            }
            if (family === 'boundary') {
                data = {
                    vertices: ring.slice(0, -1).map(([lon, lat]: any) => wgs84ToRelative({ latitude: lat, longitude: lon })),
                };
            } else if (family === 'building') {
                const center = polygonCentroid(ring);
                const rel = wgs84ToRelative(center);
                data = {
                    position: rel,
                    footprint: { width: props.width || 10, length: props.length || 10 },
                    height: props.height || 5,
                };
            } else {
                const center = polygonCentroid(ring);
                data = { position: wgs84ToRelative(center) };
            }
            break;
        }
        case 'LineString': {
            const coordinates = /** @type {Array<[number, number]>} */ (geom.coordinates || []);
            data = {
                path: coordinates.map(([lon, lat]: any) => wgs84ToRelative({ latitude: lat, longitude: lon })),
                width: props.width || 5,
            };
            break;
        }
        default:
            return null;
    }

    return {
        family,
        id,
        name,
        visible: true,
        data,
    };
}

/**
 * @param {string} geomType
 * @param {GeoJSONRecord} props
 * @returns {string}
 */
function inferFamily(geomType: any, props: any) {
    if (props.family) return String(props.family);
    switch (geomType) {
        case 'Point':
            return 'marker';
        case 'Polygon':
            return 'boundary';
        case 'LineString':
            return 'river';
        default:
            return 'marker';
    }
}

/**
 * @param {Array<[number, number]>} ring
 * @returns {{ latitude: number, longitude: number }}
 */
function polygonCentroid(ring: any) {
    let latSum = 0,
        lonSum = 0;
    const n = ring.length - 1; // Exclui ponto de fechamento
    for (let i = 0; i < n; i++) {
        lonSum += ring[i][0];
        latSum += ring[i][1];
    }
    return { latitude: latSum / n, longitude: lonSum / n };
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
