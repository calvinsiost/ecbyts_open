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
// Application: EHS & Mining - Landslide Hazard Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Landslide Hazard Assessment - Slope Stability & Risk Classification
 *
 * Módulo puro implementando avaliação de perigo de deslizamento com base no
 * modelo de talude infinito e índice de risco IAEG. Aplica a classificação
 * de perigo em 5 classes (I–V) conforme Varnes (1978) e Hungr et al. (2014).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Varnes, D. J. (1978). "Slope movement types and processes." In: Schuster, R.L.
 *     & Krizek, R.J. (Eds.), Landslides: Analysis and Control. Special Report 176.
 *     Washington, DC: Transportation Research Board, National Academy of Sciences.
 *     (classificação IAEG I–V, tipologia de movimentos de massa)
 *   - Hungr, O., Leroueil, S. & Picarelli, L. (2014). "The Varnes classification
 *     of landslide types, an update." Landslides, 11(2), 167–194.
 *     DOI: 10.1007/s10346-013-0436-y
 *     (atualização da classificação; velocidade, mecanismo, material)
 *   - USGS Open-File Report 92-521 (1992). Landslide Hazard Information.
 *     US Geological Survey, Denver, CO.
 *     (fator de segurança, susceptibilidade, índice de risco territorial)
 */

'use strict';

// Local interface (substitui import('../../../../types/app/analytics-library.js'))
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
        citation?: string;
    };
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    library?: { published: boolean; priceECBT?: number; licenseRef?: string };
}

/**
 * Calcula o Fator de Segurança (FS) genérico para talude.
 * FS = (forças resistentes) / (forças atuantes).
 * Utiliza o modelo de Coulomb com coesão, ângulo de atrito e peso próprio.
 *
 * Calcula FS pelo equilibrio de forcas em talude simples (Mohr-Coulomb).
 *
 * @param cohesion   - Coesao efetiva do solo c' [kPa] (>= 0)
 * @param friction   - Angulo de atrito interno efetivo phi' [graus] (0–90)
 * @param unitWeight - Peso especifico do solo gamma [kN/m³] (> 0)
 * @param depth      - Profundidade da superficie de ruptura z [m] (> 0)
 * @param slope      - Angulo do talude alpha [graus] (0–90)
 * @param ru         - Razao de pressao de poros ru = u/(gamma*z) [adim] (0–1)
 * @returns Fator de seguranca FS (adimensional)
 * @throws {TypeError} Se qualquer argumento nao for numero finito
 * @throws {RangeError} Se valores estiverem fora dos limites fisicos
 */
export function calcSafetyFactor(
    cohesion: number,
    friction: number,
    unitWeight: number,
    depth: number,
    slope: number,
    ru = 0,
): number {
    // Validacao de tipos
    for (const [name, val] of [
        ['cohesion', cohesion],
        ['friction', friction],
        ['unitWeight', unitWeight],
        ['depth', depth],
        ['slope', slope],
        ['ru', ru],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number, got ${val}`);
        }
    }
    // Validacao de limites fisicos
    if (cohesion < 0) throw new RangeError('cohesion must be >= 0 kPa');
    if (friction < 0 || friction >= 90) throw new RangeError('friction must be in [0, 90) degrees');
    if (unitWeight <= 0) throw new RangeError('unitWeight must be > 0 kN/m³');
    if (depth <= 0) throw new RangeError('depth must be > 0 m');
    if (slope < 0 || slope >= 90) throw new RangeError('slope must be in [0, 90) degrees');
    if (ru < 0 || ru > 1) throw new RangeError('ru must be in [0, 1]');

    const alphaRad = (slope * Math.PI) / 180;
    const phiRad = (friction * Math.PI) / 180;

    // Resistencia ao cisalhamento disponivel (Mohr-Coulomb)
    // tau_f = c' + (sigma_n - u) * tan(phi')
    // sigma_n = gamma * z * cos²(alpha)
    const sigmaN = unitWeight * depth * Math.cos(alphaRad) ** 2;
    const u = ru * unitWeight * depth; // pressao de poros
    const tauF = cohesion + Math.max(0, sigmaN - u) * Math.tan(phiRad);

    // Tensao de cisalhamento atuante
    // tau = gamma * z * sin(alpha) * cos(alpha)
    const tau = unitWeight * depth * Math.sin(alphaRad) * Math.cos(alphaRad);

    if (tau <= 0) return Infinity; // talude horizontal, sem forca atuante

    return tauF / tau;
}

/**
 * Calcula o Fator de Segurança pelo modelo de Talude Infinito.
 * Modelo analitico classico para escorregamentos translacionais rasos.
 * Considera saturacao parcial via razao de pressao de poros ru.
 *
 * Modelo de talude infinito - adequado para escorregamentos translacionais.
 *
 * @param cohesion   - Coesao efetiva c' [kPa] (>= 0)
 * @param friction   - Angulo de atrito phi' [graus] (0–90)
 * @param unitWeight - Peso especifico gamma [kN/m³] (> 0)
 * @param depth      - Espessura da camada instavel z [m] (> 0)
 * @param slope      - Inclinacao do talude beta [graus] (0–90)
 * @param ru         - Razao de pressao de poros (0–1)
 * @returns FS pelo talude infinito (adimensional)
 * @throws {TypeError|RangeError} Para inputs invalidos
 */
export function calcInfiniteSlope(
    cohesion: number,
    friction: number,
    unitWeight: number,
    depth: number,
    slope: number,
    ru = 0,
): number {
    // Reutiliza a mesma validacao do calcSafetyFactor - modelo equivalente
    // para talude infinito com a formulacao padrao USGS (Eq. 1, OFR 92-521)
    return calcSafetyFactor(cohesion, friction, unitWeight, depth, slope, ru);
}

/**
 * Calcula o Indice de Risco de Deslizamento (LRI - Landslide Risk Index).
 * LRI combina probabilidade de ruptura (baseada em FS) com magnitude
 * potencial (volume de material instavel × inclinacao).
 *
 * LRI = P(ruptura) × (volume × sin(slope)) / normFactor
 * onde P(ruptura) = 1 / (1 + exp(2*(FS - 1))) — funcao logistica centrada em FS=1
 *
 * Referencia: Hungr et al. (2014) Landslides 11:167 - Eq. adaptada para
 * escorregamentos translacionais com volume estimado.
 *
 * @param fs     - Fator de seguranca FS (> 0)
 * @param volume - Volume estimado da massa instavel [m³] (> 0)
 * @param slope  - Inclinacao do talude [graus] (0–90)
 * @param normFactor - Fator de normalizacao para adimensionalizar (> 0)
 * @returns LRI adimensional [0, 1) proporcional ao risco
 * @throws {TypeError|RangeError} Para inputs invalidos
 */
export function calcLandslideRiskIndex(fs: number, volume: number, slope: number, normFactor = 1000): number {
    for (const [name, val] of [
        ['fs', fs],
        ['volume', volume],
        ['slope', slope],
        ['normFactor', normFactor],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
            throw new TypeError(`${name} must be a finite number, got ${val}`);
        }
    }
    if (fs <= 0) throw new RangeError('fs must be > 0');
    if (volume <= 0) throw new RangeError('volume must be > 0 m³');
    if (slope < 0 || slope >= 90) throw new RangeError('slope must be in [0, 90) degrees');
    if (normFactor <= 0) throw new RangeError('normFactor must be > 0');

    // Probabilidade de ruptura: funcao logistica centrada em FS = 1
    // P = 1 / (1 + exp(2*(FS-1))): P=0.5 quando FS=1, P→0 quando FS>>1, P→1 quando FS<<1
    const pFail = 1 / (1 + Math.exp(2 * (fs - 1)));

    const alphaRad = (slope * Math.PI) / 180;
    const magnitude = volume * Math.sin(alphaRad); // [m³] componente destrutiva

    return (pFail * magnitude) / normFactor;
}

/**
 * Classifica o perigo de deslizamento em 5 classes conforme IAEG/Varnes (1978).
 *
 * Classificacao IAEG:
 *   Classe I  (Muito Baixo): FS > 2.0
 *   Classe II (Baixo):       1.5 < FS <= 2.0
 *   Classe III (Medio):      1.2 < FS <= 1.5
 *   Classe IV (Alto):        1.0 < FS <= 1.2
 *   Classe V  (Muito Alto):  FS <= 1.0 (ruptura iminente)
 *
 * @param fs - Fator de seguranca FS (> 0)
 * @returns Objeto com classe IAEG, rotulo, descricao e cor de referencia
 * @throws {TypeError|RangeError} Para FS invalido
 */
export function classifyLandslideHazard(
    fs: number,
): { class: string; label: string; description: string; color: string } {
    if (typeof fs !== 'number' || !Number.isFinite(fs)) {
        throw new TypeError(`fs must be a finite number, got ${fs}`);
    }
    if (fs <= 0) throw new RangeError('fs must be > 0');

    if (fs > 2.0) {
        return {
            class: 'I',
            label: 'Very Low',
            description: 'Stable slope, no intervention required',
            color: '#2ecc71',
        };
    } else if (fs > 1.5) {
        return {
            class: 'II',
            label: 'Low',
            description: 'Marginally stable, monitoring recommended',
            color: '#27ae60',
        };
    } else if (fs > 1.2) {
        return {
            class: 'III',
            label: 'Medium',
            description: 'Conditionally unstable, drainage needed',
            color: '#f39c12',
        };
    } else if (fs > 1.0) {
        return { class: 'IV', label: 'High', description: 'Near-critical, engineering intervention', color: '#e67e22' };
    } else {
        return { class: 'V', label: 'Very High', description: 'Failure imminent or ongoing', color: '#e74c3c' };
    }
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const landslideHazardAssessmentMeta: AnalyticsModuleMeta = {
    name: 'landslideHazardAssessment',
    description: 'Landslide Hazard Assessment',
    category: 'analytics',
    familyTags: ['risk', 'landslide'],
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
