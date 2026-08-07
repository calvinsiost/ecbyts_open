// @ts-check
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
   BOREHOLE HANDLERS — Import and validate borehole data
   Handlers para importacao e validacao de dados de sondagem

   Sondagens (boreholes) sao furos feitos no terreno para investigacao
   ambiental. Os dados incluem: localizacao do furo (collar), camadas
   do solo (intervalos litologicos) e medicoes (nivel d'agua, etc).

   Os dados validados sao adicionados como elementos 'well' com
   os campos opcionais `lithology` e `waterLevels` no objeto data.
   ================================================================ */
import { validateBorehole, validateBoreholes, normalizeBoreholeToWell } from '../../core/validation/borehole.js';
import { addElement } from '../../core/elements/manager.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { createLogger } from '../helpers/logger.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('Borehole');
/** @type {any} */
let _requestUIRefresh: any = null;
/**
 * Inject UI refresh dependency.
 * @param {Function} fn
 */
export function setBoreholeUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}
function requestBoreholeUIRefresh(reason = 'borehole.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.BOREHOLE,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
    ];
    for (const domain of domains)
        _requestUIRefresh(domain, reason);
}
// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------
/**
 * Detect input format and normalize to array of borehole objects.
 * Detecta se o JSON contem um unico furo ou batch, e normaliza.
 *
 * @param {any} json - Parsed JSON input
 * @returns {{ items: Array<any>, isBatch: boolean }}
 */
function _normalizeInput(json: any) {
    // Single borehole: { borehole: { ... } }
    if (json && json.borehole && typeof json.borehole === 'object') {
        return { items: [json], isBatch: false };
    }
    // Batch: { boreholes: [ { borehole: ... }, ... ] }
    if (json && Array.isArray(json.boreholes)) {
        return { items: json.boreholes, isBatch: true };
    }
    // Root-level array: [ { borehole: ... }, ... ]
    if (Array.isArray(json)) {
        return { items: json, isBatch: true };
    }
    return { items: [], isBatch: false };
}
/**
 * Process validated boreholes into well elements.
 * Cria elementos 'well' a partir de dados validados de sondagem.
 *
 * @param {Array<any>} validResults - Array of validated borehole data objects
 * @returns {number} Number of elements created
 */
function _createWellElements(validResults: any) {
    let created = 0;
    for (const data of validResults) {
        const wellData = normalizeBoreholeToWell(data);
        const name = data.collar.hole_id;
        addElement('well', undefined, name, wellData);
        created++;
    }
    return created;
}
// ----------------------------------------------------------------
// HANDLER FUNCTIONS
// ----------------------------------------------------------------
/**
 * Import borehole data from JSON file.
 * Abre file picker, valida e cria elementos well com litologia.
 */
function handleImportBorehole() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (/** @type {any} */ e) => {
        const file = (e?.target as any)?.files?.[0];
        if (!file)
            return;
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            const { items, isBatch } = _normalizeInput(json);
            if (items.length === 0) {
                showToast(t('boreholeInvalid') + ': JSON format not recognized', 'error');
                return;
            }
            if (isBatch) {
                const batch = validateBoreholes(items);
                if (!batch.valid) {
                    // Show first error from batch
                    const firstErr = batch.errors?.[0] ||
                        batch.results.find((/** @type {any} */ r) => !r.valid)?.errors?.[0] ||
                        t('boreholeInvalid');
                    showToast(firstErr, 'error');
                    return;
                }
                const validData = batch.results.map((/** @type {any} */ r) => r.data);
                const count = _createWellElements(validData);
                requestBoreholeUIRefresh('borehole.batch-imported');
                showToast(`${count} ${t('boreholesImported')}`, 'success');
            }
            else {
                const result = validateBorehole(items[0]);
                if (!result.valid) {
                    showToast(result.errors?.[0] || t('boreholeInvalid'), 'error');
                    return;
                }
                _createWellElements([result.data]);
                requestBoreholeUIRefresh('borehole.imported');
                showToast(t('boreholeImported'), 'success');
            }
        }
        catch (err: any) {
            log.error('Borehole import failed', err?.message || err);
            showToast(`${t('importFailed')}: ${err?.message || err}`, 'error');
        }
    };
    input.click();
}
/**
 * Validate borehole JSON file without creating elements (dry-run).
 * Apenas valida e mostra resultado - nao cria elementos.
 */
function handleValidateBorehole() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (/** @type {any} */ e) => {
        const file = (e?.target as any)?.files?.[0];
        if (!file)
            return;
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            const { items, isBatch } = _normalizeInput(json);
            if (items.length === 0) {
                showToast(t('boreholeInvalid') + ': JSON format not recognized', 'error');
                return;
            }
            if (isBatch) {
                const batch = validateBoreholes(items);
                if (batch.valid) {
                    showToast(`${t('boreholeValid')} (${items.length} boreholes)`, 'success');
                }
                else {
                    const firstErr = batch.errors?.[0] ||
                        batch.results.find((/** @type {any} */ r) => !r.valid)?.errors?.[0] ||
                        t('boreholeInvalid');
                    showToast(firstErr, 'error');
                }
            }
            else {
                const result = validateBorehole(items[0]);
                if (result.valid) {
                    showToast(t('boreholeValid'), 'success');
                }
                else {
                    showToast(result.errors?.[0] || t('boreholeInvalid'), 'error');
                }
            }
        }
        catch (err: any) {
            log.error('Borehole validation failed', err?.message || err);
            showToast(`${t('boreholeInvalid')}: ${err?.message || err}`, 'error');
        }
    };
    input.click();
}
/**
 * Import borehole data from JSON text (programmatic / API).
 * Usado pelo bridge de automacao e integracao LLM.
 *
 * @param {string} jsonText - Raw JSON string
 * @returns {{ success: boolean, created?: number, errors?: string[] }}
 */
function handleImportBoreholeFromText(jsonText: any) {
    try {
        const json = JSON.parse(jsonText);
        const { items, isBatch } = _normalizeInput(json);
        if (items.length === 0) {
            return { success: false, errors: ['JSON format not recognized'] };
        }
        if (isBatch) {
            const batch = validateBoreholes(items);
            if (!batch.valid) {
                const errors = batch.errors || batch.results.filter((r: any) => !r.valid).flatMap((r: any) => r.errors);
                return { success: false, errors };
            }
            const validData = batch.results.map((r: any) => r.data);
            const count = _createWellElements(validData);
            requestBoreholeUIRefresh('borehole.text-batch-imported');
            return { success: true, created: count };
        }
        else {
            const result = validateBorehole(items[0]);
            if (!result.valid) {
                return { success: false, errors: result.errors };
            }
            _createWellElements([result.data]);
            requestBoreholeUIRefresh('borehole.text-imported');
            return { success: true, created: 1 };
        }
    }
    catch (err: any) {
        return { success: false, errors: [/** @type {any} */ (err).message] };
    }
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const boreholeHandlers = {
    handleImportBorehole,
    handleValidateBorehole,
    handleImportBoreholeFromText,
};
