// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Well Family - Directional Survey Data Processing
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   SURVEY DATA — Processamento de dados de desvio direcional.

   Converte levantamentos de desvio (depth, inclination, azimuth)
   em trajetoria 3D usando o Metodo de Curvatura Minima (MCM).

   O MCM e o padrao da industria para calculo de trajetoria de
   pocos direcionais, recomendado pela API (American Petroleum
   Institute) e SPE (Society of Petroleum Engineers).

   Referencia:
   - Zaremba, W.A. (1973). "Directional Survey by the Maximum
     Curvature Method". SPE 3835.
   - Taylor & Mason (1972). "A systematic approach to well
     surveying calculations". SPE 3362.
   ================================================================ */

import { createLogger } from '../../../../utils/helpers/logger.js';

const log = createLogger('surveyData');

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const DEG_TO_RAD = Math.PI / 180;

interface SurveyStation {
    depth: number;
    inclination: number;
    azimuth: number;
}

interface PathPoint {
    x: number;
    y: number;
    z: number;
    md: number;
}

interface SegmentDelta {
    dx: number;
    dy: number;
    dz: number;
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Analisa texto CSV contendo dados de levantamento direcional.
 * Formato esperado: depth,inclination,azimuth (com ou sem cabecalho).
 *
 * @param {string} csvText - Texto CSV com colunas depth, inclination, azimuth
 * @returns {Array<{depth: number, inclination: number, azimuth: number}>}
 */
export function parseSurveyData(csvText: string): Array<SurveyStation> {
    if (!csvText || typeof csvText !== 'string') {
        log.warn('parseSurveyData: input vazio ou invalido');
        return [];
    }

    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length === 0) return [];

    const surveys: SurveyStation[] = [];
    const startIdx = _isHeaderRow(lines[0] as string) ? 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
        const parsed = _parseSurveyLine(lines[i] as string);
        if (parsed) surveys.push(parsed);
    }

    return surveys;
}

/**
 * Calcula trajetoria 3D usando o Metodo de Curvatura Minima.
 * Padrao da industria (API/SPE) para pocos direcionais.
 *
 * Cada par de estacoes consecutivas define um segmento curvo.
 * O fator de ratio (RF) corrige a curvatura entre as estacoes.
 *
 * @param {Array<{depth: number, inclination: number, azimuth: number}>} surveys
 * @returns {Array<{x: number, y: number, z: number, md: number}>} Pontos 3D
 */
export function minimumCurvatureMethod(surveys: Array<SurveyStation>): Array<PathPoint> {
    if (!Array.isArray(surveys) || surveys.length === 0) return [];
    if (surveys.length === 1) {
        return [{ x: 0, y: 0, z: 0, md: (surveys[0] as SurveyStation).depth }];
    }

    const points: PathPoint[] = [{ x: 0, y: 0, z: 0, md: (surveys[0] as SurveyStation).depth }];

    for (let i = 1; i < surveys.length; i++) {
        const prev = surveys[i - 1] as SurveyStation;
        const curr = surveys[i] as SurveyStation;
        const segment = _computeSegment(prev, curr);
        const last = points[points.length - 1] as PathPoint;

        points.push({
            x: last.x + segment.dx,
            y: last.y + segment.dy,
            z: last.z + segment.dz,
            md: curr.depth,
        });
    }

    return points;
}

/**
 * Constroi caminho do poco a partir de dados de levantamento.
 * Wrapper de conveniencia: parse + calculo + retorno.
 *
 * @param {Array<{depth: number, inclination: number, azimuth: number}>} surveys
 * @returns {Array<{x: number, y: number, z: number}>} Pontos do caminho
 */
export function buildWellPath(surveys: Array<SurveyStation>): Array<{ x: number; y: number; z: number }> {
    const points = minimumCurvatureMethod(surveys);
    return points.map(({ x, y, z }) => ({ x, y, z }));
}

// ----------------------------------------------------------------
// PRIVATE - Parsing
// ----------------------------------------------------------------

/**
 * Verifica se a linha e um cabecalho (contem texto nao-numerico).
 *
 * @param {string} line - Primeira linha do CSV
 * @returns {boolean}
 */
function _isHeaderRow(line: string): boolean {
    const parts = line.split(/[,;\t]/);
    return parts.some((p) => /[a-zA-Z]/.test(p.trim()));
}

/**
 * Analisa uma linha do CSV em objeto de survey.
 *
 * @param {string} line - Linha CSV (depth,inclination,azimuth)
 * @returns {{depth: number, inclination: number, azimuth: number}|null}
 */
function _parseSurveyLine(line: string): SurveyStation | null {
    const parts = line.split(/[,;\t]/).map((s) => s.trim());
    if (parts.length < 3) return null;

    const depth = parseFloat(parts[0] as string);
    const inclination = parseFloat(parts[1] as string);
    const azimuth = parseFloat(parts[2] as string);

    if (isNaN(depth) || isNaN(inclination) || isNaN(azimuth)) return null;
    if (depth < 0 || inclination < 0 || inclination > 180) return null;

    return { depth, inclination, azimuth };
}

// ----------------------------------------------------------------
// PRIVATE - Minimum Curvature Computation
// ----------------------------------------------------------------

/**
 * Calcula deslocamentos dX, dY, dZ entre duas estacoes usando MCM.
 *
 * O fator de ratio (RF) e calculado a partir do angulo entre os
 * vetores unitarios das duas estacoes (dogleg angle).
 *
 * @param {{depth: number, inclination: number, azimuth: number}} s1
 * @param {{depth: number, inclination: number, azimuth: number}} s2
 * @returns {{dx: number, dy: number, dz: number}}
 */
function _computeSegment(s1: SurveyStation, s2: SurveyStation): SegmentDelta {
    const dMD = s2.depth - s1.depth;
    if (dMD <= 0) return { dx: 0, dy: 0, dz: 0 };

    const I1 = s1.inclination * DEG_TO_RAD;
    const I2 = s2.inclination * DEG_TO_RAD;
    const A1 = s1.azimuth * DEG_TO_RAD;
    const A2 = s2.azimuth * DEG_TO_RAD;

    // Dogleg angle (angulo entre vetores unitarios)
    const cosDL = Math.cos(I2 - I1) - Math.sin(I1) * Math.sin(I2) * (1 - Math.cos(A2 - A1));

    const dogleg = Math.acos(Math.min(1, Math.max(-1, cosDL)));

    // Ratio factor (RF) - correcao de curvatura
    const rf = _ratioFactor(dogleg);

    // Deslocamentos nas tres direcoes
    const dx = (dMD / 2) * (Math.sin(I1) * Math.sin(A1) + Math.sin(I2) * Math.sin(A2)) * rf;
    const dy = (dMD / 2) * (Math.sin(I1) * Math.cos(A1) + Math.sin(I2) * Math.cos(A2)) * rf;
    const dz = (dMD / 2) * (Math.cos(I1) + Math.cos(I2)) * rf;

    return { dx, dy, dz };
}

/**
 * Calcula ratio factor (RF) para curvatura minima.
 * RF = (2/dogleg) * tan(dogleg/2) — converge para 1.0 quando dogleg -> 0.
 *
 * @param {number} dogleg - Angulo de curvatura em radianos
 * @returns {number} Fator de correcao (1.0 para trecho reto)
 */
function _ratioFactor(dogleg: number): number {
    if (Math.abs(dogleg) < 1e-6) return 1.0;
    return (2 / dogleg) * Math.tan(dogleg / 2);
}
