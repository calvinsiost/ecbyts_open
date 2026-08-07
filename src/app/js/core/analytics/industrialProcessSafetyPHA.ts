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
 * Industrial Process Safety - Process Hazard Analysis (PHA/HAZOP simplified)
 *
 * Implements a simplified PHA engine based on HAZOP methodology per IEC 61882:2016,
 * risk matrix per IEC 61511, and OSHA Process Safety Management (PSM 1910.119).
 *
 * References:
 *   - IEC 61882:2016. "Hazard and operability studies (HAZOP studies) - Application guide."
 *     International Electrotechnical Commission.
 *   - IEC 61511:2016. "Functional safety - Safety instrumented systems for the process
 *     industry sector." DOI: 10.3403/30175799U
 *   - OSHA 29 CFR 1910.119. "Process Safety Management of Highly Hazardous Chemicals."
 *     U.S. Department of Labor, 1992.
 *   - Kletz, T.A. (1999). "HAZOP and HAZAN: Identifying and Assessing Process Industry
 *     Hazards." 4th ed. IChemE. ISBN 978-0-85295-421-3.
 *   - ABNT NBR 14280:2001. "Cadastro de acidente do trabalho." Associação Brasileira de
 *     Normas Técnicas.
 *
 * @module industrialProcessSafetyPHA
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

// ─── Constants ────────────────────────────────────────────────────────────────

/** Guide words per IEC 61882 */
export const GUIDE_WORDS = ['MORE', 'LESS', 'NO', 'REVERSE', 'AS_WELL_AS', 'PART_OF', 'OTHER_THAN'];

/** Process parameters típicos em instalações industriais */
export const PROCESS_PARAMETERS = [
    'FLOW',
    'TEMPERATURE',
    'PRESSURE',
    'LEVEL',
    'COMPOSITION',
    'REACTION',
    'VISCOSITY',
    'TIME',
    'SPEED',
    'VOLTAGE',
];

/**
 * Severity scale (IEC 61511 / OSHA PSM adapted)
 * Nível 1 = negligível, 5 = catastrófico
 * @type {Record<number, string>}
 */
const SEVERITY_LABELS: Record<number, string> = {
    1: 'negligible', // Negligível — sem lesão, dano ambiental mínimo
    2: 'marginal', // Marginal — lesão leve, afastamento < 5 dias
    3: 'critical', // Crítico — lesão grave, contaminação local
    4: 'hazardous', // Perigoso — incapacidade permanente, contaminação regional
    5: 'catastrophic', // Catastrófico — morte, desastre ambiental
};

/**
 * Probability / Likelihood scale
 * Nível 1 = improvável, 5 = frequente
 * @type {Record<number, string>}
 */
const PROBABILITY_LABELS: Record<number, string> = {
    1: 'improbable', // < 1 vez em 10.000 anos
    2: 'remote', // 1 vez em 1.000–10.000 anos
    3: 'occasional', // 1 vez em 100–1.000 anos
    4: 'probable', // 1 vez em 10–100 anos
    5: 'frequent', // > 1 vez por ano
};

/**
 * Risk matrix (severity × probability) → risk level
 * @type {Record<string, string[]>}
 */
const RISK_MATRIX: Record<string, string[]> = {
    //        S=1          S=2         S=3         S=4         S=5
    P1: ['very_low', 'very_low', 'low', 'low', 'medium'],
    P2: ['very_low', 'low', 'low', 'medium', 'high'],
    P3: ['low', 'low', 'medium', 'high', 'high'],
    P4: ['low', 'medium', 'high', 'high', 'very_high'],
    P5: ['medium', 'high', 'high', 'very_high', 'very_high'],
};

/**
 * Safeguard recommendations by risk level
 * @type {Record<string, string[]>}
 */
const SAFEGUARD_RECOMMENDATIONS: Record<string, string[]> = {
    very_low: ['Periodic monitoring', 'Operating procedures update'],
    low: ['Administrative controls', 'Operator training', 'Periodic inspection'],
    medium: ['Engineering controls', 'Safety instrumented function (SIF)', 'Emergency procedure'],
    high: [
        'Safety Instrumented System (SIS)',
        'Relief device',
        'Process isolation capability',
        'Emergency response plan',
    ],
    very_high: [
        'Inherently safer design',
        'Process shutdown system (ESD)',
        'Physical barrier',
        'Community notification plan',
        'Regulatory notification',
    ],
};

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Evaluate a single HAZOP deviation node.
 *
 * Avalia um nó de desvio HAZOP: combinação (parâmetro, palavra-guia, causa) →
 * consequência → nível de risco → recomendações de salvaguarda.
 *
 * @param {object} node
 * @param {string} node.nodeId        - Identificador único do nó (ex: "N1")
 * @param {string} node.parameter     - Parâmetro de processo (ex: "FLOW")
 * @param {string} node.guideWord     - Palavra-guia (ex: "MORE")
 * @param {string} node.cause         - Causa do desvio (texto livre)
 * @param {string} node.consequence   - Consequência potencial (texto livre)
 * @param {number} node.severity      - Severidade: 1–5
 * @param {number} node.probability   - Probabilidade: 1–5
 * @param {string[]} [node.existingSafeguards=[]] - Salvaguardas existentes
 * @returns {{
 *   nodeId: string,
 *   deviation: string,
 *   riskLevel: string,
 *   riskScore: number,
 *   severityLabel: string,
 *   probabilityLabel: string,
 *   recommendations: string[],
 *   creditsExistingSafeguards: number
 * }}
 * @throws {TypeError}  se campos obrigatórios ausentes ou de tipo errado
 * @throws {RangeError} se severity ou probability fora de [1,5]
 */
export function evaluateHazopNode({
    nodeId,
    parameter,
    guideWord,
    cause,
    consequence,
    severity,
    probability,
    existingSafeguards = [],
}: {
    nodeId: string;
    parameter: string;
    guideWord: string;
    cause: string;
    consequence: string;
    severity: number;
    probability: number;
    existingSafeguards?: string[];
}): {
    nodeId: string;
    deviation: string;
    riskLevel: string;
    riskScore: number;
    severityLabel: string;
    probabilityLabel: string;
    recommendations: string[];
    creditsExistingSafeguards: number;
} {
    if (!nodeId || typeof nodeId !== 'string') throw new TypeError('nodeId must be a non-empty string');
    if (!parameter || typeof parameter !== 'string') throw new TypeError('parameter must be a non-empty string');
    if (!guideWord || typeof guideWord !== 'string') throw new TypeError('guideWord must be a non-empty string');
    if (!cause || typeof cause !== 'string') throw new TypeError('cause must be a non-empty string');
    if (!consequence || typeof consequence !== 'string') throw new TypeError('consequence must be a non-empty string');
    if (typeof severity !== 'number' || !Number.isInteger(severity)) throw new TypeError('severity must be an integer');
    if (typeof probability !== 'number' || !Number.isInteger(probability))
        throw new TypeError('probability must be an integer');
    if (severity < 1 || severity > 5) throw new RangeError('severity must be in [1, 5]');
    if (probability < 1 || probability > 5) throw new RangeError('probability must be in [1, 5]');
    if (!Array.isArray(existingSafeguards)) throw new TypeError('existingSafeguards must be an array');

    const deviation = `${guideWord} ${parameter}`;

    // Cada salvaguarda existente reduz probabilidade efetiva em 0.5 nível (mín. 1)
    const creditsExistingSafeguards = existingSafeguards.length;
    const effectiveProbability = Math.max(1, probability - Math.floor(creditsExistingSafeguards * 0.5));

    const riskLevel = RISK_MATRIX[`P${effectiveProbability}`]![severity - 1]!;
    const riskScore = severity * effectiveProbability;

    // Recomendações do nível de risco + remoção das já existentes (evita duplicidade)
    const baseRecs = SAFEGUARD_RECOMMENDATIONS[riskLevel] || [];
    const recommendations = baseRecs.filter(
        (r) => !existingSafeguards.some((s) => s.toLowerCase().includes(r.toLowerCase().slice(0, 10))),
    );

    return {
        nodeId,
        deviation,
        riskLevel,
        riskScore,
        severityLabel: SEVERITY_LABELS[severity]!,
        probabilityLabel: PROBABILITY_LABELS[probability]!,
        recommendations,
        creditsExistingSafeguards,
    };
}

/**
 * Run a complete PHA study over multiple HAZOP nodes.
 *
 * Executa estudo PHA completo: avalia todos os nós, calcula índice de completude,
 * identifica nós críticos e gera sumário executivo.
 *
 * @param {Array<Record<string, any>>} nodes - Array de objetos de nó HAZOP (same schema as evaluateHazopNode)
 * @param {string}   [studyTitle='Unnamed PHA Study'] - Título do estudo
 * @returns {{
 *   studyTitle:        string,
 *   totalNodes:        number,
 *   results:           object[],
 *   criticalNodes:     object[],
 *   riskDistribution:  Record<string, number>,
 *   completenessIndex: number,
 *   summary:           string
 * }}
 * @throws {TypeError}  se nodes não for array
 * @throws {RangeError} se nodes estiver vazio
 */
export function runPHAStudy(
    nodes: Array<Record<string, any>>,
    studyTitle = 'Unnamed PHA Study',
): {
    studyTitle: string;
    totalNodes: number;
    results: any[];
    criticalNodes: any[];
    riskDistribution: Record<string, number>;
    completenessIndex: number;
    summary: string;
} {
    if (!Array.isArray(nodes)) throw new TypeError('nodes must be an array');
    if (nodes.length === 0) throw new RangeError('nodes array must not be empty');
    if (typeof studyTitle !== 'string') throw new TypeError('studyTitle must be a string');

    const results = nodes.map((n) => evaluateHazopNode(n as any));

    const riskDistribution: Record<string, number> = { very_low: 0, low: 0, medium: 0, high: 0, very_high: 0 };
    for (const r of results) riskDistribution[r.riskLevel]!++;

    const criticalNodes = results.filter((r) => r.riskLevel === 'high' || r.riskLevel === 'very_high');

    // Índice de completude: penaliza nós sem causa/consequência documentadas
    // (proxy para completude do HAZOP worksheet)
    const nodesWithFullDoc = nodes.filter(
        (n) => n.cause && n.cause.length > 5 && n.consequence && n.consequence.length > 5,
    );
    const completenessIndex = (nodesWithFullDoc.length / nodes.length) * 100;

    const summary = [
        `PHA Study: "${studyTitle}"`,
        `Total nodes analyzed: ${results.length}`,
        `Critical/High risk nodes: ${criticalNodes.length}`,
        `Completeness index: ${completenessIndex.toFixed(1)}%`,
        criticalNodes.length > 0
            ? `ACTION REQUIRED: ${criticalNodes.length} node(s) at HIGH or VERY HIGH risk demand immediate safeguard implementation.`
            : 'No critical nodes identified. Continue monitoring and update study periodically.',
    ].join(' | ');

    return {
        studyTitle,
        totalNodes: results.length,
        results,
        criticalNodes,
        riskDistribution,
        completenessIndex,
        summary,
    };
}

/**
 * Calculate PHA completeness index for a partial study.
 *
 * Calcula índice de completude (0–100%) com base nos campos preenchidos por nó.
 * Útil para acompanhamento progressivo de estudos em andamento.
 *
 * @param {Array<Record<string, any>>} nodes     - Array de nós (podem estar parcialmente preenchidos)
 * @param {string[]} [requiredFields=['nodeId','parameter','guideWord','cause','consequence','severity','probability']]
 * @returns {{ completenessIndex: number, filledPerNode: number[], meanFieldsPerNode: number }}
 * @throws {TypeError} se nodes não for array
 */
export function calculatePHACompleteness(
    nodes: Array<Record<string, any>>,
    requiredFields = ['nodeId', 'parameter', 'guideWord', 'cause', 'consequence', 'severity', 'probability'],
): { completenessIndex: number; filledPerNode: number[]; meanFieldsPerNode: number } {
    if (!Array.isArray(nodes)) throw new TypeError('nodes must be an array');
    if (nodes.length === 0) return { completenessIndex: 0, filledPerNode: [], meanFieldsPerNode: 0 };

    const filledPerNode = nodes.map((n) => {
        let filled = 0;
        for (const f of requiredFields) {
            const v = n[f];
            if (v !== undefined && v !== null && v !== '') filled++;
        }
        return (filled / requiredFields.length) * 100;
    });

    const mean = filledPerNode.reduce((a, b) => a + b, 0) / filledPerNode.length;
    const meanFieldsPerNode = (mean / 100) * requiredFields.length;

    return { completenessIndex: mean, filledPerNode, meanFieldsPerNode };
}

/**
 * Build a risk matrix summary table from PHA results.
 *
 * Monta tabela cruzada severidade × probabilidade com contagem de nós.
 * Útil para visualização e documentação do estudo.
 *
 * @param {Array<Record<string, any>>} phaResults - Array de resultados de evaluateHazopNode
 * @returns {{ matrix: number[][], severityAxis: number[], probabilityAxis: number[] }}
 *   matrix[p-1][s-1] = count of nodes at that (probability, severity) cell
 * @throws {TypeError} se phaResults não for array
 */
export function buildRiskMatrixSummary(phaResults: Array<Record<string, any>>): {
    matrix: number[][];
    severityAxis: number[];
    probabilityAxis: number[];
} {
    if (!Array.isArray(phaResults)) throw new TypeError('phaResults must be an array');
    // Matriz 5×5 (probabilidade 1–5 × severidade 1–5)
    const matrix = Array.from({ length: 5 }, () => Array(5).fill(0));

    for (const r of phaResults) {
        // Reconstruir probabilidade original a partir do riskScore e severity
        // Nota: riskScore = severity * effectiveProbability - aproximação para display
        const sev = Object.keys(SEVERITY_LABELS).find((k) => SEVERITY_LABELS[Number(k)] === r.severityLabel);
        const prob = Object.keys(PROBABILITY_LABELS).find((k) => PROBABILITY_LABELS[Number(k)] === r.probabilityLabel);
        if (sev && prob) {
            matrix[parseInt(prob) - 1]![parseInt(sev) - 1]++;
        }
    }

    return {
        matrix,
        severityAxis: [1, 2, 3, 4, 5],
        probabilityAxis: [1, 2, 3, 4, 5],
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialProcessSafetyPHAMeta: AnalyticsModuleMeta = {
    name: 'industrialProcessSafetyPHA',
    description: 'industrialProcessSafetyPHA',
    category: 'analytics',
    familyTags: ['industrial', 'risk'],
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
