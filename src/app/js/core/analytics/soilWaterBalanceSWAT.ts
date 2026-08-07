// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Soil Water Balance (SWAT)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

interface ETResult { et0: number; eta: number; }
interface WaterContentResult { sw: number; percolation: number; } // Not used explicitly in return but following structure
interface MoistureStatusResult { status: string; ratio: number; description: string; }

/**
 * Calcula a evapotranspiração real diária pelo método de Hargreaves modificado (SWAT).
 * Método de Hargreaves estima ET0 a partir de temperaturas e radiação extraterrestre;
 * o fator de ajuste de umidade reduz ET0 quando o solo está seco.
 *
 * @param {number} tMax - Temperatura máxima diária (°C)
 * @param {number} tMin - Temperatura mínima diária (°C)
 * @param {number} ra   - Radiação extraterrestre (MJ m⁻² d⁻¹)
 * @param {number} sw   - Conteúdo de água no solo atual (mm)
 * @param {number} fc   - Capacidade de campo do solo (mm)
 * @returns {{ et0: number, eta: number }} ET potencial e real (mm d⁻¹)
 * @throws {RangeError} Se ra < 0 ou fc <= 0
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function calcActualEvapotranspiration(tMax: number, tMin: number, ra: number, sw: number, fc: number): ETResult {
    // Validação de tipos e intervalos
    for (const [name, val] of [
        ['tMax', tMax],
        ['tMin', tMin],
        ['ra', ra],
        ['sw', sw],
        ['fc', fc],
    ]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} deve ser número finito; recebido: ${val}`);
        }
    }
    if (ra < 0) throw new RangeError(`ra (radiação extraterrestre) deve ser >= 0; recebido: ${ra}`);
    if (fc <= 0) throw new RangeError(`fc (capacidade de campo) deve ser > 0; recebido: ${fc}`);

    // ET0 pela equação de Hargreaves (1985): ET0 = 0.0023 * Ra * (Tmax - Tmin)^0.5 * (Tmean + 17.8)
    // Fórmula empírica calibrada para clima semiárido e temperado
    const tMean = (tMax + tMin) / 2;
    const tRange = Math.max(0, tMax - tMin); // Diferença de temperatura; mínimo 0
    const et0 = 0.0023 * ra * Math.sqrt(tRange) * (tMean + 17.8);

    // Fator de ajuste de umidade do solo: reduz ET quando solo abaixo da capacidade de campo
    // Equação SWAT: ETa = ET0 * SW / (SW + exp(2.412 - 7.5 * (SW / FC)))
    const swClamped = Math.max(0, Math.min(sw, fc));
    let eta: number;
    if (swClamped <= 0) {
        eta = 0; // Solo completamente seco: sem evapotranspiração
    } else {
        const ratio = swClamped / fc;
        const denom = swClamped + Math.exp(2.412 - 7.5 * ratio);
        eta = (et0 * swClamped) / denom;
    }

    return { et0: Math.max(0, et0), eta: Math.max(0, eta) };
}

/**
 * Calcula o conteúdo de água no solo após um passo diário de balanço hídrico.
 * Equação de continuidade: SW(t+1) = SW(t) + P - Q - ETa - Perc
 * onde Perc é a percolação para camadas inferiores quando SW > FC.
 *
 * @param {number} sw0   - Conteúdo de água no solo inicial (mm)
 * @param {number} prec  - Precipitação diária (mm)
 * @param {number} runoff - Escoamento superficial (mm)
 * @param {number} eta   - Evapotranspiração real (mm d⁻¹)
 * @param {number} fc    - Capacidade de campo (mm)
 * @param {number} wp    - Ponto de murcha permanente (mm)
 * @returns {{ sw: number, percolation: number }} Novo conteúdo de água e percolação (mm)
 * @throws {RangeError} Se fc <= wp ou sw0 < 0
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function calcSoilWaterContent(sw0: number, prec: number, runoff: number, eta: number, fc: number, wp: number): WaterContentResult {
    for (const [name, val] of [
        ['sw0', sw0],
        ['prec', prec],
        ['runoff', runoff],
        ['eta', eta],
        ['fc', fc],
        ['wp', wp],
    ]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} deve ser número finito; recebido: ${val}`);
        }
    }
    if (sw0 < 0) throw new RangeError(`sw0 deve ser >= 0; recebido: ${sw0}`);
    if (fc <= wp) throw new RangeError(`fc (${fc}) deve ser maior que wp (${wp})`);

    // Balanço hídrico diário antes da percolação
    const swRaw = sw0 + prec - Math.max(0, runoff) - Math.max(0, eta);

    // Percolação: água excedente acima da capacidade de campo drena para camadas inferiores
    const percolation = Math.max(0, swRaw - fc);

    // Conteúdo final limitado entre ponto de murcha e saturação (aproximada por 1.25 * FC)
    const sw = Math.max(wp, Math.min(swRaw - percolation, fc * 1.25));

    return { sw, percolation };
}

/**
 * Calcula o escoamento superficial diário pela equação SCS-CN modificada (SWAT).
 * O número de curva CN é ajustado pela umidade antecedente do solo usando
 * a função de transformação contínua adotada pelo SWAT para CN2 → CN1/CN3.
 *
 * @param {number} prec  - Precipitação diária (mm)
 * @param {number} cn2   - Número de curva para condição de umidade II (adimensional, 1-100)
 * @param {number} sw    - Conteúdo de água atual no solo (mm)
 * @param {number} swMax - Conteúdo máximo de água no solo (mm, aprox. FC)
 * @returns {number} Escoamento superficial Q (mm)
 * @throws {RangeError} Se cn2 fora de [1, 100] ou swMax <= 0
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function calcSurfaceRunoffCN(prec: number, cn2: number, sw: number, swMax: number): number {
    for (const [name, val] of [
        ['prec', prec],
        ['cn2', cn2],
        ['sw', sw],
        ['swMax', swMax],
    ]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} deve ser número finito; recebido: ${val}`);
        }
    }
    if (cn2 < 1 || cn2 > 100) throw new RangeError(`cn2 deve estar entre 1 e 100; recebido: ${cn2}`);
    if (swMax <= 0) throw new RangeError(`swMax deve ser > 0; recebido: ${swMax}`);
    if (prec <= 0) return 0; // Sem precipitação: sem escoamento

    // CN3 (solo saturado) e CN1 (solo seco) por funções contínuas SWAT
    const cn3 = cn2 * Math.exp(0.00673 * (100 - cn2));
    const cn1 = cn2 - (20 * (100 - cn2)) / (100 - cn2 + Math.exp(2.533 - 0.0636 * (100 - cn2)));

    // CN ajustado pela umidade do solo: interpolação entre CN1 e CN3
    const wFrac = Math.max(0, Math.min(1, sw / swMax));
    const cnAdj = cn1 + (cn3 - cn1) * wFrac;

    // Retenção máxima S (mm) e limiar de precipitação Ia = 0.2 * S
    const S = 25400 / cnAdj - 254; // Retenção máxima potencial (mm)
    const Ia = 0.2 * S; // Abstração inicial

    if (prec <= Ia) return 0; // Precipitação abaixo da abstração inicial

    // Equação SCS-CN: Q = (P - Ia)² / (P - Ia + S)
    const Q = Math.pow(prec - Ia, 2) / (prec - Ia + S);
    return Math.max(0, Q);
}

/**
 * Classifica o estado de umidade do solo baseado na relação SW/FC.
 * Classes adaptadas do sistema SWAT para uso em monitoramento ambiental.
 *
 * @param {number} sw - Conteúdo de água no solo atual (mm)
 * @param {number} fc - Capacidade de campo (mm)
 * @param {number} wp - Ponto de murcha permanente (mm)
 * @returns {{ status: string, ratio: number, description: string }} Classificação e razão SW/FC
 * @throws {RangeError} Se fc <= wp
 * @throws {TypeError} Se qualquer argumento não for número finito
 */
export function classifySoilMoistureStatus(sw: number, fc: number, wp: number): MoistureStatusResult {
    for (const [name, val] of [
        ['sw', sw],
        ['fc', fc],
        ['wp', wp],
    ]) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} deve ser número finito; recebido: ${val}`);
        }
    }
    if (fc <= wp) throw new RangeError(`fc (${fc}) deve ser maior que wp (${wp})`);

    const ratio = sw / fc; // Razão conteúdo de água / capacidade de campo

    // Classificação por faixas de umidade relativa
    if (sw <= wp) {
        return { status: 'WILTING', ratio, description: 'Abaixo do ponto de murcha — plantas sob estresse severo' };
    } else if (ratio < 0.4) {
        return { status: 'DRY', ratio, description: 'Solo seco — alta demanda evapotranspirativa' };
    } else if (ratio < 0.7) {
        return { status: 'MODERATE', ratio, description: 'Umidade moderada — condições normais de crescimento' };
    } else if (ratio <= 1.0) {
        return { status: 'OPTIMAL', ratio, description: 'Próximo à capacidade de campo — umidade ótima' };
    } else {
        return { status: 'SATURATED', ratio, description: 'Acima da capacidade de campo — percolação ativa' };
    }
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilWaterBalanceSWATMeta = {
    name: 'soilWaterBalanceSWAT',
    description: 'Soil Water Balance (SWAT)',
    category: 'analytics',
    familyTags: ['soil', 'water', 'hydrocarbon'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
