// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Industrial Ecology - Material Flow Analysis (MFA)
 *
 * Academic references:
 *   Baccini, P. & Brunner, P.H. (2012). Metabolism of the Anthroposphere.
 *     MIT Press. ISBN 978-0-262-01657-4
 *   Graedel, T.E. & Allenby, B.R. (2003). Industrial Ecology (2nd ed.).
 *     Prentice Hall. ISBN 978-0-13-046682-1
 *   Brunner, P.H. & Rechberger, H. (2004). Practical Handbook of Material
 *     Flow Analysis. CRC Press. DOI:10.1201/9780203507209
 *
 * Zero dependências DOM/IDB/Three.js/fetch.
 * Todos os fluxos em unidades homogêneas (toneladas/ano ou kg/ano).
 */

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

// ─── Mass Balance ────────────────────────────────────────────────────────────

/**
 * Mass Balance for a single compartment / Balanço de massa por compartimento.
 *
 * Equação: dStock/dt = Σ(inputs) − Σ(outputs) − Σ(losses)
 * Referência: Brunner & Rechberger 2004, eq. 2.1
 *
 * @param {object} params
 * @param {number} params.totalInput   - Soma de todas as entradas (t/a)
 * @param {number} params.totalOutput  - Soma de todas as saídas (t/a)
 * @param {number} params.totalLoss    - Perdas dissipativas (t/a)
 * @param {number|null} [params.deltaStock] - Variação de estoque medida (t/a); se fornecida, calcula imbalance
 * @returns {{ stockChange: number, imbalance: number|null }}
 * @throws {TypeError}  se algum valor numérico for inválido
 * @throws {RangeError} se algum valor for negativo
 */
export function massBalance({
    totalInput,
    totalOutput,
    totalLoss,
    deltaStock = null,
}: {
    totalInput: number;
    totalOutput: number;
    totalLoss: number;
    deltaStock?: number | null;
}): { stockChange: number; imbalance: number | null } {
    for (const [name, val] of [
        ['totalInput', totalInput],
        ['totalOutput', totalOutput],
        ['totalLoss', totalLoss],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !isFinite(val)) throw new TypeError(`${name} must be a finite number`);
        if (val < 0) throw new RangeError(`${name} must be >= 0`);
    }
    // Variação de estoque calculada / calculated stock change
    const stockChange = totalInput - totalOutput - totalLoss;
    // Desequilíbrio em relação ao valor medido (null se não fornecido)
    const imbalance = deltaStock !== null ? stockChange - deltaStock : null;
    return { stockChange, imbalance };
}

// ─── Material Use Efficiency ──────────────────────────────────────────────────

/**
 * Material Use Efficiency (MUE) / Eficiência de uso de material.
 *
 * MUE = massInProduct / totalInput  [0, 1]
 * Indica a fração do insumo que se incorpora ao produto final.
 * Referência: Graedel & Allenby 2003, cap. 4
 *
 * @param {number} massInProduct - Massa incorporada ao produto (t/a)
 * @param {number} totalInput    - Massa total de entrada (t/a)
 * @returns {number} MUE em fração [0, 1]
 * @throws {TypeError}  se valores não forem números finitos
 * @throws {RangeError} se totalInput <= 0 ou massInProduct < 0
 */
export function materialUseEfficiency(massInProduct: number, totalInput: number): number {
    if (typeof massInProduct !== 'number' || !isFinite(massInProduct))
        throw new TypeError('massInProduct must be a finite number');
    if (typeof totalInput !== 'number' || !isFinite(totalInput))
        throw new TypeError('totalInput must be a finite number');
    if (totalInput <= 0) throw new RangeError('totalInput must be > 0');
    if (massInProduct < 0) throw new RangeError('massInProduct must be >= 0');
    return massInProduct / totalInput;
}

// ─── Circularity Index ────────────────────────────────────────────────────────

/**
 * Circularity Index (CI) / Índice de circularidade.
 *
 * CI = recycledInput / totalInput  [0, 1]
 * Mede a proporção de material proveniente de reciclagem (fluxo secundário).
 * Referência: Ellen MacArthur Foundation (2015); adaptado de Brunner & Rechberger 2004
 *
 * @param {number} recycledInput - Entrada de material reciclado (t/a)
 * @param {number} totalInput    - Entrada total (primária + secundária) (t/a)
 * @returns {number} CI em fração [0, 1]
 * @throws {TypeError}  se valores não forem números finitos
 * @throws {RangeError} se totalInput <= 0 ou recycledInput < 0 ou recycledInput > totalInput
 */
export function circularityIndex(recycledInput: number, totalInput: number): number {
    if (typeof recycledInput !== 'number' || !isFinite(recycledInput))
        throw new TypeError('recycledInput must be a finite number');
    if (typeof totalInput !== 'number' || !isFinite(totalInput))
        throw new TypeError('totalInput must be a finite number');
    if (totalInput <= 0) throw new RangeError('totalInput must be > 0');
    if (recycledInput < 0) throw new RangeError('recycledInput must be >= 0');
    if (recycledInput > totalInput) throw new RangeError('recycledInput cannot exceed totalInput');
    return recycledInput / totalInput;
}

// ─── Recycling Rate ───────────────────────────────────────────────────────────

/**
 * Recycling Rate / Taxa de reciclagem.
 *
 * RR = massRecycled / (massRecycled + massLandfilled)  [0, 1]
 * Denominador = total de resíduos que poderiam ter sido reciclados.
 * Referência: Eurostat (2021) Waste statistics methodology; Baccini & Brunner 2012
 *
 * @param {number} massRecycled   - Massa efetivamente reciclada (t/a)
 * @param {number} massLandfilled - Massa destinada a aterro (t/a)
 * @returns {number} Taxa de reciclagem [0, 1]
 * @throws {TypeError}  se valores não forem números finitos
 * @throws {RangeError} se algum valor for negativo ou denominador for zero
 */
export function recyclingRate(massRecycled: number, massLandfilled: number): number {
    if (typeof massRecycled !== 'number' || !isFinite(massRecycled))
        throw new TypeError('massRecycled must be a finite number');
    if (typeof massLandfilled !== 'number' || !isFinite(massLandfilled))
        throw new TypeError('massLandfilled must be a finite number');
    if (massRecycled < 0) throw new RangeError('massRecycled must be >= 0');
    if (massLandfilled < 0) throw new RangeError('massLandfilled must be >= 0');
    const total = massRecycled + massLandfilled;
    if (total === 0) throw new RangeError('massRecycled + massLandfilled must be > 0');
    return massRecycled / total;
}

// ─── Multi-Compartment MFA ────────────────────────────────────────────────────

/**
 * Multi-compartment MFA summary / Resumo MFA multi-compartimento.
 *
 * Recebe um array de compartimentos e retorna indicadores consolidados.
 * Referência: Brunner & Rechberger 2004, cap. 3 - Process Model
 *
 * @param {Array<{name: string, input: number, output: number, loss: number}>} compartments
 * @returns {{
 *   totalInput: number,
 *   totalOutput: number,
 *   totalLoss: number,
 *   totalStockChange: number,
 *   systemMUE: number,
 *   compartmentBalances: Array<{name:string, stockChange:number}>
 * }}
 * @throws {TypeError}  se compartments não for array não-vazio
 * @throws {RangeError} se algum valor de compartimento for negativo
 */
export function multiCompartmentMFA(
    compartments: Array<{ name: string; input: number; output: number; loss: number }>,
): {
    totalInput: number;
    totalOutput: number;
    totalLoss: number;
    totalStockChange: number;
    systemMUE: number;
    compartmentBalances: Array<{ name: string; stockChange: number }>;
} {
    if (!Array.isArray(compartments) || compartments.length === 0)
        throw new TypeError('compartments must be a non-empty array');

    let totalInput = 0,
        totalOutput = 0,
        totalLoss = 0;
    const compartmentBalances: Array<{ name: string; stockChange: number }> = [];

    for (const c of compartments) {
        if (typeof c.input !== 'number' || c.input < 0)
            throw new RangeError(`Compartment ${c.name}: input must be >= 0`);
        if (typeof c.output !== 'number' || c.output < 0)
            throw new RangeError(`Compartment ${c.name}: output must be >= 0`);
        if (typeof c.loss !== 'number' || c.loss < 0) throw new RangeError(`Compartment ${c.name}: loss must be >= 0`);
        const stockChange = c.input - c.output - c.loss;
        totalInput += c.input;
        totalOutput += c.output;
        totalLoss += c.loss;
        compartmentBalances.push({ name: c.name, stockChange });
    }

    const totalStockChange = totalInput - totalOutput - totalLoss;
    // MUE do sistema: saída total sobre entrada total
    const systemMUE = totalInput > 0 ? totalOutput / totalInput : 0;

    return { totalInput, totalOutput, totalLoss, totalStockChange, systemMUE, compartmentBalances };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialEcologyMFAMeta: AnalyticsModuleMeta = {
    name: 'industrialEcologyMFA',
    description: 'industrialEcologyMFA',
    category: 'analytics',
    familyTags: ['industrial', 'mfa'],
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
