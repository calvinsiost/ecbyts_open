// @ts-check
// Generated from src/app/js/utils/ui/boundaryConfirm.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   BOUNDARY CONFIRM — Confirmation dialog before boundary overwrite
   ================================================================

   Exibe dialogo de confirmacao quando o usuario tenta criar um novo
   boundary e ja existe um no modelo. Oferece tres opcoes:
   Replace (substituir), Keep Both (manter ambos), Cancel (cancelar).

   Tambem dispara autosave antes de acoes destrutivas para garantir
   que o estado anterior nao se perca.

   ================================================================ */
import { asyncConfirm } from './asyncDialogs.js';
import { t } from '../i18n/translations.js';
import { createLogger } from '../helpers/logger.js';
import { getAllElements } from '../../core/elements/manager.js';
const log = createLogger('BoundaryConfirm');
/**
 * Action constants returned by confirmBoundaryOverwrite.
 * Constantes de acao retornadas pelo dialogo de confirmacao.
 */
export const BOUNDARY_ACTION = Object.freeze({
    REPLACE: 'replace',
    KEEP_BOTH: 'keepBoth',
    CANCEL: 'cancel',
});
/**
 * Find existing boundary elements in the model.
 * Busca elementos do tipo boundary no modelo atual.
 *
 * @returns {Object|null} First boundary element found, or null
 */
export function findExistingBoundary() {
    const elements = getAllElements();
    return elements.find((e: any) => e.family === 'boundary') || null;
}
/**
 * Show confirmation dialog when a boundary already exists.
 * Mostra dialogo de confirmacao quando ja existe um boundary no modelo.
 * Oferece Replace / Keep Both / Cancel.
 *
 * @param {any} existingBoundary - The existing boundary element
 * @returns {Promise<string>} One of BOUNDARY_ACTION values
 */
export async function confirmBoundaryOverwrite( existingBoundary: any) {
    if (!existingBoundary) {
        // Nenhum boundary existente - prosseguir sem dialogo
        return BOUNDARY_ACTION.REPLACE;
    }
    const boundaryName = existingBoundary.name || existingBoundary.id || 'Boundary';
    const message =
        t('boundaryConfirmMessage') || `A boundary "${boundaryName}" already exists. What would you like to do?`;
    // asyncConfirm retorna boolean - usamos para Replace vs Cancel
    // Para a opcao Keep Both, precisamos de um fluxo customizado
    const confirmed = await asyncConfirm(message, {
        confirmLabel: t('boundaryConfirmReplace') || 'Replace',
        cancelLabel: t('boundaryConfirmCancel') || 'Cancel',
        danger: true,
    });
    if (confirmed) {
        return BOUNDARY_ACTION.REPLACE;
    }
    // Se cancelou, verificar se quer manter ambos
    // Segundo dialogo: manter ambos?
    const keepBoth = await asyncConfirm(t('boundaryConfirmKeepBothPrompt') || `Keep both boundaries?`, {
        confirmLabel: t('boundaryConfirmKeepBoth') || 'Keep Both',
        cancelLabel: t('boundaryConfirmCancel') || 'Cancel',
    });
    if (keepBoth) {
        return BOUNDARY_ACTION.KEEP_BOTH;
    }
    return BOUNDARY_ACTION.CANCEL;
}
/**
 * Trigger autosave before a destructive boundary action.
 * Dispara autosave antes de uma acao destrutiva sobre boundary.
 * Usa autosaveModelSnapshot do cloud manager se disponivel,
 * caso contrario salva no localStorage como fallback.
 *
 * @returns {Promise<boolean>} true if autosave succeeded, false otherwise
 */
export async function autosaveBeforeBoundary() {
    try {
        const { buildModel } = await import('../../core/io/export.js' as string);
        const modelData = (buildModel()) as any;
        if (!modelData || !Array.isArray(modelData.elements) || modelData.elements.length === 0) {
            // Modelo vazio - nada a salvar
            log.info('No model data to autosave before boundary action');
            return false;
        }
        try {
            const { autosaveModelSnapshot } = await import('../cloud/manager.js' as string);
            await autosaveModelSnapshot({ modelData, force: true });
            log.info('Autosave to cloud completed before boundary action');
            return true;
        } catch (cloudErr: any) {
            // Cloud indisponivel - fallback para localStorage
            log.warn('Cloud autosave unavailable, using localStorage fallback', cloudErr?.message);
            const { safeSetItem } = await import('../storage/storageMonitor.js' as string);
            const saved = safeSetItem(
                'ecbyts-boundary-autosave',
                JSON.stringify({
                    timestamp: Date.now(),
                    elements: modelData.elements.length,
                    campaigns: (modelData.campaigns || []).length,
                    data: modelData,
                }),
            );
            if (saved) {
                log.info('Autosave to localStorage completed before boundary action');
            }
            return saved;
        }
    } catch (err: any) {
        log.error('Autosave before boundary action failed', err?.message);
        return false;
    }
}
/**
 * Full confirmation flow: check for existing boundary, autosave, confirm.
 * Fluxo completo: verifica boundary existente, autosave, confirmacao.
 *
 * @returns {Promise<{ action: string, existingBoundary: Object|null }>}
 */
export async function boundaryOverwriteGuard() {
    const existing = findExistingBoundary();
    if (!existing) {
        // Nenhum boundary existente - prosseguir direto
        return { action: BOUNDARY_ACTION.REPLACE, existingBoundary: null };
    }
    // Autosave antes de mostrar o dialogo - protege o estado atual
    await autosaveBeforeBoundary();
    const action = await confirmBoundaryOverwrite(existing);
    return { action, existingBoundary: existing };
}
