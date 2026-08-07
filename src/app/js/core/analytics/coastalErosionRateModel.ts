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
// Application: EHS & Mining - Coastal Erosion Rate Model
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Coastal Erosion Rate Model - Shoreline Retreat & Sediment Transport
 *
 * Módulo puro implementando modelos analíticos de erosão costeira:
 * a Regra de Bruun para recuo por elevação do nível do mar, o modelo CERC
 * para transporte longitudinal de sedimentos e classificação de severidade.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Bruun, P. (1962). "Sea-level rise as a cause of shore erosion."
 *     Journal of the Waterways and Harbors Division, ASCE, 88(1), 117–130.
 *     Reprinted in: Beach Erosion Board Technical Memorandum No. 115.
 *     (Regra de Bruun - recuo horizontal R por elevacao S do nivel do mar)
 *   - CERC - Coastal Engineering Research Center (1984). "Shore Protection
 *     Manual." 4th Edition. Vicksburg, MS: US Army Corps of Engineers.
 *     (CERC formula para transporte longitudinal Ql - Eq. 4-51, Cap. 4)
 *   - van Rijn, L. C. (2014). "A simple general expression for longshore
 *     transport of sand, gravel and shingle." Coastal Engineering, 90, 23–39.
 *     DOI: 10.1016/j.coastaleng.2013.10.021
 *     (coeficiente K calibrado por granulometria, ondas obliquas)
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

/** Densidade da agua do mar [kg/m³] */
const RHO_SEA = 1025;

/** Aceleracao gravitacional [m/s²] */
const G = 9.81;

/**
 * Valida que um valor e um numero finito.
 * @param name - Nome do parametro
 * @param value - Valor a validar
 * @param allowZero - Permitir zero
 * @throws {TypeError|RangeError}
 */
function assertFinitePositive(name: string, value: number, allowZero: boolean = false): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number, got ${value}`);
    }
    if (allowZero ? value < 0 : value <= 0) {
        throw new RangeError(`${name} must be ${allowZero ? '>= 0' : '> 0'}, got ${value}`);
    }
}

/**
 * Calcula o recuo costeiro horizontal (R) pela Regra de Bruun.
 *
 * Equacao de Bruun (1962):
 *   R = S * L / (h* + B)
 *
 * Onde:
 *   R  = recuo da linha de costa [m]
 *   S  = elevacao do nivel do mar [m]
 *   L  = largura do perfil ativo de sedimento [m] (da linha de costa ate h*)
 *   h* = profundidade de fechamento do perfil ativo [m]
 *   B  = altura da berma (cota de praia) [m]
 *
 * Limitacoes: valida para perfis em equilibrio dinamico, granulometria uniforme.
 *
 * @param seaLevelRise - Elevacao do nivel do mar S [m] (> 0)
 * @param activeProfileWidth - Largura do perfil ativo L [m] (> 0)
 * @param closureDepth - Profundidade de fechamento h* [m] (> 0)
 * @param bermaHeight - Altura da berma B [m] (> 0)
 * @returns Recuo R da linha de costa [m]
 * @throws {TypeError|RangeError} Para inputs invalidos
 */
export function calcBruunRuleErosion(
    seaLevelRise: number,
    activeProfileWidth: number,
    closureDepth: number,
    bermaHeight: number,
): number {
    assertFinitePositive('seaLevelRise', seaLevelRise);
    assertFinitePositive('activeProfileWidth', activeProfileWidth);
    assertFinitePositive('closureDepth', closureDepth);
    assertFinitePositive('bermaHeight', bermaHeight);

    // Denominador e a altura total do perfil ativo: h* + B [m]
    const profileHeight = closureDepth + bermaHeight;

    // Bruun Rule: R = S * L / (h* + B)
    return (seaLevelRise * activeProfileWidth) / profileHeight;
}

/**
 * Calcula a taxa de transporte longitudinal de sedimentos (Ql) pela formula CERC.
 *
 * Formula CERC (Shore Protection Manual, 1984 - Eq. 4-51):
 *   Ql = K * (Hb^(5/2) * sin(2*alphab)) / (16 * sqrt(g/kappa) * (s-1) * (1-n))
 *
 * Versao simplificada (van Rijn 2014, coeficiente K_CERC):
 *   Ql = K_CERC * Ecg * sin(alphab) * cos(alphab) [m³/s]
 *
 * Onde:
 *   Hb     = altura de onda na zona de arrebentacao [m]
 *   alphab = angulo de incidencia da onda na arrebentacao [graus]
 *   K      = coeficiente empirico CERC (0.77 para areia media, van Rijn 2014)
 *   kappa  = indice de arrebentacao (0.78)
 *   s      = densidade relativa do sedimento (rho_s/rho_w ≈ 2.65)
 *   n      = porosidade do deposito (0.40)
 *
 * @param breakerHeight - Altura de onda na arrebentacao Hb [m] (> 0)
 * @param breakerAngle - Angulo de incidencia da onda alpha_b [graus] (0–90)
 * @param K - Coeficiente CERC (van Rijn 2014) [-] (> 0)
 * @param kappaBreaker - Indice de arrebentacao kappa [-] (> 0)
 * @param sedimentDensityRel - Densidade relativa s = rho_s/rho_w [-] (> 1)
 * @param porosity - Porosidade do deposito n [-] (0–1)
 * @returns Taxa de transporte longitudinal Ql [m³/s]
 * @throws {TypeError|RangeError} Para inputs invalidos
 */
export function calcLongshoreTransportRate(
    breakerHeight: number,
    breakerAngle: number,
    K: number = 0.77,
    kappaBreaker: number = 0.78,
    sedimentDensityRel: number = 2.65,
    porosity: number = 0.4,
): number {
    assertFinitePositive('breakerHeight', breakerHeight);
    if (typeof breakerAngle !== 'number' || !Number.isFinite(breakerAngle) || breakerAngle < 0 || breakerAngle > 90) {
        throw new RangeError('breakerAngle must be in [0, 90] degrees');
    }
    assertFinitePositive('K', K);
    assertFinitePositive('kappaBreaker', kappaBreaker);
    if (sedimentDensityRel <= 1) throw new RangeError('sedimentDensityRel must be > 1');
    if (porosity < 0 || porosity >= 1) throw new RangeError('porosity must be in [0, 1)');

    const alphaRad = (breakerAngle * Math.PI) / 180;

    // Celeridade de grupo na arrebentacao: Cg = sqrt(g * Hb / kappa)
    // (aproximacao de agua rasa: Cg = sqrt(g * h), h = Hb/kappa)
    const Cg = Math.sqrt((G * breakerHeight) / kappaBreaker);

    // Densidade de energia de onda: E = (1/8) * rho_w * g * Hb²
    const E = (1 / 8) * RHO_SEA * G * breakerHeight ** 2;

    // Fluxo de energia: Ecg = E * Cg [W/m]
    const Ecg = E * Cg;

    // CERC formula (van Rijn 2014 - forma dimensional):
    // Ql = K * Ecg * sin(alpha_b) * cos(alpha_b) / (rho_s * g * (s-1) * (1-n))
    const rhoSediment = sedimentDensityRel * RHO_SEA; // [kg/m³]
    const denominator = rhoSediment * G * (sedimentDensityRel - 1) * (1 - porosity);

    return (K * Ecg * Math.sin(alphaRad) * Math.cos(alphaRad)) / denominator;
}

/**
 * Calcula o indice de estabilidade de perfil de praia (Dean Omega).
 *
 * Numero de Dean (Omega) classifica o estado morfodinamico da praia:
 *   Omega = Hb / (ws * T)
 *
 * Onde:
 *   Hb = altura de onda significativa na arrebentacao [m]
 *   ws = velocidade de sedimentacao do grao [m/s]
 *   T  = periodo de onda [s]
 *
 * Classificacao morfologica (Short & Wright, 1983):
 *   Omega < 1.0: Refletiva (praia estavel, grao grosso)
 *   1.0–2.5: Intermediaria baixa
 *   2.5–5.0: Intermediaria alta
 *   > 5.0: Dissipativa (praia plana, erosao potencial alta)
 *
 * @param breakerHeight - Altura de onda Hb [m] (> 0)
 * @param settlingVelocity - Velocidade de sedimentacao ws [m/s] (> 0)
 * @param wavePeriod - Periodo de onda T [s] (> 0)
 * @returns
 * @throws {TypeError|RangeError} Para inputs invalidos
 */
export function calcBeachProfileStability(
    breakerHeight: number,
    settlingVelocity: number,
    wavePeriod: number,
): { omega: number; state: string; stabilityIndex: number } {
    assertFinitePositive('breakerHeight', breakerHeight);
    assertFinitePositive('settlingVelocity', settlingVelocity);
    assertFinitePositive('wavePeriod', wavePeriod);

    const omega = breakerHeight / (settlingVelocity * wavePeriod);

    let state: string;
    if (omega < 1.0) {
        state = 'Reflective';
    } else if (omega < 2.5) {
        state = 'Low Intermediate';
    } else if (omega < 5.0) {
        state = 'High Intermediate';
    } else {
        state = 'Dissipative';
    }

    // Indice de estabilidade: inverso normalizado de Omega (0=dissipativo, 1=refletivo)
    const stabilityIndex = Math.max(0, Math.min(1, 1 - (omega - 1) / 9));

    return { omega, state, stabilityIndex };
}

/**
 * Classifica a severidade da erosao costeira com base na taxa anual de recuo.
 *
 * Criterios adaptados de van Rijn (2014) e EUROSION (2004) para praias arenosas:
 *   Negligivel: R_anual < 0.5 m/ano
 *   Leve:       0.5 <= R < 1.0 m/ano
 *   Moderada:   1.0 <= R < 3.0 m/ano
 *   Severa:     3.0 <= R < 10.0 m/ano
 *   Critica:    R >= 10.0 m/ano
 *
 * @param annualRetreatRate - Taxa anual de recuo da linha de costa [m/ano] (>= 0)
 * @returns
 * @throws {TypeError|RangeError} Para inputs invalidos
 */
export function classifyErosionSeverity(annualRetreatRate: number): {
    severity: string;
    label: string;
    color: string;
    actionRequired: string;
} {
    if (typeof annualRetreatRate !== 'number' || !Number.isFinite(annualRetreatRate)) {
        throw new TypeError(`annualRetreatRate must be a finite number, got ${annualRetreatRate}`);
    }
    if (annualRetreatRate < 0) throw new RangeError('annualRetreatRate must be >= 0 m/year');

    if (annualRetreatRate < 0.5) {
        return { severity: 'Negligible', label: 'Negligible', color: '#2ecc71', actionRequired: 'Monitoring only' };
    } else if (annualRetreatRate < 1.0) {
        return { severity: 'Mild', label: 'Mild', color: '#27ae60', actionRequired: 'Baseline monitoring program' };
    } else if (annualRetreatRate < 3.0) {
        return {
            severity: 'Moderate',
            label: 'Moderate',
            color: '#f39c12',
            actionRequired: 'Sand nourishment evaluation',
        };
    } else if (annualRetreatRate < 10.0) {
        return {
            severity: 'Severe',
            label: 'Severe',
            color: '#e67e22',
            actionRequired: 'Hard engineering or managed retreat',
        };
    } else {
        return {
            severity: 'Critical',
            label: 'Critical',
            color: '#e74c3c',
            actionRequired: 'Emergency intervention required',
        };
    }
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const coastalErosionRateModelMeta: AnalyticsModuleMeta = {
    name: 'coastalErosionRateModel',
    description: 'Coastal Erosion Rate Model',
    category: 'analytics',
    familyTags: ['coastal', 'erosion'],
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
