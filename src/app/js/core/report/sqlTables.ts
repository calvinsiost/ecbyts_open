// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/// <reference types="node" />

/* ================================================================
   SQL TABLES (Report) — SPEC_SQL_TABLES_REPORT

   Pure helpers para tabelas em relatórios:
   - Query hash (inline data-query identification) §Q2
   - Pagination (50/100/250 rows) §Q3
   - Conditional formatting (vermelho/amarelo/verde vs VR/VP/VI)
   - GAC pivot: parâmetros × poços §Q4 (JS, não SQL)
   - GHG Scope aggregator (Scope 1/2/3) para template GEE
   ================================================================ */

import crypto from 'node:crypto';

type ExceedanceLevel = 'ok' | 'vr_exceeded' | 'vp_exceeded' | 'vi_exceeded';
type ExceedanceThresholds = { vr?: number; vp?: number; vi?: number };
type GacPivotRow = { parameter: string; [key: string]: any };
type GacPivot = { columns: string[]; rows: GacPivotRow[] };
type GacObservation = { parameter: string; wellId: string; value: any; date?: any };
type GhgScope = 1 | 2 | 3;
type GhgEmission = { scope: GhgScope; sourceName?: string; tCO2e: any; [key: string]: any };

// ──────────────────────────────────────────────────────────────────────
// Constants §Q3
// ──────────────────────────────────────────────────────────────────────

export const TABLE_MODES = Object.freeze(['live', 'static']);

export const PAGINATION_SIZES = Object.freeze([50, 100, 250]);
export const DEFAULT_PAGINATION = 100;

// Severidade de exceedance (CONAMA/CETESB)
export const EXCEEDANCE_LEVELS = Object.freeze(['ok', 'vr_exceeded', 'vp_exceeded', 'vi_exceeded']);

// Formatação condicional por nível
export const EXCEEDANCE_COLORS = Object.freeze({
    ok: '#2ecc71', // verde
    vr_exceeded: '#f1c40f', // amarelo
    vp_exceeded: '#e67e22', // laranja
    vi_exceeded: '#e74c3c', // vermelho
});

// GHG Protocol scopes
export const GHG_SCOPES = Object.freeze([1, 2, 3]);

// ──────────────────────────────────────────────────────────────────────
// Query hash §Q2
// ──────────────────────────────────────────────────────────────────────

/**
 * Hash determinístico da query SQL (SHA-256 truncado) - para data-query attribute.
 * Normaliza whitespace antes de hash.
 *
 * @param sql
 * @returns hash hex 16 chars
 */
export function hashQuery(sql: string): string {
    if (typeof sql !== 'string') return '';
    const normalized = sql.trim().replace(/\s+/g, ' ').toLowerCase();
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Valida config de SQL table.
 * @param cfg
 * @returns
 */
export function validateTableConfig(cfg: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!cfg || typeof cfg !== 'object') return { valid: false, errors: ['not object'] };
    if (!cfg.sql || typeof cfg.sql !== 'string') errors.push('sql required');
    if (cfg.mode && !TABLE_MODES.includes(cfg.mode)) {
        errors.push(`mode must be one of: ${TABLE_MODES.join(', ')}`);
    }
    if (cfg.pageSize != null && !PAGINATION_SIZES.includes(cfg.pageSize)) {
        errors.push(`pageSize must be one of: ${PAGINATION_SIZES.join(', ')}`);
    }
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Pagination §Q3
// ──────────────────────────────────────────────────────────────────────

/**
 * @param value
 * @param thresholds - 1-based
 * @param pageSize
 * @returns
 */
export function paginate<T>(
    rows: T[],
    page: number = 1,
    pageSize: number = DEFAULT_PAGINATION,
): {
    rows: T[];
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
} {
    const list = Array.isArray(rows) ? rows : ([] as T[]);
    const size = PAGINATION_SIZES.includes(pageSize) ? pageSize : DEFAULT_PAGINATION;
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const p = Math.max(1, Math.min(totalPages, Math.floor(Number(page) || 1)));
    const start = (p - 1) * size;
    const end = Math.min(total, start + size);
    return {
        rows: list.slice(start, end),
        page: p,
        pageSize: size,
        totalRows: total,
        totalPages,
        hasNext: p < totalPages,
        hasPrev: p > 1,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Conditional formatting (CONAMA VR/VP/VI)
// ──────────────────────────────────────────────────────────────────────

/**
 * Classifica uma medição contra thresholds.
 *
 * @param value
 * @param thresholds
 * @returns
 */
export function classifyExceedance(value: number, thresholds: ExceedanceThresholds): ExceedanceLevel {
    const v = Number(value);
    if (!Number.isFinite(v) || !thresholds) return 'ok';
    const { vi, vp, vr } = thresholds;
    if (typeof vi === 'number' && Number.isFinite(vi) && v > vi) return 'vi_exceeded';
    if (typeof vp === 'number' && Number.isFinite(vp) && v > vp) return 'vp_exceeded';
    if (typeof vr === 'number' && Number.isFinite(vr) && v > vr) return 'vr_exceeded';
    return 'ok';
}

/**
 * @param level
 * @returns hex color
 */
export function getExceedanceColor(level: string): string {
    const colors = EXCEEDANCE_COLORS as Record<string, string>;
    return (colors[level] || colors.ok) as string;
}

// ──────────────────────────────────────────────────────────────────────
// GAC Pivot §Q4 (JS - SQLite não tem PIVOT)
// ──────────────────────────────────────────────────────────────────────

/**
 * Pivota observações em tabela parâmetros × poços.
 *
 * @param observations
 * @returns
 */
export function pivotGAC(observations: GacObservation[]): GacPivot {
    if (!Array.isArray(observations)) return { columns: [], rows: [] };

    const wells = new Set<string>();
    const parameters = new Set<string>();
    const byKey = new Map<string, number[]>(); // `${param}||${well}` → [values]

    for (const obs of observations) {
        if (!obs || !obs.parameter || !obs.wellId) continue;
        wells.add(obs.wellId);
        parameters.add(obs.parameter);
        const key = `${obs.parameter}||${obs.wellId}`;
        let values = byKey.get(key);
        if (!values) {
            values = [];
            byKey.set(key, values);
        }
        const v = Number(obs.value);
        if (Number.isFinite(v)) values.push(v);
    }

    const wellList = [...wells].sort();
    const paramList = [...parameters].sort();
    const columns = ['parameter', ...wellList];

    const rows: GacPivotRow[] = [];
    for (const param of paramList) {
        const row: GacPivotRow = { parameter: param };
        for (const well of wellList) {
            const values = byKey.get(`${param}||${well}`) || [];
            if (values.length === 0) {
                row[well] = null;
            } else {
                // Agregar: pega max (conservador para GAC)
                row[well] = Math.max(...values);
            }
        }
        rows.push(row);
    }

    return { columns, rows };
}

/**
 * Conta quantos valores excedentes existem no pivot.
 * @param pivot
 * @param thresholdsByParameter
 * @returns
 */
export function countExceedancesInPivot(
    pivot: GacPivot,
    thresholdsByParameter: Record<string, ExceedanceThresholds>,
): Record<ExceedanceLevel, number> & { total: number } {
    const counts: Record<ExceedanceLevel, number> & { total: number } = {
        ok: 0,
        vr_exceeded: 0,
        vp_exceeded: 0,
        vi_exceeded: 0,
        total: 0,
    };
    if (!pivot || !Array.isArray(pivot.rows) || !Array.isArray(pivot.columns)) return counts;
    const wells = pivot.columns.filter((c) => c !== 'parameter');
    for (const row of pivot.rows) {
        const th = thresholdsByParameter?.[row.parameter] || {};
        for (const well of wells) {
            const v = row[well];
            if (v == null) continue;
            counts.total++;
            const level = classifyExceedance(v, th);
            counts[level]++;
        }
    }
    return counts;
}

// ──────────────────────────────────────────────────────────────────────
// GHG Scope Aggregator (template GEE)
// ──────────────────────────────────────────────────────────────────────

/**
 * Agrupa emissões por Scope (1/2/3).
 *
 * @param emissions
 * @returns
 */
export function aggregateGHGByScope(emissions: GhgEmission[]): {
    byScope: Record<GhgScope, any[]>;
    totals: Record<GhgScope, number>;
    grandTotal: number;
} {
    const byScope: Record<GhgScope, any[]> = { 1: [], 2: [], 3: [] };
    const totals: Record<GhgScope, number> = { 1: 0, 2: 0, 3: 0 };
    let grandTotal = 0;

    if (!Array.isArray(emissions)) return { byScope, totals, grandTotal };

    for (const e of emissions) {
        if (!e || !GHG_SCOPES.includes(e.scope)) continue;
        const tco2e = Number(e.tCO2e);
        if (!Number.isFinite(tco2e)) continue;
        byScope[e.scope].push({ ...e });
        totals[e.scope] += tco2e;
        grandTotal += tco2e;
    }
    return { byScope, totals, grandTotal };
}
