// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   DATA STUDIO COLLECTIONS PANEL — Data group manager sidebar
   Painel de colecoes — cria e lista colecoes (data groups)
   ================================================================ */

import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { guardBackendFetch } from '../../main/guestGate.js';

/** @type {any} */
let _container: any = null;
const _state = {
    loading: false,
    items: [],
    unavailableReason: '',
};

const TYPE_OPTIONS = ['manual', 'observation', 'family', 'model', 'relation', 'derived'];
const STATUS_OPTIONS = ['draft', 'active', 'audited', 'archived'];
const AUDIT_OPTIONS = ['pass', 'pass_with_issues', 'fail'];

async function _parseApiJson(/** @type {any} */ resp: any, /** @type {any} */ context: any) {
    // Content-type guard: SPA fallback may return index.html with 200.
    // Detect before attempting JSON.parse so we can classify as
    // 'api_unavailable' silently instead of emitting a console.error.
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    const raw = await resp.text();
    const looksJson = ct.includes('json') || /^\s*[[{]/.test(raw);
    if (!looksJson) {
        // Api not providing data-groups endpoint - common in static
        // hosting (Bluehost) or when api-server is not running.
        const err: any = new Error(`${context}: api_unavailable`);
        err._apiUnavailable = true;
        throw err;
    }
    try {
        return raw ? JSON.parse(raw) : {};
    } catch {
        const sample = String(raw || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120);
        throw new Error(`${context}: invalid_json (${sample || 'empty_response'})`);
    }
}

export function initCollectionsPanel(/** @type {any} */ container: any) {
    _container = container || document.querySelector('.ds-collections');
    _render();
    refreshCollections();
}

export async function refreshCollections() {
    if (!_container) return;
    // ECBYTS-OPEN-LOCAL-001 F1: em Modo Convidado nem tenta o fetch — o painel
    // mostra o mesmo aviso visível de api_unavailable (render abaixo), sem 404.
    if (!guardBackendFetch('datastudio:collections-list', 'boot')) {
        _state.loading = false;
        _state.items = [];
        _state.unavailableReason = 'api_unavailable';
        _render();
        return;
    }
    _state.loading = true;
    _render();
    try {
        const resp = await fetch('/api/data-groups?include=items,audits', { credentials: 'same-origin' });
        const body = await _parseApiJson(resp, 'collections_list');
        if (!resp.ok || !body?.success) {
            throw new Error(body?.error || `Request failed (${resp.status})`);
        }
        _state.items = Array.isArray(body.data) ? body.data : [];
        _state.unavailableReason = '';
    } catch (err) {
        const e: any = err;
        const msg = String(e?.message || '');
        const apiUnavailable =
            e?._apiUnavailable ||
            msg.includes('api_unavailable') ||
            msg.includes('invalid_json (<!DOCTYPE') ||
            msg.includes('Request failed (404)');
        _state.unavailableReason = apiUnavailable ? 'api_unavailable' : 'load_failed';
        // api_unavailable is an expected condition (static hosting, offline,
        // walker pre-boot); log at debug so it doesn't pollute critical-error
        // count in the click-walker feedback loop. Real failures still error.
        if (apiUnavailable) {
            console.debug('[ecbyts:datastudio] collections unavailable:', msg);
        } else {
            console.error('[ecbyts:datastudio] Collections load failed:', msg);
            showToast(t('dsCollectionsLoadFail') || 'Failed to load colecoes', 'error');
        }
    } finally {
        _state.loading = false;
        _render();
    }
}

// --- Internal ---

function _render() {
    if (!_container) return;
    _container.textContent = '';

    const header = document.createElement('div');
    header.className = 'ds-collections-header';
    header.textContent = t('dsCollections') || 'Colecoes';
    _container.appendChild(header);

    const toolbar = document.createElement('div');
    toolbar.className = 'ds-collections-toolbar';

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'ds-collections-refresh';
    refreshBtn.textContent = t('dsCollectionsRefresh') || 'Atualizar';
    refreshBtn.addEventListener('click', refreshCollections);
    toolbar.appendChild(refreshBtn);

    const loading = document.createElement('span');
    loading.className = 'ds-collections-loading';
    loading.textContent = _state.loading ? t('dsLoading') || 'Loading...' : '';
    toolbar.appendChild(loading);
    _container.appendChild(toolbar);

    _container.appendChild(_buildCreateForm());

    if (_state.unavailableReason === 'api_unavailable') {
        const empty = document.createElement('div');
        empty.className = 'ds-collections-empty';
        empty.textContent =
            t('dsCollectionsApiUnavailable') || 'Colecoes indisponiveis neste modo (API bridge offline).';
        _container.appendChild(empty);
        return;
    }

    if (!_state.items.length && !_state.loading) {
        const empty = document.createElement('div');
        empty.className = 'ds-collections-empty';
        empty.textContent = t('dsCollectionsEmpty') || 'Sem colecoes ainda.';
        _container.appendChild(empty);
        return;
    }

    for (const group of _state.items) {
        _container.appendChild(_renderGroup(group));
    }
}

function _buildCreateForm() {
    const wrap = document.createElement('div');
    wrap.className = 'ds-collections-create';

    const title = document.createElement('div');
    title.className = 'ds-collections-title';
    title.textContent = t('dsCollectionsCreate') || 'Nova colecao';
    wrap.appendChild(title);

    const titleInput = _input('text', t('dsCollectionTitle') || 'Titulo', 'ds-collections-input');
    const scopeInput = _input('text', t('dsCollectionScope') || 'Scope (ex: project:alpha)', 'ds-collections-input');

    const typeSelect = _select(TYPE_OPTIONS, t('dsCollectionType') || 'Tipo');
    const statusSelect = _select(STATUS_OPTIONS, t('dsCollectionStatus') || 'Status');
    statusSelect.value = 'draft';

    const defLabel = document.createElement('div');
    defLabel.className = 'ds-collections-label';
    defLabel.textContent = t('dsCollectionDefinition') || 'Definition (JSON)';
    const defArea = document.createElement('textarea');
    defArea.className = 'ds-collections-textarea';
    defArea.rows = 3;
    defArea.value = '{\n  "mode": "manual"\n}';

    const itemsLabel = document.createElement('div');
    itemsLabel.className = 'ds-collections-label';
    itemsLabel.textContent = t('dsCollectionItems') || 'Items (JSON array, optional)';
    const itemsArea = document.createElement('textarea');
    itemsArea.className = 'ds-collections-textarea';
    itemsArea.rows = 2;
    itemsArea.placeholder = '[{"entity_type":"elements","entity_id":"el_1"}]';

    const createBtn = document.createElement('button');
    createBtn.className = 'ds-collections-create-btn';
    createBtn.textContent = t('dsCollectionCreateBtn') || 'Criar colecao';
    createBtn.addEventListener('click', async () => {
        /** @type {any} */
        const payload: any = {
            title: titleInput.value.trim(),
            scope: scopeInput.value.trim(),
            type: typeSelect.value,
            status: statusSelect.value,
        };
        if (!payload.title || !payload.scope) {
            showToast(t('dsCollectionMissing') || 'Titulo e scope sao obrigatorios', 'warning');
            return;
        }
        let definition;
        try {
            definition = JSON.parse(defArea.value || '{}');
        } catch (_err) {
            showToast(t('dsCollectionDefInvalid') || 'Definition JSON invalido', 'error');
            return;
        }
        payload.definition = definition;

        let items = [];
        if (itemsArea.value.trim()) {
            try {
                items = JSON.parse(itemsArea.value.trim());
                if (!Array.isArray(items)) throw new Error('items_not_array');
            } catch {
                showToast(t('dsCollectionItemsInvalid') || 'Items JSON invalido', 'error');
                return;
            }
        }
        if (items.length) payload.items = items;

        // ECBYTS-OPEN-LOCAL-001 F1 (RF1/A11): ação do usuário — toast + abort.
        if (!guardBackendFetch('datastudio:collections-create', 'action')) return;

        try {
            const resp = await fetch('/api/data-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const body = await _parseApiJson(resp, 'collections_create');
            if (!resp.ok || !body?.success) {
                throw new Error(body?.error || `Request failed (${resp.status})`);
            }
            showToast(t('dsCollectionCreated') || 'Colecao criada', 'success');
            titleInput.value = '';
            scopeInput.value = '';
            statusSelect.value = 'draft';
            itemsArea.value = '';
            refreshCollections();
        } catch (err) {
            showToast((err as any)?.message || 'Falha ao criar colecao', 'error');
        }
    });

    wrap.appendChild(titleInput);
    wrap.appendChild(scopeInput);
    wrap.appendChild(typeSelect);
    wrap.appendChild(statusSelect);
    wrap.appendChild(defLabel);
    wrap.appendChild(defArea);
    wrap.appendChild(itemsLabel);
    wrap.appendChild(itemsArea);
    wrap.appendChild(createBtn);

    return wrap;
}

function _renderGroup(/** @type {any} */ group: any) {
    const card = document.createElement('div');
    card.className = 'ds-collections-card';

    const header = document.createElement('div');
    header.className = 'ds-collections-card-header';
    header.textContent = group.title || 'Colecao';
    card.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'ds-collections-meta';
    meta.textContent = `${group.type || 'manual'} · ${group.status || 'draft'}`;
    card.appendChild(meta);

    const counts = document.createElement('div');
    counts.className = 'ds-collections-counts';
    const items = Array.isArray(group.items) ? group.items.length : 0;
    counts.textContent = `${items} items`;
    card.appendChild(counts);

    const audit = _latestAudit(group);
    const auditEl = document.createElement('div');
    auditEl.className = 'ds-collections-audit';
    auditEl.textContent = audit
        ? `audit: ${audit.audit_result || 'pass'} · ${_shortDate(audit.audited_at)}`
        : t('dsCollectionNotAudited') || 'audit: not audited';
    card.appendChild(auditEl);

    const details = document.createElement('details');
    details.className = 'ds-collections-details';
    const summary = document.createElement('summary');
    summary.textContent = t('dsCollectionDetails') || 'Detalhes';
    details.appendChild(summary);
    const pre = document.createElement('pre');
    pre.className = 'ds-collections-json';
    pre.textContent = JSON.stringify(group.definition || {}, null, 2);
    details.appendChild(pre);
    card.appendChild(details);

    const actions = document.createElement('div');
    actions.className = 'ds-collections-actions';

    const snapBtn = document.createElement('button');
    snapBtn.className = 'ds-collections-action';
    snapBtn.textContent = t('dsCollectionSnapshot') || 'Snapshot';
    snapBtn.addEventListener('click', () => _snapshotGroup(group.id));
    actions.appendChild(snapBtn);

    const auditBtn = document.createElement('button');
    auditBtn.className = 'ds-collections-action';
    auditBtn.textContent = t('dsCollectionAudit') || 'Auditar';
    auditBtn.addEventListener('click', () => {
        card.classList.toggle('ds-collections-card--audit');
    });
    actions.appendChild(auditBtn);

    card.appendChild(actions);
    card.appendChild(_buildAuditForm(group.id));
    return card;
}

function _buildAuditForm(/** @type {any} */ groupId: any) {
    const wrap = document.createElement('div');
    wrap.className = 'ds-collections-audit-form';

    const byInput = _input('text', t('dsCollectionAuditBy') || 'Auditor (id/email)', 'ds-collections-input');
    const resultSelect = _select(AUDIT_OPTIONS, t('dsCollectionAuditResult') || 'Resultado');
    const notes = document.createElement('textarea');
    notes.className = 'ds-collections-textarea';
    notes.rows = 2;
    notes.placeholder = t('dsCollectionAuditNotes') || 'Notas de auditoria';

    const submit = document.createElement('button');
    submit.className = 'ds-collections-action ds-collections-action--primary';
    submit.textContent = t('dsCollectionAuditSave') || 'Salvar auditoria';
    submit.addEventListener('click', async () => {
        const payload = {
            audited_by: byInput.value.trim(),
            audit_result: resultSelect.value,
            audit_notes: notes.value.trim(),
        };
        if (!payload.audited_by) {
            showToast(t('dsCollectionAuditMissing') || 'Auditor obrigatorio', 'warning');
            return;
        }
        // ECBYTS-OPEN-LOCAL-001 F1 (RF1/A11): ação do usuário — toast + abort.
        if (!guardBackendFetch('datastudio:collections-audit', 'action')) return;
        try {
            const resp = await fetch(`/api/data-groups/${groupId}/audit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const body = await _parseApiJson(resp, 'collections_audit');
            if (!resp.ok || !body?.success) throw new Error(body?.error || `Request failed (${resp.status})`);
            showToast(t('dsCollectionAuditSaved') || 'Auditoria salva', 'success');
            refreshCollections();
        } catch (err) {
            showToast((err as any)?.message || 'Falha ao auditar', 'error');
        }
    });

    wrap.appendChild(byInput);
    wrap.appendChild(resultSelect);
    wrap.appendChild(notes);
    wrap.appendChild(submit);
    return wrap;
}

async function _snapshotGroup(/** @type {any} */ groupId: any) {
    // ECBYTS-OPEN-LOCAL-001 F1 (RF1/A11): ação do usuário — toast + abort.
    if (!guardBackendFetch('datastudio:collections-snapshot', 'action')) return;
    try {
        const resp = await fetch(`/api/data-groups/${groupId}/snapshot`, { method: 'POST' });
        const body = await _parseApiJson(resp, 'collections_snapshot');
        if (!resp.ok || !body?.success) throw new Error(body?.error || `Request failed (${resp.status})`);
        showToast(t('dsCollectionSnapCreated') || 'Snapshot criado', 'success');
        refreshCollections();
    } catch (err) {
        showToast((err as any)?.message || 'Falha ao criar snapshot', 'error');
    }
}

function _latestAudit(/** @type {any} */ group: any) {
    const audits = Array.isArray(group.audits) ? group.audits : [];
    if (!audits.length) return null;
    return audits.slice().sort((/** @type {any} */ a: any, /** @type {any} */ b: any) => String(b.audited_at || '').localeCompare(String(a.audited_at || '')))[0];
}

function _shortDate(/** @type {any} */ value: any) {
    if (!value) return 'n/a';
    return String(value).slice(0, 10);
}

function _input(/** @type {any} */ type: any, /** @type {any} */ placeholder: any, /** @type {any} */ className: any) {
    const input = document.createElement('input');
    input.type = type;
    input.className = className;
    input.placeholder = placeholder;
    return input;
}

function _select(/** @type {any} */ options: any, /** @type {any} */ ariaLabel: any) {
    const select = document.createElement('select');
    select.className = 'ds-collections-select';
    select.setAttribute('aria-label', ariaLabel);
    for (const opt of options) {
        const el = document.createElement('option');
        el.value = opt;
        el.textContent = opt;
        select.appendChild(el);
    }
    return select;
}

export const __testCollectionsPanel = {
    parseApiJson: _parseApiJson,
};
