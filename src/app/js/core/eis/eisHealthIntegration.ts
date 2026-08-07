// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Occupational Health ↔ EIS Integration Bridge (HEALTH-MON-001)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   EIS Health Integration — HEALTH-MON-001 ↔ EIS Bridge

   Traduz dados de saúde ocupacional (HEALTH-MON-001) em scores do
   eixo EIS "Segurança Ocupacional", conectando os dois módulos sem
   acoplamento direto.

   HEALTH-MON-001 fornece:
   - HI (Hazard Index) por agente e agregado
   - Status de compliance BEI por trabalhador (green/yellow/red/critical)

   Este módulo traduz esses dados em:
   - Score do eixo occupational_safety (1–5)
   - Template EIS compatível com customScoreBuilder
   - Interpretação de HI em níveis de ação (safe/monitoring/action/critical)
   - Assessment de compliance para integração em template EIS

   Pure — sem IDB, sem DOM, sem Three.js. Importável no Node.js runner.

   PUBLIC API:
   - HEALTH_EIS_AXIS_ID                 constante do eixo ('occupational_safety')
   - createHealthAxisTemplate()         template EIS com eixo de saúde
   - computeHealthAxisScore()           score 1–5 a partir de HI + compliance
   - mapHiToEisInterpretation()         HI → nível de ação + recomendação PT
   - assessHealthCompliance()           workers → taxa de compliance + críticos
   - integrateHealthIntoEisTemplate()   injeta eixo de saúde em template existente
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// CONSTANTES PÚBLICAS
// ──────────────────────────────────────────────────────────────────────

/**
 * Identificador canônico do eixo de saúde ocupacional no sistema EIS.
 */
export const HEALTH_EIS_AXIS_ID = 'occupational_safety';

// ──────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ──────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} HealthAxisTemplateOptions
 * @property {string} [ownerId]
 * @property {'user'|'org'} [ownerType]
 *
 * @typedef {Object} HealthScoreInput
 * @property {number} hi
 * @property {number} complianceRate
 * @property {number} [incidentRate]
 *
 * @typedef {Object} HealthScoreComponents
 * @property {number} hiPenalty
 * @property {number} complianceFactor
 * @property {number} incidentPenalty
 *
 * @typedef {'A'|'B'|'C'|'D'} HealthGrade
 *
 * @typedef {Object} HealthScoreResult
 * @property {number} score
 * @property {'A'|'B'|'C'|'D'} grade
 * @property {Readonly<HealthScoreComponents>} components
 * @property {Readonly<Required<HealthScoreInput>>} inputs
 *
 * @typedef {'safe'|'monitoring'|'action'|'critical'} HiLevel
 *
 * @typedef {Object} HiInterpretation
 * @property {number} hi
 * @property {HiLevel} level
 * @property {string} recommendation
 *
 * @typedef {Object} Worker
 * @property {string} id
 * @property {number} hi
 * @property {string} status
 *
 * @typedef {Object} ComplianceSummary
 * @property {number} n
 * @property {number} nCompliant
 * @property {number} nWarning
 * @property {number} nCritical
 * @property {number} complianceRate
 *
 * @typedef {Object} ComplianceResult
 * @property {number} complianceRate
 * @property {ReadonlyArray<Readonly<Worker>>} criticalWorkers
 * @property {Readonly<ComplianceSummary>} summary
 */

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function _clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * @param {number} value
 * @returns {number}
 */
function _round1(value: number): number {
    return Math.round(value * 10) / 10;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function _asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
        return Object.fromEntries([]);
    }
    return Object.fromEntries(Object.entries(value));
}

// ──────────────────────────────────────────────────────────────────────
// 1. createHealthAxisTemplate
// ──────────────────────────────────────────────────────────────────────

/**
 * Cria um template EIS com eixo único de saúde ocupacional.
 * @param {HealthAxisTemplateOptions} [options]
 * @returns {Readonly<Record<string, unknown>>}
 */
export function createHealthAxisTemplate(
    { ownerId, ownerType }: HealthAxisTemplateOptions = {},
): Readonly<Record<string, unknown>> {
    const template = Object.freeze({
        id: 'health-safety-axis-v1',
        name: 'Segurança Ocupacional — Eixo HEALTH-MON-001',
        based_on: 'default',
        owner_id: ownerId || 'ecbt-system',
        owner_type: ownerType || 'org',
        status: 'draft',
        version: 1,
        axes: Object.freeze([
            Object.freeze({
                key: HEALTH_EIS_AXIS_ID,
                enabled: true,
                weight: 2,
                label: 'Segurança Ocupacional',
                scale: Object.freeze({ min: 1, max: 5 }),
            }),
        ]),
        veto: Object.freeze({
            enabled: true,
            // threshold=0: qualquer score 0 (mapeado de HI crítico) provoca veto
            threshold: 0,
            rules: Object.freeze([
                Object.freeze({
                    axis: HEALTH_EIS_AXIS_ID,
                    op: '<=' as const,
                    value: 0,
                    action: 'zero' as const,
                    description: 'HI crítico (≥2.0) — afastamento obrigatório',
                }),
            ]),
        }),
        verdictThresholds: Object.freeze({ green: 4.5, yellow: 3.5, red: 0 }),
    });
    return template;
}

// ──────────────────────────────────────────────────────────────────────
// 2. computeHealthAxisScore
// ──────────────────────────────────────────────────────────────────────

type HealthGrade = 'A' | 'B' | 'C' | 'D';

interface HealthAxisTemplateOptions {
    ownerId?: string;
    ownerType?: 'user' | 'org';
}

interface HealthScoreInput {
    hi: number;
    complianceRate: number;
    incidentRate?: number;
}

interface HealthScoreComponents {
    hiPenalty: number;
    complianceFactor: number;
    incidentPenalty: number;
}

interface HealthScoreResult {
    score: number;
    grade: HealthGrade;
    components: Readonly<HealthScoreComponents>;
    inputs: Readonly<Required<HealthScoreInput>>;
}

/**
 * Calcula o score do eixo de saúde ocupacional na escala EIS (1–5).
 * @param {HealthScoreInput} input
 * @returns {HealthScoreResult}
 */
export function computeHealthAxisScore({ hi, complianceRate, incidentRate = 0 }: HealthScoreInput): HealthScoreResult {
    if (typeof hi !== 'number' || !Number.isFinite(hi) || hi < 0) {
        throw new TypeError(`[EIS Health] hi deve ser número ≥ 0. Recebido: ${hi}`);
    }
    if (
        typeof complianceRate !== 'number' ||
        !Number.isFinite(complianceRate) ||
        complianceRate < 0 ||
        complianceRate > 1
    ) {
        throw new TypeError(`[EIS Health] complianceRate deve ser número em [0,1]. Recebido: ${complianceRate}`);
    }
    if (typeof incidentRate !== 'number' || !Number.isFinite(incidentRate) || incidentRate < 0) {
        throw new TypeError(`[EIS Health] incidentRate deve ser número ≥ 0. Recebido: ${incidentRate}`);
    }

    // Penalidade de HI: aplicada apenas acima de 0.5 (limiar de monitoramento)
    const hiPenalty = hi > 0.5 ? Math.min(4.5, (hi - 0.5) * 2.0) : 0;

    // Aplicar penalidade de HI, garantindo floor 0.5 antes de compliance
    const afterHI = Math.max(0.5, 5.0 - hiPenalty);

    // Multiplicar por taxa de compliance (não-compliance reduz o score)
    const afterCompliance = afterHI * complianceRate;

    // Penalidade de incidentes: cada 1 incidente/100 trabalhadores/ano reduz 0.05, cap 1.0
    const incidentPenalty = Math.min(1.0, incidentRate * 0.05);

    // Score final: clamp em [1, 5] com 1 decimal
    const raw = afterCompliance - incidentPenalty;
    const score = _round1(_clamp(raw, 1.0, 5.0));

    // Classificação em graus (A/B/C/D)
    /** @type {HealthGrade} */
    let grade: HealthGrade;
    if (score >= 4.5) grade = 'A';
    else if (score >= 3.5) grade = 'B';
    else if (score >= 2.5) grade = 'C';
    else grade = 'D';

    return Object.freeze({
        score,
        grade,
        components: Object.freeze({
            hiPenalty: _round1(hiPenalty),
            complianceFactor: complianceRate,
            incidentPenalty: _round1(incidentPenalty),
        }),
        inputs: Object.freeze({
            hi,
            complianceRate,
            incidentRate,
        }),
    });
}

// ──────────────────────────────────────────────────────────────────────
// 3. mapHiToEisInterpretation
// ──────────────────────────────────────────────────────────────────────

type HiLevel = 'safe' | 'monitoring' | 'action' | 'critical';

interface HiInterpretation {
    hi: number;
    level: HiLevel;
    recommendation: string;
}

/**
 * Mapeia um HI agregado para nível de ação e recomendação em português.
 * @param {number} hi
 * @returns {HiInterpretation}
 */
export function mapHiToEisInterpretation(hi: number): HiInterpretation {
    if (typeof hi !== 'number' || !Number.isFinite(hi) || hi < 0) {
        throw new TypeError(`[EIS Health] hi deve ser número ≥ 0. Recebido: ${hi}`);
    }

    /** @type {HiLevel} */
    let level: HiLevel;
    let recommendation: string;

    if (hi < 0.5) {
        level = 'safe';
        recommendation = 'Nenhuma ação necessária. Exposição dentro dos padrões.';
    } else if (hi < 1.0) {
        level = 'monitoring';
        recommendation = 'Monitoramento periódico recomendado. BEI próximo ao limiar.';
    } else if (hi < 2.0) {
        level = 'action';
        recommendation = 'Ação corretiva necessária. BEI excedido — revisar EPI e jornada.';
    } else {
        level = 'critical';
        recommendation = 'CRÍTICO: Afastamento imediato. Investigação obrigatória NR-7/NR-15.';
    }

    return Object.freeze({ hi, level, recommendation });
}

// ──────────────────────────────────────────────────────────────────────
// 4. assessHealthCompliance
// ──────────────────────────────────────────────────────────────────────

interface Worker {
    id: string;
    hi: number;
    status: string;
}

interface ComplianceResult {
    complianceRate: number;
    criticalWorkers: ReadonlyArray<Readonly<Worker>>;
    summary: Readonly<ComplianceSummary>;
}

interface ComplianceSummary {
    n: number;
    nCompliant: number;
    nWarning: number;
    nCritical: number;
    complianceRate: number;
}

/**
 * Avalia compliance BEI de um grupo de trabalhadores.
 * @param {{ workers: Worker[] }} input
 * @returns {ComplianceResult}
 */
export function assessHealthCompliance({ workers }: { workers: Worker[] }): ComplianceResult {
    if (!Array.isArray(workers)) {
        throw new TypeError(`[EIS Health] workers deve ser array. Recebido: ${typeof workers}`);
    }

    const n = workers.length;

    // Array vazio: sem dados de exposição → compliance plena por default defensivo
    if (n === 0) {
        return Object.freeze({
            complianceRate: 1.0,
            criticalWorkers: Object.freeze([]),
            summary: Object.freeze({
                n: 0,
                nCompliant: 0,
                nWarning: 0,
                nCritical: 0,
                complianceRate: 1.0,
            }),
        });
    }

    let nCompliant = 0;
    let nWarning = 0;
    let nCritical = 0;
    const criticalWorkers: Readonly<Worker>[] = [];

    for (const worker of workers) {
        const status = worker.status;
        if (status === 'green') {
            nCompliant++;
        } else if (status === 'yellow') {
            nWarning++;
            // yellow é conformidade (monitoramento), não crítico
        } else if (status === 'red' || status === 'critical') {
            nCritical++;
            criticalWorkers.push(Object.freeze({ ...worker }));
        }
    }

    // Compliance = trabalhadores green + yellow (monitoramento dentro dos padrões)
    const nInCompliance = nCompliant + nWarning;
    const complianceRate = n > 0 ? nInCompliance / n : 1.0;

    return Object.freeze({
        complianceRate: parseFloat(complianceRate.toFixed(4)),
        criticalWorkers: Object.freeze(criticalWorkers),
        summary: Object.freeze({
            n,
            nCompliant,
            nWarning,
            nCritical,
            complianceRate: parseFloat(complianceRate.toFixed(4)),
        }),
    });
}

// ──────────────────────────────────────────────────────────────────────
// 5. integrateHealthIntoEisTemplate
// ──────────────────────────────────────────────────────────────────────

/**
 * Integra o eixo de saúde ocupacional em um template EIS existente.
 * @param {Record<string, unknown>} baseTemplate
 * @param {number} unknown>
 * @returns {Readonly<Record<string, unknown>>}
 */
export function integrateHealthIntoEisTemplate(baseTemplate: Record<string, unknown>, healthAxisScore: number): Readonly<Record<string, unknown>> {
    if (typeof healthAxisScore !== 'number' || !Number.isFinite(healthAxisScore)) {
        throw new TypeError(`[EIS Health] healthAxisScore deve ser número em [1,5]. Recebido: ${healthAxisScore}`);
    }
    if (healthAxisScore < 1 || healthAxisScore > 5) {
        throw new TypeError(`[EIS Health] healthAxisScore fora do intervalo [1,5]. Recebido: ${healthAxisScore}`);
    }
    if (!baseTemplate || typeof baseTemplate !== 'object') {
        throw new TypeError('[EIS Health] baseTemplate deve ser objeto de template EIS válido.');
    }

    // Clonar eixos existentes excluindo occupational_safety (se já existir)
    /** @type {Array<Record<string, unknown>>} */
    const existingAxes = Array.isArray(baseTemplate.axes) ? (baseTemplate.axes as Array<Record<string, unknown>>) : [];
    const filteredAxes = existingAxes.filter((ax) => ax.key !== HEALTH_EIS_AXIS_ID);

    // Novo eixo de saúde com o score fornecido
    const healthAxis = Object.freeze({
        key: HEALTH_EIS_AXIS_ID,
        enabled: true,
        weight: 2,
        label: 'Segurança Ocupacional',
        score: healthAxisScore,
        scale: Object.freeze({ min: 1, max: 5 }),
    });

    // Construir novo template (cópia profunda do base + eixo integrado)
    const newAxes = Object.freeze([
        ...filteredAxes.map((ax) => Object.freeze({ ...ax })),
        healthAxis,
    ]);

    // Clonar veto rules existentes preservando as regras do base
    const baseVeto = _asRecord(baseTemplate.veto);
    /** @type {Array<Record<string, unknown>>} */
    const baseVetoRules = Array.isArray(baseVeto.rules) ? (baseVeto.rules as Array<Record<string, unknown>>) : [];

    // Adicionar regra de veto para o eixo de saúde se não existir
    const hasHealthVetoRule = baseVetoRules.some((r) => r.axis === HEALTH_EIS_AXIS_ID);
    const newVetoRules = hasHealthVetoRule
        ? baseVetoRules.map((r) => Object.freeze({ ...r }))
        : [
              ...baseVetoRules.map((r) => Object.freeze({ ...r })),
              Object.freeze({
                  axis: HEALTH_EIS_AXIS_ID,
                  op: '<=' as const,
                  value: 0,
                  action: 'zero' as const,
                  description: 'HI crítico — afastamento obrigatório',
              }),
          ];
    const baseVersion = typeof baseTemplate.version === 'number' && Number.isFinite(baseTemplate.version)
        ? baseTemplate.version
        : 1;

    return Object.freeze({
        ...baseTemplate,
        axes: newAxes,
        veto: Object.freeze({
            ...baseVeto,
            rules: Object.freeze(newVetoRules),
        }),
        // Incrementar versão para rastrear integração
        version: baseVersion + 1,
        _healthIntegrated: true,
        _healthAxisScore: healthAxisScore,
    });
}
