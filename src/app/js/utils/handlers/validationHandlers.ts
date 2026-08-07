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
import { CONFIG } from '../../config.js';
import { getAllElements } from '../../core/elements/manager.js';
import {
    listValidationProfiles,
    saveCustomProfile,
    deleteCustomProfile,
    getActiveProfileIds,
    setActiveProfileIds,
    validateBatchWithProfile,
    getLastValidationResults,
} from '../../core/validation/profileEngine.js';
import {
    openValidationProfileModal,
    closeValidationProfileModal,
    refreshValidationProfileModal,
} from '../ui/validationProfileModal.js';
import { assessTier2 } from '../../core/validation/tier2Risk.js';
import { showToast as _showToastImpl } from '../ui/toast.js';
const showToast = _showToastImpl;
import { asyncPrompt } from '../ui/asyncDialogs.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
let _requestUIRefresh: any = null;
/**
 * @param {() => void} fn
 */
export function setValidationUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}
function requestValidationUIRefresh(reason = 'validation.changed') {
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
    return CONFIG.FEATURES?.VALIDATION_PROFILES !== false;
}
function _collectObservations() {
    const rows = [];
    for (const element of getAllElements()) {
        const observations = Array.isArray(element?.data?.observations) ? element.data.observations : [];
        for (const obs of observations) {
            rows.push({
                ...obs,
                elementId: element.id,
            });
        }
    }
    return rows;
}
async function handleOpenValidationProfiles() {
    if (!_enabled()) {
        showToast('Validation Profiles is disabled by feature flag', 'warning');
        return;
    }
    await openValidationProfileModal();
}
function handleCloseValidationProfiles() {
    closeValidationProfileModal();
}
async function handleRunValidationProfile(profileId: any) {
    if (!_enabled()) return;
    const rows = _collectObservations();
    if (rows.length === 0) {
        showToast('No observations available for validation', 'warning');
        return {
            profileId: profileId || null,
            violations: [],
            interventionCandidates: [],
            summary: { totalObservations: 0, totalViolations: 0 },
        };
    }
    const result = await validateBatchWithProfile(rows, profileId);
    window.__ecbyts_validation = result;
    const msg = `Validation finished: ${result.summary.totalViolations} violation(s) in ${result.summary.totalObservations} observation(s)`;
    showToast(msg, result.summary.totalViolations > 0 ? 'warning' : 'success');
    requestValidationUIRefresh('validation.profile-run');
    refreshValidationProfileModal().catch((_e) =>
        console.debug('[utils/handlers/validationHandlers:silent-catch]', _e?.message || _e),
    );
    return result;
}
async function handleCreateValidationProfile(profileJsonOrObject: any) {
    if (!_enabled()) return null;
    let profile = profileJsonOrObject;
    if (typeof profileJsonOrObject === 'string') {
        profile = JSON.parse(profileJsonOrObject);
    }
    const saved = await saveCustomProfile(profile);
    showToast(`Validation profile "${saved.name}" saved`, 'success');
    refreshValidationProfileModal().catch((_e) =>
        console.debug('[utils/handlers/validationHandlers:silent-catch]', _e?.message || _e),
    );
    return saved;
}
async function handleDeleteValidationProfile(profileId: any) {
    if (!_enabled()) return false;
    const ok = await deleteCustomProfile(profileId);
    if (ok) {
        showToast('Validation profile deleted', 'info');
        refreshValidationProfileModal().catch((_e) =>
            console.debug('[utils/handlers/validationHandlers:silent-catch]', _e?.message || _e),
        );
    }
    return ok;
}
async function handleSetActiveValidationProfiles(profileIds: any) {
    if (!_enabled()) return [];
    let ids = profileIds;
    if (typeof profileIds === 'string') {
        ids = profileIds
            .split(',')
            .map((v: any) => v.trim())
            .filter(Boolean);
    }
    await setActiveProfileIds(ids);
    refreshValidationProfileModal().catch((_e) =>
        console.debug('[utils/handlers/validationHandlers:silent-catch]', _e?.message || _e),
    );
    return getActiveProfileIds();
}
function _toCsvValue(v: any) {
    const txt = String(v ?? '');
    return `"${txt.replace(/"/g, '""')}"`;
}
function _downloadCsv(filename: any, rows: any) {
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
function handleExportValidationResultsCSV() {
    const result = getLastValidationResults();
    if (!result || !Array.isArray(result.violations) || result.violations.length === 0) {
        showToast('No validation results to export', 'warning');
        return false;
    }
    const header = [
        'profileId',
        'ruleId',
        'ruleType',
        'severity',
        'elementId',
        'observationId',
        'parameterId',
        'measuredValue',
        'thresholdValue',
        'unit',
        'message',
    ];
    const rows = [header.join(',')];
    for (const v of result.violations) {
        rows.push(
            [
                _toCsvValue(v.profileId),
                _toCsvValue(v.ruleId),
                _toCsvValue(v.ruleType),
                _toCsvValue(v.severity),
                _toCsvValue(v.elementId),
                _toCsvValue(v.observationId),
                _toCsvValue(v.parameterId),
                _toCsvValue(v.measuredValue),
                _toCsvValue(v.thresholdValue),
                _toCsvValue(v.unit),
                _toCsvValue(v.message),
            ].join(','),
        );
    }
    _downloadCsv('validation-results.csv', rows);
    showToast('Validation CSV exported', 'success');
    return true;
}
function handleCreateIssuesFromValidation() {
    const result = getLastValidationResults();
    const candidates = result?.interventionCandidates || [];
    if (candidates.length === 0) {
        showToast('No intervention candidates found', 'info');
        return [];
    }
    showToast(`Found ${candidates.length} intervention candidate(s). Issues module not enabled yet.`, 'warning');
    return candidates;
}
async function handleListValidationProfiles() {
    return listValidationProfiles();
}
async function handleRunTier2RiskAssessment() {
    try {
        const parameterId = await asyncPrompt('Parâmetro (ex.: benzene):', 'benzene');
        if (parameterId == null) return;
        const concRaw = await asyncPrompt('Concentração medida (mesma unidade do VI):', '');
        if (concRaw == null) return;
        const csfRaw = await asyncPrompt('CSF oral (mg/kg-dia)⁻¹ — vazio se não-carcinogênico:', '0.055');
        const rfdRaw = csfRaw ? '' : await asyncPrompt('RfD (mg/kg-dia):', '');
        const concentration = Number(concRaw);
        if (!Number.isFinite(concentration) || concentration < 0) {
            showToast('Concentração inválida', 'error');
            return;
        }
        const toxicity = {
            csf: csfRaw ? Number(csfRaw) : null,
            rfd: rfdRaw ? Number(rfdRaw) : null,
        };
        const r = assessTier2({ parameterId: String(parameterId), concentration, toxicity });
        if (!r.tier1Exceeded) {
            showToast(`Tier-1 OK: ${parameterId} ≤ VI (${r.viValue}). Tier-2 não exigido.`, 'success');
            return;
        }
        const verdict = r.tier2Decision === 'remediation_required' ? 'error' : 'warning';
        const label =
            r.tier2Decision === 'remediation_required' ? 'Remediação exigida' : 'Risco aceitável (site-specific)';
        showToast(`Tier-2: ${label}. RBSL≈${Number(r.rbsl).toPrecision(4)} (driver: ${r.driver})`, verdict);
    } catch (e: any) {
        console.debug('[validation:tier2]', e?.message || e);
        showToast('Falha na avaliação Tier-2: ' + (e?.message || e), 'error');
    }
}
export const validationHandlers = {
    handleOpenValidationProfiles,
    handleCloseValidationProfiles,
    handleRunValidationProfile,
    handleCreateValidationProfile,
    handleDeleteValidationProfile,
    handleSetActiveValidationProfiles,
    handleExportValidationResultsCSV,
    handleCreateIssuesFromValidation,
    handleListValidationProfiles,
    handleRunTier2RiskAssessment,
};
