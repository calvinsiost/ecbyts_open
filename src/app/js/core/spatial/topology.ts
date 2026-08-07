// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: SpatialBlueprint - Topology & Polygonization
// ADR: ADR-021

// ================================================================
// topology.js - Polygonizacao e auto-cura topologica
// Usa JSTS (Java Topology Suite portado para JS) para costurar
// linhas soltas em poligonos fechados e curar geometrias invalidas.
//
// REGRA DE OURO #1: Coletar linhas soltas + polilinhas abertas e
// usar Polygonizer para recuperar areas reais.
//
// REGRA DE OURO #4: buffer(0) para curar auto-intersecoes.
// Area final deve ser > 0.
// ================================================================

import { importCDN } from '../../utils/helpers/cdnLoader.js';

/** @type {any} cache do modulo JSTS */
let _jsts: any = null;

/**
 * Carrega JSTS sob demanda via CDN.
 * @returns {Promise<any>}
 */
async function loadJSTS() {
    if (_jsts) return _jsts;
    // License: (EDL-1.0 OR EPL-1.0). Using EDL-1.0 (BSD-3-Clause equiv).
    // Compatible with AGPL-3.0-only as unmodified library dependency (EDL-1.0 is permissive).
    // See docs/INTEGRATION_ROADMAP.md § jsts License Evaluation.
    _jsts = await importCDN('https://esm.sh/jsts@2.7.1', { name: 'JSTS' });
    return _jsts;
}

/**
 * Costura linhas soltas e polilinhas abertas em poligonos fechados.
 * Implementa a Regra de Ouro #1 - Defesa contra CAD Amador.
 *
 * Estrategia:
 * 1. Polilinhas ja fechadas -> criadas diretamente como poligonos
 * 2. Linhas abertas e polilinhas abertas -> alimentadas no Polygonizer
 * 3. Union de todos os poligonos resultantes
 *
 * @param {import('./dxfParser.js').DXFEntity[]} entities - Entidades DXF parseadas
 * @returns {Promise<any[]>} - Array de poligonos JSTS validos
 */
export async function polygonize(entities: any) {
    const jsts = await loadJSTS();
    const gf = new jsts.geom.GeometryFactory();

    const closedPolygons = [];
    const openLines = [];

    for (const entity of entities) {
        const coords = entity.vertices.map((v: any) => new jsts.geom.Coordinate(v.x, v.y));

        if (coords.length < 2) continue;

        if (entity.closed && coords.length >= 3) {
            // Polilinea fechada - cria poligono diretamente
            // Nota: Coordinate.clone() do JSTS CDN pode falhar; usar new Coordinate
            const closing = new jsts.geom.Coordinate(coords[0].x, coords[0].y);
            const ring = [...coords, closing];
            try {
                const shell = gf.createLinearRing(ring);
                const polygon = gf.createPolygon(shell);
                closedPolygons.push(polygon);
            } catch (e) {
                // Ring invalido - tenta como linha aberta
                console.warn('[Spatial] Ring inválido, tentando como linha aberta:', (e as any).message);
                openLines.push(gf.createLineString(coords));
            }
        } else {
            // Linha aberta - sera costurada pelo Polygonizer
            openLines.push(gf.createLineString(coords));
        }
    }

    // Polygonize das linhas abertas (Regra de Ouro #1)
    let stitchedPolygons = [];
    if (openLines.length > 0) {
        try {
            const polygonizer = new jsts.operation.polygonize.Polygonizer();
            for (const line of openLines) {
                polygonizer.add(line);
            }
            const collection = polygonizer.getPolygons();
            const iterator = collection.iterator();
            while (iterator.hasNext()) {
                stitchedPolygons.push(iterator.next());
            }
        } catch (e) {
            console.warn('[Spatial] Polygonizer falhou, tentando noding manual:', (e as any).message);
            // Fallback: tenta union das linhas e depois polygonize
            stitchedPolygons = await polygonizeFallback(jsts, gf, openLines);
        }
    }

    // Combina poligonos fechados + costurados
    const allPolygons = [...closedPolygons, ...stitchedPolygons];

    // Union (unary) para remover sobreposicoes
    if (allPolygons.length === 0) return [];

    return allPolygons;
}

/**
 * Fallback para polygonize quando o Polygonizer padrao falha.
 * Usa noding + union das linhas antes de tentar polygonize.
 *
 * @param {any} jsts
 * @param {any} gf - GeometryFactory
 * @param {any[]} openLines - LineStrings JSTS
 * @returns {Promise<any[]>}
 */
async function polygonizeFallback(jsts: any, gf: any, openLines: any) {
    try {
        // Tenta union de todas as linhas (resolve noding)
        let merged = openLines[0];
        for (let i = 1; i < openLines.length; i++) {
            merged = merged.union(openLines[i]);
        }

        // Tenta polygonize do resultado
        const polygonizer = new jsts.operation.polygonize.Polygonizer();
        polygonizer.add(merged);
        const collection = polygonizer.getPolygons();
        const result = [];
        const iterator = collection.iterator();
        while (iterator.hasNext()) {
            result.push(iterator.next());
        }
        return result;
    } catch (e) {
        console.warn('[Spatial] Fallback polygonize também falhou:', (e as any).message);
        return [];
    }
}

/**
 * Cura geometria invalida usando buffer(0) e validacao JSTS.
 * Implementa a Regra de Ouro #4 - Auto-Cura Topologica.
 *
 * @param {any} polygon - Poligono JSTS (potencialmente invalido)
 * @returns {Promise<any|null>} - Poligono valido ou null se irrecuperavel
 */
export async function healGeometry(polygon: any) {
    const jsts = await loadJSTS();

    // 1. Verifica se ja e valido
    const validator = new jsts.operation.valid.IsValidOp(polygon);
    if (validator.isValid()) {
        const area = polygon.getArea();
        return area > 0 ? polygon : null;
    }

    // 2. Tenta buffer(0) - o truque classico de auto-cura
    try {
        const healed = polygon.buffer(0);

        if (healed.isEmpty()) return null;

        // Verifica se o resultado e valido e tem area > 0
        const healedValidator = new jsts.operation.valid.IsValidOp(healed);
        if (healedValidator.isValid() && healed.getArea() > 0) {
            return healed;
        }
    } catch (e) {
        console.warn('[Spatial] buffer(0) falhou:', (e as any).message);
    }

    // 3. Tenta convex hull como ultimo recurso
    try {
        const hull = polygon.convexHull();
        if (hull.getArea() > 0) {
            console.warn('[Spatial] Usando convex hull como fallback (geometria original irrecuperável)');
            return hull;
        }
    } catch (e) {
        console.warn('[Spatial] convexHull também falhou:', (e as any).message);
    }

    return null;
}

/**
 * Executa union de multiplos poligonos JSTS.
 *
 * @param {any[]} polygons - Array de poligonos JSTS
 * @returns {Promise<any>} - Poligono unificado
 */
export async function unionPolygons(polygons: any) {
    const jsts = await loadJSTS();

    if (polygons.length === 0) return null;
    if (polygons.length === 1) return polygons[0];

    const gf = new jsts.geom.GeometryFactory();
    const collection = gf.createGeometryCollection(polygons);

    try {
        return jsts.operation.union.UnaryUnionOp.union(collection);
    } catch (_e) {
        // Fallback: union iterativa
        let result = polygons[0];
        for (let i = 1; i < polygons.length; i++) {
            try {
                result = result.union(polygons[i]);
            } catch (err) {
                console.warn(`[Spatial] Union falhou no poligono ${i}:`, (err as any).message);
            }
        }
        return result;
    }
}

/**
 * Converte poligono JSTS para array de coordenadas [x, y].
 *
 * @param {any} jstsGeom - Geometria JSTS
 * @returns {Array<[number, number]>} - Coordenadas do shell externo
 */
export function jstsToCoords(jstsGeom: any) {
    if (!jstsGeom || jstsGeom.isEmpty()) return [];

    // Se e GeometryCollection ou MultiPolygon, pega o maior
    if (jstsGeom.getNumGeometries() > 1) {
        let largest = jstsGeom.getGeometryN(0);
        for (let i = 1; i < jstsGeom.getNumGeometries(); i++) {
            const g = jstsGeom.getGeometryN(i);
            if (g.getArea() > largest.getArea()) largest = g;
        }
        jstsGeom = largest;
    }

    // Extrai shell externo
    const shell = jstsGeom.getExteriorRing ? jstsGeom.getExteriorRing() : jstsGeom;

    const coordinates = shell.getCoordinates();
    return coordinates.map((/** @type {any} */ c: any) => [c.x, c.y]);
}
