// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import {
    buildDocMatrixKey,
    collectDocMatrixBuckets,
    isDocMatrixAmbiguous,
    normalizeDocMatrixValue,
} from '../helpers/docDecisions.js';
import { collectDocVisualAssets, ensureDocDecisions } from './ingestionDocDecisions.js';

interface DocLocale {
    locale: string;
    confidence: number;
    signals?: string[];
}

interface DocState {
    readings?: any[];
    selected?: Set<number> | any[];
    _detectedLocale?: DocLocale | null;
    stats?: any;
    _processing?: {
        startedAt: number;
        finishedAt?: number;
    } | null;
    fileType?: string;
    _piiDetection?: {
        detected: boolean;
    };
}

interface DocDecisions {
    matrixOverrides?: Record<string, any>;
    lgpdStrategy?: string;
}

interface BuildDocReviewStateResult {
    sortedIndices: number[];
    uniqueWells: string[];
    docLocale: DocLocale | null;
    localeLabel: string;
    localeSignal: string;
    browserLang: string;
    localeMismatch: boolean;
    processingStats: any;
    processingDurationMs: number | null;
    extractorPrimary: string;
    extractorCache: any;
    budgetMode: string;
    decisions: DocDecisions;
    matrixBuckets: any;
    visualAssets: any;
    piiDetected: boolean;
    selectedCount: number;
    unresolvedMatrixSelected: number;
    isLgpdBlocked: boolean;
    isConfirmBlocked: boolean;
    matchedParams: string[];
    docType: string;
}

const CONF_ORDER: Record<string, number> = { green: 0, yellow: 1, red: 2 };

/**
 * @param {any[]} [readings]
 */
export function buildSortedDocReviewIndices(readings: any[] = []): number[] {
    return readings
        .map((_, i) => i)
        .sort((a, b) => {
            const pageA = readings[a]?.source?.page ?? 0;
            const pageB = readings[b]?.source?.page ?? 0;
            if (pageA !== pageB) return pageA - pageB;
            return (CONF_ORDER[readings[a]?.confidence ?? ''] ?? 2) - (CONF_ORDER[readings[b]?.confidence ?? ''] ?? 2);
        });
}

/**
 * @param {DocState} docState
 * @param {string} [browserLanguage]
 */
export function buildDocReviewState(docState: DocState, browserLanguage: string = 'en-US'): BuildDocReviewStateResult {
    const readings = Array.isArray(docState?.readings) ? docState.readings : [];
    const selected = docState?.selected instanceof Set ? docState.selected : new Set(docState?.selected || []);
    const uniqueWells = [...new Set(readings.map((r: any) => r.elementName).filter(Boolean))];
    const docLocale = docState?._detectedLocale || null;
    const localeLabel = docLocale
        ? ({ 'pt-BR': 'BR', 'en-US': 'US', 'generic-EU': 'EU' } as Record<string, string>)[docLocale.locale] || 'Auto'
        : 'Auto';
    const localeSignal = docLocale?.signals?.[0] || '';
    const browserLang = String(browserLanguage || 'en-US').substring(0, 5);
    const localeMismatch = !!(docLocale && docLocale.locale !== browserLang && docLocale.confidence > 0.3);
    const processingStats = docState?.stats || {};
    const processingState = docState?._processing || null;
    const processingDurationMs = processingState?.startedAt
        ? (processingState.finishedAt || Date.now()) - processingState.startedAt
        : null;
    const extractorPrimary =
        processingStats.extractorPrimary || (docState?.fileType === 'pdf' ? 'pdfplumber' : 'worker');
    const extractorCache = processingStats.pdfplumber?.cache || null;
    const budgetMode = processingStats.budgetMode || 'normal';
    const decisions = ensureDocDecisions(docState);
    const matrixBuckets = collectDocMatrixBuckets(readings);
    const visualAssets = collectDocVisualAssets(docState);
    const piiDetected = !!docState?._piiDetection?.detected;
    const selectedCount = selected.size;
    const selectedAmbiguousKeys = new Set<string>();

    for (const idx of selected) {
        const row = readings[idx];
        if (!isDocMatrixAmbiguous(row)) continue;
        selectedAmbiguousKeys.add(buildDocMatrixKey(row));
    }

    const unresolvedMatrixSelected = [...selectedAmbiguousKeys].filter(
        (key) => !normalizeDocMatrixValue(decisions.matrixOverrides?.[key]),
    ).length;
    const isLgpdBlocked = piiDetected && decisions.lgpdStrategy === 'block' && selectedCount > 0;
    const isConfirmBlocked = selectedCount === 0 || unresolvedMatrixSelected > 0 || isLgpdBlocked;
    const matchedParams = [...new Set(readings.filter((r: any) => r.parameterId).map((r: any) => r.parameterId))];
    const docType = docLocale?.signals?.some((s: any) => /conama|cetesb/i.test(s))
        ? 'Investigacao Ambiental (CONAMA 420)'
        : 'Relatorio Tecnico';

    return {
        sortedIndices: buildSortedDocReviewIndices(readings),
        uniqueWells,
        docLocale,
        localeLabel,
        localeSignal,
        browserLang,
        localeMismatch,
        processingStats,
        processingDurationMs,
        extractorPrimary,
        extractorCache,
        budgetMode,
        decisions,
        matrixBuckets,
        visualAssets,
        piiDetected,
        selectedCount,
        unresolvedMatrixSelected,
        isLgpdBlocked,
        isConfirmBlocked,
        matchedParams,
        docType,
    };
}
