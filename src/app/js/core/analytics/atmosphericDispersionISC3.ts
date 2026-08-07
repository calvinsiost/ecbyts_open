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
// Application: EHS & Mining - Atmospheric Dispersion (ISC3 / Gaussian)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Atmospheric Dispersion - Gaussian Plume (ISC3 / Briggs)
 *
 * Módulo puro implementando o modelo de dispersão atmosférica Gaussiana do
 * ISC3 (Industrial Source Complex 3) da US EPA, incluindo a equação de pluma
 * Gaussiana, elevação de pluma por building wake (Briggs), concentração máxima
 * ao solo e classificação de impacto na qualidade do ar.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - US EPA (1995). User's Guide for the Industrial Source Complex (ISC3)
 *     Dispersion Models. EPA-454/B-95-003a. Research Triangle Park, NC.
 *   - Briggs, G. A. (1975). "Plume rise predictions." In: D. A. Haugen (Ed.),
 *     Lectures on Air Pollution and Environmental Impact Analyses.
 *     Amer. Meteor. Soc., Boston, MA, pp. 59–111.
 *   - Pasquill, F. (1961). "The estimation of the dispersion of windborne
 *     material." Meteorol. Mag. 90(1063), 33–49.
 *     (Pasquill–Gifford stability classes and sigma parameterizations)
 *   - Seinfeld, J. H. & Pandis, S. N. (2016). Atmospheric Chemistry and
 *     Physics (3rd ed.). Wiley. ISBN: 978-1-118-94740-1.
 *
 * @module atmosphericDispersionISC3
 */

'use strict';

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

/**
 * Coeficientes de dispersão de Pasquill-Gifford para sigma_y e sigma_z (m).
 * Fonte: ISC3 User's Guide (EPA-454/B-95-003a), Tabela B-2.
 * Formato: [a, b] → sigma_y = a * x^0.9 (x em km) — simplificado Pasquill (1961)
 * Stability A=0, B=1, C=2, D=3, E=4, F=5
 */
const PG_SIGMA_Y_PARAMS = [
    { a: 0.22, b: 0.9 }, // A — muito instável
    { a: 0.16, b: 0.9 }, // B — instável
    { a: 0.12, b: 0.9 }, // C — ligeiramente instável
    { a: 0.08, b: 0.9 }, // D — neutro
    { a: 0.06, b: 0.9 }, // E — ligeiramente estável
    { a: 0.04, b: 0.9 }, // F — estável
];

const PG_SIGMA_Z_PARAMS = [
    { a: 0.2, b: 0.95 }, // A
    { a: 0.12, b: 0.95 }, // B
    { a: 0.08, b: 0.95 }, // C
    { a: 0.06, b: 0.95 }, // D
    { a: 0.03, b: 0.95 }, // E
    { a: 0.016, b: 0.95 }, // F
];

/**
 * Mapeia rótulo de classe de estabilidade para índice numérico.
 * @param stability - 'A'|'B'|'C'|'D'|'E'|'F' ou 0–5
 * @returns índice 0–5
 */
function stabilityIndex(stability: string | number): number {
    if (typeof stability === 'number') {
        if (!Number.isInteger(stability) || stability < 0 || stability > 5)
            throw new RangeError('stability index must be an integer 0–5');
        return stability;
    }
    const map: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };
    const key = String(stability).toUpperCase();
    if (!(key in map)) throw new TypeError("stability must be 'A'-'F' or 0-5");
    return map[key]!;
}

/**
 * Calcula sigma_y e sigma_z (m) para distância x (m) e classe de estabilidade.
 *
 * @param x_m       - Distância downwind (m), > 0
 * @param stabIndex - Índice de estabilidade 0–5 (A=0 … F=5)
 * @returns desvios laterais e verticais (m)
 */
function calcSigmas(x_m: number, stabIndex: number): { sigma_y: number; sigma_z: number } {
    const x_km = x_m / 1000;
    const sy_p = PG_SIGMA_Y_PARAMS[stabIndex]!;
    const sz_p = PG_SIGMA_Z_PARAMS[stabIndex]!;
    return {
        sigma_y: sy_p.a * Math.pow(x_km, sy_p.b) * 1000, // convertido de km→m
        sigma_z: sz_p.a * Math.pow(x_km, sz_p.b) * 1000,
    };
}

/**
 * Calcula a concentração de poluente via equação Gaussiana do ISC3 (μg/m³).
 *
 * C(x, y, z) = Q / (2π * σy * σz * u) *
 *   exp(-y²/(2σy²)) *
 *   [exp(-(z-H)²/(2σz²)) + exp(-(z+H)²/(2σz²))]
 *
 * O segundo termo representa a reflexão no solo (terreno plano).
 *
 * @param Q           - Taxa de emissão (g/s), > 0
 * @param u           - Velocidade do vento na altura efetiva (m/s), > 0
 * @param x           - Distância downwind (m), > 0
 * @param y           - Distância crosswind (m)
 * @param z           - Altura do receptor (m), >= 0
 * @param H           - Altura efetiva da pluma (m), >= 0
 * @param stability - Classe de estabilidade Pasquill-Gifford
 * @returns Concentração (μg/m³), sigma_y e sigma_z (m)
 */
export function calcGaussianPlumeConc(
    Q: number,
    u: number,
    x: number,
    y: number,
    z: number,
    H: number,
    stability: string | number = 'D',
): { conc_ug_m3: number; sigma_y: number; sigma_z: number } {
    if (typeof Q !== 'number' || Q <= 0) throw new RangeError('Q (emission rate) must be > 0 (g/s)');
    if (typeof u !== 'number' || u <= 0) throw new RangeError('u (wind speed) must be > 0 (m/s)');
    if (typeof x !== 'number' || x <= 0) throw new RangeError('x (downwind distance) must be > 0 (m)');
    if (typeof y !== 'number') throw new TypeError('y (crosswind distance) must be a number (m)');
    if (typeof z !== 'number' || z < 0) throw new RangeError('z (receptor height) must be >= 0 (m)');
    if (typeof H !== 'number' || H < 0) throw new RangeError('H (effective plume height) must be >= 0 (m)');

    const si = stabilityIndex(stability);
    const { sigma_y, sigma_z } = calcSigmas(x, si);

    const factor = Q / (2 * Math.PI * sigma_y * sigma_z * u);
    const crosswind = Math.exp(-(y * y) / (2 * sigma_y * sigma_y));
    const vertical =
        Math.exp(-((z - H) ** 2) / (2 * sigma_z * sigma_z)) + Math.exp(-((z + H) ** 2) / (2 * sigma_z * sigma_z));

    // Concentração em g/m³ → converter para μg/m³ (× 1e6)
    const conc_g_m3 = factor * crosswind * vertical;

    return { conc_ug_m3: conc_g_m3 * 1e6, sigma_y, sigma_z };
}

/**
 * Calcula a elevação de pluma por efeito de sombra de edifício (building wake).
 *
 * Usa as equações de Briggs (1975) para pluma momentum e pluma térmica em
 * presença de building downwash:
 *   ΔH_b = 1.5 * (Fb^(1/3) / u) * (3.5 * x)^(2/3)  para pluma flotante
 *   ΔH_b = 3 * d  (limitador de building wake)
 *
 * Na prática, aplica-se o menor dos dois, com downwash pela fórmula
 * simplificada de Schulman & Scire (1980): H_eff = H_s + ΔH - 1.5 * h_b.
 *
 * @param H_s        - Altura física da chaminé (m), > 0
 * @param Fb         - Parâmetro de flutuação (m⁴/s³), >= 0
 * @param u          - Velocidade do vento (m/s), > 0
 * @param h_b        - Altura do edifício adjacente (m), >= 0
 * @param d_b        - Dimensão horizontal do edifício (m), >= 0
 * @param x          - Distância da fonte (m), > 0
 * @returns Altura efetiva da pluma, elevação bruta e penalidade de downwash (m)
 */
function _validatePlumeRiseBuildingInput(
    H_s: number,
    Fb: number,
    u: number,
    h_b: number,
    d_b: number,
    x: number,
): void {
    if (typeof H_s !== 'number' || H_s <= 0) throw new RangeError('H_s (stack height) must be > 0 (m)');
    if (typeof Fb !== 'number' || Fb < 0) throw new RangeError('Fb (buoyancy flux) must be >= 0 (m⁴/s³)');
    if (typeof u !== 'number' || u <= 0) throw new RangeError('u (wind speed) must be > 0 (m/s)');
    if (typeof h_b !== 'number' || h_b < 0) throw new RangeError('h_b (building height) must be >= 0 (m)');
    if (typeof d_b !== 'number' || d_b < 0) throw new RangeError('d_b (building dimension) must be >= 0 (m)');
    if (typeof x !== 'number' || x <= 0) throw new RangeError('x (distance) must be > 0 (m)');
}

export function calcPlumeRiseBuilding(
    H_s: number,
    Fb: number,
    u: number,
    h_b: number,
    d_b: number,
    x: number,
): { H_eff: number; delta_H: number; downwash_penalty: number } {
    _validatePlumeRiseBuildingInput(H_s, Fb, u, h_b, d_b, x);

    // Elevação por flutuação de Briggs (1975) - pluma térmica/momentum
    const delta_H_buoyancy = Fb > 0 ? ((1.5 * Math.pow(Fb, 1 / 3)) / u) * Math.pow(3.5 * x, 2 / 3) : 0;

    // Limitador físico por building: ΔH_max = 3 * d_b
    const delta_H = Math.min(delta_H_buoyancy, 3 * d_b || delta_H_buoyancy);

    // Penalidade de downwash (Schulman & Scire 1980): 1.5 * h_b se H_s < 2.5 * h_b
    const downwash_penalty = H_s < 2.5 * h_b ? 1.5 * h_b : 0;

    const H_eff = Math.max(0, H_s + delta_H - downwash_penalty);

    return { H_eff, delta_H, downwash_penalty };
}

/**
 * Calcula a concentração máxima ao solo (Cmax) e a distância onde ocorre.
 *
 * A Cmax para pluma Gaussiana ao nível do solo (z=0, y=0) é dada por:
 *   Cmax ≈ Q / (π * u * σy * σz) * exp(−H²/(2σz²))
 *
 * A distância xmax é encontrada por busca numérica (grid de 50 pontos).
 *
 * @param Q        - Taxa de emissão (g/s), > 0
 * @param u        - Velocidade do vento (m/s), > 0
 * @param H        - Altura efetiva da pluma (m), >= 0
 * @param stability - Classe de estabilidade
 * @param x_min   - Distância mínima de busca (m)
 * @param x_max - Distância máxima de busca (m)
 * @returns Concentração máxima ao solo (μg/m³) e distância downwind onde ocorre (m)
 */
export function calcMaxGroundConc(
    Q: number,
    u: number,
    H: number,
    stability: string | number = 'D',
    x_min = 100,
    x_max = 50000,
): { Cmax_ug_m3: number; x_max_m: number } {
    if (typeof Q !== 'number' || Q <= 0) throw new RangeError('Q must be > 0 (g/s)');
    if (typeof u !== 'number' || u <= 0) throw new RangeError('u must be > 0 (m/s)');
    if (typeof H !== 'number' || H < 0) throw new RangeError('H must be >= 0 (m)');
    if (x_min <= 0 || x_max <= x_min) throw new RangeError('x_min > 0 and x_max > x_min required');

    const si = stabilityIndex(stability);
    const N = 50;
    const step = (x_max - x_min) / N;

    let best_conc = 0;
    let best_x = x_min;

    for (let i = 0; i <= N; i++) {
        const x = x_min + i * step;
        const { sigma_y, sigma_z } = calcSigmas(x, si);
        // Concentração ao solo (z=0, y=0)
        const c = (Q / (Math.PI * u * sigma_y * sigma_z)) * Math.exp(-(H * H) / (2 * sigma_z * sigma_z));
        if (c > best_conc) {
            best_conc = c;
            best_x = x;
        }
    }

    return { Cmax_ug_m3: best_conc * 1e6, x_max_m: best_x };
}

/**
 * Classifica o impacto na qualidade do ar com base na concentração de poluente.
 *
 * Utiliza os padrões de qualidade do ar da CONAMA 003/90 para PM10 como
 * referência, mas aceita limites personalizados. Pode ser usado para qualquer
 * poluente com ajuste dos limiares.
 *
 * Padrões default (μg/m³ - concentração 24h PM10, CONAMA 003/90 + WHO 2021):
 *   < 15    : Bom (WHO AQG 2021)
 *   < 50    : Moderado
 *   < 150   : Ruim (CONAMA PII)
 *   >= 150  : Crítico
 *
 * @param conc_ug_m3 - Concentração (μg/m³), >= 0
 * @param thresholds - Limiares de transição (μg/m³)
 * @param labels - Rótulos de impacto
 * @returns Classificação de impacto, nível (0=bom, 3=crítico) e concentração
 */
export function classifyAirQualityImpact(
    conc_ug_m3: number,
    thresholds: number[] = [15, 50, 150],
    labels: string[] = ['good', 'moderate', 'poor', 'critical'],
): { impact: string; level: number; conc_ug_m3: number } {
    if (typeof conc_ug_m3 !== 'number' || conc_ug_m3 < 0) throw new RangeError('conc_ug_m3 must be >= 0');
    if (!Array.isArray(thresholds) || thresholds.length !== labels.length - 1)
        throw new TypeError('thresholds must have length = labels.length - 1');

    for (let i = 0; i < thresholds.length; i++) {
        if (conc_ug_m3 < thresholds[i]!) {
            return { impact: labels[i]!, level: i, conc_ug_m3 };
        }
    }

    return { impact: labels[labels.length - 1]!, level: labels.length - 1, conc_ug_m3 };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const atmosphericDispersionISC3Meta: AnalyticsModuleMeta = {
    name: 'atmosphericDispersionISC3',
    description: 'Atmospheric Dispersion (ISC3 / Gaussian)',
    category: 'analytics',
    familyTags: ['atmosphere', 'fate_transport'],
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
