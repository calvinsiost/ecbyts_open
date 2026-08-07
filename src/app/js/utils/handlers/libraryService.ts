// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   LIBRARY SERVICE HANDLERS — window.* registration for Library billing
   Expoe handleLibraryAiEstimate e handleLibraryConsultingRequest
   para ser chamado via onclick ou ACTION_REGISTRY.
   ================================================================ */
import { routeLibraryRequest } from '../../core/library/serviceRouter.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('library-service');
/**
 * Estimate AI execution cost and route the request.
 * @param {{ specificationId?: string, model?: string, maxTokens?: number }} [params]
 * @returns {Promise<object>} LibraryServiceResult
 */
async function handleLibraryAiEstimate({ specificationId, model, maxTokens }: any = {}) {
    try {
        const result = await routeLibraryRequest({
            type: 'ai_execution',
            specificationId: specificationId ?? '',
            model,
            maxTokens,
            userId: window.__ecbtUserId ?? 'anonymous',
        });
        log.debug('AI estimate result', result);
        return result;
    }
    catch (err: any) {
        log.warn('handleLibraryAiEstimate failed', err);
        showToast('Library AI estimate failed — check console for details', 'error');
        throw err;
    }
}
/**
 * Build a consulting proposal and return it.
 * @param {{ specificationId?: string }} [params]
 * @returns {Promise<object>} LibraryServiceResult with status='proposal_ready'
 */
async function handleLibraryConsultingRequest({ specificationId }: any = {}) {
    try {
        const result = await routeLibraryRequest({
            type: 'consulting_request',
            specificationId: specificationId ?? '',
            userId: window.__ecbtUserId ?? 'anonymous',
        });
        log.debug('Consulting proposal result', result);
        return result;
    }
    catch (err: any) {
        log.warn('handleLibraryConsultingRequest failed', err);
        showToast('Library consulting request failed — check console for details', 'error');
        throw err;
    }
}
export const libraryServiceHandlers = {
    handleLibraryAiEstimate,
    handleLibraryConsultingRequest,
};
