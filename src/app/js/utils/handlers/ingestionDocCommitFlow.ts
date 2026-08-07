// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import * as docDecisionsMod from '../helpers/docDecisions.js';
import * as ingestionDocDecisionsMod from './ingestionDocDecisions.js';
import * as docMappingMod from './ingestionDocMapping.js';

const { buildWellProfilePatch, mergeWellProfileByStrategy } = /** @type {any} */ (docDecisionsMod);
const { collectDocVisualAssets } = /** @type {any} */ (ingestionDocDecisionsMod);
const {
    buildDocObservations,
    collectUnresolvedDocMatrixSelections,
    groupDocReadingsByWell,
    prepareDocReadingsForImport,
} = /** @type {any} */ (docMappingMod);

function getSelectedReadings(/** @type {any} */ state: any) {
    if (!state || !Array.isArray(state.readings)) return [];
    if (Array.isArray(state._selectedReadings)) return state._selectedReadings;
    return state.readings.filter((/** @type {any} */ _: any, /** @type {number} */ index: any) => state.selected?.has(index));
}

export async function registerImportedDocumentSourceFile(/** @type {any} */ state: any, /** @type {any} */ deps: any) {
    if (!deps?.registerFromIngestion || !deps?.getFileRegisterMode) return { ok: true, skipped: true };
    const sourceFile = state?._sourceFile;
    if (!sourceFile) return { ok: true, skipped: true };

    try {
        const mode = deps.getFileRegisterMode();
        const reg = await deps.registerFromIngestion(sourceFile, { mode, source: 'document' });
        if (!reg?.ok) {
            deps.logger?.warn?.('File register returned error', reg?.error || 'unknown error');
            deps.showToast?.('Falha ao salvar arquivo no Files. Importacao principal mantida.', 'warning');
            return { ok: false, error: reg?.error || 'register_failed' };
        }
        return { ok: true };
    } catch (error: any) {
        deps.logger?.warn?.('File register threw exception', /** @type {any} */ (error)?.message || error);
        deps.showToast?.('Falha ao salvar arquivo no Files. Importacao principal mantida.', 'warning');
        return { ok: false, error };
    }
}

export async function runDocImportCommit(/** @type {any} */ state: any, /** @type {any} */ deps: any = {}) {
    if (!state || !state._mapping) return { status: 'idle' };

    const decisions = deps.ensureDocDecisions?.(state) || {};
    const selectedReadings = getSelectedReadings(state);

    if (selectedReadings.length === 0) {
        deps.showToast?.('Nenhuma leitura selecionada', 'error');
        return { status: 'blocked', reason: 'empty_selection' };
    }

    if (state?._piiDetection?.detected && decisions.lgpdStrategy === 'block') {
        deps.showToast?.('Importacao bloqueada pela decisao LGPD atual', 'warning');
        return { status: 'blocked', reason: 'lgpd_block' };
    }

    const unresolved = collectUnresolvedDocMatrixSelections(selectedReadings, decisions);
    if (unresolved.size > 0) {
        deps.showToast?.(`Resolva ${unresolved.size} matriz(zes) ambigua(s) antes de confirmar`, 'warning');
        return { status: 'blocked', reason: 'unresolved_matrix', unresolvedCount: unresolved.size };
    }

    try {
        let elementsCreated = 0;
        let elementsLinked = 0;
        let totalReadings = 0;
        let createIndex = 0;
        const timestamp = deps.now?.() ?? Date.now();

        const piiDetection = state._piiDetection || null;
        const { fallbackDate, preparedReadings } = prepareDocReadingsForImport(
            selectedReadings,
            decisions,
            piiDetection,
            deps.redactPII,
        );
        const profilePatch = buildWellProfilePatch(state._extractedFields || [], fallbackDate);
        const wellGroups = groupDocReadingsByWell(preparedReadings);

        for (const [wellId, group] of wellGroups) {
            const mapping = state._mapping.get(wellId) || { action: 'create' };
            if (mapping.action === 'ignore') continue;

            const observations = buildDocObservations(group, fallbackDate, deps.nowIso);

            if (mapping.action === 'link' && mapping.elementId) {
                const existingElement = deps.getElementById?.(mapping.elementId);
                if (!existingElement) continue;

                const data = { ...(existingElement.data || {}) };
                const existingObservations = Array.isArray(data.observations) ? data.observations : [];
                data.observations = [...existingObservations, ...observations];

                if (existingElement.family === 'well' && profilePatch && decisions.profileConflictStrategy !== 'skip') {
                    data.profile = mergeWellProfileByStrategy(
                        data.profile || null,
                        profilePatch,
                        decisions.profileConflictStrategy,
                    );
                }

                deps.updateElement?.(existingElement.id, { data });
                elementsLinked++;
            } else {
                const inferredFamily = wellId !== '_default' ? 'well' : group[0]?.family || 'well';
                const familyId = deps.defaultFamilies?.[inferredFamily] ? inferredFamily : 'well';
                const elementName =
                    wellId !== '_default' ? wellId : `Import: ${state.fileName} #${elementsCreated + 1}`;
                const elementId = `doc-${familyId}-${timestamp}-${elementsCreated}`;
                const position = deps.getScatterPosition?.(createIndex++, Math.max(wellGroups.size, 1)) || {
                    x: 0,
                    z: 0,
                };

                /** @type {any} */
                const data = {
                    x: position.x,
                    y: 0,
                    z: position.z,
                    observations,
                };

                if (familyId === 'well') {
                    (data as any).coordinates = {
                        easting: position.x,
                        northing: -position.z,
                        elevation: 0,
                    };
                    if (profilePatch && decisions.profileConflictStrategy !== 'skip') {
                        (data as any).profile = mergeWellProfileByStrategy(
                            null,
                            profilePatch,
                            decisions.profileConflictStrategy,
                        );
                    }
                }

                deps.addElement?.(familyId, elementId, elementName, data);
                elementsCreated++;
            }

            totalReadings += group.length;
        }

        const parts = [];
        if (elementsLinked > 0) parts.push(`${elementsLinked} vinculado(s)`);
        if (elementsCreated > 0) parts.push(`${elementsCreated} criado(s)`);
        deps.showToast?.(
            `${totalReadings} leitura(s) importada(s) -- ${parts.join(', ') || 'sem alteracoes'}`,
            'success',
        );

        if (decisions.saveInFiles) {
            await registerImportedDocumentSourceFile(state, deps);
        }

        state._importSummary = {
            totalReadings,
            elementsCreated,
            elementsLinked,
        };

        const visualAssets = decisions.visualWizardEnabled ? collectDocVisualAssets(state) : [];
        if (decisions.visualWizardEnabled && visualAssets.length > 0) {
            state.step = 'post_visual';
            state._postImportVisualAssets = visualAssets;
            state._mapping = null;
            state._selectedReadings = null;
            deps.renderDocVisualWizard?.();
            return {
                status: 'post_visual',
                summary: state._importSummary,
                visualAssetsCount: visualAssets.length,
            };
        }

        deps.closeIngestionModal?.();
        deps.requestUIRefresh?.('ingestion.doc-import-completed');
        return { status: 'completed', summary: state._importSummary };
    } catch (error: any) {
        const errAny = /** @type {any} */ (error);
        deps.logger?.error?.('Document ingest failed', errAny?.message || error);
        deps.showToast?.(`Erro na importacao: ${errAny?.message || error}`, 'error');
        return { status: 'error', error };
    }
}
