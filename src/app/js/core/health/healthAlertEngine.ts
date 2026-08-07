// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEALTH-MON-001 Phase 1 — Alert Engine: classificação de níveis,
   correlação de Pearson, sumário por trabalhador.

   Referências:
     - ACGIH BEI 2024 Technical Reference (ISBN 978-1-607260-94-5)
     - Pearson (1895) "Notes on regression and inheritance"
       doi:10.1098/rspl.1895.0041

   Lógica pura — sem DOM, sem IDB, sem rede.
   Coberto por tests/health-alert-engine.test.mjs (~40 testes).
   ================================================================ */

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

/** Janela de alinhamento temporal (ms) para correlação ambiental/biométrica. */
const ALIGNMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

/** Pares mínimos para cálculo de correlação de Pearson. */
const MIN_CORRELATION_PAIRS = 3;

// ----------------------------------------------------------------
// classifyAlertLevel
// ----------------------------------------------------------------

/**
 * Classifica o nível de alerta para uma leitura em relação a uma regra de threshold.
 *
 * Lógica:
 *   value < warningValue                       → 'safe'
 *   warningValue ≤ value < criticalValue       → 'warning'
 *   criticalValue ≤ value < actionValue        → 'critical'
 *   value ≥ actionValue                        → 'action'
 *
 * Referência: ACGIH BEI 2024 §3.2 Action Level Hierarchy
 *
 * @param value - Valor medido (mesma unidade que a regra)
 * @param rule
 * @returns
 * @throws {TypeError} se value não for número finito ou rule for inválida
 */
export function classifyAlertLevel(
    value: number,
    rule: { warningValue: number; criticalValue: number; actionValue: number },
): 'safe' | 'warning' | 'critical' | 'action' {
    if (typeof value !== 'number' || !isFinite(value)) {
        throw new TypeError('classifyAlertLevel: value must be a finite number');
    }
    if (!rule || typeof rule !== 'object') {
        throw new TypeError('classifyAlertLevel: rule is required');
    }
    const { warningValue, criticalValue, actionValue } = rule;
    if (typeof warningValue !== 'number' || typeof criticalValue !== 'number' || typeof actionValue !== 'number') {
        throw new TypeError('classifyAlertLevel: rule must have numeric warningValue, criticalValue, actionValue');
    }

    if (value >= actionValue) return 'action';
    if (value >= criticalValue) return 'critical';
    if (value >= warningValue) return 'warning';
    return 'safe';
}

// ----------------------------------------------------------------
// evaluateReading
// ----------------------------------------------------------------

/**
 * Avalia uma leitura de biomarcador contra um conjunto de regras.
 * Encontra a regra pelo biomarkerId e retorna o resultado classificado.
 *
 * @param reading
 * @param rules
 * @returns Resultado classificado ou null se não houver regra correspondente
 */
export function evaluateReading(
    reading: { id: string; workerId: string; biomarkerId: string; value: number; unit: string; timestamp: number },
    rules: Array<{
        id?: string;
        biomarkerId: string;
        warningValue: number;
        criticalValue: number;
        actionValue: number;
        unit: string;
    }>,
): Readonly<{
    level: string;
    readingId: any;
    workerId: any;
    biomarkerId: any;
    value: any;
    unit: any;
    ruleId: any;
    timestamp: any;
    [k: string]: any;
}> | null {
    if (!reading || !Array.isArray(rules)) return null;

    const rule = rules.find((r) => r && r.biomarkerId === reading.biomarkerId);
    if (!rule) return null;

    const level = classifyAlertLevel(reading.value, rule);

    return Object.freeze({
        readingId: reading.id || null,
        workerId: reading.workerId || null,
        biomarkerId: reading.biomarkerId,
        value: reading.value,
        unit: reading.unit || null,
        level,
        ruleId: rule.id || null,
        timestamp: reading.timestamp || null,
    });
}

// ----------------------------------------------------------------
// batchEvaluateReadings
// ----------------------------------------------------------------

/**
 * Avalia um lote de leituras contra um conjunto de regras.
 * Leituras sem regra correspondente são ignoradas (não contam em flagged).
 *
 * @param readings - Array de leituras de biomarcadores
 * @param rules    - Array de regras de threshold
 * @returns
 */
export function batchEvaluateReadings(
    readings: any[],
    rules: any[],
): Readonly<{
    alerts: ReadonlyArray<any>;
    passed: number;
    flagged: number;
    total: number;
    byLevel: Readonly<Record<string, number>>;
}> {
    if (!Array.isArray(readings)) readings = [];
    if (!Array.isArray(rules)) rules = [];

    const alerts: any[] = [];
    let passed = 0;
    const byLevel: Record<string, number> = { warning: 0, critical: 0, action: 0 };

    for (const reading of readings) {
        const result = evaluateReading(reading, rules);
        if (result === null) continue; // sem regra correspondente

        if (result.level === 'safe') {
            passed += 1;
        } else {
            alerts.push(result);
            byLevel[result.level] = (byLevel[result.level] || 0) + 1;
        }
    }

    const flagged = alerts.length;
    const total = passed + flagged;

    return Object.freeze({
        alerts: Object.freeze(alerts),
        passed,
        flagged,
        total,
        byLevel: Object.freeze(byLevel),
    });
}

// ----------------------------------------------------------------
// computePearsonCorrelation
// ----------------------------------------------------------------

/**
 * Calcula o coeficiente de correlação de Pearson entre duas séries numéricas.
 *
 * Referência: Pearson (1895) doi:10.1098/rspl.1895.0041
 *
 * @param xSeries - Série X (mesmo comprimento que ySeries, ≥ 2)
 * @param ySeries - Série Y
 * @returns
 * @throws {RangeError} se as séries tiverem comprimentos diferentes ou n < 2
 */
export function computePearsonCorrelation(
    xSeries: number[],
    ySeries: number[],
): Readonly<{ r: number; n: number; interpretation: string }> {
    if (!Array.isArray(xSeries) || !Array.isArray(ySeries)) {
        throw new RangeError('computePearsonCorrelation: both series must be arrays');
    }
    const n = xSeries.length;
    if (n !== ySeries.length) {
        throw new RangeError('computePearsonCorrelation: series must have the same length');
    }
    if (n < 2) {
        throw new RangeError('computePearsonCorrelation: series must have at least 2 elements');
    }

    const meanX = xSeries.reduce((s, v) => s + v, 0) / n;
    const meanY = ySeries.reduce((s, v) => s + v, 0) / n;

    let sumXY = 0,
        sumX2 = 0,
        sumY2 = 0;
    for (let i = 0; i < n; i++) {
        const dx = xSeries[i]! - meanX;
        const dy = ySeries[i]! - meanY;
        sumXY += dx * dy;
        sumX2 += dx * dx;
        sumY2 += dy * dy;
    }

    // Caso de variância zero em qualquer série → r=0 (sem correlação definida)
    if (sumX2 === 0 || sumY2 === 0) {
        return Object.freeze({ r: 0, n, interpretation: 'weak' });
    }

    const r = sumXY / Math.sqrt(sumX2 * sumY2);
    // Clamp para [-1, 1] por precisão de ponto flutuante
    const rClamped = Math.max(-1, Math.min(1, r));

    return Object.freeze({ r: rClamped, n, interpretation: _interpretPearson(rClamped) });
}

/**
 * Interpreta o coeficiente de correlação de Pearson.
 * @param r
 * @returns
 */
function _interpretPearson(r: number): string {
    if (r >= 0.7) return 'strong_positive';
    if (r >= 0.4) return 'moderate_positive';
    if (r <= -0.7) return 'strong_negative';
    if (r <= -0.4) return 'moderate_negative';
    return 'weak';
}

// ----------------------------------------------------------------
// computeExposureBiometricCorrelation
// ----------------------------------------------------------------

/**
 * Correlaciona séries temporais de exposição ambiental e biomarcadores.
 * Alinha por proximidade temporal (janela de 7 dias).
 *
 * @param envTimeSeries
 * @param bioTimeSeries
 * @returns
 */
export function computeExposureBiometricCorrelation(
    envTimeSeries: Array<{ timestamp: number | string | Date; value: number }>,
    bioTimeSeries: Array<{ timestamp: number | string | Date; value: number }>,
): Readonly<{ r: number | null; alignedPairs: number; interpretation: string; trend: string | null }> {
    if (!Array.isArray(envTimeSeries) || !Array.isArray(bioTimeSeries)) {
        return Object.freeze({ r: null, alignedPairs: 0, interpretation: 'insufficient_data', trend: null });
    }

    // Converter timestamps para ms
    const envNorm = envTimeSeries.map((p) => ({ ts: _toMs(p.timestamp), value: p.value }));

    // Para cada ponto bio, encontrar o ponto env mais próximo na janela de 7d
    const xVals: number[] = [],
        yVals: number[] = [];
    for (const bio of bioTimeSeries) {
        const bioTs = _toMs(bio.timestamp);
        let best: { ts: number; value: number } | null = null,
            bestDiff = Infinity;
        for (const env of envNorm) {
            const diff = Math.abs(env.ts - bioTs);
            if (diff <= ALIGNMENT_WINDOW_MS && diff < bestDiff) {
                best = env;
                bestDiff = diff;
            }
        }
        if (best !== null) {
            xVals.push(best.value);
            yVals.push(bio.value);
        }
    }

    const alignedPairs = xVals.length;
    if (alignedPairs < MIN_CORRELATION_PAIRS) {
        return Object.freeze({ r: null, alignedPairs, interpretation: 'insufficient_data', trend: null });
    }

    const { r, interpretation } = computePearsonCorrelation(xVals, yVals);

    // Tendência temporal baseada na direção da série bio ordenada
    const trend = _computeTrend(yVals);

    return Object.freeze({ r, alignedPairs, interpretation, trend });
}

/**
 * Converte um timestamp para milissegundos.
 * @param ts
 * @returns
 */
function _toMs(ts: number | string | Date): number {
    if (typeof ts === 'number') return ts;
    if (ts instanceof Date) return ts.getTime();
    return new Date(ts).getTime();
}

/**
 * Determina tendência temporal de uma série de valores.
 * @param values
 * @returns
 */
function _computeTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';
    // Regressão linear simples - sinal do slope determina tendência
    const n = values.length;
    const meanX = (n - 1) / 2;
    const meanY = values.reduce((s, v) => s + v, 0) / n;
    let num = 0,
        den = 0;
    for (let i = 0; i < n; i++) {
        num += (i - meanX) * (values[i]! - meanY);
        den += (i - meanX) * (i - meanX);
    }
    if (den === 0) return 'stable';
    const slope = num / den;
    if (slope > 0.001) return 'increasing';
    if (slope < -0.001) return 'decreasing';
    return 'stable';
}

// ----------------------------------------------------------------
// computeDaysSinceLastExam
// ----------------------------------------------------------------

/**
 * Calcula os dias desde o último exame de um trabalhador para um biomarcador específico.
 *
 * @param readings - Array de leituras de biomarcadores
 * @param workerId   - ID do trabalhador
 * @param biomarkerId - ID do biomarcador
 * @returns
 */
export function computeDaysSinceLastExam(
    readings: any[],
    workerId: string,
    biomarkerId: string,
): Readonly<{ days: number; lastTimestamp: number | null; workerId: string; biomarkerId: string }> {
    if (!Array.isArray(readings)) {
        return Object.freeze({ days: Infinity, lastTimestamp: null, workerId, biomarkerId });
    }

    const matching = readings.filter(
        (r) => r && r.workerId === workerId && r.biomarkerId === biomarkerId && r.timestamp != null,
    );

    if (matching.length === 0) {
        return Object.freeze({ days: Infinity, lastTimestamp: null, workerId, biomarkerId });
    }

    // Encontrar leitura mais recente
    const mostRecent = matching.reduce((best, r) => {
        const ts = _toMs(r.timestamp);
        return ts > _toMs(best.timestamp) ? r : best;
    }, matching[0]);

    const lastTs = _toMs(mostRecent.timestamp);
    const nowMs = Date.now();
    const days = Math.floor((nowMs - lastTs) / (24 * 60 * 60 * 1000));

    return Object.freeze({ days, lastTimestamp: lastTs, workerId, biomarkerId });
}

// ----------------------------------------------------------------
// generateWorkerHealthSummary
// ----------------------------------------------------------------

/**
 * Gera um sumário de saúde para um trabalhador específico.
 * complianceRate = (passed + warnings) / total - warnings são conformes;
 * critical + action são não-conformes.
 *
 * @param workerId    - ID do trabalhador
 * @param readings  - Todas as leituras (filtradas por workerId internamente)
 * @param rules     - Regras de threshold
 * @returns
 */
export function generateWorkerHealthSummary(
    workerId: string,
    readings: any[],
    rules: any[],
): Readonly<{
    workerId: string;
    totalReadings: number;
    alertCount: number;
    highestLevel: string;
    alerts: ReadonlyArray<any>;
    lastReadingTimestamp: number | null;
    complianceRate: number;
}> {
    if (!Array.isArray(readings)) readings = [];
    if (!Array.isArray(rules)) rules = [];

    // Filtrar leituras do trabalhador
    const workerReadings = readings.filter((r) => r && r.workerId === workerId);

    if (workerReadings.length === 0) {
        return Object.freeze({
            workerId,
            totalReadings: 0,
            alertCount: 0,
            highestLevel: 'safe',
            alerts: Object.freeze([]),
            lastReadingTimestamp: null,
            complianceRate: 1,
        });
    }

    const batch = batchEvaluateReadings(workerReadings, rules);

    // Determinar nível mais alto
    const LEVEL_ORDER = ['safe', 'warning', 'critical', 'action'];
    let highestLevel = 'safe';
    for (const alert of batch.alerts) {
        if (LEVEL_ORDER.indexOf(alert.level) > LEVEL_ORDER.indexOf(highestLevel)) {
            highestLevel = alert.level;
        }
    }

    // Última leitura com timestamp
    const withTs = workerReadings.filter((r) => r.timestamp != null);
    let lastReadingTimestamp: number | null = null;
    if (withTs.length > 0) {
        lastReadingTimestamp = withTs.reduce((best, r) => {
            const ts = _toMs(r.timestamp);
            return ts > best ? ts : best;
        }, -Infinity);
        if (!isFinite(lastReadingTimestamp as number)) lastReadingTimestamp = null;
    }

    // complianceRate: passed + warning são conformes; critical + action não são
    const nonCompliant = batch.byLevel.critical! + batch.byLevel.action!;
    const complianceRate = batch.total > 0 ? (batch.total - nonCompliant) / batch.total : 1;

    return Object.freeze({
        workerId,
        totalReadings: batch.total,
        alertCount: batch.flagged,
        highestLevel,
        alerts: batch.alerts,
        lastReadingTimestamp,
        complianceRate: Number(complianceRate.toFixed(4)),
    });
}
