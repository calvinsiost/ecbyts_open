// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// TRUST-010 W9 wire-up — mapeia EPSG codes/nomes de CRS para datum IDs usados
// pelo helmert7Param.ts. Permite que geojson.detectNonWGS84Crs + reprojectDatum
// trabalhem juntos: dataset declara `crs.name=EPSG:4267` → epsgToDatum →
// reprojectDatum(NAD27, WGS84) → coords corrigidas.
//
// Apenas datums catalogados em helmert7Param.ts são suportados aqui (NAD27,
// Tokyo Datum, SIRGAS 2000). Para suporte exhaustivo (200+ projeções), proj4js.

/**
 * Mapa EPSG/nome canônico → datum id usado pelo helmert7Param.
 * Cobre os 3 pares suportados + variações de string comuns em GeoJSON legados.
 */
const EPSG_TO_DATUM: Record<string, string> = {
    // SIRGAS 2000 family
    'EPSG:4674': 'SIRGAS2000', // SIRGAS 2000 geographic 2D
    'EPSG:4989': 'SIRGAS2000', // SIRGAS 2000 geographic 3D
    'EPSG:5640': 'SIRGAS2000', // SIRGAS 2000 / UTM 24N
    'EPSG:31983': 'SIRGAS2000', // SIRGAS 2000 / UTM 23S (SP, BR comum)
    'EPSG:31984': 'SIRGAS2000', // SIRGAS 2000 / UTM 24S
    'EPSG:31982': 'SIRGAS2000', // SIRGAS 2000 / UTM 22S
    // NAD27 family (US legacy)
    'EPSG:4267': 'NAD27', // NAD27 geographic
    'EPSG:26710': 'NAD27', // NAD27 / UTM zone 10N
    'EPSG:26711': 'NAD27',
    'EPSG:26712': 'NAD27',
    'EPSG:26713': 'NAD27',
    'EPSG:26714': 'NAD27',
    'EPSG:26715': 'NAD27',
    'EPSG:26716': 'NAD27',
    'EPSG:26717': 'NAD27',
    'EPSG:26718': 'NAD27',
    'EPSG:26719': 'NAD27',
    // Tokyo Datum family (JP legacy pre-JGD2000)
    'EPSG:4301': 'TokyoDatum', // Tokyo geographic
    'EPSG:30161': 'TokyoDatum', // Tokyo / Japan Plane Rectangular CS I
    'EPSG:30162': 'TokyoDatum',
    'EPSG:30163': 'TokyoDatum',
    'EPSG:30164': 'TokyoDatum',
};

/**
 * Mapeia EPSG code/nome canônico para datum id do helmert7Param.
 * Tolerant a variações: 'EPSG:4267', 'EPSG::4267', 'urn:ogc:def:crs:EPSG::4267'.
 *
 * @param crsName string declarada (ex: 'EPSG:31983', 'urn:ogc:def:crs:EPSG::4267')
 * @returns datum id ('SIRGAS2000', 'NAD27', 'TokyoDatum') ou null se desconhecido
 */
export function epsgToDatum(crsName: string): string | null {
    if (!crsName || typeof crsName !== 'string') return null;
    // Normalize: extract EPSG:NNNN pattern
    const match = crsName.match(/EPSG[:_]+(\d{4,5})/i);
    if (!match) return null;
    const epsg = `EPSG:${match[1]}`;
    return EPSG_TO_DATUM[epsg] || null;
}

/**
 * Lista todos os códigos EPSG suportados (audit/UI helper).
 */
export function getSupportedEpsgCodes(): readonly string[] {
    return Object.freeze(Object.keys(EPSG_TO_DATUM));
}

/**
 * Conta EPSG codes por datum (audit helper).
 */
export function getEpsgCountByDatum(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const datum of Object.values(EPSG_TO_DATUM)) {
        counts[datum] = (counts[datum] || 0) + 1;
    }
    return counts;
}
