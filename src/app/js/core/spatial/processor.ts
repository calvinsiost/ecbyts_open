// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: SpatialBlueprint - Processing Pipeline Orchestrator
// ADR: ADR-021
// ================================================================
// processor.js - Orquestrador do pipeline SpatialBlueprint
// Conecta os 7 estagios: parse -> polygonize -> heal -> project
// -> simplify+area -> compliance -> output (GeoJSON + elemento)
// ================================================================
import { parseDXF } from './dxfParser.js';
import { polygonize, healGeometry, unionPolygons, jstsToCoords } from './topology.js';
import { projectToUTM, projectToWGS84, simplifyMetric, calculateAreaMetric } from './projection.js';
import { checkCompliance } from './compliance.js';
/** Categorias validas para blueprints */
export const BLUEPRINT_CATEGORIES = ['industrial', 'urban', 'forest', 'agricultural', 'mixed'];
/**
 * @typedef {Object} ProcessedLayer
 * @property {string} name - Nome do layer DXF
 * @property {number} entityCount - Entidades originais no layer
 * @property {number} polygonCount - Poligonos resultantes
 * @property {Object} geometry - GeoJSON Polygon em WGS84
 * @property {number} area_m2 - Area em metros quadrados
 * @property {Object} attributes - Metadados adicionais
 */
/**
 * @typedef {Object} SpatialBlueprintResult
 * @property {ProcessedLayer[]} layers - Layers processados
 * @property {Object} footprint - GeoJSON Polygon unificado (WGS84)
 * @property {number} area_m2 - Area total em metros quadrados
 * @property {import('./compliance.js' as string).ComplianceResult[]} compliance
 * @property {Object} metadata - Metadados de processamento
 * @property {Object} element - Dados prontos para criar elemento ecbyts
 */
/**
 * Processa arquivo DXF completo pelo pipeline SpatialBlueprint.
 *
 * Pipeline (7 estagios):
 * 1. PARSE - Extrai entidades DXF
 * 2. POLYGONIZE - Costura linhas em poligonos (JSTS)
 * 3. HEAL - Cura geometrias invalidas (buffer(0))
 * 4. PROJECT - Projeta para UTM metrico (proj4)
 * 5. SIMPLIFY + AREA - Simplifica e calcula area em metros
 * 6. COMPLIANCE - Verifica sobreposicao com zonas ambientais
 * 7. OUTPUT - Gera GeoJSON WGS84 e dados de elemento
 *
 * @param {File|string} input - Arquivo DXF (File) ou conteudo texto
 * @param {Object} [options]
 * @param {string} [options.sourceCRS] - CRS fonte (ex: 'EPSG:31983')
 * @param {string} [options.category='industrial'] - Categoria do site
 * @param {number} [options.simplifyTolerance=0.5] - Tolerancia DP em metros
 * @param {Object[]} [options.referenceZones] - Zonas de compliance GeoJSON
 * @param {number} [options.minOverlapM2=1.0] - Limiar minimo de sobreposicao
 * @param {Function} [options.onProgress] - Callback (stage: string, percent: number)
 * @returns {Promise<SpatialBlueprintResult>}
 */
export async function processDXF(input: any, options: any = {}) {
    const { sourceCRS = 'EPSG:4326', category = 'industrial', simplifyTolerance = 0.5, referenceZones = [], minOverlapM2 = 1.0, onProgress = () => { }, } = options;
    const startTime = Date.now();
    // ── STAGE 1: PARSE ──────────────────────────────────────────
    onProgress('parsing', 0);
    let dxfText;
    const inputAny = input;
    if (input instanceof File || (input && typeof inputAny.text === 'function')) {
        dxfText = await inputAny.text();
    }
    else if (typeof input === 'string') {
        dxfText = input;
    }
    else {
        throw new Error('Input deve ser um File ou string com conteúdo DXF');
    }
    const parsed = parseDXF(dxfText);
    onProgress('parsing', 100);
    if (parsed.entities.length === 0) {
        throw new Error('Nenhuma entidade geométrica encontrada no arquivo DXF');
    }
    // ── STAGE 2: POLYGONIZE (por layer) ─────────────────────────
    onProgress('polygonizing', 0);
    const processedLayers: any[] = [];
    const allPolygons: any[] = [];
    let layerIdx = 0;
    const totalLayers = parsed.layers.size;
    for (const [layerName, layerEntities] of parsed.layers) {
        const polygons = await polygonize(layerEntities);
        // ── STAGE 3: HEAL ───────────────────────────────────────
        const healedPolygons: any[] = [];
        let healedCount = 0;
        for (const poly of polygons) {
            const healed = await healGeometry(poly);
            if (healed) {
                healedPolygons.push(healed);
                if (healed !== poly)
                    healedCount++;
            }
        }
        if (healedPolygons.length > 0) {
            processedLayers.push({
                name: layerName,
                entityCount: layerEntities.length,
                polygonCount: healedPolygons.length,
                healedCount,
                polygons: healedPolygons, // JSTS objects (temporarios)
            });
            allPolygons.push(...healedPolygons);
        }
        layerIdx++;
        onProgress('polygonizing', Math.round((layerIdx / totalLayers) * 100));
    }
    if (allPolygons.length === 0) {
        throw new Error('Nenhum polígono válido foi recuperado. Verifique se o DXF contém geometrias fecháveis.');
    }
    // ── Determina modo de coordenadas ─────────────────────────────
    const isLocal = sourceCRS === 'LOCAL';
    // Unifica todos os poligonos para o footprint
    const footprintJSTS = await unionPolygons(allPolygons);
    const footprintCoords = jstsToCoords(footprintJSTS);
    const coordPairs = footprintCoords.map((c: any) => [c[0], c[1]]);
    let finalCoords: any; // Coords em metros para area/simplify
    let outputCoords: any; // Coords para GeoJSON e Three.js
    let utmCRS: any = null;
    if (isLocal) {
        // ── LOCAL: coords ja estao em metros - sem projecao ──────
        onProgress('projecting', 100);
        // Simplifica e calcula area direto em metros
        onProgress('simplifying', 0);
        finalCoords = simplifyMetric(coordPairs, simplifyTolerance);
        outputCoords = finalCoords;
    }
    else {
        // ── GEOGRAPHIC: pipeline completo com projecao ───────────
        onProgress('projecting', 0);
        const projected = await projectToUTM(coordPairs, sourceCRS);
        utmCRS = projected.targetCRS;
        onProgress('projecting', 100);
        onProgress('simplifying', 0);
        finalCoords = simplifyMetric(projected.coords, simplifyTolerance);
        // Reprojecao para WGS84
        onProgress('reprojecting', 0);
        outputCoords = await projectToWGS84(finalCoords, utmCRS);
        onProgress('reprojecting', 100);
    }
    const totalArea = calculateAreaMetric(finalCoords);
    // ── Processa area por layer ──────────────────────────────────
    for (const layer of processedLayers) {
        let layerArea = 0;
        const layerGeoJSONPolygons: any[] = [];
        for (const poly of layer.polygons) {
            const polyCoords = jstsToCoords(poly);
            const polyPairs = polyCoords.map((c: any) => [c[0], c[1]]);
            let polyMetric: any, polyOutput: any;
            if (isLocal) {
                polyMetric = simplifyMetric(polyPairs, simplifyTolerance);
                polyOutput = polyMetric;
            }
            else {
                const { coords: polyUTM } = await projectToUTM(polyPairs, sourceCRS, utmCRS);
                polyMetric = simplifyMetric(polyUTM, simplifyTolerance);
                polyOutput = await projectToWGS84(polyMetric, utmCRS);
            }
            layerArea += calculateAreaMetric(polyMetric);
            // Fecha o anel se necessario
            const ring = [...polyOutput];
            if (ring.length > 0 &&
                (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
                ring.push([...ring[0]]);
            }
            layerGeoJSONPolygons.push(ring);
        }
        layer.area_m2 = Math.round(layerArea * 100) / 100;
        layer.geometry =
            layerGeoJSONPolygons.length === 1
                ? { type: 'Polygon', coordinates: [layerGeoJSONPolygons[0]] }
                : {
                    type: 'MultiPolygon',
                    coordinates: layerGeoJSONPolygons.map((r: any) => [r]),
                };
        delete layer.polygons;
    }
    onProgress('simplifying', 100);
    // ── Footprint GeoJSON ────────────────────────────────────────
    const ring = [...outputCoords];
    if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
        ring.push([...ring[0]]);
    }
    const footprintGeoJSON = {
        type: 'Polygon',
        coordinates: [ring],
    };
    // ── COMPLIANCE ───────────────────────────────────────────────
    onProgress('compliance', 0);
    // Compliance requer coords geograficas; skip se local sem zonas
    const compliance = !isLocal && referenceZones.length > 0
        ? await checkCompliance(footprintGeoJSON, referenceZones, minOverlapM2)
        : [];
    onProgress('compliance', 100);
    // ── Three.js vertices ────────────────────────────────────────
    const threejsVertices = isLocal ? localCoordsToThreeJS(outputCoords) : wgs84CoordsToThreeJS(outputCoords);
    // ── Metadata ─────────────────────────────────────────────────
    const metadata = {
        source_file: input instanceof File ? input.name : 'inline',
        parsed_at: new Date().toISOString(),
        entity_count: parsed.entities.length,
        polygon_count: allPolygons.length,
        layer_count: processedLayers.length,
        healed_count: processedLayers.reduce((sum: any, l: any) => sum + (l.healedCount || 0), 0),
        simplification_tolerance: simplifyTolerance,
        original_vertices: footprintCoords.length,
        simplified_vertices: finalCoords.length,
        source_crs: sourceCRS,
        utm_crs: utmCRS || 'LOCAL',
        dxf_units: parsed.metadata.units,
        processing_time_ms: Date.now() - startTime,
    };
    // ── Element data ─────────────────────────────────────────────
    const element = {
        category,
        crs_source: sourceCRS,
        geometry: footprintGeoJSON,
        area_m2: Math.round(totalArea * 100) / 100,
        vertices: threejsVertices,
        layers: processedLayers.map((l: any) => ({
            name: l.name,
            entityCount: l.entityCount,
            polygonCount: l.polygonCount,
            geometry: l.geometry,
            area_m2: l.area_m2,
            attributes: {},
        })),
        compliance,
        sensors: [],
        metadata,
    };
    return {
        layers: processedLayers,
        footprint: footprintGeoJSON,
        area_m2: element.area_m2,
        compliance,
        metadata,
        element,
    };
}
/**
 * Converte coordenadas locais (metros) para vertices Three.js centrados.
 * Coords locais ja estao em metros - centra no centroide.
 *
 * @param {Array<[number, number]>} coords - [x, y] pairs em metros
 * @returns {Array<{x: number, z: number}>} - Vertices Three.js (x, z)
 */
function localCoordsToThreeJS(coords: any) {
    if (coords.length === 0)
        return [];
    // Centroide
    let sumX = 0, sumY = 0;
    for (const [x, y] of coords) {
        sumX += x;
        sumY += y;
    }
    const cx = sumX / coords.length;
    const cy = sumY / coords.length;
    // Coords locais = metros direto. Centra no centroide.
    return coords.map(([x, y]: any) => ({
        x: Math.round((x - cx) * 100) / 100,
        z: Math.round(-(y - cy) * 100) / 100, // Three.js Z e invertido vs Y CAD
    }));
}
/**
 * Converte coordenadas WGS84 para vertices Three.js relativos ao centroide.
 * Usa projecao simples de lat/lon para metros (Haversine aproximado).
 *
 * @param {Array<[number, number]>} wgs84Coords - [lon, lat] pairs
 * @returns {Array<{x: number, z: number}>} - Vertices Three.js (x, z)
 */
function wgs84CoordsToThreeJS(wgs84Coords: any) {
    if (wgs84Coords.length === 0)
        return [];
    // Centroide
    let sumLon = 0, sumLat = 0;
    for (const [lon, lat] of wgs84Coords) {
        sumLon += lon;
        sumLat += lat;
    }
    const cLon = sumLon / wgs84Coords.length;
    const cLat = sumLat / wgs84Coords.length;
    // Fator de conversao graus -> metros (aproximado)
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLon = 111320 * Math.cos((cLat * Math.PI) / 180);
    // Escala para caber no viewport 3D (normaliza para ~50m max)
    const offsets = wgs84Coords.map(([lon, lat]: any) => ({
        dx: (lon - cLon) * metersPerDegreeLon,
        dz: (lat - cLat) * metersPerDegreeLat,
    }));
    const maxExtent = Math.max(...offsets.map((o: any) => Math.abs(o.dx)), ...offsets.map((o: any) => Math.abs(o.dz)), 1);
    const scale = maxExtent > 50 ? 50 / maxExtent : 1;
    return offsets.map((o: any) => ({
        x: Math.round(o.dx * scale * 100) / 100,
        // Three.js Z e invertido
        z: Math.round(-o.dz * scale * 100) / 100
    }));
}
/**
 * Valida categoria do blueprint.
 *
 * @param {string} category
 * @returns {boolean}
 */
export function isValidCategory(category: any) {
    return BLUEPRINT_CATEGORIES.includes(category);
}
