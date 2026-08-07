// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Logger - Phase 38 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S38
 *
 * Phase 38 (2026-05-02) - pure-logic structured logger com ring buffer.
 * Suporta:
 *   - 5 níveis: debug / info / warn / error / fatal
 *   - level filtering (logger só aceita >= configured level)
 *   - ring buffer com cap fixo (oldest descartado quando full)
 *   - filterByLevel / summarizeLogs
 *
 * NÃO depende de browser. Não toca em DOM/console/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Níveis canônicos com prioridade numérica. */
export const LOG_LEVELS = Object.freeze({
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    fatal: 50,
});

/** Default config canônica. */
export const DEFAULT_CONFIG = Object.freeze({
    level: 'info',
    capacity: 500,
});

/** Identidade do módulo. */
export const LOGGER_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 38,
    deliveredAt: '2026-05-02',
});

/**
 * Verifica se nível é válido.
 *
 * @param {string} level
 * @returns {boolean}
 */
export function isValidLevel(level: string): boolean {
    return typeof level === 'string' && Object.prototype.hasOwnProperty.call(LOG_LEVELS, level);
}

/**
 * Cria logger pure-logic frozen.
 *
 * @param {Object} [config]
 * @returns {Object}
 */
export function createLogger(config: any = {}): object {
    const cfg = { ...DEFAULT_CONFIG, ...(config || {}) };
    const level = isValidLevel(cfg.level) ? cfg.level : DEFAULT_CONFIG.level;
    const capacity = Number.isInteger(cfg.capacity) && cfg.capacity > 0 ? cfg.capacity : DEFAULT_CONFIG.capacity;
    return Object.freeze({
        level,
        capacity,
        entries: Object.freeze([]), // [{ level, message, context, timestamp, seq }]
        stats: Object.freeze({
            totalAccepted: 0,
            totalDropped: 0,
            totalEvicted: 0,
            byLevel: Object.freeze({ debug: 0, info: 0, warn: 0, error: 0, fatal: 0 }),
        }),
    });
}

/**
 * Verifica se entry deve ser aceita pelo nível configurado.
 *
 * @param {string} entryLevel
 * @param {string} loggerLevel
 * @returns {boolean}
 */
export function shouldAccept(entryLevel: string, loggerLevel: string): boolean {
    if (!isValidLevel(entryLevel) || !isValidLevel(loggerLevel)) return false;
    const levels = LOG_LEVELS as Record<string, number>;
    return (levels[entryLevel] as number) >= (levels[loggerLevel] as number);
}

/**
 * Adiciona entry ao logger. Aplica filtro de nível e ring buffer.
 *
 * @param {Record<string, any>} logger
 * @param {Record<string, any>} any> { level, message, context?, timestamp? }
 * @returns {Object} novo logger
 */
export function addLogEntry(logger: Record<string, any>, entry: Record<string, any>): any {
    if (!logger) return logger;
    if (!entry || typeof entry !== 'object') {
        return Object.freeze({
            ...logger,
            stats: Object.freeze({
                ...logger.stats,
                totalDropped: logger.stats.totalDropped + 1,
            }),
        });
    }
    const level = isValidLevel(entry.level) ? entry.level : null;
    if (!level) {
        return Object.freeze({
            ...logger,
            stats: Object.freeze({
                ...logger.stats,
                totalDropped: logger.stats.totalDropped + 1,
            }),
        });
    }
    if (!shouldAccept(level, logger.level)) {
        return Object.freeze({
            ...logger,
            stats: Object.freeze({
                ...logger.stats,
                totalDropped: logger.stats.totalDropped + 1,
            }),
        });
    }
    const ts = Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now();
    const seq = logger.stats.totalAccepted + 1;
    const newEntry = Object.freeze({
        level,
        message: typeof entry.message === 'string' ? entry.message : String(entry.message ?? ''),
        context: entry.context && typeof entry.context === 'object' ? Object.freeze({ ...entry.context }) : null,
        timestamp: ts,
        seq,
    });
    const entries = [...logger.entries, newEntry];
    let evicted = logger.stats.totalEvicted;
    while (entries.length > logger.capacity) {
        entries.shift();
        evicted++;
    }
    const byLevel = { ...logger.stats.byLevel };
    byLevel[level] = (byLevel[level] || 0) + 1;
    return Object.freeze({
        ...logger,
        entries: Object.freeze(entries),
        stats: Object.freeze({
            ...logger.stats,
            totalAccepted: logger.stats.totalAccepted + 1,
            totalEvicted: evicted,
            byLevel: Object.freeze(byLevel),
        }),
    });
}

/**
 * Filtra entries por nível mínimo (>=).
 *
 * @param {Record<string, any>} logger
 * @param {string} any>
 * @returns {any[]}
 */
export function filterByLevel(logger: Record<string, any>, minLevel: string): any[] {
    if (!logger || !isValidLevel(minLevel)) return [];
    const levels = LOG_LEVELS as Record<string, number>;
    const threshold = levels[minLevel] as number;
    return Object.freeze(
        logger.entries.filter((e: any) => e && (levels[e.level] as number) >= threshold),
    ) as any[];
}

/**
 * Limpa entries do logger (mantém config + stats).
 *
 * @param {Object} logger
 * @returns {Object}
 */
export function clearEntries(logger: any): any {
    if (!logger) return logger;
    return Object.freeze({
        ...logger,
        entries: Object.freeze([]),
    });
}

/**
 * Sumariza estado do logger.
 *
 * @param {Record<string, any>} logger
 * @returns {Object}
 */
export function summarizeLogs(logger: Record<string, any>): any {
    const empty = {
        size: 0,
        capacity: 0,
        level: 'info',
        utilization: 0,
        totalAccepted: 0,
        totalDropped: 0,
        totalEvicted: 0,
        byLevel: { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 },
        hasErrors: false,
        hasFatal: false,
    };
    if (!logger) return empty;
    const byLevel = logger.stats?.byLevel || empty.byLevel;
    return Object.freeze({
        size: logger.entries.length,
        capacity: logger.capacity,
        level: logger.level,
        utilization: logger.capacity > 0 ? logger.entries.length / logger.capacity : 0,
        totalAccepted: logger.stats?.totalAccepted || 0,
        totalDropped: logger.stats?.totalDropped || 0,
        totalEvicted: logger.stats?.totalEvicted || 0,
        byLevel: Object.freeze({ ...byLevel }),
        hasErrors: (byLevel.error || 0) > 0,
        hasFatal: (byLevel.fatal || 0) > 0,
    });
}

/**
 * Module identity export.
 */
export const pipelineLoggerMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 38,
    deliveredAt: '2026-05-02',
    exports: [
        'LOG_LEVELS',
        'DEFAULT_CONFIG',
        'LOGGER_META',
        'isValidLevel',
        'createLogger',
        'shouldAccept',
        'addLogEntry',
        'filterByLevel',
        'clearEntries',
        'summarizeLogs',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
