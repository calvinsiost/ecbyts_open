// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { collectUnresolvedDocMatrixSelections } from './ingestionDocMapping.js';
import { runDocImportCommit } from './ingestionDocCommitFlow.js';

function buildDocImportFullText(/** @type {any} */ state: any, /** @type {any} */ selectedReadings: any) {
    const rawText = String(state?.rawText || '');
    if (rawText) return rawText;
    return (Array.isArray(selectedReadings) ? selectedReadings : [])
        .map((/** @type {any} */ reading) =>
            [reading?.source?.text || '', reading?.parameterName || '', reading?.elementName || ''].join(' '),
        )
        .join(' ');
}

export async function prepareDocIngestFlow(/** @type {any} */ state: any, /** @type {any} */ deps: any = {}) {
    if (!state || !Array.isArray(state.readings)) return { status: 'idle' };

    const decisions = deps.ensureDocDecisions?.(state) || {};
    const selectedReadings = state.readings.filter((/** @type {any} */ _: any, /** @type {any} */ index: any) =>
        state.selected?.has(index),
    );

    if (selectedReadings.length === 0) {
        deps.showToast?.('Nenhuma leitura selecionada', 'error');
        return { status: 'blocked', reason: 'empty_selection' };
    }

    const unresolved = collectUnresolvedDocMatrixSelections(selectedReadings, decisions);
    if (unresolved.size > 0) {
        deps.showToast?.(`Defina a matriz para ${unresolved.size} tabela(s) ambigua(s) antes de confirmar`, 'warning');
        deps.renderDocReview?.();
        return { status: 'blocked', reason: 'unresolved_matrix', unresolvedCount: unresolved.size };
    }

    if (state?._piiDetection?.detected && decisions.lgpdStrategy === 'block') {
        deps.showToast?.('Importacao bloqueada pela decisao LGPD atual', 'warning');
        deps.renderDocReview?.();
        return { status: 'blocked', reason: 'lgpd_block' };
    }

    const wellIds = [
        ...new Set(selectedReadings.map((/** @type {any} */ reading: any) => reading?.elementName).filter(Boolean)),
    ];

    if (wellIds.length === 0) {
        state._mapping = new Map([['_default', { action: 'create', existingElement: null, elementId: null }]]);
        state._selectedReadings = selectedReadings;
        state._extractedFields = [];
        return { status: 'auto_confirm', selectedReadings };
    }

    state._mapping = deps.autoMatchWells?.(wellIds, deps.getAllElements?.() || []) || new Map();
    state._selectedReadings = selectedReadings;

    try {
        if (typeof deps.loadExtractFields === 'function') {
            const fields = await deps.loadExtractFields(
                buildDocImportFullText(state, selectedReadings),
                selectedReadings,
            );
            state._extractedFields = Array.isArray(fields) ? fields : [];
        } else {
            state._extractedFields = [];
        }
    } catch (error: any) {
        deps.logger?.debug?.('Field extraction ignored', /** @type {any} */ (error)?.message || error);
        state._extractedFields = [];
    }

    return { status: 'mapping_ready', selectedReadings, wellIds };
}

export async function commitDocImportFlow(/** @type {any} */ state: any, /** @type {any} */ deps: any = {}) {
    return runDocImportCommit(state, deps);
}
