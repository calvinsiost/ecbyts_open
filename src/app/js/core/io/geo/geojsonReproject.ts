// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// TRUST-010 W9 adoption helper — reprojeta uma FeatureCollection GeoJSON
// inteira de um datum legado para WGS84, usando catálogo W9 (helmert7Param)
// + mapeamento EPSG → datum (epsgDatumMap).
//
// PIPELINE: detectNonWGS84Crs → epsgToDatum → reprojectDatum em cada vértice.
//
// USO TÍPICO: caller que importa GeoJSON com crs.name=EPSG:4267 (NAD27),
// EPSG:31983 (SIRGAS UTM-23S) ou EPSG:4301 (Tokyo Datum) pode chamar este
// helper para obter FeatureCollection equivalente em WGS84 antes de passar
// para importGeoJSONObject (que assume WGS84). Opt-in: NÃO é chamado
// automaticamente por importGeoJSONObject (preserva backward compat).
//
// LIMITAÇÃO conhecida: datums em projeções UTM (e.g. EPSG:31983 SIRGAS
// UTM-23S) requerem invertir UTM → LLA antes do Helmert. Como o app só
// reprojeta o DATUM (não a projeção), coordenadas que chegam projetadas
// em UTM-23S precisam ser convertidas para LLA SIRGAS2000 ANTES de chamar
// este helper. Para o caso comum (crs declarado mas coords ainda em
// lon/lat — frequente em shapefile→GeoJSON conversions onde o conversor
// preserva lat/lon do datum source), funciona direto.

import { reprojectDatum, getHelmertParams } from './helmert7Param.js';
import { epsgToDatum } from './epsgDatumMap.js';
import { deepClone } from '../../../utils/helpers/deepClone.js';

export interface ReprojectResult {
    readonly reprojected: boolean;
    readonly sourceDatum: string | null;
    readonly accuracyM: number | null;
    readonly featureCollection: any;
    readonly verticesTransformed: number;
    readonly warning: string | null;
}

/**
 * Reprojeta FeatureCollection GeoJSON de datum legado → WGS84.
 *
 * Detecta `fc.crs.name` (ou `fc.crs.properties.name`), mapeia EPSG → datum,
 * e aplica `reprojectDatum` em todos os vértices (Point/LineString/Polygon/
 * MultiPoint/MultiLineString/MultiPolygon).
 *
 * Retorna `{ reprojected, sourceDatum, accuracyM, featureCollection, ... }`.
 * Se já WGS84 ou datum desconhecido, retorna fc original + reprojected=false.
 *
 * @param fc FeatureCollection GeoJSON (não-mutado; deep-clone interno)
 */
export function reprojectFeatureCollectionToWgs84(fc: any): ReprojectResult {
    if (!fc || typeof fc !== 'object' || fc.type !== 'FeatureCollection') {
        return {
            reprojected: false,
            sourceDatum: null,
            accuracyM: null,
            featureCollection: fc,
            verticesTransformed: 0,
            warning: 'Input não é FeatureCollection válido.',
        };
    }
    const crsName: string =
        fc.crs?.properties?.name ||
        fc.crs?.name ||
        '';
    if (!crsName) {
        return {
            reprojected: false,
            sourceDatum: null,
            accuracyM: null,
            featureCollection: fc,
            verticesTransformed: 0,
            warning: null, // RFC 7946: WGS84 implícito
        };
    }
    // WGS84 detection (já é destino — no-op)
    if (/EPSG[:_]+4326|CRS84/i.test(crsName)) {
        return {
            reprojected: false,
            sourceDatum: 'WGS84',
            accuracyM: null,
            featureCollection: fc,
            verticesTransformed: 0,
            warning: null,
        };
    }
    const sourceDatum = epsgToDatum(crsName);
    if (!sourceDatum) {
        return {
            reprojected: false,
            sourceDatum: null,
            accuracyM: null,
            featureCollection: fc,
            verticesTransformed: 0,
            warning: `Datum ${crsName} não suportado pelo catálogo Helmert (W9). Reprojeção não-aplicada.`,
        };
    }
    const params = getHelmertParams(sourceDatum, 'WGS84');
    if (!params) {
        return {
            reprojected: false,
            sourceDatum,
            accuracyM: null,
            featureCollection: fc,
            verticesTransformed: 0,
            warning: `Helmert params ausentes para ${sourceDatum}→WGS84.`,
        };
    }
    // Deep clone + transform cada vértice (lon, lat) → reprojectDatum
    let count = 0;
    const transformed = deepClone(fc);
    for (const feature of transformed.features || []) {
        if (!feature || !feature.geometry) continue;
        feature.geometry.coordinates = _transformCoordinates(
            feature.geometry.coordinates,
            feature.geometry.type,
            (lon: number, lat: number) => {
                const r = reprojectDatum(lat, lon, 0, sourceDatum, 'WGS84');
                if (!r) return [lon, lat];
                count++;
                return [r.longitude, r.latitude];
            },
        );
    }
    // Marca FC como WGS84
    transformed.crs = {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    };
    return {
        reprojected: true,
        sourceDatum,
        accuracyM: params.accuracyM,
        featureCollection: transformed,
        verticesTransformed: count,
        warning: null,
    };
}

/** Recursivamente transforma coordenadas baseado no GeoJSON geometry type. */
function _transformCoordinates(coords: any, geomType: string, transform: (lon: number, lat: number) => number[]): any {
    if (geomType === 'Point') {
        const [lon, lat] = coords;
        return transform(lon, lat);
    }
    if (geomType === 'MultiPoint' || geomType === 'LineString') {
        return coords.map(([lon, lat]: [number, number]) => transform(lon, lat));
    }
    if (geomType === 'MultiLineString' || geomType === 'Polygon') {
        return coords.map((line: any) => line.map(([lon, lat]: [number, number]) => transform(lon, lat)));
    }
    if (geomType === 'MultiPolygon') {
        return coords.map((poly: any) =>
            poly.map((line: any) => line.map(([lon, lat]: [number, number]) => transform(lon, lat))),
        );
    }
    return coords; // GeometryCollection ou tipo desconhecido — passthrough
}
