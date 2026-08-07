// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   ECBT — Domain Validator Editor Modal
   utils/ui/domainEditorModal.js

   Two-pane modal for user-defined validation domains.
   Left: domain list. Right: entity/rule editor.
   Uses createElement (no monolithic innerHTML).
   License: AGPL-3.0
   ================================================================ */
import {
    listSavedDomains,
    getDomain,
    saveDomain,
    deleteDomain,
    duplicateDomain,
    getActiveDomainIds,
    testDomainAgainstData,
} from '../../core/validation/engine/index.js';
import { validateDomainDefinition } from '../../core/validation/engine/domainLoader.js';
import { showToast } from './toast.js';
import { asyncPrompt, asyncConfirm } from './asyncDialogs.js';
import { escapeHtml } from '../helpers/html.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { deepClone } from '../helpers/deepClone.js';
import { t as _t } from '../i18n/translations.js';
/**
 * @param {any} entity
 * @param {any} [params]
 * @returns {any}
 */
const t: any = (key: any, params?: any) => (_t as any)(key, params);
import { buildModalShell } from './modals.js';
/**
 * @typedef {{ id: string, name: string, description?: string, ruleCount?: number, entityCount?: number }} DomainSummary
 * @typedef {{ valid?: boolean, definitionErrors?: string[], entityResults?: Array<{ violations?: Array<{ rowIndex?: number|string, field: string, severity: string, message: string }> }> }} DomainTestResult
 */
// ── State ─────────────────────────────────────────────────────────────────────
let _modalRoot: any = null;
let _currentDomainId: any = null;
let _draft: any = null; // Working copy of domain being edited
let _currentEntityIdx = 0; // Index of entity being edited
const _idCounter = 0;
const ROOT_ID = 'domain-editor-modal-root';
const RULE_TYPES = [
    { value: 'required', label: 'Required' },
    { value: 'ifAvailable', label: 'If Available' },
    { value: 'oneOf', label: 'One Of' },
    { value: 'numeric', label: 'Numeric' },
    { value: 'matchPattern', label: 'Pattern' },
    { value: 'custom', label: 'Custom' },
];
const _BATCH_RULE_TYPES = [{ value: 'uniqueKey', label: t('domainEditor.uniqueKeyLabel') }];
const CUSTOM_OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith'];
// ── Public API ────────────────────────────────────────────────────────────────
export async function openDomainEditorModal() {
    _modalRoot = document.getElementById(ROOT_ID);
    if (!_modalRoot) {
        _modalRoot = document.createElement('div');
        _modalRoot.id = ROOT_ID;
        document.body.appendChild(_modalRoot);
    }
    _currentDomainId = null;
    _draft = null;
    _currentEntityIdx = 0;
    _modalRoot.innerHTML = '';
    _modalRoot.appendChild(await _buildModal());
    // Sprint 3 Tier-B wire (Calvin 2026-06-03)
    syncDeepLinkUrl('domain-editor');
}
export function closeDomainEditorModal() {
    _draft = null;
    _currentDomainId = null;
    if (_modalRoot) _modalRoot.innerHTML = '';
    // Also remove any overlay created by buildModalShell
    const overlay = document.querySelector('.sym-overlay #domain-editor-modal')?.closest('.sym-overlay');
    if (overlay) overlay.remove();
    clearDeepLinkUrl();
}
export async function refreshDomainEditorModal() {
    if (!_modalRoot || !document.getElementById('domain-editor-modal')) return;
    _modalRoot.innerHTML = '';
    _modalRoot.appendChild(await _buildModal());
}
// ── Modal structure ───────────────────────────────────────────────────────────
async function _buildModal() {
    const { overlay, body } = buildModalShell({
        title: t('domainValidators') || 'Domain Validators',
        width: '960px',
        id: 'domain-editor-modal',
        twoPane: true,
        onClose: () => {
            _draft = null;
            _currentDomainId = null;
        },
    });
    // Remove footer - editor has its own inline actions
    const footer = overlay.querySelector('.sym-footer');
    if (footer) footer.remove();
    const sidebar = await _buildSidebar();
    const content = _draft ? _buildEditor() : _buildEmptyState();
    body.appendChild(sidebar);
    body.appendChild(content);
    return overlay;
}
// ── Sidebar (domain list) ─────────────────────────────────────────────────────
async function _buildSidebar() {
    const sidebar = _el('div', 'de-sidebar');
    const domains = await listSavedDomains();
    const activeIds = await getActiveDomainIds();
    const activeSet = new Set(activeIds);
    for (const d of domains) {
        const isActive = _currentDomainId === d.id;
        const item = _el('div', `de-sidebar-item${isActive ? ' de-sidebar-item--active' : ''}`);
        item.title = d.description || d.name;
        const dot = _el('span', `de-active-dot${activeSet.has(d.id) ? ' de-active-dot--on' : ''}`);
        item.appendChild(dot);
        const label = _el('span', 'de-sidebar-label');
        label.textContent = d.name;
        item.appendChild(label);
        const count = _el('span', 'de-sidebar-count');
        count.textContent = `${d.ruleCount}`;
        count.title = `${d.ruleCount} rules, ${d.entityCount} entities`;
        item.appendChild(count);
        item.onclick = async () => {
            _currentDomainId = d.id;
            _draft = deepClone(await getDomain(d.id));
            _currentEntityIdx = 0;
            await refreshDomainEditorModal();
        };
        sidebar.appendChild(item);
    }
    // New domain button
    const newBtn = _el('button', 'de-sidebar-btn de-sidebar-btn--primary');
    newBtn.textContent = '+ ' + t('newDomain');
    newBtn.onclick = async () => {
        const id = `domain-${Date.now()}`;
        _draft = {
            id,
            name: 'New Domain',
            version: '1.0',
            description: '',
            entities: [{ name: 'RECORD', rules: [], batchRules: [] }],
            relations: [],
        };
        _currentDomainId = null;
        _currentEntityIdx = 0;
        await refreshDomainEditorModal();
    };
    sidebar.appendChild(newBtn);
    // Import button
    const importBtn = _el('button', 'de-sidebar-btn de-sidebar-btn--secondary');
    importBtn.textContent = t('importDomain');
    importBtn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const domain = JSON.parse(text);
                await saveDomain(domain);
                showToast(t('domainEditor.domainImported', { name: domain.name }), 'success');
                await refreshDomainEditorModal();
            } catch (err: any) {
                showToast(t('domainEditor.importError', { message: err.message }), 'error');
            }
        };
        input.click();
    };
    sidebar.appendChild(importBtn);
    return sidebar;
}
// ── Empty state ───────────────────────────────────────────────────────────────
function _buildEmptyState() {
    const content = _el('div', 'de-empty');
    content.textContent = t('selectOrCreateDomain');
    return content;
}
// ── Editor (right pane) ───────────────────────────────────────────────────────
function _buildEditor() {
    const content = _el('div', 'de-content');
    // Domain metadata
    const metaRow = _el('div', 'de-meta-row');
    metaRow.appendChild(
        _labeledInput(
            t('domainEditor.nameLabel'),
            _draft.name,
            (v: any) => {
                _draft.name = v;
            },
            { width: '200px' },
        ),
    );
    metaRow.appendChild(
        _labeledInput(
            t('domainEditor.versionLabel'),
            _draft.version || '1.0',
            (v: any) => {
                _draft.version = v;
            },
            { width: '80px' },
        ),
    );
    metaRow.appendChild(
        _labeledInput(
            t('domainEditor.descriptionLabel'),
            _draft.description || '',
            (v: any) => {
                _draft.description = v;
            },
            { width: '300px' },
        ),
    );
    content.appendChild(metaRow);
    // Entity tabs
    const entityTabs = _el('div', 'de-entity-tabs');
    (_draft.entities || []).forEach((entity: any, idx: any) => {
        const tab = _el('button', `de-entity-tab${idx === _currentEntityIdx ? ' de-entity-tab--active' : ''}`);
        tab.textContent = entity.name;
        tab.onclick = () => {
            _currentEntityIdx = idx;
            refreshDomainEditorModal();
        };
        // Double-click to rename
        tab.ondblclick = async () => {
            const newName = await asyncPrompt(t('domainEditor.entityNamePrompt'), entity.name, {
                placeholder: t('domainEditor.recordTypesPlaceholder'),
                confirmLabel: 'Renomear',
                cancelLabel: 'Cancelar',
            });
            if (newName && newName.trim()) {
                _draft.entities[idx].name = newName.trim().toUpperCase();
                refreshDomainEditorModal();
            }
        };
        entityTabs.appendChild(tab);
    });
    // Add entity button
    const addEntityBtn = _el('button', 'de-add-entity-btn');
    addEntityBtn.textContent = '+';
    addEntityBtn.title = t('domainEditor.addEntity');
    addEntityBtn.onclick = () => {
        _draft.entities.push({ name: `ENTITY_${_draft.entities.length + 1}`, rules: [], batchRules: [] });
        _currentEntityIdx = _draft.entities.length - 1;
        refreshDomainEditorModal();
    };
    entityTabs.appendChild(addEntityBtn);
    // Delete entity button (if >1)
    if (_draft.entities.length > 1) {
        const delEntityBtn = _el('button', 'de-del-entity-btn');
        delEntityBtn.textContent = '\u2212';
        delEntityBtn.title = t('domainEditor.removeEntity');
        delEntityBtn.onclick = () => {
            _draft.entities.splice(_currentEntityIdx, 1);
            _currentEntityIdx = Math.min(_currentEntityIdx, _draft.entities.length - 1);
            refreshDomainEditorModal();
        };
        entityTabs.appendChild(delEntityBtn);
    }
    content.appendChild(entityTabs);
    // Entity rules
    const entity = _draft.entities[_currentEntityIdx];
    if (entity) {
        content.appendChild(_buildRulesSection(entity));
        content.appendChild(_buildBatchRulesSection(entity));
    }
    // Relations section (collapsible)
    content.appendChild(_buildRelationsSection());
    // Footer: actions
    const footer = _el('div', 'de-footer');
    const saveBtn = _actionBtn('Save', 'accent', async () => {
        const check = validateDomainDefinition(_draft);
        if (!check.valid) {
            showToast(t('domainEditor.validationError', { message: check.errors[0] }), 'error');
            return;
        }
        await saveDomain(_draft);
        _currentDomainId = _draft.id;
        showToast(t('domainEditor.domainSaved', { name: _draft.name }), 'success');
        await refreshDomainEditorModal();
    });
    const testBtn = _actionBtn('Test Data', 'muted', () => {
        _openTestPanel(content);
    });
    const exportBtn = _actionBtn('Export', 'neutral', () => {
        const json = JSON.stringify(_draft, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `domain-${_draft.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(t('domainEditor.exported'), 'success');
    });
    const dupBtn = _actionBtn('Duplicate', 'neutral', async () => {
        if (!_currentDomainId) {
            showToast(t('domainEditor.saveFirst'), 'warning');
            return;
        }
        await duplicateDomain(_currentDomainId);
        showToast(t('domainEditor.duplicated'), 'success');
        await refreshDomainEditorModal();
    });
    const delBtn = _actionBtn('Delete', 'danger', async () => {
        if (!_currentDomainId) return;
        const ok = await asyncConfirm(t('domainEditor.deleteConfirm', { name: _draft.name }), {
            confirmLabel: t('domainEditor.deleteLabel'),
            cancelLabel: t('domainEditor.cancelLabel'),
            destructive: true,
        } as any);
        if (!ok) return;
        await deleteDomain(_currentDomainId);
        _currentDomainId = null;
        _draft = null;
        showToast(t('domainEditor.deleted'), 'success');
        await refreshDomainEditorModal();
    });
    footer.appendChild(saveBtn);
    footer.appendChild(testBtn);
    footer.appendChild(exportBtn);
    if (_currentDomainId) {
        footer.appendChild(dupBtn);
        footer.appendChild(delBtn);
    }
    content.appendChild(footer);
    return content;
}
// ── Rules section ─────────────────────────────────────────────────────────────
/**
 * @param {any} entity
 */
function _buildRulesSection( entity: any) {
    const section = _el('div');
    const heading = _el('h4', 'de-section-heading');
    heading.textContent = `${t('domainEditor.rulesHeading')} (${(entity.rules || []).length})`;
    section.appendChild(heading);
    const table = _el('table', 'de-rules-table');
    // Header
    const thead = _el('thead');
    const hRow = _el('tr');
    for (const h of [
        t('domainEditor.fieldHeader'),
        t('domainEditor.typeHeader'),
        t('domainEditor.parametersHeader'),
        t('domainEditor.severityHeader'),
        '',
    ]) {
        const th = _el('th');
        th.textContent = h;
        hRow.appendChild(th);
    }
    thead.appendChild(hRow);
    table.appendChild(thead);
    // Body
    const tbody = _el('tbody');
    (entity.rules || []).forEach((rule: any, idx: any) => {
        tbody.appendChild(_buildRuleRow(entity, rule, idx));
    });
    table.appendChild(tbody);
    section.appendChild(table);
    // Add rule button
    const addBtn = _el('button', 'de-add-btn');
    addBtn.textContent = '+ ' + (t('addRule') || t('domainEditor.addRule'));
    addBtn.onclick = () => {
        if (!entity.rules) entity.rules = [];
        entity.rules.push({ type: 'required', field: '', label: '' });
        refreshDomainEditorModal();
    };
    section.appendChild(addBtn);
    return section;
}
/**
 * @param {any} entity
 * @param {any} rule
 * @param {any} idx
 */
function _buildRuleRow( entity: any, rule: any, idx: any) {
    const tr = _el('tr');
    // Field
    const tdField = _el('td');
    const fieldInput = _el('input', 'de-rule-input');
    fieldInput.type = 'text';
    fieldInput.value = rule.field || '';
    fieldInput.placeholder = 'field_name';
    fieldInput.style.width = '120px';
    fieldInput.onchange = (e: any) => {
        rule.field = e.target.value.trim();
        if (!rule.label) rule.label = rule.field;
    };
    tdField.appendChild(fieldInput);
    tr.appendChild(tdField);
    // Type
    const tdType = _el('td');
    const typeSelect = _el('select', 'de-rule-input');
    for (const rt of RULE_TYPES) {
        const opt = _el('option');
        opt.value = rt.value;
        opt.textContent = rt.label;
        if (rt.value === rule.type) opt.selected = true;
        typeSelect.appendChild(opt);
    }
    typeSelect.onchange = (e: any) => {
        rule.type = e.target.value;
        refreshDomainEditorModal();
    };
    tdType.appendChild(typeSelect);
    tr.appendChild(tdType);
    // Parameters (contextual)
    const tdParams = _el('td');
    tdParams.appendChild(_buildParamsInput(rule));
    tr.appendChild(tdParams);
    // Severity
    const tdSev = _el('td');
    const sevSelect = _el('select', 'de-rule-input');
    for (const sev of ['error', 'warning', 'info']) {
        const opt = _el('option');
        opt.value = sev;
        opt.textContent = sev;
        if ((rule.severity || 'error') === sev) opt.selected = true;
        sevSelect.appendChild(opt);
    }
    sevSelect.onchange = (e: any) => {
        rule.severity = e.target.value;
    };
    tdSev.appendChild(sevSelect);
    tr.appendChild(tdSev);
    // Delete
    const tdDel = _el('td');
    const delBtn = _el('button', 'de-delete-btn');
    delBtn.textContent = '\u2715';
    delBtn.title = 'Remove rule';
    delBtn.onclick = () => {
        entity.rules.splice(idx, 1);
        refreshDomainEditorModal();
    };
    tdDel.appendChild(delBtn);
    tr.appendChild(tdDel);
    return tr;
}
/**
 * @param {any} rule
 */
function _buildParamsInput( rule: any) {
    const wrapper = _el('div', 'de-params-row');
    switch (rule.type) {
        case 'required':
        case 'ifAvailable':
            // Sem parametros adicionais
            wrapper.textContent = '\u2014';
            break;
        case 'oneOf': {
            const input = _el('input', 'de-rule-input');
            input.type = 'text';
            input.value = (rule.allowed || []).join(', ');
            input.placeholder = 'value1, value2, ...';
            input.style.width = '180px';
            input.onchange = (e: any) => {
                rule.allowed = e.target.value
                    .split(',')
                    .map((v: any) => v.trim())
                    .filter(Boolean);
            };
            wrapper.appendChild(input);
            break;
        }
        case 'numeric': {
            if (!rule.opts) rule.opts = {};
            const minInput = _el('input', 'de-rule-input');
            minInput.type = 'number';
            minInput.value = rule.opts.min ?? '';
            minInput.placeholder = 'min';
            minInput.style.width = '70px';
            minInput.onchange = (e: any) => {
                rule.opts.min = e.target.value !== '' ? Number(e.target.value) : undefined;
            };
            const maxInput = _el('input', 'de-rule-input');
            maxInput.type = 'number';
            maxInput.value = rule.opts.max ?? '';
            maxInput.placeholder = 'max';
            maxInput.style.width = '70px';
            maxInput.onchange = (e: any) => {
                rule.opts.max = e.target.value !== '' ? Number(e.target.value) : undefined;
            };
            wrapper.appendChild(minInput);
            wrapper.appendChild(_el('span'));
            wrapper.lastChild.textContent = '\u2013';
            wrapper.appendChild(maxInput);
            break;
        }
        case 'matchPattern': {
            const input = _el('input', 'de-rule-input');
            input.type = 'text';
            input.value = rule.pattern || '';
            input.placeholder = 'regex pattern';
            input.style.width = '140px';
            input.onchange = (e: any) => {
                rule.pattern = e.target.value;
            };
            const hintInput = _el('input', 'de-rule-input');
            hintInput.type = 'text';
            hintInput.value = rule.formatHint || '';
            hintInput.placeholder = 'hint';
            hintInput.style.width = '80px';
            hintInput.onchange = (e: any) => {
                rule.formatHint = e.target.value;
            };
            wrapper.appendChild(input);
            wrapper.appendChild(hintInput);
            break;
        }
        case 'custom': {
            const opSelect = _el('select', 'de-rule-input');
            for (const op of CUSTOM_OPERATORS) {
                const opt = _el('option');
                opt.value = op;
                opt.textContent = op;
                if ((rule.operator || 'eq') === op) opt.selected = true;
                opSelect.appendChild(opt);
            }
            opSelect.onchange = (e: any) => {
                rule.operator = e.target.value;
            };
            const valInput = _el('input', 'de-rule-input');
            valInput.type = 'text';
            valInput.value = rule.value ?? '';
            valInput.placeholder = 'value';
            valInput.style.width = '80px';
            valInput.onchange = (e: any) => {
                rule.value = e.target.value;
            };
            wrapper.appendChild(opSelect);
            wrapper.appendChild(valInput);
            break;
        }
    }
    return wrapper;
}
// ── Batch rules section ───────────────────────────────────────────────────────
/**
 * @param {any} entity
 */
function _buildBatchRulesSection( entity: any) {
    const section = _el('div', 'de-batch-section');
    const heading = _el('h4', 'de-section-heading');
    heading.textContent = `Batch Rules (${(entity.batchRules || []).length})`;
    section.appendChild(heading);
    (entity.batchRules || []).forEach((br: any, idx: any) => {
        const row = _el('div', 'de-batch-row');
        const label = _el('span', 'de-batch-label');
        label.textContent = t('domainEditor.uniqueKeyLabel');
        row.appendChild(label);
        const input = _el('input', 'de-rule-input');
        input.type = 'text';
        input.value = (br.fields || []).join(', ');
        input.placeholder = 'field1, field2, ...';
        input.style.width = '200px';
        input.onchange = (e: any) => {
            br.fields = e.target.value
                .split(',')
                .map((v: any) => v.trim())
                .filter(Boolean);
            br.label = br.fields.join('+');
        };
        row.appendChild(input);
        const delBtn = _el('button', 'de-batch-delete-btn');
        delBtn.textContent = '\u2715';
        delBtn.onclick = () => {
            entity.batchRules.splice(idx, 1);
            refreshDomainEditorModal();
        };
        row.appendChild(delBtn);
        section.appendChild(row);
    });
    const addBtn = _el('button', 'de-add-btn de-add-btn--mt4');
    addBtn.textContent = '+ ' + (t('addBatchRule') || 'Add Batch Rule');
    addBtn.onclick = () => {
        if (!entity.batchRules) entity.batchRules = [];
        entity.batchRules.push({ type: 'uniqueKey', fields: [], label: '' });
        refreshDomainEditorModal();
    };
    section.appendChild(addBtn);
    return section;
}
// ── Relations section ─────────────────────────────────────────────────────────
function _buildRelationsSection() {
    const section = _el('div', 'de-relations-section');
    const heading = _el('h4', 'de-section-heading de-section-heading--clickable');
    heading.textContent = `Relations (${(_draft.relations || []).length})`;
    heading.title = 'Cross-entity referential integrity';
    section.appendChild(heading);
    (_draft.relations || []).forEach((rel: any, idx: any) => {
        const row = _el('div', 'de-relation-row');
        for (const [prop, placeholder] of [
            ['from', 'from entity'],
            ['fromField', t('domainEditor.fromFieldLabel')],
            ['to', 'to entity'],
            ['toField', t('domainEditor.toFieldLabel')],
            ['label', 'label'],
        ]) {
            const input = _el('input', 'de-rule-input');
            input.type = 'text';
            input.value = rel[prop] || '';
            input.placeholder = placeholder;
            input.style.width = '100px';
            input.onchange = (e: any) => {
                rel[prop] = e.target.value.trim();
            };
            row.appendChild(input);
        }
        const delBtn = _el('button', 'de-batch-delete-btn');
        delBtn.textContent = '\u2715';
        delBtn.onclick = () => {
            _draft.relations.splice(idx, 1);
            refreshDomainEditorModal();
        };
        row.appendChild(delBtn);
        section.appendChild(row);
    });
    const addBtn = _el('button', 'de-add-btn de-add-btn--mt4');
    addBtn.textContent = '+ Add Relation';
    addBtn.onclick = () => {
        if (!_draft.relations) _draft.relations = [];
        _draft.relations.push({ from: '', fromField: '', to: '', toField: '', label: '' });
        refreshDomainEditorModal();
    };
    section.appendChild(addBtn);
    return section;
}
// ── Test panel ────────────────────────────────────────────────────────────────
/**
 * @param {any} container
 */
function _openTestPanel( container: any) {
    // Remove existing test panel if present
    const existing = document.getElementById('domain-test-panel');
    if (existing) {
        existing.remove();
        return;
    }
    const panel = _el('div', 'de-test-panel');
    panel.id = 'domain-test-panel';
    const heading = _el('h4', 'de-test-heading');
    heading.textContent = t('testAgainstData') || 'Test Against Data';
    panel.appendChild(heading);
    const hint = _el('p', 'de-test-hint');
    hint.textContent = t('domainEditor.importHint');
    panel.appendChild(hint);
    const textarea = _el('textarea', 'de-test-textarea');
    textarea.placeholder = '[{"field1": "value1", "field2": 42}, ...]';
    panel.appendChild(textarea);
    const btnRow = _el('div', 'de-test-btn-row');
    const runBtn = _actionBtn('Run Test', 'accent', async () => {
        const resultsDiv = document.getElementById('domain-test-results');
        if (resultsDiv) resultsDiv.remove();
        /** @type {any} */ let data;
        try {
            data = JSON.parse(textarea.value);
            if (!Array.isArray(data)) data = [data];
        } catch (_e: any) {
            showToast('Invalid JSON', 'error');
            return;
        }
        const result = testDomainAgainstData(_draft, data);
        const div = _el('div', 'de-test-results');
        div.id = 'domain-test-results';
        if (!result.valid && result.definitionErrors) {
            div.innerHTML = `<p class="de-test-msg--error">Definition errors: ${escapeHtml(result.definitionErrors.join('; '))}</p>`;
        } else {
            let totalViolations = 0;
            for (const er of result.entityResults || []) {
                totalViolations += (er.violations || []).length;
            }
            if (totalViolations === 0) {
                div.innerHTML = '<p class="de-test-msg--success">All records valid. No violations found.</p>';
            } else {
                const tbl = document.createElement('table');
                tbl.innerHTML = `<thead><tr><th>${t('domainEditor.validationRow')}</th><th>${t('domainEditor.validationField')}</th><th>${t('domainEditor.validationSeverity')}</th><th>${t('domainEditor.validationMessage')}</th></tr></thead>`;
                const tbody = _el('tbody');
                for (const er of result.entityResults || []) {
                    for (const v of er.violations || []) {
                        const row = _el('tr');
                        const sevClass =
                            v.severity === 'error'
                                ? 'de-test-sev--error'
                                : v.severity === 'warning'
                                  ? 'de-test-sev--warning'
                                  : 'de-test-sev--info';
                        row.innerHTML = `<td>${v.rowIndex ?? '-'}</td><td>${escapeHtml(v.field)}</td><td class="${sevClass}">${escapeHtml(v.severity)}</td><td>${escapeHtml(v.message)}</td>`;
                        tbody.appendChild(row);
                    }
                }
                tbl.appendChild(tbody);
                div.appendChild(tbl);
            }
        }
        panel.appendChild(div);
    });
    const uploadBtn = _actionBtn('Upload File', 'neutral', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.csv';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            textarea.value = await file.text();
        };
        input.click();
    });
    btnRow.appendChild(runBtn);
    btnRow.appendChild(uploadBtn);
    panel.appendChild(btnRow);
    container.appendChild(panel);
}
// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * @param {any} tag
 * @param {any} [className]
 */
function _el( tag: any, className: any = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
}
/**
 * @param {any} label
 * @param {any} value
 * @param {any} onChange
 * @param {any} opts
 */
function _labeledInput( label: any, value: any, onChange: any, opts: any = {}) {
    const wrapper = _el('div', 'de-labeled-input');
    const lbl = _el('label');
    lbl.textContent = label;
    const input = _el('input');
    input.type = 'text';
    input.value = value;
    if (opts.width) input.style.width = opts.width;
    input.onchange = (e: any) => onChange(e.target.value);
    wrapper.appendChild(lbl);
    wrapper.appendChild(input);
    return wrapper;
}
/**
 * @param {string} text
 * @param {string} colorClass - One of 'accent', 'muted', 'neutral', 'danger'
 * @param {Function} onClick
 */
function _actionBtn( text: any, colorClass: any, onClick: any) {
    const btn = _el('button', `de-action-btn de-action-btn--${colorClass}`);
    btn.textContent = text;
    btn.onclick = onClick;
    return btn;
}
