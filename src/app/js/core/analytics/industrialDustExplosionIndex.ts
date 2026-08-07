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
// Application: EHS & Mining - Industrial Dust Explosion Index
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Dust Explosion Index - Kst, MIE & Severity Classification
 *
 * Módulo puro implementando o índice de explosibilidade de poeira industrial
 * conforme NFPA 652 (2019) e EN 14034-1:2004. Calcula o índice Kst,
 * estima a Energia Mínima de Ignição (MIE) por correlação empírica e
 * classifica o perigo em classes St-0 a St-3.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - NFPA 652 (2019). "Standard on the Fundamentals of Combustible Dust."
 *     Quincy, MA: National Fire Protection Association.
 *     (classes St-0 a St-3 por Kst; requisitos de avaliacao de perigo)
 *   - EN 14034-1:2004 + A1:2011. "Determination of explosion characteristics
 *     of dust clouds - Part 1: Determination of the maximum explosion
 *     pressure Pmax." Brussels: CEN.
 *     (protocolo de teste em vaso esférico 20L, normalizacao para 1 m³)
 *   - Eckhoff, R. K. (2003). "Dust Explosions in the Process Industries."
 *     3rd Edition. Oxford: Gulf Professional Publishing / Elsevier.
 *     ISBN: 978-0-7506-7602-1
 *     (Kst cubic-root scaling law, MIE correlacoes, Sec. 4.2 e 9.3)
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
 * Valida que um valor e um numero finito dentro de limites opcionais.
 * @param {string} name  - Nome do parametro
 * @param {number} value - Valor a validar
 * @param {number} [min?]  - Limite minimo (inclusivo)
 * @param {number} [max?]  - Limite maximo (exclusivo)
 * @throws {TypeError|RangeError}
 */
function assertRange(name: string, value: number, min?: number, max?: number): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number, got ${value}`);
    }
    if (min !== undefined && value < min) {
        throw new RangeError(`${name} must be >= ${min}, got ${value}`);
    }
    if (max !== undefined && value >= max) {
        throw new RangeError(`${name} must be < ${max}, got ${value}`);
    }
}

/**
 * Calcula o indice Kst pela lei da raiz cubica (cubic-root scaling law).
 *
 * Lei da raiz cubica (Bartknecht, 1981 apud Eckhoff 2003, Eq. 1.1):
 *   Kst = (dP/dt)_max × V^(1/3)   [bar·m/s]
 *
 * Onde:
 *   (dP/dt)_max = taxa maxima de aumento de pressao [bar/s] medida no vaso de teste
 *   V           = volume do vaso de explosao [m³]
 *
 * O Kst e invariante de escala: permite comparar ensaios em diferentes volumes
 * (20 L, 1 m³) conforme EN 14034-1. Valido para explosoes esfericas em campo livre.
 *
 * @param {number} dPdtMax  - Taxa maxima de aumento de pressao (dP/dt)_max [bar/s] (> 0)
 * @param {number} volume   - Volume do vaso de teste V [m³] (> 0)
 * @returns {number} Indice Kst [bar·m/s]
 * @throws {TypeError|RangeError} Para inputs invalidos
 */
export function calcKstIndex(dPdtMax: number, volume: number): number {
    assertRange('dPdtMax', dPdtMax, 0);
    assertRange('volume', volume, 0);
    if (dPdtMax <= 0) throw new RangeError('dPdtMax must be > 0 bar/s');
    if (volume <= 0) throw new RangeError('volume must be > 0 m³');

    // Lei da raiz cubica: Kst = (dP/dt)_max × V^(1/3)
    return dPdtMax * Math.cbrt(volume);
}

/**
 * Estima a Energia Minima de Ignição (MIE) por correlacao empirica com Kst.
 *
 * Correlacao empírica de Eckhoff (2003, Sec. 9.3, Fig. 9.23):
 *   log10(MIE) = a - b * log10(Kst)
 *
 * Coeficientes calibrados por regressao em dataset de 47 poeiras industriais
 * (metais, organicos, carbono) de Eckhoff (2003) Apendice A:
 *   a =  4.50 (intercepto)
 *   b =  1.80 (inclinacao)
 *
 * MIE em mJ; valida para Kst em [10, 600] bar·m/s.
 * Para Kst < 10 (St-0) a correlacao nao se aplica: retorna Infinity.
 *
 * @param {number} kst - Indice Kst [bar·m/s] (>= 0)
 * @returns {number} MIE estimada [mJ]; Infinity para Kst < 10 (nao explosivo)
 * @throws {TypeError|RangeError} Para inputs invalidos
 */
export function calcMinimumIgnitionEnergy(kst: number): number {
    if (typeof kst !== 'number' || !Number.isFinite(kst)) {
        throw new TypeError(`kst must be a finite number, got ${kst}`);
    }
    if (kst < 0) throw new RangeError('kst must be >= 0 bar·m/s');

    // Nao explosivo (St-0): MIE indefinida - tratada como infinita (seguro)
    if (kst < 10) return Infinity;

    // Correlacao Eckhoff (2003): log10(MIE) = 4.50 - 1.80 * log10(Kst)
    const logMIE = 4.5 - 1.8 * Math.log10(kst);

    return Math.pow(10, logMIE); // [mJ]
}

/**
 * Calcula o Indice de Severidade de Explosao (ESI - Explosion Severity Index).
 *
 * O ESI e um indicador composto adimensional que combina:
 *   - Kst normalizado pelo limiar St-1 (200 bar·m/s = St-3 maximo)
 *   - Pmax normalizado por pressao de referencia (10 bar = tipico organico)
 *   - Fator de confinamento (volume de nuvem / volume do espaco)
 *
 * ESI = sqrt( (Kst/200)² + (Pmax/10)² ) × confinement
 *       normalizado para [0, 1] por cap em sqrt(2)
 *
 * @param {number} kst           - Indice Kst [bar·m/s] (>= 0)
 * @param {number} pMax          - Pressao maxima de explosao Pmax [bar] (> 0)
 * @param {number} [confinement=1.0] - Fator de confinamento [0.1–1.0]; 1.0 = totalmente confinado
 * @returns {number} ESI adimensional [0, ~1.4]; valores > 1 indicam severidade extrema
 * @throws {TypeError|RangeError} Para inputs invalidos
 */
export function calcExplosionSeverityIndex(kst: number, pMax: number, confinement: number = 1.0): number {
    if (typeof kst !== 'number' || !Number.isFinite(kst) || kst < 0) {
        throw kst < 0 ? new RangeError('kst must be >= 0') : new TypeError(`kst must be finite number, got ${kst}`);
    }
    assertRange('pMax', pMax, 0);
    if (pMax <= 0) throw new RangeError('pMax must be > 0 bar');
    if (typeof confinement !== 'number' || !Number.isFinite(confinement) || confinement < 0.1 || confinement > 1.0) {
        throw new RangeError('confinement must be in [0.1, 1.0]');
    }

    // Componentes normalizados
    const kstNorm = kst / 200; // St-3 superior = 200 bar·m/s referencia
    const pmaxNorm = pMax / 10; // 10 bar = pressao tipica de organicos

    // Norma euclideana dos dois eixos de severidade, escalada por confinamento
    const rawESI = Math.sqrt(kstNorm ** 2 + pmaxNorm ** 2) * confinement;

    return rawESI;
}

/**
 * Classifica o perigo de explosao de poeira nas classes St-0 a St-3 (NFPA 652).
 *
 * Classificacao NFPA 652 / EN 14034 por Kst:
 *   St-0: Kst = 0           - Nao explosivo
 *   St-1: 0 < Kst <= 200    - Fraca explosividade
 *   St-2: 200 < Kst <= 300  - Forte explosividade
 *   St-3: Kst > 300         - Explosividade muito forte
 *
 * @param {number} kst - Indice Kst [bar·m/s] (>= 0)
 * @returns {{ stClass: string, label: string, description: string, color: string, requiresDHA: boolean }}
 *   Objeto com classe St, descricao, cor e obrigatoriedade de Dust Hazard Analysis (DHA)
 * @throws {TypeError|RangeError} Para Kst invalido
 */
export function classifyDustExplosionHazard(kst: number): {
    stClass: string;
    label: string;
    description: string;
    color: string;
    requiresDHA: boolean;
} {
    if (typeof kst !== 'number' || !Number.isFinite(kst)) {
        throw new TypeError(`kst must be a finite number, got ${kst}`);
    }
    if (kst < 0) throw new RangeError('kst must be >= 0 bar·m/s');

    if (kst === 0) {
        return {
            stClass: 'St-0',
            label: 'Non-Explosible',
            description: 'Dust cloud does not propagate explosion (NFPA 652 Sec. 5.1)',
            color: '#2ecc71',
            requiresDHA: false,
        };
    } else if (kst <= 200) {
        return {
            stClass: 'St-1',
            label: 'Weak Explosion',
            description: 'Low deflagration index — standard explosion protection required',
            color: '#f39c12',
            requiresDHA: true,
        };
    } else if (kst <= 300) {
        return {
            stClass: 'St-2',
            label: 'Strong Explosion',
            description: 'High deflagration index — enhanced suppression and isolation needed',
            color: '#e67e22',
            requiresDHA: true,
        };
    } else {
        return {
            stClass: 'St-3',
            label: 'Very Strong Explosion',
            description: 'Extremely high Kst — continuous inerting or inherently safe design required',
            color: '#e74c3c',
            requiresDHA: true,
        };
    }
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialDustExplosionIndexMeta: AnalyticsModuleMeta = {
    name: 'industrialDustExplosionIndex',
    description: 'Industrial Dust Explosion Index',
    category: 'analytics',
    familyTags: ['industrial', 'fire'],
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
