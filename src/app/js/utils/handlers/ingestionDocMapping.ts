// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { buildDocMatrixKey, isDocMatrixAmbiguous, normalizeDocMatrixValue } from '../helpers/docDecisions.js';
import { redactDocReadingSource } from './ingestionDocDecisions.js';

export function collectUnresolvedDocMatrixSelections(selectedReadings: any, decisions: any): Set<string> {
    const unresolved = new Set<string>();
    for (const row of Array.isArray(selectedReadings) ? selectedReadings : []) {
        if (!isDocMatrixAmbiguous(row)) continue;
        const key = buildDocMatrixKey(row);
        if (!normalizeDocMatrixValue(decisions?.matrixOverrides?.[key])) {
            unresolved.add(key);
        }
    }
    return unresolved;
}

export function prepareDocReadingsForImport(selectedReadings: any, decisions: any, piiDetection: any, redactFn: any): { fallbackDate: string; preparedReadings: any[] } {
    const list = Array.isArray(selectedReadings) ? selectedReadings : [];
    const fallbackDate = list.find((r) => r?.dateLabel)?.dateLabel || new Date().toISOString();
    const preparedReadings = list.map((reading) => {
        let next = { ...reading, source: { ...(reading?.source || {}) } };
        const matrixKey = buildDocMatrixKey(reading);
        const matrixOverride = normalizeDocMatrixValue(decisions?.matrixOverrides?.[matrixKey]);
        if (matrixOverride) next.matrix = matrixOverride;
        if (piiDetection?.detected && decisions?.lgpdStrategy === 'pseudonymize') {
            next = redactDocReadingSource(next, piiDetection, redactFn);
        }
        return next;
    });
    return { fallbackDate, preparedReadings };
}

export function groupDocReadingsByWell(preparedReadings: any): Map<string, any[]> {
    const groups = new Map<string, any[]>();
    for (const reading of Array.isArray(preparedReadings) ? preparedReadings : []) {
        const key = reading?.elementName || '_default';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(reading);
    }
    return groups;
}

export function buildDocObservations(group: any, fallbackDate: string, nowIso: () => string = () => new Date().toISOString()): any[] {
    return (Array.isArray(group) ? group : []).map((reading) => ({
        parameterId: reading.parameterId,
        value: reading.value,
        unit: reading.unitId || reading.unit || '',
        operator: reading.operator || '=',
        date: reading.dateLabel || fallbackDate,
        timestamp: nowIso(),
        cost: reading.cost || null,
        matrix: reading.matrix || null,
        sample_matrix: reading.matrix || null,
        source: reading.source || null,
    }));
}
