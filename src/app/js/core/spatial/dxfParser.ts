// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: SpatialBlueprint - DXF Parser
// ADR: ADR-021

// ================================================================
// dxfParser.js - DXF Parser for CAD Vector Ingestion
// Extrai geometrias de arquivos DXF: LINE, LWPOLYLINE, POLYLINE,
// CIRCLE, ARC, ELLIPSE, SPLINE. Entidades curvas sao tesseladas
// em polylines para compatibilidade com o pipeline de poligonizacao.
// DXF e formato texto com group codes (pares codigo/valor).
// ================================================================

interface DXFEntity {
    type: 'LINE' | 'LWPOLYLINE' | 'POLYLINE';
    layer: string;
    vertices: Array<{ x: number; y: number }>;
    closed: boolean;
}

interface ParsedDXF {
    layers: Map<string, DXFEntity[]>;
    entities: DXFEntity[];
    metadata: {
        units: string;
        extents: object | null;
        entityCount: number;
    };
}

// Mapa de unidades DXF ($INSUNITS group code 70 no HEADER)
const DXF_UNITS: Record<number, string> = {
    0: 'unitless',
    1: 'inches',
    2: 'feet',
    3: 'miles',
    4: 'millimeters',
    5: 'centimeters',
    6: 'meters',
    7: 'kilometers',
    8: 'microinches',
    9: 'mils',
    10: 'yards',
    11: 'angstroms',
    12: 'nanometers',
    13: 'microns',
    14: 'decimeters',
    15: 'decameters',
    16: 'hectometers',
    17: 'gigameters',
    18: 'astronomical_units',
    19: 'light_years',
    20: 'parsecs',
};

/**
 * Parse DXF text into structured geometry.
 * Extrai entidades LINE, LWPOLYLINE e POLYLINE com seus vertices e layers.
 *
 * @param dxfText - Conteudo bruto do arquivo DXF
 */
export function parseDXF(dxfText: string): ParsedDXF {
    if (!dxfText || typeof dxfText !== 'string') {
        throw new Error('DXF input must be a non-empty string');
    }

    // Normaliza line endings e split em linhas
    const lines = dxfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    // Extrai pares group code / value
    const pairs: Array<{ code: number; value: string; index: number }> = [];
    for (let i = 0; i < lines.length - 1; i += 2) {
        const code = parseInt((lines[i] as string).trim(), 10);
        const value = lines[i + 1]?.trim() ?? '';
        if (!isNaN(code)) {
            pairs.push({ code, value, index: i });
        }
    }

    // Extrai metadata do HEADER
    const metadata: any = extractHeader(pairs);

    // Extrai entidades da secao ENTITIES
    const entities = extractEntities(pairs);

    // Agrupa por layer
    const layers = new Map();
    for (const entity of entities) {
        const layerName = entity.layer || '0';
        if (!layers.has(layerName)) {
            layers.set(layerName, []);
        }
        layers.get(layerName).push(entity);
    }

    metadata.entityCount = entities.length;

    return { layers, entities, metadata };
}

/**
 * Extrai metadata do HEADER DXF.
 * Busca $INSUNITS, $EXTMIN, $EXTMAX.
 *
 * @param pairs
 */
function extractHeader(pairs: Array<{ code: number; value: string }>): object {
    const metadata: any = { units: 'unknown', extents: null };
    let inHeader = false;

    for (let i = 0; i < pairs.length; i++) {
        const { code, value } = pairs[i]!;

        // Detecta inicio/fim da secao HEADER
        if (code === 2 && value === 'HEADER') {
            inHeader = true;
            continue;
        }
        if (code === 0 && value === 'ENDSEC' && inHeader) break;
        if (!inHeader) continue;

        // $INSUNITS - unidade do desenho
        if (code === 9 && value === '$INSUNITS') {
            const next = pairs[i + 1];
            if (next && next.code === 70) {
                const unitCode = parseInt(next.value, 10);
                metadata.units = (DXF_UNITS as Record<number, string>)[unitCode] || `unit_${unitCode}`;
            }
        }

        // $EXTMIN - extensao minima
        if (code === 9 && value === '$EXTMIN') {
            const ext = readPoint(pairs, i + 1);
            if (ext) {
                if (!metadata.extents) metadata.extents = {};
                metadata.extents.min = ext;
            }
        }

        // $EXTMAX - extensao maxima
        if (code === 9 && value === '$EXTMAX') {
            const ext = readPoint(pairs, i + 1);
            if (ext) {
                if (!metadata.extents) metadata.extents = {};
                metadata.extents.max = ext;
            }
        }
    }

    return metadata;
}

/**
 * Le um ponto 2D (codes 10/20) a partir de uma posicao nos pares.
 *
 * @param pairs
 * @param startIdx
 */
function readPoint(pairs: any[], startIdx: number): { x: number; y: number } | null {
    let x = null,
        y = null;
    for (let i = startIdx; i < Math.min(startIdx + 6, pairs.length); i++) {
        if (pairs[i].code === 10) x = parseFloat(pairs[i].value);
        if (pairs[i].code === 20) y = parseFloat(pairs[i].value);
        // Para se encontrar outro group code de controle
        if (pairs[i].code === 0 || pairs[i].code === 9) break;
    }
    return x !== null && y !== null ? { x, y } : null;
}

/**
 * Extrai entidades geometricas da secao ENTITIES.
 * Suporta: LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, ELLIPSE, SPLINE.
 * Entidades curvas (CIRCLE, ARC, ELLIPSE, SPLINE) sao tesseladas em
 * polylines para compatibilidade com o pipeline de poligonizacao.
 *
 * @param pairs
 */
function extractEntities(pairs: Array<{ code: number; value: string }>): DXFEntity[] {
    const entities = [];
    let inEntities = false;

    for (let i = 0; i < pairs.length; i++) {
        const { code, value } = pairs[i]!;

        // Detecta secao ENTITIES
        if (code === 2 && value === 'ENTITIES') {
            inEntities = true;
            continue;
        }
        if (code === 0 && value === 'ENDSEC' && inEntities) break;
        if (!inEntities) continue;

        // Entidade LINE - exatamente 2 vertices
        if (code === 0 && value === 'LINE') {
            const entity = parseLINE(pairs, i + 1);
            if (entity) entities.push(entity);
        }

        // Entidade LWPOLYLINE - vertices sequenciais com flag closed
        if (code === 0 && value === 'LWPOLYLINE') {
            const entity = parseLWPOLYLINE(pairs, i + 1);
            if (entity) entities.push(entity);
        }

        // Entidade POLYLINE - vertices em sub-entidades VERTEX ate SEQEND
        if (code === 0 && value === 'POLYLINE') {
            const entity = parsePOLYLINE(pairs, i + 1);
            if (entity) entities.push(entity);
        }

        // Entidade CIRCLE - tesselada para polilinea fechada
        if (code === 0 && value === 'CIRCLE') {
            const entity = parseCIRCLE(pairs, i + 1);
            if (entity) entities.push(entity);
        }

        // Entidade ARC - tesselada para polilinea aberta
        if (code === 0 && value === 'ARC') {
            const entity = parseARC(pairs, i + 1);
            if (entity) entities.push(entity);
        }

        // Entidade ELLIPSE - tesselada para polilinea
        if (code === 0 && value === 'ELLIPSE') {
            const entity = parseELLIPSE(pairs, i + 1);
            if (entity) entities.push(entity);
        }

        // Entidade SPLINE - tesselada por pontos de controle/fit
        if (code === 0 && value === 'SPLINE') {
            const entity = parseSPLINE(pairs, i + 1);
            if (entity) entities.push(entity);
        }
    }

    return entities;
}

/**
 * Parse entidade LINE (2 pontos: 10/20 e 11/21).
 *
 * @param pairs
 * @param startIdx
 */
function parseLINE(pairs: any[], startIdx: number): DXFEntity | null {
    let layer = '0';
    let x1 = null,
        y1 = null,
        x2 = null,
        y2 = null;

    for (let i = startIdx; i < pairs.length; i++) {
        const { code, value } = pairs[i];
        if (code === 0) break; // Proxima entidade

        if (code === 8) layer = value;
        if (code === 10) x1 = parseFloat(value);
        if (code === 20) y1 = parseFloat(value);
        if (code === 11) x2 = parseFloat(value);
        if (code === 21) y2 = parseFloat(value);
    }

    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

    return {
        type: 'LINE',
        layer,
        vertices: [
            { x: x1, y: y1 },
            { x: x2, y: y2 },
        ],
        closed: false,
    };
}

/**
 * Parse entidade LWPOLYLINE (vertices sequenciais).
 * Group code 90 = vertex count, 70 = flags (bit 1 = closed).
 *
 * @param pairs
 * @param startIdx
 */
function parseLWPOLYLINE(pairs: any[], startIdx: number): DXFEntity | null {
    let layer = '0';
    let flags = 0;
    const vertices = [];
    let currentX = null;

    for (let i = startIdx; i < pairs.length; i++) {
        const { code, value } = pairs[i];
        if (code === 0) break; // Proxima entidade

        if (code === 8) layer = value;
        if (code === 70) flags = parseInt(value, 10);

        // Vertices: cada par 10/20 e um vertice
        if (code === 10) {
            currentX = parseFloat(value);
        }
        if (code === 20 && currentX !== null) {
            vertices.push({ x: currentX, y: parseFloat(value) });
            currentX = null;
        }
    }

    if (vertices.length < 2) return null;

    return {
        type: 'LWPOLYLINE',
        layer,
        vertices,
        closed: (flags & 1) === 1,
    };
}

/**
 * Parse entidade POLYLINE (vertices em sub-entidades VERTEX ate SEQEND).
 *
 * @param pairs
 * @param startIdx
 */
function parsePOLYLINE(pairs: any[], startIdx: number): DXFEntity | null {
    let layer = '0';
    let flags = 0;
    const vertices = [];

    // Le flags e layer da entidade POLYLINE
    let i = startIdx;
    for (; i < pairs.length; i++) {
        const { code, value } = pairs[i];
        if (code === 0) break;
        if (code === 8) layer = value;
        if (code === 70) flags = parseInt(value, 10);
    }

    // Le vertices (sub-entidades VERTEX)
    for (; i < pairs.length; i++) {
        const { code, value } = pairs[i];

        if (code === 0 && value === 'SEQEND') break;
        if (code === 0 && value !== 'VERTEX') continue;

        // Le coordenadas do VERTEX
        let vx = null,
            vy = null;
        for (let j = i + 1; j < pairs.length; j++) {
            if (pairs[j].code === 0) break;
            if (pairs[j].code === 10) vx = parseFloat(pairs[j].value);
            if (pairs[j].code === 20) vy = parseFloat(pairs[j].value);
        }
        if (vx !== null && vy !== null) {
            vertices.push({ x: vx, y: vy });
        }
    }

    if (vertices.length < 2) return null;

    return {
        type: 'POLYLINE',
        layer,
        vertices,
        closed: (flags & 1) === 1,
    };
}

// ----------------------------------------------------------------
// ENTIDADES CURVAS - tesseladas em polylines para compatibilidade
// Segmentos por curva: 36 para circulos completos, proporcional para arcos
// ----------------------------------------------------------------

/** Segmentos por circulo completo (360 graus) */
const CIRCLE_SEGMENTS = 36;

/**
 * Parse entidade CIRCLE - tesselada para polilinea fechada.
 * Group codes: 10/20 = centro, 40 = raio.
 *
 * @param pairs
 * @param startIdx
 */
function parseCIRCLE(pairs: any[], startIdx: number): DXFEntity | null {
    let layer = '0';
    let cx = null,
        cy = null,
        radius = null;

    for (let i = startIdx; i < pairs.length; i++) {
        const { code, value } = pairs[i];
        if (code === 0) break;
        if (code === 8) layer = value;
        if (code === 10) cx = parseFloat(value);
        if (code === 20) cy = parseFloat(value);
        if (code === 40) radius = parseFloat(value);
    }

    if (cx === null || cy === null || radius === null || radius <= 0) return null;

    const vertices = [];
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
        const angle = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
        vertices.push({
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
        });
    }

    return { type: 'LWPOLYLINE', layer, vertices, closed: true };
}

/**
 * Parse entidade ARC - tesselada para polilinea aberta.
 * Group codes: 10/20 = centro, 40 = raio, 50 = angulo inicio, 51 = angulo fim.
 * Angulos em graus, sentido anti-horario a partir do eixo X positivo.
 *
 * @param pairs
 * @param startIdx
 */
function parseARC(pairs: any[], startIdx: number): DXFEntity | null {
    let layer = '0';
    let cx = null,
        cy = null,
        radius = null;
    let startAngle = 0,
        endAngle = 360;

    for (let i = startIdx; i < pairs.length; i++) {
        const { code, value } = pairs[i];
        if (code === 0) break;
        if (code === 8) layer = value;
        if (code === 10) cx = parseFloat(value);
        if (code === 20) cy = parseFloat(value);
        if (code === 40) radius = parseFloat(value);
        if (code === 50) startAngle = parseFloat(value);
        if (code === 51) endAngle = parseFloat(value);
    }

    if (cx === null || cy === null || radius === null || radius <= 0) return null;

    // Converte graus para radianos
    const startRad = (startAngle * Math.PI) / 180;
    let endRad = (endAngle * Math.PI) / 180;

    // Garante sentido anti-horario (DXF convention)
    if (endRad <= startRad) endRad += 2 * Math.PI;

    const sweep = endRad - startRad;
    const segments = Math.max(3, Math.round((CIRCLE_SEGMENTS * sweep) / (2 * Math.PI)));

    const vertices = [];
    for (let i = 0; i <= segments; i++) {
        const angle = startRad + (sweep * i) / segments;
        vertices.push({
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
        });
    }

    return { type: 'LWPOLYLINE', layer, vertices, closed: false };
}

/**
 * Parse entidade ELLIPSE - tesselada para polilinea.
 * Group codes:
 *   10/20 = centro
 *   11/21 = endpoint do eixo maior (relativo ao centro)
 *   40 = ratio do eixo menor / eixo maior
 *   41 = angulo inicio (radianos, default 0)
 *   42 = angulo fim (radianos, default 2*PI)
 *
 * @param pairs
 * @param startIdx
 */
function parseELLIPSE(pairs: any[], startIdx: number): DXFEntity | null {
    let layer = '0';
    let cx = null,
        cy = null;
    let mx = null,
        my = null; // Endpoint eixo maior (relativo ao centro)
    let ratio = 1;
    let startParam = 0,
        endParam = 2 * Math.PI;

    for (let i = startIdx; i < pairs.length; i++) {
        const { code, value } = pairs[i];
        if (code === 0) break;
        if (code === 8) layer = value;
        if (code === 10) cx = parseFloat(value);
        if (code === 20) cy = parseFloat(value);
        if (code === 11) mx = parseFloat(value);
        if (code === 21) my = parseFloat(value);
        if (code === 40) ratio = parseFloat(value);
        if (code === 41) startParam = parseFloat(value);
        if (code === 42) endParam = parseFloat(value);
    }

    if (cx === null || cy === null || mx === null || my === null) return null;

    // Comprimento do eixo maior e angulo de rotacao
    const a = Math.sqrt(mx * mx + my * my); // Semi-eixo maior
    const b = a * ratio; // Semi-eixo menor
    const rotation = Math.atan2(my, mx); // Angulo de rotacao

    if (a <= 0) return null;

    // Garante varredura correta
    if (endParam <= startParam) endParam += 2 * Math.PI;
    const sweep = endParam - startParam;
    const isFull = Math.abs(sweep - 2 * Math.PI) < 0.001;
    const segments = Math.max(6, Math.round((CIRCLE_SEGMENTS * sweep) / (2 * Math.PI)));

    const vertices = [];
    const count = isFull ? segments : segments + 1;
    for (let i = 0; i < count; i++) {
        const t = startParam + (sweep * i) / segments;
        // Ponto na elipse rotacionada
        const px = a * Math.cos(t);
        const py = b * Math.sin(t);
        vertices.push({
            x: cx + px * Math.cos(rotation) - py * Math.sin(rotation),
            y: cy + px * Math.sin(rotation) + py * Math.cos(rotation),
        });
    }

    return { type: 'LWPOLYLINE', layer, vertices, closed: isFull };
}

/**
 * Parse entidade SPLINE - aproximada por fit points ou control points.
 * Usa fit points (code 11) se disponiveis; senao usa control points (code 10).
 * Splines com apenas control points sao tratados como polylines
 * (aproximacao grosseira mas suficiente para footprints de planta).
 *
 * Group codes:
 *   70 = flags (bit 0 = closed)
 *   73 = numero de fit points
 *   10/20 = control points
 *   11/21 = fit points
 *
 * @param pairs
 * @param startIdx
 */
function parseSPLINE(pairs: any[], startIdx: number): DXFEntity | null {
    let layer = '0';
    let flags = 0;
    const controlPoints = [];
    const fitPoints = [];
    let currentCtrlX = null;
    let currentFitX = null;

    for (let i = startIdx; i < pairs.length; i++) {
        const { code, value } = pairs[i];
        if (code === 0) break;

        if (code === 8) layer = value;
        if (code === 70) flags = parseInt(value, 10);

        // Control points (code 10/20)
        if (code === 10) currentCtrlX = parseFloat(value);
        if (code === 20 && currentCtrlX !== null) {
            controlPoints.push({ x: currentCtrlX, y: parseFloat(value) });
            currentCtrlX = null;
        }

        // Fit points (code 11/21) - coordenadas exatas por onde a curva passa
        if (code === 11) currentFitX = parseFloat(value);
        if (code === 21 && currentFitX !== null) {
            fitPoints.push({ x: currentFitX, y: parseFloat(value) });
            currentFitX = null;
        }
    }

    // Prefere fit points (mais precisos); fallback para control points
    const vertices = fitPoints.length >= 2 ? fitPoints : controlPoints;
    if (vertices.length < 2) return null;

    return {
        type: 'LWPOLYLINE',
        layer,
        vertices,
        closed: (flags & 1) === 1,
    };
}
