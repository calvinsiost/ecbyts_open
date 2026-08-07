// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
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
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Temporal Trend Alerts — Pure-logic, no DOM, no IDB, no Three.js
 *
 * Detecta tendências significativas em séries temporais de sensores e
 * classifica a severidade do alerta de forma não-compensatória.
 *
 * Reuso obrigatório (NÃO reimplementar): a matemática estatística vem de
 * `temporalTrends.js` (Mann-Kendall + Theil-Sen, proveniência acadêmica
 * documentada em ADR-005 / core/analytics/ADR.md).
 *
 * @module core/analytics/temporalTrendAlerts
 */

import { computeMannKendallTrend, computeTheilSenSlope } from './temporalTrends.js';
import { eventBus } from './eventBus.js';
import { createLogger } from '../../utils/helpers/logger.js';

const log = createLogger('TrendAlerts');

/** Evento emitido quando um alerta de tendência é gerado. */
export const TREND_ALERT_EVENT = 'analytics:trend:alert';

/**
 * Limiares padrão de severidade (relativos à média absoluta da série).
 * Não-compensatório: avaliados em ordem, o primeiro que casar vence.
 * @readonly
 */
export const DEFAULT_THRESHOLDS = Object.freeze({
    minN: 4, // mínimo Mann-Kendall (RangeError abaixo disto)
    warnPct: 0.02, // |slope/mean| ≥ 2% por leitura → warning
    criticalPct: 0.1, // |slope/mean| ≥ 10% por leitura → critical
});

/**
 * Calcula a média dos valores absolutos (escala de referência para slopePct).
 * @param values
 */
function meanAbs(values: number[]): number {
    if (values.length === 0) return 0;
    let sum = 0;
    for (const v of values) sum += Math.abs(v);
    return sum / values.length;
}

/**
 * Classifica a severidade do alerta a partir do resultado MK + slope relativo.
 * Regra não-compensatória (a primeira condição satisfeita determina o nível).
 *
 * @param trend - 'increasing'|'decreasing'|'no_trend'
 * @param slopePct - slope Theil-Sen normalizado pela média absoluta
 * @param thr
 */
export function classifySeverity(
    trend: string,
    slopePct: number,
    thr: { warnPct: number; criticalPct: number },
): 'info' | 'warning' | 'critical' {
    if (trend === 'no_trend') return 'info';
    const mag = Math.abs(slopePct);
    if (mag >= thr.criticalPct) return 'critical';
    if (mag >= thr.warnPct) return 'warning';
    return 'info';
}

/**
 * Constrói uma mensagem legível e determinística para o alerta.
 * @param parameterId
 * @param trend
 * @param severity
 * @param slope
 */
function buildMessage(parameterId: string, trend: string, severity: string, slope: number): string {
    const dir = trend === 'increasing' ? 'rising' : trend === 'decreasing' ? 'falling' : 'stable';
    return `${parameterId}: ${dir} trend (${severity}), slope=${slope.toFixed(4)}/reading`;
}

export interface TrendAlert {
    parameterId: string;
    /** increasing|decreasing|no_trend|insufficient_data */
    trend: string;
    severity: 'info' | 'warning' | 'critical';
    /** Theil-Sen slope (change per reading) */
    slope: number;
    /** slope normalizado pela média absoluta */
    slopePct: number;
    /** número de observações usadas */
    n: number;
    /** bracket de p-value (ex: 'p < 0.050') */
    pValueApprox: string;
    message: string;
}

/**
 * Analisa a tendência de UMA série numérica e retorna o alerta classificado.
 *
 * @param values - valores em ordem cronológica
 * @param opts
 */
export function analyzeReadingTrend(
    values: number[],
    opts: { parameterId?: string | undefined; thresholds?: Partial<typeof DEFAULT_THRESHOLDS> | undefined } = {},
): Readonly<TrendAlert> {
    const parameterId = opts.parameterId || 'value';
    const thr = { ...DEFAULT_THRESHOLDS, ...(opts.thresholds || {}) };
    const series = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : [];

    if (series.length < thr.minN) {
        return Object.freeze({
            parameterId,
            trend: 'insufficient_data',
            severity: 'info',
            slope: NaN,
            slopePct: NaN,
            n: series.length,
            pValueApprox: 'p > 0.10',
            message: `${parameterId}: insufficient data (n=${series.length})`,
        });
    }

    const mk = computeMannKendallTrend(series);
    const ts = computeTheilSenSlope(series);
    const scale = meanAbs(series);
    const slopePct = scale > 0 ? ts.slope / scale : 0;
    const severity = classifySeverity(mk.trend, slopePct, thr);

    return Object.freeze({
        parameterId,
        trend: mk.trend,
        severity,
        slope: ts.slope,
        slopePct,
        n: mk.n,
        pValueApprox: mk.pValueApprox,
        message: buildMessage(parameterId, mk.trend, severity, ts.slope),
    });
}

/**
 * Agrupa leituras `latestReadings` por parameterId mantendo ordem cronológica.
 * @param readings
 */
function groupByParameter(readings: Array<{ parameterId?: string; value: number }>): Map<string, number[]> {
    const map: Map<string, number[]> = new Map();
    for (const r of readings) {
        const pid = r && r.parameterId ? r.parameterId : 'value';
        if (!map.has(pid)) map.set(pid, []);
        const bucket = map.get(pid);
        if (bucket && Number.isFinite(r.value)) bucket.push(r.value);
    }
    return map;
}

/**
 * Analisa todas as séries de um elemento sensor e retorna a lista de alertas.
 * Emite cada alerta via EventBus quando `opts.emitAlerts` é verdadeiro.
 *
 * @param sensorElement - elemento da família 'sensor'
 * @param opts
 */
export function analyzeSensorTrends(
    sensorElement: { data?: any },
    opts: {
        emitAlerts?: boolean;
        thresholds?: Partial<typeof DEFAULT_THRESHOLDS>;
        history?: Array<{ parameterId?: string; value: number }>;
    } = {},
): ReadonlyArray<Readonly<TrendAlert>> {
    const data = (sensorElement && sensorElement.data) || {};
    const readings = Array.isArray(opts.history)
        ? opts.history
        : Array.isArray(data.latestReadings)
          ? data.latestReadings
          : [];

    const grouped = groupByParameter(readings);
    const alerts: Array<Readonly<TrendAlert>> = [];

    for (const [parameterId, values] of grouped) {
        const alert = analyzeReadingTrend(values, {
            parameterId,
            thresholds: opts.thresholds,
        });
        alerts.push(alert);
        if (opts.emitAlerts && alert.severity !== 'info') {
            try {
                eventBus.emit(TREND_ALERT_EVENT, {
                    sensorId: sensorElement && (sensorElement as any).id,
                    alert,
                });
            } catch (e) {
                log.debug('[trendAlerts:emit] failed', e && (e as any).message);
            }
        }
    }

    return Object.freeze(alerts);
}

/**
 * Module metadata for Library catalog / Data Studio.
 */
export const temporalTrendAlertsMeta: Record<string, any> = {
    name: 'temporalTrendAlerts',
    description: 'Sensor temporal trend detection with severity classification',
    category: 'analytics',
    familyTags: ['environmental', 'sensor'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_TEMPORAL_TREND_ALERTS.md',
    },
};
