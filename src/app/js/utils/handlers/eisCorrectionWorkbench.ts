// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
import { validateCorrectionValue } from '../../core/eis/batchCorrectionValidator.js';
import { escapeHtml } from '../helpers/html.js';
function defaultClassifyObservation() {
    return {};
}
function defaultTranslate(key: any) {
    return key;
}
function defaultGetElements() {
    return [];
}
function defaultToast() { }
const defaultLogger = {
    warn() { },
};
function resolveDocument(documentRef: any) {
    return documentRef || globalThis.document || null;
}
function resolveWindow(windowRef: any) {
    return windowRef || globalThis.window || null;
}
function signalModelChanged(win: any, source: string) {
    if (typeof win?.dispatchEvent !== 'function')
        return;
    const CustomEventCtor = win.CustomEvent || globalThis.CustomEvent;
    if (typeof CustomEventCtor !== 'function')
        return;
    win.dispatchEvent(new CustomEventCtor('modelChanged', { detail: { source } }));
}
function resolveWorkbenchHost(documentRef: any) {
    const doc = resolveDocument(documentRef);
    if (!doc?.getElementById)
        return null;
    const hostId = 'eis-correction-workbench';
    let host = doc.getElementById(hostId);
    const panel = doc.getElementById('eis-quality-extensions');
    if (!host && panel?.parentElement && doc.createElement) {
        host = doc.createElement('div');
        host.id = hostId;
        panel.parentElement.insertBefore(host, panel.nextSibling);
    }
    return host || null;
}
/** @param {any} [opts] */
export function buildCorrectionRefs({ getElements = defaultGetElements, classifyObservation = defaultClassifyObservation, }: any = {}) {
    const refs: any[] = [];
    const elements = typeof getElements === 'function' ? (getElements)() : [];
    for (const element of Array.isArray(elements) ? elements : []) {
        const family = String(element?.family || 'unknown');
        const observations = Array.isArray(element?.data?.observations) ? element.data.observations : [];
        for (let index = 0; index < observations.length; index++) {
            const observation = observations[index];
            refs.push({
                elementId: element.id,
                elementName: element?.data?.name || element.id,
                family,
                index,
                parameterId: String(observation?.parameterId || observation?.parameter || 'unknown'),
                sampleType: String(observation?.sample_type || 'primary'),
                eventType: String(observation?.event_type || 'routine'),
                value: Number(observation?.value ?? observation?.reading),
                uncertainty: Number(observation?.uncertainty),
                cls: (classifyObservation)(observation),
            });
        }
    }
    return refs;
}
export function filterCorrectionRefs(issue: any, refs: any) {
    const list = Array.isArray(refs) ? refs : [];
    if (issue === 'validity')
        return list.filter((ref: any) => ref.cls?.validityIssue);
    if (issue === 'uniqueness') {
        const seen = new Set();
        const duplicates: any[] = [];
        for (const ref of list) {
            if (ref.cls?.plannedQa)
                continue;
            const key = `${ref.elementId}|${ref.parameterId}|${String(ref.value)}|${ref.sampleType}`;
            if (seen.has(key))
                duplicates.push(ref);
            else
                seen.add(key);
        }
        return duplicates;
    }
    if (issue === 'uncertainty')
        return list.filter((ref: any) => !Number.isFinite(ref.uncertainty) || ref.uncertainty <= 0);
    if (issue === 'exception') {
        return list.filter((ref: any) => ref.cls?.exceptionContext || ref.cls?.catastrophicPendingReview);
    }
    return list;
}
export function groupValueFor(ref: any, by: any) {
    if (by === 'family')
        return ref.family;
    if (by === 'parameter')
        return ref.parameterId;
    if (by === 'sample_type')
        return ref.sampleType;
    if (by === 'event_type')
        return ref.eventType;
    return ref.elementName || ref.elementId;
}
export function buildCorrectionWorkbenchState(issue: any, { documentRef = globalThis.document, getElements = defaultGetElements, classifyObservation = defaultClassifyObservation, }: any = {}) {
    const doc = resolveDocument(documentRef);
    const refs = filterCorrectionRefs(issue, buildCorrectionRefs({ getElements, classifyObservation }));
    const groupBy = doc?.getElementById?.('eis-fix-group-by')?.value || 'element';
    const groupValues = [...new Set(refs.map((ref: any) => groupValueFor(ref, groupBy)))].sort();
    const selectedValue = doc?.getElementById?.('eis-fix-group-value')?.value || '';
    const currentGroup = selectedValue && groupValues.includes(selectedValue) ? selectedValue : groupValues[0] || '';
    const selected = refs.filter((ref: any) => groupValueFor(ref, groupBy) === currentGroup);
    return {
        refs,
        groupBy,
        groupValues,
        currentGroup,
        selected,
    };
}
export function buildCorrectionWorkbenchHtml(issue: any, state: any, { translate = defaultTranslate }: any = {}) {
    const refs = Array.isArray(state?.refs) ? state.refs : [];
    const groupBy = state?.groupBy || 'element';
    const groupValues = Array.isArray(state?.groupValues) ? state.groupValues : [];
    const currentGroup = state?.currentGroup || '';
    const selected = Array.isArray(state?.selected) ? state.selected : [];
    const title = translate('eis.batch_correction_workbench') || 'Batch Correction Workbench';
    const lblGroupBy = translate('eis.batch_group_by') || 'Group by';
    const lblGroupValue = translate('eis.batch_group_value') || 'Group value';
    const lblField = translate('eis.batch_field') || 'Field';
    const lblValue = translate('eis.batch_value') || 'Value';
    const phValue = translate('eis.batch_value_placeholder') || 'new value';
    const lblApply = translate('eis.batch_apply') || 'Apply to group';
    const lblClose = translate('eis.batch_close') || 'Close';
    const lblCandidates = translate('eis.batch_candidates') || 'Candidates';
    const lblSelected = translate('eis.batch_selected_group') || 'Selected group';
    const lblElement = translate('eis.batch_group_element') || 'Element';
    const lblFamily = translate('eis.batch_group_family') || 'Family';
    const lblParameter = translate('eis.batch_group_parameter') || 'Parameter';
    const lblSampleType = translate('eis.batch_group_sample_type') || 'Sample Type';
    const lblEventType = translate('eis.batch_group_event_type') || 'Event Type';
    return `
        <div class="eis-fix-box" role="region" aria-label="${escapeHtml(title)}">
            <div class="eis-fix-title">${escapeHtml(title)} - ${escapeHtml(issue)}</div>
            <div class="eis-fix-controls">
                <label>${escapeHtml(lblGroupBy)}
                    <select data-field-meta="true" data-field-meta-key="auto:eis-fix-group-by" id="eis-fix-group-by" aria-label="${escapeHtml(lblGroupBy)}" data-cc-call-change="handleEisRefreshCorrectionWorkbench|s:${encodeURIComponent(`${issue}`)}">
                        <option value="element" ${groupBy === 'element' ? 'selected' : ''}>${escapeHtml(lblElement)}</option>
                        <option value="family" ${groupBy === 'family' ? 'selected' : ''}>${escapeHtml(lblFamily)}</option>
                        <option value="parameter" ${groupBy === 'parameter' ? 'selected' : ''}>${escapeHtml(lblParameter)}</option>
                        <option value="sample_type" ${groupBy === 'sample_type' ? 'selected' : ''}>${escapeHtml(lblSampleType)}</option>
                        <option value="event_type" ${groupBy === 'event_type' ? 'selected' : ''}>${escapeHtml(lblEventType)}</option>
                    </select>
                </label>
                <label>${escapeHtml(lblGroupValue)}
                    <select data-field-meta="true" data-field-meta-key="auto:eis-fix-group-value" id="eis-fix-group-value" aria-label="${escapeHtml(lblGroupValue)}" data-cc-call-change="handleEisRefreshCorrectionWorkbench|s:${encodeURIComponent(`${issue}`)}">
                        ${groupValues.map((value: any) => `<option value="${escapeHtml(value)}" ${value === currentGroup ? 'selected' : ''}>${escapeHtml(value)} (${refs.filter((ref: any) => groupValueFor(ref, groupBy) === value).length})</option>`).join('')}
                    </select>
                </label>
                <label>${escapeHtml(lblField)}
                    <select data-field-meta="true" data-field-meta-key="auto:eis-fix-field" id="eis-fix-field" aria-label="${escapeHtml(lblField)}">
                        <option value="sample_type">sample_type</option>
                        <option value="qa_pair_id">qa_pair_id</option>
                        <option value="event_type">event_type</option>
                        <option value="event_severity">event_severity</option>
                        <option value="exception_justification">exception_justification</option>
                        <option value="uncertainty">uncertainty</option>
                    </select>
                </label>
                <label>${escapeHtml(lblValue)}
                    <input data-field-meta="true" data-field-meta-key="auto:eis-fix-value" id="eis-fix-value" type="text" aria-label="${escapeHtml(lblValue)}" placeholder="${escapeHtml(phValue)}">
                </label>
                <button class="eis-qx-fix-btn" type="button" data-cc-call-click="handleEisApplyBatchCorrection|s:${encodeURIComponent(`${issue}`)}">${escapeHtml(lblApply)}</button>
                <button class="eis-qx-fix-btn secondary" type="button" data-cc-action="cc-e2a71997">${escapeHtml(lblClose)}</button>
            </div>
            <div class="eis-fix-meta">${escapeHtml(lblCandidates)}: ${refs.length} · ${escapeHtml(lblSelected)}: ${selected.length}</div>
        </div>
    `;
}
export function renderCorrectionWorkbench(issue: any = 'validity', { documentRef = globalThis.document, getElements = defaultGetElements, classifyObservation = defaultClassifyObservation, translate = defaultTranslate, }: any = {}) {
    const host = resolveWorkbenchHost(documentRef);
    if (!host)
        return false;
    const state = buildCorrectionWorkbenchState(issue, {
        documentRef,
        getElements,
        classifyObservation,
    });
    host.innerHTML = buildCorrectionWorkbenchHtml(issue, state, { translate });
    return true;
}
export function openCorrectionWorkbench(issue: any = "validity", deps: any = {}) {
    return renderCorrectionWorkbench(issue, deps);
}
export function refreshCorrectionWorkbench(issue: any = "validity", deps: any = {}) {
    return renderCorrectionWorkbench(issue, deps);
}
export async function applyBatchCorrection(issue: any = 'validity', { documentRef = globalThis.document, windowRef = globalThis.window, getElements = defaultGetElements, classifyObservation = defaultClassifyObservation, validateValue = validateCorrectionValue, toast = defaultToast, translate = defaultTranslate, onRecalculate, onRenderQualityExtensions, onTrackEisUxEvent, logger = defaultLogger, importAuditTrail = () => import('../../core/governance/auditTrail.js' as string), }: any = {}) {
    const doc = resolveDocument(documentRef);
    const win = resolveWindow(windowRef);
    const groupBy = doc?.getElementById?.('eis-fix-group-by')?.value || 'element';
    const groupValue = doc?.getElementById?.('eis-fix-group-value')?.value || '';
    const field = doc?.getElementById?.('eis-fix-field')?.value || '';
    const rawValue = doc?.getElementById?.('eis-fix-value')?.value ?? '';
    if (!field)
        return { ok: false, changed: 0, reason: 'missing-field' };
    const validation = validateValue(field, rawValue);
    if (!validation.ok) {
        const msg = translate('eis.batch_invalid_value') || `Invalid value for ${field} (${validation.reason})`;
        toast(msg, 'error');
        return { ok: false, changed: 0, reason: validation.reason || 'invalid-value' };
    }
    const coercedValue = validation.value;
    const refs = filterCorrectionRefs(issue, buildCorrectionRefs({ getElements, classifyObservation })).filter((ref: any) => groupValueFor(ref, groupBy) === groupValue);
    if (refs.length === 0) {
        const msg = translate('eis.batch_empty_group') || 'No matching records for batch correction';
        toast(msg, 'warning');
        return { ok: false, changed: 0, reason: 'empty-group' };
    }
    const byElement = new Map();
    for (const ref of refs) {
        if (!byElement.has(ref.elementId))
            byElement.set(ref.elementId, []);
        byElement.get(ref.elementId).push(ref.index);
    }
    const elements = typeof getElements === 'function' ? (getElements)() : [];
    let changed = 0;
    for (const element of Array.isArray(elements) ? elements : []) {
        const indexes = byElement.get(element.id);
        if (!indexes || !Array.isArray(element?.data?.observations))
            continue;
        for (const index of indexes) {
            const observation = element.data.observations[index];
            if (!observation)
                continue;
            observation[field] = coercedValue;
            changed++;
        }
    }
    signalModelChanged(win, 'eis-batch-correction');
    if (typeof onRecalculate === 'function')
        (onRecalculate)();
    if (typeof onRenderQualityExtensions === 'function')
        (onRenderQualityExtensions)();
    renderCorrectionWorkbench(issue, { documentRef, getElements, classifyObservation, translate });
    importAuditTrail()
        .then(({ logAction }: any) => {
        let userId;
        try {
            userId = (win)?.__ecbytsSession?.userId || 'anonymous';
        }
        catch {
            userId = 'anonymous';
        }
        return logAction(userId, 'eis.batch_correction.apply', `${issue}:${field}`, {
            issue,
            groupBy,
            groupValue,
            field,
            value: coercedValue,
            count: changed,
        });
    })
        .catch((err: any) => logger.warn('audit trail failed', err?.message));
    if (typeof onTrackEisUxEvent === 'function') {
        (onTrackEisUxEvent)('eis_batch_correction_applied', {
            issue,
            groupBy,
            field,
            count: changed,
        });
    }
    const successMsg = translate('eis.batch_correction_applied') || `Batch correction applied to ${changed} observation(s)`;
    toast(successMsg.replace('{count}', String(changed)), 'success');
    return { ok: true, changed };
}
