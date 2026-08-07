// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
import { CONFIG } from '../../config.js';
import { getAllElements } from '../../core/elements/manager.js';
import {
    listSavedDomains,
    getDomain,
    saveDomain,
    deleteDomain,
    duplicateDomain,
    setActiveDomainIds,
    runActiveDomainValidation,
    testDomainAgainstData,
} from '../../core/validation/engine/index.js';
import { openDomainEditorModal, closeDomainEditorModal, refreshDomainEditorModal } from '../ui/domainEditorModal.js';
import { showToast } from '../ui/toast.js';
import { createLogger } from '../helpers/logger.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';

const log = createLogger('DomainValidation') as any;
let _requestUIRefresh: any = null;

export function setDomainValidationUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}

function requestDomainValidationUIRefresh(reason = 'domain-validation.changed') {
    if (typeof _requestUIRefresh !== 'function')
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.VALIDATION,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        _requestUIRefresh(domain, reason);
    }
}

function _enabled() {
    return CONFIG.FEATURES?.DOMAIN_VALIDATORS !== false;
}

async function handleOpenDomainEditor() {
    if (!_enabled()) {
        showToast('Domain Validators disabled', 'warning');
        return;
    }
    await openDomainEditorModal();
}

function handleCloseDomainEditor() {
    closeDomainEditorModal();
}

async function handleCreateDomain(domainObj: any) {
    if (!_enabled()) return null;
    try {
        const saved = await saveDomain(typeof domainObj === 'string' ? JSON.parse(domainObj) : domainObj);
        showToast(`Domain "${saved.name}" saved`, 'success');
        refreshDomainEditorModal().catch((_e: any) =>
            console.debug('[utils/handlers/domainValidation:silent-catch]', _e?.message || _e),
        );
        return saved;
    } catch (err: any) {
        log.error('Domain save failed', err?.message || err);
        showToast(`Error: ${err?.message || err}`, 'error');
        return null;
    }
}

async function handleDeleteDomain(domainId: any) {
    if (!_enabled()) return;
    const ok = await deleteDomain(domainId);
    if (ok) {
        showToast('Domain deleted', 'success');
        refreshDomainEditorModal().catch((_e: any) =>
            console.debug('[utils/handlers/domainValidation:silent-catch]', _e?.message || _e),
        );
    } else {
        showToast('Domain not found', 'warning');
    }
}

async function handleDuplicateDomain(domainId: any) {
    if (!_enabled()) return null;
    try {
        const copy = await duplicateDomain(domainId);
        showToast(`Domain duplicated as "${copy.name}"`, 'success');
        refreshDomainEditorModal().catch((_e: any) =>
            console.debug('[utils/handlers/domainValidation:silent-catch]', _e?.message || _e),
        );
        return copy;
    } catch (err: any) {
        log.error('Domain duplication failed', err?.message || err);
        showToast(`Error: ${err?.message || err}`, 'error');
        return null;
    }
}

async function handleSaveDomain(domainObj: any) {
    return handleCreateDomain(domainObj);
}

async function handleExportDomain(domainId: any) {
    if (!_enabled()) return;
    const domain = await getDomain(domainId);
    if (!domain) {
        showToast('Domain not found', 'warning');
        return;
    }
    const json = JSON.stringify(domain, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `domain-${domain.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Domain exported', 'success');
}

async function handleImportDomain(jsonStringOrFile: any) {
    if (!_enabled()) return null;
    try {
        let domainObj: any;
        if (typeof jsonStringOrFile === 'string') {
            domainObj = JSON.parse(jsonStringOrFile);
        } else if (jsonStringOrFile instanceof File) {
            const text = await jsonStringOrFile.text();
            domainObj = JSON.parse(text);
        } else {
            domainObj = jsonStringOrFile;
        }
        const saved = await saveDomain(domainObj);
        showToast(`Domain "${saved.name}" imported`, 'success');
        refreshDomainEditorModal().catch((_e: any) =>
            console.debug('[utils/handlers/domainValidation:silent-catch]', _e?.message || _e),
        );
        return saved;
    } catch (err: any) {
        log.error('Domain import failed', err?.message || err);
        showToast(`Import error: ${err?.message || err}`, 'error');
        return null;
    }
}

async function handleRunDomainValidation() {
    if (!_enabled()) return null;
    const rows: any[] = [];
    for (const element of getAllElements() as any[]) {
        const observations = Array.isArray(element?.data?.observations) ? element.data.observations : [];
        for (const obs of observations) {
            rows.push({ ...obs, elementId: element.id });
        }
    }
    if (rows.length === 0) {
        showToast('No data to validate', 'warning');
        return { domainResults: [], totalViolations: 0 };
    }
    const result = await runActiveDomainValidation(rows);
    (window as any).__ecbyts_domain_validation = result;
    if (result.totalViolations === 0) {
        showToast('All records valid', 'success');
    } else {
        showToast(`${result.totalViolations} violation(s) found`, 'warning');
    }
    requestDomainValidationUIRefresh('domain-validation.run');
    refreshDomainEditorModal().catch((_e: any) =>
        console.debug('[utils/handlers/domainValidation:silent-catch]', _e?.message || _e),
    );
    return result;
}

async function handleTestDomainRules(domainObj: any, sampleData: any) {
    if (!_enabled()) return null;
    try {
        const domain = typeof domainObj === 'string' ? JSON.parse(domainObj) : domainObj;
        const data = typeof sampleData === 'string' ? JSON.parse(sampleData) : sampleData;
        const result = testDomainAgainstData(domain, Array.isArray(data) ? data : [data]);
        return result;
    } catch (err: any) {
        log.error('Domain rule test failed', err?.message || err);
        showToast(`Test error: ${err?.message || err}`, 'error');
        return null;
    }
}

async function handleListDomains() {
    return listSavedDomains();
}

async function handleSetActiveDomains(ids: any) {
    if (!_enabled()) return;
    await setActiveDomainIds(Array.isArray(ids) ? ids : [ids]);
    showToast('Active domains updated', 'success');
    refreshDomainEditorModal().catch((_e: any) =>
        console.debug('[utils/handlers/domainValidation:silent-catch]', _e?.message || _e),
    );
}

export const domainValidationHandlers = {
    handleOpenDomainEditor,
    handleCloseDomainEditor,
    handleCreateDomain,
    handleDeleteDomain,
    handleDuplicateDomain,
    handleSaveDomain,
    handleExportDomain,
    handleImportDomain,
    handleRunDomainValidation,
    handleTestDomainRules,
    handleListDomains,
    handleSetActiveDomains,
};
