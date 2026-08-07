// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FIELD-META-001 Fase 1b — popover UI (MVP 3 tabs)

   Non-modal, light-dismiss popover anchored to the triggering input.
   Listens to `ecbyts:field-meta-open` events dispatched by
   utils/ui/fieldMetaWrapper.js.

   MVP tabs (3 of the 6 planned):
   - Resumo: filled_by + value + confidence + notes
   - Proveniência: provenance + revisions
   - Avançado: flags + validation_state + regulatory_refs + privacy

   Uncertainty, Sources, Temporal/Dependents are Fase 1c.
   ================================================================ */

import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import { t } from '../i18n/translations.js';
import {
    FILLED_BY_VALUES,
    FILLED_BY_BADGE,
    CONFIDENCE_LEVELS,
    VALIDATION_STATES,
    FIELD_FLAGS,
    PRIVACY_SENSITIVITY,
    SOURCE_TYPES,
    setFilledBy,
    // eslint-disable-next-line
    appendRevision,
    createFieldMeta,
} from '../../core/fieldMeta/schema.js';
import * as _uncertaintyMod from '../../core/uncertainty/index.js';
const _u = (_uncertaintyMod as any);
const combineComponents = _u.combineComponents;
const Q2Q_LEVELS = _u.Q2Q_LEVELS;
const Q2Q_LAYMAN_LABELS_PT = _u.Q2Q_LAYMAN_LABELS_PT;
const UNCERTAINTY_SOURCES = _u.UNCERTAINTY_SOURCES;
const createUncertainty = _u.createUncertainty;
import { getFieldMeta, setFieldMeta } from '../../core/fieldMeta/store.js';
import { lazyImport } from '../helpers/lazyImport.js';

const POPOVER_ID = 'field-meta-popover';
/** @type {any} */
let _activeAnchor: any = null;
/** @type {any} */
let _activeMeta = null;

/**
 * Register global listener on document. Idempotent.
 */
let _listenerInstalled = false;
export function installFieldMetaPopoverListener() {
    if (_listenerInstalled) return;
    _listenerInstalled = true;
    document.addEventListener('ecbyts:field-meta-open', async (ev: any) => {
        const target = ev.target;
        const { field_key } = ev.detail || {};
        if (!field_key || !(target instanceof HTMLElement)) return;
        await openPopoverFor(target, field_key);
    });
    // Light-dismiss on outside click. Ignora cliques em qualquer botão ⓘ
    // (permite usuário alternar entre inputs sem fechar acidentalmente).
    document.addEventListener('click', (ev) => {
        const pop = document.getElementById(POPOVER_ID);
        if (!pop || pop.hidden) return;
        const evTarget = (ev.target as any);
        if (pop.contains(evTarget)) return;
        if (_activeAnchor && _activeAnchor.contains(evTarget)) return;
        if (evTarget?.closest?.('.field-meta-info-btn')) return;
        closePopover();
    });
    // ESC dismisses
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') closePopover();
    });
    // Auto-wrap any [data-field-meta="true"] node appearing in DOM (MVP
    // integration strategy - forms opt-in by just marking the attribute).
    _installAutoWrapObserver();
}

async function _installAutoWrapObserver() {
    // REF-SWEEPS RF-2: chamado fire-and-forget no init do popover — sem o chunk o
    // auto-wrap simplesmente nao e instalado (degradacao benigna: os campos ficam
    // sem o icone de metadados), em vez de vazar 'Uncaught (in promise)' no boot.
    const _wrap = await lazyImport('./fieldMetaWrapper.js', { importer: () => import('./fieldMetaWrapper.js') });
    if (!_wrap) return;
    const { autoWrapFieldsWithMeta } = _wrap;
    const runWrap = () => {
        try {
            autoWrapFieldsWithMeta(document);
        } catch (err: any) {
            console.debug('[field-meta] autoWrap error:', (err as any)?.message);
        }
    };
    // Initial pass for anything already in the DOM
    runWrap();
    // Observe additions / attr changes
    const mo = new MutationObserver((muts) => {
        let should = false;
        for (const m of muts) {
            if (m.type === 'childList' && m.addedNodes.length) {
                for (const n of m.addedNodes) {
                    if (n.nodeType === 1) {
                        const el = (n as any);
                        if (
                            el.matches?.('[data-field-meta="true"]') ||
                            el.querySelector?.('[data-field-meta="true"]:not([data-field-meta-wrapped])')
                        ) {
                            should = true;
                            break;
                        }
                    }
                }
            } else if (m.type === 'attributes' && m.attributeName === 'data-field-meta') {
                should = true;
            }
            if (should) break;
        }
        if (should) runWrap();
    });
    mo.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-field-meta'],
    });
}

/**
 * Open the popover anchored to inputEl for the given field_key.
 */
/** @param {any} inputEl @param {any} field_key */
export async function openPopoverFor(inputEl: any, field_key: any) {
    let meta = null;
    try {
        meta = await getFieldMeta(field_key);
    } catch (err: any) {
        console.warn('[field-meta] getFieldMeta failed, using blank:', (err as any)?.message);
    }
    // First-time click on a never-saved field → synthesize blank record so
    // UI can render and user can populate + save. Without this the popover
    // threw silently on meta.filled_by access and appeared unresponsive.
    if (!meta) {
        meta = createFieldMeta({
            field_key,
            value: inputEl?.value ?? null,
            filled_by: 'unknown',
        });
    }
    _activeAnchor = inputEl;
    _activeMeta = meta;
    let pop = document.getElementById(POPOVER_ID);
    if (!pop) {
        pop = _buildShell();
        document.body.appendChild(pop);
    }
    try {
        _render(pop, meta);
        _position(pop, inputEl);
        pop.hidden = false;
    } catch (err: any) {
        console.error('[field-meta] render failed:', err);
    }
}

export function closePopover() {
    const pop = document.getElementById(POPOVER_ID);
    if (pop) pop.hidden = true;
    _activeAnchor = null;
    _activeMeta = null;
}

function _buildShell() {
    const pop = document.createElement('div');
    pop.id = POPOVER_ID;
    pop.className = 'field-meta-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Metadados do campo');
    pop.hidden = true;
    return pop;
}

/** @param {any} pop @param {any} meta */
function _render(pop: any, meta: any) {
    const badge = (FILLED_BY_BADGE as any)[meta.filled_by] || (FILLED_BY_BADGE as any).unknown;
    pop.innerHTML = `
        <header class="fmp-head">
            <div class="fmp-title">
                <span class="fmp-filled-by" style="background:${badge.color};"
                    title="${t('fieldMeta.filledByTooltip', { label: escapeHtml(badge.label) })}">
                    ${escapeHtml(badge.glyph)}
                </span>
                <span class="fmp-key">${escapeHtml(meta.field_key)}</span>
            </div>
            <button type="button" class="fmp-close" aria-label="Fechar">&#x2715;</button>
        </header>
        <nav class="fmp-tabs" role="tablist">
            <button class="fmp-tab" role="tab" aria-selected="true" data-tab="summary">Resumo</button>
            <button class="fmp-tab" role="tab" aria-selected="false" data-tab="uncertainty">Incerteza</button>
            <button class="fmp-tab" role="tab" aria-selected="false" data-tab="provenance">Proveniência</button>
            <button class="fmp-tab" role="tab" aria-selected="false" data-tab="sources">Fontes</button>
            <button class="fmp-tab" role="tab" aria-selected="false" data-tab="temporal">Temporal</button>
            <button class="fmp-tab" role="tab" aria-selected="false" data-tab="advanced">Avançado</button>
            <button class="fmp-tab" role="tab" aria-selected="false" data-tab="calibration">Calibração</button>
            <button class="fmp-tab" role="tab" aria-selected="false" data-tab="dataGroup">Grupo</button>
            <button class="fmp-tab" role="tab" aria-selected="false" data-tab="additional">Adicional</button>
        </nav>
        <section class="fmp-body">
            ${_renderSummary(meta)}
            <div class="fmp-panel" data-tab="uncertainty" hidden>${_renderUncertainty(meta)}</div>
            <div class="fmp-panel" data-tab="provenance" hidden>${_renderProvenance(meta)}</div>
            <div class="fmp-panel" data-tab="sources" hidden>${_renderSources(meta)}</div>
            <div class="fmp-panel" data-tab="temporal" hidden>${_renderTemporal(meta)}</div>
            <div class="fmp-panel" data-tab="advanced" hidden>${_renderAdvanced(meta)}</div>
            <div class="fmp-panel" data-tab="calibration" hidden>${_renderCalibration(meta)}</div>
            <div class="fmp-panel" data-tab="dataGroup" hidden>${_renderDataGroup(meta)}</div>
            <div class="fmp-panel" data-tab="additional" hidden>${_renderAdditional(meta)}</div>
        </section>
    `;
    pop.querySelector('.fmp-close').addEventListener('click', closePopover);
    pop.querySelectorAll('.fmp-tab').forEach((btn: any) => {
        btn.addEventListener('click', () => _switchTab(pop, btn.dataset.tab));
    });
    _wireSummaryForm(pop, meta);
    _wireAdvancedForm(pop, meta);
    _wireUncertaintyForm(pop, meta);
    _wireSourcesForm(pop, meta);
    _wireTemporalForm(pop, meta);
    _wireCalibrationForm(pop, meta);
    _wireDataGroupForm(pop, meta);
    _wireAdditionalForm(pop, meta);
}

/** @param {any} meta */
function _renderSummary(meta: any) {
    const v = meta.value == null ? '' : String(meta.value);
    const notes = meta.notes || '';
    const filledByOptions = FILLED_BY_VALUES.map((fb: any) => {
        const b = (FILLED_BY_BADGE as any)[fb];
        return `<option value="${escapeHtml(fb)}" ${fb === meta.filled_by ? 'selected' : ''}>
            ${escapeHtml(b.label)}
        </option>`;
    }).join('');
    const confidenceOptions = ['', ...CONFIDENCE_LEVELS]
        .map(
            (
                c: any,
            ) => `<option value="${escapeHtml(c)}" ${c === (meta.confidence || '') ? 'selected' : ''}>
            ${escapeHtml(c || '—')}
        </option>`,
        )
        .join('');
    return `
        <div class="fmp-panel active" data-tab="summary">
            <label class="fmp-field">
                <span>Preenchido por</span>
                <select data-bind="filled_by">${filledByOptions}</select>
            </label>
            <label class="fmp-field">
                <span>Valor</span>
                <input type="text" data-bind="value" value="${escapeHtml(v)}" />
            </label>
            <fieldset class="fmp-censored">
                <legend>Dado censurado (Annex A Tela 0.5)</legend>
                <label>
                    <input type="checkbox" data-bind="censored.is_censored"
                        ${meta.censored?.is_censored ? 'checked' : ''} />
                    Resultado abaixo do limite de detecção/quantificação
                </label>
                <div class="fmp-censored-details">
                    <label>
                        <span>Tipo</span>
                        <select data-bind="censored.limit_type">
                            <option value="LD" ${meta.censored?.limit_type === 'LD' ? 'selected' : ''}>LD (detecção)</option>
                            <option value="LQ" ${meta.censored?.limit_type === 'LQ' ? 'selected' : ''}>LQ (quantificação)</option>
                        </select>
                    </label>
                    <label>
                        <span>Valor do limite</span>
                        <input type="number" step="0.001" min="0" data-bind="censored.limit_value"
                            value="${escapeHtml(meta.censored?.limit_value == null ? '' : String(meta.censored.limit_value))}" />
                    </label>
                </div>
            </fieldset>
            <fieldset class="fmp-qc-gate">
                <legend>Gate de validade (Annex A Tela 0)</legend>
                <label>
                    <input type="checkbox" data-qc-flag="invalid_holding_time"
                        ${meta.qc_flags?.includes('invalid_holding_time') ? 'checked' : ''} />
                    Holding time excedido (dado com validade comprometida)
                </label>
                <label>
                    <input type="checkbox" data-qc-flag="compromised_sample"
                        ${meta.qc_flags?.includes('compromised_sample') ? 'checked' : ''} />
                    Amostra comprometida (dado rejeitado — não entra em cálculos)
                </label>
            </fieldset>
            <label class="fmp-field">
                <span>Confiança epistêmica</span>
                <select data-bind="confidence">${confidenceOptions}</select>
            </label>
            <label class="fmp-field">
                <span>Notas</span>
                <textarea data-bind="notes" rows="3">${escapeHtml(notes)}</textarea>
            </label>
            <div class="fmp-actions">
                <button type="button" class="fmp-save">Salvar</button>
            </div>
        </div>
    `;
}

/** @param {any} meta */
function _renderProvenance(meta: any) {
    const p = meta.provenance || {};
    const revs = Array.isArray(meta.revisions) ? meta.revisions : [];
    return `
        <div class="fmp-prov">
            <div><strong>Agente:</strong> ${escapeHtml(p.agent?.label || '—')} (${escapeHtml(p.agent?.type || '')})</div>
            <div><strong>Atividade:</strong> ${escapeHtml(p.activity || '—')}</div>
            <div><strong>Quando:</strong> ${escapeHtml(p.set_at || '—')}</div>
        </div>
        <h5>Revisões (${revs.length})</h5>
        ${
            revs.length === 0
                ? '<p class="fmp-empty">Sem revisões ainda.</p>'
                : `<ul class="fmp-revs">${revs
                      .slice()
                      .reverse()
                      .map(
                          (r: any) => `<li>
                            <code>${escapeHtml(r.revision_id || '')}</code>
                            <div>${escapeHtml(r.prev_value + ' → ' + r.new_value)}</div>
                            <em>${escapeHtml(r.reason || '')}</em>
                        </li>`,
                      )
                      .join('')}</ul>`
        }
    `;
}

/** @param {any} meta */
function _renderAdvanced(meta: any) {
    const flagsChecked = (f: any) => meta.flags?.includes(f);
    const stateOptions = VALIDATION_STATES.map(
        (s: any) => `<option value="${escapeHtml(s)}" ${s === meta.validation_state ? 'selected' : ''}>
            ${escapeHtml(s)}
        </option>`,
    ).join('');
    const sensOptions = PRIVACY_SENSITIVITY.map(
        (s: any) => `<option value="${escapeHtml(s)}" ${s === meta.privacy?.sensitivity ? 'selected' : ''}>
            ${escapeHtml(s)}
        </option>`,
    ).join('');
    return `
        <label class="fmp-field">
            <span>Estado de validação</span>
            <select data-bind="validation_state">${stateOptions}</select>
        </label>
        <fieldset class="fmp-flags">
            <legend>Flags</legend>
            ${FIELD_FLAGS.map(
                (f: any) => `<label>
                    <input type="checkbox" data-flag="${escapeHtml(f)}" ${flagsChecked(f) ? 'checked' : ''} />
                    ${escapeHtml(f)}
                </label>`,
            ).join('')}
        </fieldset>
        <label class="fmp-field">
            <span>Referências regulatórias</span>
            <input type="text" data-bind="regulatory_refs"
                value="${escapeHtml((meta.regulatory_refs || []).join(', '))}"
                placeholder="${t('fieldMeta.legalRefPlaceholder')}" />
        </label>
        <fieldset class="fmp-privacy">
            <legend>Privacidade (LGPD)</legend>
            <label>
                <input type="checkbox" data-bind="privacy.is_pii" ${meta.privacy?.is_pii ? 'checked' : ''} />
                Contém PII
            </label>
            <label>
                <span>Sensibilidade</span>
                <select data-bind="privacy.sensitivity">${sensOptions}</select>
            </label>
        </fieldset>
        <div class="fmp-actions">
            <button type="button" class="fmp-save-advanced">Salvar avançado</button>
        </div>
    `;
}

/** @param {any} pop @param {any} tabId */
function _switchTab(pop: any, tabId: any) {
    pop.querySelectorAll('.fmp-tab').forEach((btn: any) => {
        btn.setAttribute('aria-selected', String(btn.dataset.tab === tabId));
    });
    pop.querySelectorAll('.fmp-panel').forEach((panel: any) => {
        if (panel.dataset.tab === tabId) {
            panel.hidden = false;
            panel.classList.add('active');
        } else {
            panel.hidden = true;
            panel.classList.remove('active');
        }
    });
}

/** @param {any} pop @param {any} meta */
function _wireSummaryForm(pop: any, meta: any) {
    const save = pop.querySelector('.fmp-save');
    if (!save) return;
    save.addEventListener('click', async () => {
        const filledBy = pop.querySelector('[data-bind="filled_by"]').value;
        const value = pop.querySelector('[data-bind="value"]').value;
        const confidence = pop.querySelector('[data-bind="confidence"]').value || null;
        const notes = pop.querySelector('[data-bind="notes"]').value;
        // Censored data (Annex A Tela 0.5)
        const isCensored = pop.querySelector('[data-bind="censored.is_censored"]').checked;
        const limitType = pop.querySelector('[data-bind="censored.limit_type"]').value;
        const limitValueRaw = pop.querySelector('[data-bind="censored.limit_value"]').value;
        const censored = {
            is_censored: isCensored,
            limit_type: isCensored ? limitType : null,
            limit_value: isCensored && limitValueRaw !== '' ? Number(limitValueRaw) : null,
        };
        // QC flags (Annex A Tela 0)
        const qcFlagsFromSummary = Array.from(pop.querySelectorAll('[data-qc-flag]'))
            .filter((cb: any) => cb.checked)
            .map((cb: any) => cb.dataset.qcFlag);
        let next = { ...meta, notes, confidence, censored, qc_flags: qcFlagsFromSummary };
        const newValue = _coerceValue(value, meta.value);
        if (filledBy !== meta.filled_by || newValue !== meta.value) {
            next = setFilledBy(next, {
                filled_by: filledBy,
                new_value: newValue !== meta.value ? newValue : undefined,
                reason: newValue !== meta.value ? 'edited via popover' : 'filled_by update',
            });
        }
        // Validity gate - if compromised_sample, mark rejected
        if (qcFlagsFromSummary.includes('compromised_sample')) {
            next.validation_state = 'rejected';
        } else if (qcFlagsFromSummary.includes('invalid_holding_time')) {
            next.validation_state = 'disputed';
        }
        await setFieldMeta(meta.field_key, next);
        _propagateValue(meta.field_key, next.value, filledBy);
        closePopover();
    });
}

/** @param {any} pop @param {any} meta */
function _wireAdvancedForm(pop: any, meta: any) {
    const save = pop.querySelector('.fmp-save-advanced');
    if (!save) return;
    save.addEventListener('click', async () => {
        const validation_state = pop.querySelector('[data-bind="validation_state"]').value;
        const flags = Array.from(pop.querySelectorAll('[data-flag]'))
            .filter((cb: any) => cb.checked)
            .map((cb: any) => cb.dataset.flag);
        const regStr = pop.querySelector('[data-bind="regulatory_refs"]').value;
        const regulatory_refs = regStr
            .split(',')
            .map((s: any) => s.trim())
            .filter(Boolean);
        const is_pii = pop.querySelector('[data-bind="privacy.is_pii"]').checked;
        const sensitivity = pop.querySelector('[data-bind="privacy.sensitivity"]').value;
        const next = {
            ...meta,
            validation_state,
            flags,
            regulatory_refs,
            privacy: { is_pii, sensitivity },
        };
        await setFieldMeta(meta.field_key, next);
        closePopover();
    });
}

/** @param {any} str @param {any} originalValue */
function _coerceValue(str: any, originalValue: any) {
    if (typeof originalValue === 'number') {
        const n = Number(str);
        return Number.isFinite(n) ? n : originalValue;
    }
    return str;
}

/** @param {any} field_key @param {any} value @param {any} filled_by */
function _propagateValue(field_key: any, value: any, filled_by: any) {
    document.dispatchEvent(
        new CustomEvent('ecbyts:field-meta-saved', {
            detail: { field_key, value, filled_by },
        }),
    );
}

/** @param {any} pop @param {any} anchor */
function _position(pop: any, anchor: any) {
    // position: fixed - coordenadas viewport-relativas, sem window.scroll*
    const r = anchor.getBoundingClientRect();
    const popWidth = 360;
    const popHeight = Math.min(window.innerHeight * 0.7, pop.offsetHeight || 400);
    const margin = 8;

    // Horizontal: alinha com esquerda do input, clampa dentro do viewport
    let left = r.left;
    if (left + popWidth > window.innerWidth - margin) {
        left = window.innerWidth - popWidth - margin;
    }
    if (left < margin) left = margin;

    // Vertical: preferencialmente abaixo do input, se não couber abre acima
    let top = r.bottom + 4;
    if (top + popHeight > window.innerHeight - margin) {
        const above = r.top - popHeight - 4;
        top = above >= margin ? above : Math.max(margin, window.innerHeight - popHeight - margin);
    }

    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(left)}px`;
}

// ─── Fase 2 tab renderers ───────────────────────────────────────────

/** @param {any} meta */
function _renderUncertainty(meta: any) {
    const u = meta.uncertainty || {};
    const classOptions = ['', ...Q2Q_LEVELS]
        .map(
            (
                lvl: any,
            ) => `<option value="${escapeHtml(lvl)}" ${lvl === (u.class || '') ? 'selected' : ''}>
            ${escapeHtml(lvl ? Q2Q_LAYMAN_LABELS_PT[lvl] : '—')}
        </option>`,
        )
        .join('');
    const sourcesChecked = (s: any) => Array.isArray(u.sources) && u.sources.includes(s);
    const comps = u.components || {};
    return `
        <label class="fmp-field">
            <span>Classe Q2Q (UNC-STRUCTURAL-001)</span>
            <select data-bind="unc.class">${classOptions}</select>
        </label>
        <label class="fmp-field">
            <span>U relativa combinada</span>
            <input type="number" step="0.01" min="0" max="1" data-bind="unc.value"
                value="${escapeHtml(u.value == null ? '' : String(u.value))}" />
        </label>
        <fieldset class="fmp-unc-sources">
            <legend>Fontes de incerteza (Eurachem 2019)</legend>
            ${UNCERTAINTY_SOURCES.map(
                (s: any) => `<label>
                    <input type="checkbox" data-unc-source="${escapeHtml(s)}" ${sourcesChecked(s) ? 'checked' : ''} />
                    ${escapeHtml(s)}
                </label>`,
            ).join('')}
        </fieldset>
        <fieldset class="fmp-unc-comps">
            <legend>Componentes (u por fonte, quadrature)</legend>
            ${['installation', 'sampling', 'analytical', 'qualitative', 'modeled']
                .map(
                    (c: any) => `<label class="fmp-field fmp-field-inline">
                        <span>${escapeHtml(c)}</span>
                        <input type="number" step="0.01" min="0" max="1"
                            data-unc-comp="${escapeHtml(c)}"
                            value="${escapeHtml(comps[c] == null ? '' : String(comps[c]))}" />
                    </label>`,
                )
                .join('')}
        </fieldset>
        <div class="fmp-actions">
            <button type="button" class="fmp-save-uncertainty">Salvar incerteza</button>
        </div>
    `;
}

/** @param {any} meta */
function _renderSources(meta: any) {
    const list = Array.isArray(meta.sources) ? meta.sources : [];
    const typeOptions = SOURCE_TYPES.map(
        (t: any) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`,
    ).join('');
    return `
        <h5>Evidências anexas (${list.length})</h5>
        ${
            list.length === 0
                ? '<p class="fmp-empty">Nenhuma fonte anexada.</p>'
                : `<ul class="fmp-sources">${list
                      .map(
                          (s: any, i: any) => `<li>
                            <strong>${escapeHtml(s.type || 'other')}</strong>
                            <code>${escapeHtml(s.ref || '')}</code>
                            <em>${escapeHtml(s.note || '')}</em>
                            <button type="button" class="fmp-src-del" data-idx="${i}" aria-label="Remover">✕</button>
                        </li>`,
                      )
                      .join('')}</ul>`
        }
        <fieldset>
            <legend>Adicionar fonte</legend>
            <label class="fmp-field">
                <span>Tipo</span>
                <select data-bind="new.type">${typeOptions}</select>
            </label>
            <label class="fmp-field">
                <span>Ref (URL, file id, laudo)</span>
                <input type="text" data-bind="new.ref" placeholder="${t('fieldMeta.sourceRefPlaceholder')}" />
            </label>
            <label class="fmp-field">
                <span>Nota</span>
                <input type="text" data-bind="new.note" placeholder="${t('fieldMeta.sourceNotePlaceholder')}" />
            </label>
            <div class="fmp-actions">
                <button type="button" class="fmp-src-add">Adicionar</button>
            </div>
        </fieldset>
    `;
}

/** @param {any} meta */
function _renderTemporal(meta: any) {
    const tv = meta.temporal_validity || {};
    const deps = Array.isArray(meta.dependents) ? meta.dependents : [];
    return `
        <label class="fmp-field">
            <span>Válido de</span>
            <input type="date" data-bind="tv.valid_from"
                value="${escapeHtml(tv.valid_from ? String(tv.valid_from).slice(0, 10) : '')}" />
        </label>
        <label class="fmp-field">
            <span>Válido até</span>
            <input type="date" data-bind="tv.valid_until"
                value="${escapeHtml(tv.valid_until ? String(tv.valid_until).slice(0, 10) : '')}" />
        </label>
        <label class="fmp-field">
            <span>Dependentes (field_keys separados por vírgula)</span>
            <textarea data-bind="dependents" rows="2"
                placeholder="element:abc:observation:0:trend, element:xyz:...">${escapeHtml(deps.join(', '))}</textarea>
        </label>
        <div class="fmp-actions">
            <button type="button" class="fmp-save-temporal">Salvar temporal</button>
        </div>
    `;
}

// ─── Fase 2 handlers ────────────────────────────────────────────────

/** @param {any} pop @param {any} meta */
function _wireUncertaintyForm(pop: any, meta: any) {
    const save = pop.querySelector('.fmp-save-uncertainty');
    if (!save) return;
    save.addEventListener('click', async () => {
        const q2q = pop.querySelector('[data-bind="unc.class"]').value || null;
        const uVal = pop.querySelector('[data-bind="unc.value"]').value;
        const value = uVal === '' ? null : Number(uVal);
        const sources = Array.from(pop.querySelectorAll('[data-unc-source]'))
            .filter((cb: any) => cb.checked)
            .map((cb: any) => cb.dataset.uncSource);
        const components: Record<string, any> = {};
        for (const c of ['installation', 'sampling', 'analytical', 'qualitative', 'modeled']) {
            const el = pop.querySelector(`[data-unc-comp="${c}"]`);
            const v = el?.value;
            components[c] = v === '' || v === undefined ? null : Number(v);
        }
        // Auto-combine via GUM §5.2 quadrature when value is blank but
        // components are present (gap #7 fix).
        let effectiveValue = value;
        if (effectiveValue === null) {
            const combined = combineComponents(components);
            if (combined !== null && Number.isFinite(combined)) effectiveValue = combined;
        }
        let uncertainty = null;
        if (q2q && sources.length > 0) {
            try {
                uncertainty = createUncertainty({
                    class: q2q,
                    value: effectiveValue,
                    sources,
                    components,
                    provenance: { method: 'manual', set_by: meta.provenance?.set_by ?? null },
                });
            } catch (err: any) {
                showToast(
                    t('fieldMeta.uncertaintyValidationError', { message: (err as any).message }),
                    'error',
                );
                return;
            }
        }
        const next = { ...meta, uncertainty };
        const { setFieldMeta } = await import('../../core/fieldMeta/store.js');
        await setFieldMeta(meta.field_key, next);
        closePopover();
    });
}

/** @param {any} pop @param {any} meta */
function _wireSourcesForm(pop: any, meta: any) {
    const addBtn = pop.querySelector('.fmp-src-add');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const type = pop.querySelector('[data-bind="new.type"]').value;
            const ref = pop.querySelector('[data-bind="new.ref"]').value.trim();
            const note = pop.querySelector('[data-bind="new.note"]').value.trim();
            if (!ref) {
                showToast(t('fieldMeta.sourceRefRequired'), 'warn');
                return;
            }
            const next = {
                ...meta,
                sources: [...(meta.sources || []), { type, ref, note }],
            };
            const { setFieldMeta } = await import('../../core/fieldMeta/store.js');
            await setFieldMeta(meta.field_key, next);
            closePopover();
        });
    }
    pop.querySelectorAll('.fmp-src-del').forEach((btn: any) => {
        btn.addEventListener('click', async () => {
            const i = Number(btn.dataset.idx);
            const list = Array.isArray(meta.sources) ? [...meta.sources] : [];
            list.splice(i, 1);
            const next = { ...meta, sources: list };
            const { setFieldMeta } = await import('../../core/fieldMeta/store.js');
            await setFieldMeta(meta.field_key, next);
            closePopover();
        });
    });
}

/** @param {any} pop @param {any} meta */
function _wireTemporalForm(pop: any, meta: any) {
    const save = pop.querySelector('.fmp-save-temporal');
    if (!save) return;
    save.addEventListener('click', async () => {
        const vf = pop.querySelector('[data-bind="tv.valid_from"]').value || null;
        const vu = pop.querySelector('[data-bind="tv.valid_until"]').value || null;
        const depsStr = pop.querySelector('[data-bind="dependents"]').value || '';
        const dependents = depsStr
            .split(',')
            .map((s: any) => s.trim())
            .filter(Boolean);
        const next = {
            ...meta,
            temporal_validity: { valid_from: vf, valid_until: vu },
            dependents,
        };
        const { setFieldMeta } = await import('../../core/fieldMeta/store.js');
        await setFieldMeta(meta.field_key, next);
        closePopover();
    });
}

// ─── FIELD-META-EXT-001 tab renderers ───────────────────────────────
// Three extended sections from core/fieldMeta/extendedMetadata.js:
//   Calibração / Grupo de Dados / Dados Adicionais
// Render functions are DOM-free (return HTML string); wire functions
// attach listeners via querySelectorAll and persist via setFieldMeta.

const _CALIBRATION_STATUS_COLORS = Object.freeze({
    calibrated: '#22c55e',
    uncertain: '#f59e0b',
    expired: '#ef4444',
    unknown: '#6b7280',
});

const _CALIBRATION_STATUS_LABELS_PT = Object.freeze({
    calibrated: 'calibrado',
    uncertain: 'incerto',
    expired: 'vencido',
    unknown: 'desconhecido',
});

/** @param {any} meta */
function _renderCalibration(meta: any) {
    const c = meta?.calibration || {};
    const status = (c.status as any) || 'unknown';
    const color = (_CALIBRATION_STATUS_COLORS as any)[status] || _CALIBRATION_STATUS_COLORS.unknown;
    const label = (_CALIBRATION_STATUS_LABELS_PT as any)[status] || _CALIBRATION_STATUS_LABELS_PT.unknown;
    const dateOnly = (d: any) => d ? String(d).slice(0, 10) : '';
    const standardOptions = ['', 'ISO 17025', 'NIST', 'INMETRO', 'CETESB', 'EPA', 'outro']
        .map(
            (s: any) => `<option value="${escapeHtml(s)}" ${s === (c.standard || '') ? 'selected' : ''}>
                ${escapeHtml(s || '—')}
            </option>`,
        )
        .join('');
    return `
        <div class="fmp-calibration-status" style="background:${color};color:#fff;
            padding:4px 8px;border-radius:4px;font-size:11px;margin-bottom:8px;display:inline-block;">
            ${escapeHtml(label)}
        </div>
        <p class="fmp-hint" style="font-size:11px;color:#6b7280;margin:0 0 8px;">
            Status afeta EIS Acurácia (A).
        </p>
        <label class="fmp-field">
            <span>Instrument ID</span>
            <input type="text" data-bind="cal.instrumentId" value="${escapeHtml(c.instrumentId || '')}"
                placeholder="ex: pH-Meter-01" />
        </label>
        <label class="fmp-field">
            <span>Modelo</span>
            <input type="text" data-bind="cal.instrumentModel" value="${escapeHtml(c.instrumentModel || '')}" />
        </label>
        <label class="fmp-field">
            <span>Nº de série</span>
            <input type="text" data-bind="cal.serialNumber" value="${escapeHtml(c.serialNumber || '')}" />
        </label>
        <label class="fmp-field">
            <span>Última calibração</span>
            <input type="date" data-bind="cal.lastCalibrationDate" value="${escapeHtml(dateOnly(c.lastCalibrationDate))}" />
        </label>
        <label class="fmp-field">
            <span>Intervalo (dias)</span>
            <input type="number" min="1" step="1" data-bind="cal.intervalDays"
                value="${escapeHtml(c.intervalDays == null ? '365' : String(c.intervalDays))}" />
        </label>
        <label class="fmp-field">
            <span>Acurácia</span>
            <input type="number" step="0.001" data-bind="cal.accuracy"
                value="${escapeHtml(c.accuracy == null ? '' : String(c.accuracy))}" />
        </label>
        <label class="fmp-field">
            <span>Incerteza do instrumento</span>
            <input type="number" step="0.001" min="0" data-bind="cal.uncertainty"
                value="${escapeHtml(c.uncertainty == null ? '' : String(c.uncertainty))}" />
        </label>
        <label class="fmp-field">
            <span>Nº do certificado</span>
            <input type="text" data-bind="cal.certificateNumber" value="${escapeHtml(c.certificateNumber || '')}" />
        </label>
        <label class="fmp-field">
            <span>Padrão</span>
            <select data-bind="cal.standard">${standardOptions}</select>
        </label>
        <label class="fmp-field">
            <span>Laboratório</span>
            <input type="text" data-bind="cal.laboratory" value="${escapeHtml(c.laboratory || '')}" />
        </label>
        <label class="fmp-field">
            <span>Notas</span>
            <textarea data-bind="cal.notes" rows="2">${escapeHtml(c.notes || '')}</textarea>
        </label>
        <div class="fmp-actions">
            <button type="button" class="fmp-save-calibration">Salvar calibração</button>
        </div>
    `;
}

/** @param {any} meta */
function _renderDataGroup(meta: any) {
    const g = meta?.dataGroup || {};
    const accessTier = g.accessTier || 'private';
    const sharingScope = g.sharingScope || 'owner';
    const tierRadio = (t: any, lbl: any) => `
        <label class="fmp-radio-inline">
            <input type="radio" name="dg-access-tier" data-bind="dg.accessTier" value="${escapeHtml(t)}"
                ${t === accessTier ? 'checked' : ''} />
            ${escapeHtml(lbl)}
        </label>`;
    const scopeRadio = (s: any, lbl: any) => `
        <label class="fmp-radio-inline">
            <input type="radio" name="dg-sharing-scope" data-bind="dg.sharingScope" value="${escapeHtml(s)}"
                ${s === sharingScope ? 'checked' : ''} />
            ${escapeHtml(lbl)}
        </label>`;
    return `
        <p class="fmp-hint" style="font-size:11px;color:#6b7280;margin:0 0 8px;">
            Reflete em EIS Transparência (T).
        </p>
        <label class="fmp-field">
            <span>Radar Profile ID</span>
            <input type="text" data-bind="dg.radarProfileId" value="${escapeHtml(g.radarProfileId || '')}"
                placeholder="(opcional)" />
        </label>
        <label class="fmp-field">
            <span>Radar Slice ID</span>
            <input type="text" data-bind="dg.radarSliceId" value="${escapeHtml(g.radarSliceId || '')}"
                placeholder="(opcional)" />
        </label>
        <fieldset class="fmp-dg-tier">
            <legend>Access tier</legend>
            ${tierRadio('public', 'público')}
            ${tierRadio('summary', 'sumário')}
            ${tierRadio('protected', 'protegido')}
            ${tierRadio('private', 'privado')}
        </fieldset>
        <fieldset class="fmp-dg-scope">
            <legend>Sharing scope</legend>
            ${scopeRadio('owner', 'dono')}
            ${scopeRadio('team', 'time')}
            ${scopeRadio('org', 'organização')}
            ${scopeRadio('external', 'externo')}
        </fieldset>
        <label class="fmp-field">
            <span>Rótulo do grupo</span>
            <input type="text" data-bind="dg.groupLabel" value="${escapeHtml(g.groupLabel || '')}"
                placeholder="ex: campanha-q1" />
        </label>
        <label class="fmp-field">
            <input type="checkbox" data-bind="dg.publishedToRadar" ${g.publishedToRadar ? 'checked' : ''} />
            <span>Publicado no radar</span>
        </label>
        <div class="fmp-actions">
            <button type="button" class="fmp-save-dataGroup">Salvar grupo</button>
        </div>
    `;
}

/** @param {any} meta */
function _renderAdditional(meta: any) {
    const entries = Array.isArray(meta?.additionalData) ? meta.additionalData : [];
    const typeOptions = ['string', 'number', 'boolean', 'date']
        .map((t: any) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)
        .join('');
    const rows = entries.length
        ? `<table class="fmp-additional-table" style="width:100%;font-size:11px;border-collapse:collapse;">
            <thead>
                <tr>
                    <th style="text-align:left;">Chave</th>
                    <th style="text-align:left;">Valor</th>
                    <th style="text-align:left;">Tipo</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${entries
                    .map(
                        (e: any) => `<tr data-additional-id="${escapeHtml(e.id || '')}">
                            <td>
                                ${e.pinned ? '<span title="fixado">&#x1F4CC;</span> ' : ''}
                                ${escapeHtml(e.key || '')}
                            </td>
                            <td>${escapeHtml(String(e.value ?? ''))}</td>
                            <td>${escapeHtml(e.type || '')}</td>
                            <td>
                                <button type="button" class="fmp-additional-pin" data-id="${escapeHtml(e.id || '')}"
                                    aria-label="Fixar">&#x1F4CC;</button>
                                <button type="button" class="fmp-additional-del" data-id="${escapeHtml(e.id || '')}"
                                    aria-label="Remover">&#x2715;</button>
                            </td>
                        </tr>`,
                    )
                    .join('')}
            </tbody>
        </table>`
        : '<p class="fmp-empty" style="font-style:italic;color:#6b7280;">Sem dados adicionais. Adicione um par chave/valor abaixo.</p>';
    return `
        <h5>Dados adicionais (${entries.length})</h5>
        ${rows}
        <fieldset>
            <legend>Adicionar entrada</legend>
            <label class="fmp-field">
                <span>Chave</span>
                <input type="text" data-bind="ad.new.key" placeholder="ex: lote_amostra" />
            </label>
            <label class="fmp-field">
                <span>Valor</span>
                <input type="text" data-bind="ad.new.value" placeholder="valor" />
            </label>
            <label class="fmp-field">
                <span>Tipo</span>
                <select data-bind="ad.new.type">${typeOptions}</select>
            </label>
            <div class="fmp-actions">
                <button type="button" class="fmp-additional-add">+ Adicionar</button>
            </div>
        </fieldset>
    `;
}

export { _renderCalibration, _renderDataGroup, _renderAdditional };

/** @param {any} pop @param {any} meta */
function _wireCalibrationForm(pop: any, meta: any) {
    const save = pop.querySelector('.fmp-save-calibration');
    if (!save) return;
    save.addEventListener('click', async () => {
        try {
            const ext = (await import('../../core/fieldMeta/extendedMetadata.js') as any);
            const get = (sel: any) => pop.querySelector(sel);
            const instrumentId = get('[data-bind="cal.instrumentId"]').value.trim();
            if (!instrumentId) {
                showToast('Instrument ID é obrigatório.', 'warn');
                return;
            }
            const lastCalibrationDate = get('[data-bind="cal.lastCalibrationDate"]').value || null;
            const intervalRaw = get('[data-bind="cal.intervalDays"]').value;
            const intervalDays = intervalRaw === '' ? 365 : Number(intervalRaw);
            const accuracyRaw = get('[data-bind="cal.accuracy"]').value;
            const uncertaintyRaw = get('[data-bind="cal.uncertainty"]').value;
            const calibration = ext.buildCalibrationMeta({
                instrumentId,
                instrumentModel: get('[data-bind="cal.instrumentModel"]').value || null,
                serialNumber: get('[data-bind="cal.serialNumber"]').value || null,
                lastCalibrationDate,
                intervalDays,
                accuracy: accuracyRaw === '' ? null : Number(accuracyRaw),
                uncertainty: uncertaintyRaw === '' ? null : Number(uncertaintyRaw),
                certificateNumber: get('[data-bind="cal.certificateNumber"]').value || null,
                standard: get('[data-bind="cal.standard"]').value || null,
                laboratory: get('[data-bind="cal.laboratory"]').value || null,
                notes: get('[data-bind="cal.notes"]').value || null,
            });
            const next = { ...meta, calibration };
            await setFieldMeta(meta.field_key, next);
            showToast('Calibração salva.', 'success');
            closePopover();
        } catch (err: any) {
            showToast(`Erro: ${(err as any)?.message || err}`, 'error');
        }
    });
}

/** @param {any} pop @param {any} meta */
function _wireDataGroupForm(pop: any, meta: any) {
    const save = pop.querySelector('.fmp-save-dataGroup');
    if (!save) return;
    save.addEventListener('click', async () => {
        try {
            const ext = (await import('../../core/fieldMeta/extendedMetadata.js') as any);
            const get = (sel: any) => pop.querySelector(sel);
            const getRadio = (name: any) => {
                const checked = pop.querySelector(`input[name="${name}"]:checked`);
                return checked ? checked.value : null;
            };
            const dataGroup = ext.buildDataGroupMeta({
                radarProfileId: get('[data-bind="dg.radarProfileId"]').value || null,
                radarSliceId: get('[data-bind="dg.radarSliceId"]').value || null,
                accessTier: getRadio('dg-access-tier') || 'private',
                sharingScope: getRadio('dg-sharing-scope') || 'owner',
                groupLabel: get('[data-bind="dg.groupLabel"]').value || null,
                publishedToRadar: get('[data-bind="dg.publishedToRadar"]').checked,
            });
            const next = { ...meta, dataGroup };
            await setFieldMeta(meta.field_key, next);
            showToast('Grupo salvo.', 'success');
            closePopover();
        } catch (err: any) {
            showToast(`Erro: ${(err as any)?.message || err}`, 'error');
        }
    });
}

/** @param {any} pop @param {any} meta */
function _wireAdditionalForm(pop: any, meta: any) {
    const addBtn = pop.querySelector('.fmp-additional-add');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            try {
                const ext = (await import('../../core/fieldMeta/extendedMetadata.js') as any);
                const key = pop.querySelector('[data-bind="ad.new.key"]').value.trim();
                const valRaw = pop.querySelector('[data-bind="ad.new.value"]').value;
                const type = pop.querySelector('[data-bind="ad.new.type"]').value;
                if (!key) {
                    showToast('Chave é obrigatória.', 'warn');
                    return;
                }
                let value = (valRaw as any);
                if (type === 'number') {
                    const n = Number(valRaw);
                    if (!Number.isFinite(n)) {
                        showToast('Valor numérico inválido.', 'error');
                        return;
                    }
                    value = n;
                } else if (type === 'boolean') {
                    value = String(valRaw).toLowerCase() === 'true' || valRaw === '1';
                } else if (type === 'date') {
                    if (!Number.isFinite(Date.parse(valRaw))) {
                        showToast('Data inválida.', 'error');
                        return;
                    }
                }
                const baseArr = Array.isArray(meta.additionalData) ? meta.additionalData : [];
                const nextArr = ext.addAdditionalDataEntry(baseArr, { key, value, type });
                const next = { ...meta, additionalData: nextArr };
                await setFieldMeta(meta.field_key, next);
                showToast('Entrada adicionada.', 'success');
                closePopover();
            } catch (err: any) {
                showToast(`Erro: ${(err as any)?.message || err}`, 'error');
            }
        });
    }
    pop.querySelectorAll('.fmp-additional-del').forEach((btn: any) => {
        btn.addEventListener('click', async () => {
            try {
                const ext = (await import('../../core/fieldMeta/extendedMetadata.js') as any);
                const id = btn.dataset.id;
                if (!id) return;
                const baseArr = Array.isArray(meta.additionalData) ? meta.additionalData : [];
                const nextArr = ext.removeAdditionalDataEntry(baseArr, id);
                const next = { ...meta, additionalData: nextArr };
                await setFieldMeta(meta.field_key, next);
                showToast('Entrada removida.', 'info');
                closePopover();
            } catch (err: any) {
                showToast(`Erro: ${(err as any)?.message || err}`, 'error');
            }
        });
    });
    pop.querySelectorAll('.fmp-additional-pin').forEach((btn: any) => {
        btn.addEventListener('click', async () => {
            try {
                const ext = (await import('../../core/fieldMeta/extendedMetadata.js') as any);
                const id = btn.dataset.id;
                if (!id) return;
                const baseArr = Array.isArray(meta.additionalData) ? meta.additionalData : [];
                const target = baseArr.find((e: any) => e?.id === id);
                if (!target) return;
                const nextArr = ext.updateAdditionalDataEntry(baseArr, id, { pinned: !target.pinned });
                const next = { ...meta, additionalData: nextArr };
                await setFieldMeta(meta.field_key, next);
                closePopover();
            } catch (err: any) {
                showToast(`Erro: ${(err as any)?.message || err}`, 'error');
            }
        });
    });
}
