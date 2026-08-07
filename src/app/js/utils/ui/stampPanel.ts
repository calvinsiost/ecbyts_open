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
   PAINEL DE ESTAMPAS (STAMP PANEL)
   ================================================================

   UI para visualizar e gerenciar estampas de elementos.
   Exibe estampas por categoria com opcoes de adicionar/remover.

   FUNCIONALIDADES:
   - Listar estampas do elemento selecionado
   - Adicionar novas estampas via modal
   - Remover estampas existentes
   - Filtrar por categoria

   ================================================================ */
import { t } from '../i18n/translations.js';
import { getIcon } from './icons.js';
import { showToast } from './toast.js';
import { openModal, closeModal } from './modals.js';
import { asyncConfirm } from './asyncDialogs.js';
import { STAMP_CATEGORIES, getStampType, getStampTypesByCategory, validateStampValue } from '../stamps/types.js';
import { addStamp, removeStamp, getStamps, getStampSummary, hasResponsibleTechnical, hasDigitalSignature, getApprovalStatus, } from '../stamps/manager.js';
import { formatDate as _formatDateCanonical } from '../helpers/formatDate.js';
// CERT-STAMPS-001 RF-5 — gate anti-greenwashing na renderização de selos.
// Ver SPEC_ENVIRONMENTAL_CERTIFICATION_STAMPS.md §8 RF-5.
import { classifyCertificationStamp, isCertificationStamp } from '../../core/certification/_antiGreenwashPure.js';
// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
let currentElement: any = null;
let selectedCategory: any = null;
let selectedClassification: any = null; // null = all, 'passive', 'active'
// ----------------------------------------------------------------
// INICIALIZACAO
// ----------------------------------------------------------------
/**
 * Inicializa o painel de estampas.
 * Registra handlers globais.
 */
export function initStampPanel() {
    // Registrar handlers globais
    window.handleAddStampClick = handleAddStampClick;
    window.handleRemoveStamp = /** @type {any} */ (handleRemoveStamp);
    window.handleStampCategoryFilter = /** @type {any} */ (handleStampCategoryFilter);
    window.handleStampClassificationFilter = /** @type {any} */ (handleStampClassificationFilter);
    window.handlePendingClassification = /** @type {any} */ (handlePendingClassification);
    window.handleStampTypeSelect = /** @type {any} */ (handleStampTypeSelect);
    window.handleSaveStamp = handleSaveStamp;
    window.handleQuickClassification = /** @type {any} */ (handleQuickClassification);
    window.closeStampModal = () => closeModal('stamp-modal');
}
// ----------------------------------------------------------------
// RENDERIZACAO DO PAINEL
// ----------------------------------------------------------------
/**
 * Atualiza o painel de estampas para um elemento.
 * @param {any} element - Elemento selecionado
 */
export function updateStampPanel( element: any) {
    // Resetar filtros ao trocar de elemento
    if (element !== currentElement) {
        selectedCategory = null;
        selectedClassification = null;
    }
    currentElement = element;
    const container = (document.getElementById('stamp-panel-content')) as any;
    if (!container)
        return;
    if (!element) {
        container.innerHTML = `
            <p class="stamp-panel-empty-msg">
                Selecione um elemento para ver suas conexões.
            </p>
        `;
        return;
    }
    // Resumo passivo/ativo
    const summary = getStampSummary(element);
    // Renderizar cabecalho com info do elemento
    let html = `
        <div class="stamp-panel-header">
            <span class="stamp-element-name">${element.name}</span>
            <span class="stamp-element-family">${element.family}</span>
        </div>
    `;
    // Resumo de classificacao
    if (summary.passive > 0 || summary.active > 0) {
        html += `
            <div class="stamp-classification-summary">
                <span class="stamp-class-badge passive">${summary.passive} passivo${summary.passive !== 1 ? 's' : ''}</span>
                <span class="stamp-class-badge active">${summary.active} ativo${summary.active !== 1 ? 's' : ''}</span>
            </div>
        `;
    }
    // Verificacoes de governanca
    const hasRT = hasResponsibleTechnical(element);
    const hasSig = hasDigitalSignature(element);
    const approval = getApprovalStatus(element);
    html += `
        <div class="stamp-governance-status">
            <span class="governance-badge ${hasRT ? 'active' : ''}" title="${t('stamp.technicalResponsible')}">
                ${getIcon('hardhat', { size: '12px' })} RT ${hasRT ? getIcon('check', { size: '10px' }) : getIcon('x', { size: '10px' })}
            </span>
            <span class="governance-badge ${hasSig ? 'active' : ''}" title="Assinatura Digital">
                ${getIcon('pen-sign', { size: '12px' })} Assinado ${hasSig ? getIcon('check', { size: '10px' }) : getIcon('x', { size: '10px' })}
            </span>
            <span class="governance-badge ${approval.approved ? 'active' : ''}" title="${t('stamp.approval')}">
                ${getIcon('check-circle', { size: '12px' })} ${approval.status || 'Pendente'}
            </span>
        </div>
    `;
    // Filtros de classificacao
    html += `
        <div class="stamp-category-filters">
            <button type="button" class="stamp-filter-btn ${!selectedClassification ? 'active' : ''}"
                    data-cc-action="cc-2eded6a4">
                Todos
            </button>
            <button type="button" class="stamp-filter-btn stamp-filter-passive ${selectedClassification === 'passive' ? 'active' : ''}"
                    data-cc-action="cc-aa4b8b1e">
                Passivos
            </button>
            <button type="button" class="stamp-filter-btn stamp-filter-active ${selectedClassification === 'active' ? 'active' : ''}"
                    data-cc-action="cc-c1a03b5b">
                Ativos
            </button>
            <span class="stamp-filter-divider"></span>
            <button type="button" class="stamp-filter-btn ${!selectedCategory ? 'active' : ''}"
                    data-cc-action="cc-c9e258b0">
                Todas
            </button>
            ${Object.values(STAMP_CATEGORIES)
        .map((cat: any) => `
                <button type="button" class="stamp-filter-btn ${selectedCategory === cat.id ? 'active' : ''}"
                        data-cc-call-click="handleStampCategoryFilter|s:${encodeURIComponent(`${cat.id}`)}"
                        style="--cat-color: ${cat.color}">
                    ${getIcon(cat.icon, { size: '12px' })} ${cat.name}
                </button>
            `)
        .join('')}
        </div>
    `;
    // Listar estampas por categoria e classificacao
    let stamps = getStamps(element, selectedCategory ? { category: selectedCategory } : {});
    if (selectedClassification) {
        stamps = stamps.filter((s: any) => s.classification === selectedClassification);
    }
    if (stamps.length === 0) {
        html += `
            <div class="stamp-empty">
                <p>Nenhuma estampa aplicada.</p>
            </div>
        `;
    }
    else {
        // Agrupar por categoria
        const grouped: any = {};
        stamps.forEach((stamp: any) => {
            if (!grouped[stamp.category]) {
                grouped[stamp.category] = [];
            }
            grouped[stamp.category].push(stamp);
        });
        for (const [category, categoryStamps] of Object.entries(grouped) as [string, any[]][]) {
            const catInfo = (STAMP_CATEGORIES as any)[category];
            html += `
                <div class="stamp-category-section">
                    <div class="stamp-category-header" style="--cat-color: ${catInfo?.color || '#666'}">
                        ${getIcon(catInfo?.icon || 'tag', { size: '12px' })} ${catInfo?.name || category}
                    </div>
                    <div class="stamp-list">
                        ${categoryStamps.map((stamp: any) => renderStampItem(stamp)).join('')}
                    </div>
                </div>
            `;
        }
    }
    // Acoes rapidas: marcar como passivo/ativo
    html += `
        <div class="stamp-quick-actions">
            <button type="button" class="stamp-quick-btn passive" data-cc-action="cc-d4c51aa3">
                ${getIcon('alert-triangle', { size: '14px' })} Marcar Passivo
            </button>
            <button type="button" class="stamp-quick-btn active" data-cc-action="cc-5897fc33">
                ${getIcon('check-circle', { size: '14px' })} Marcar Ativo
            </button>
        </div>
    `;
    // Botao adicionar estampa completa
    html += `
        <div class="stamp-actions">
            <button type="button" class="btn btn-secondary" data-cc-action="cc-c7cbca74">
                ${getIcon('plus', { size: '14px' })} Adicionar Outra Estampa
            </button>
        </div>
    `;
    container.innerHTML = html;
}
/**
 * Renderiza um item de estampa.
 * @param {any} stamp - Estampa
 * @returns {string} HTML
 */
function renderStampItem( stamp: any) {
    const stampType = /** @type {any} */ (getStampType(stamp.type)) as any;
    const _catInfo = (STAMP_CATEGORIES as any)[stamp.category];
    // Formatar valor para exibicao
    const valueDisplay = formatStampValue(stamp.value, stampType) as any;
    const isActive = stamp.classification === 'active';

    // ────────────────────────────────────────────────────────────────
    // CERT-STAMPS-001 RF-5 — gate anti-greenwashing.
    // Selo de certificação ganha renderização DISTINTA conforme o tier
    // (certified | verified_statement | self_declared) + escopo visível +
    // rodapé em autodeclarados + aviso de mismatch de escopo (org vs físico).
    // Ver core/certification/_antiGreenwashPure.ts e SPEC §8 RF-5.
    // ────────────────────────────────────────────────────────────────
    let certClass = '';
    let certTierBadge = '';
    let certScopeChip = '';
    let certDisclaimer = '';
    let certScopeWarning = '';
    if (isCertificationStamp(stamp) && stamp.value) {
        const c = classifyCertificationStamp(stamp.value);
        certClass = c.cssClass; // stamp-cert--certified | --self_declared | --verified_statement
        const tierLabel = c.renderTier === 'certified'
            ? 'CERTIFICADO'
            : c.renderTier === 'verified_statement'
                ? 'DECLARAÇÃO VERIFICADA'
                : 'AUTODECLARADO';
        certTierBadge = `<span class="stamp-cert-tier-badge ${certClass}" title="${c.labelTypeLabel}">${tierLabel}</span>`;
        // Escopo sempre visível junto do selo (RF-5b).
        certScopeChip = `<span class="stamp-cert-scope-chip" title="Escopo da certificação">Escopo: ${c.scopeLabel}</span>`;
        // Rodapé "este registro não constitui certificação" em self_declared (RF-5c).
        if (c.requiresDisclaimer) {
            certDisclaimer = `<div class="stamp-cert-disclaimer">${c.disclaimerText}</div>`;
        }
        // Aviso de mismatch de escopo (org vs ativo físico — armadilha B Corp/AQUA).
        if (c.scopeMismatch) {
            certScopeWarning = `<div class="stamp-cert-scope-warning">${getIcon('alert-triangle', { size: '11px' })} ${c.scopeMismatchWarning}</div>`;
        }
    }

    return `
        <div class="stamp-item ${certClass}" data-stamp-id="${stamp.id}">
            <div class="stamp-item-header">
                <span class="stamp-icon">${getIcon(stampType?.icon || 'tag', { size: '14px' })}</span>
                <span class="stamp-name">${stampType?.name || stamp.type}</span>
                ${certTierBadge}
                <span class="stamp-class-badge ${isActive ? 'active' : 'passive'}">${isActive ? 'ATIVO' : 'PASSIVO'}</span>
                <button type="button" class="stamp-remove-btn" data-cc-call-click="handleRemoveStamp|s:${encodeURIComponent(`${stamp.id}`)}" title="Remover" aria-label="Remove">
                    ${getIcon('x', { size: '12px' })}
                </button>
            </div>
            <div class="stamp-item-value">
                ${valueDisplay}
            </div>
            ${certScopeChip ? `<div class="stamp-cert-scope">${certScopeChip}</div>` : ''}
            ${certScopeWarning}
            ${certDisclaimer}
            <div class="stamp-item-meta">
                <span class="stamp-date">${formatDate(stamp.appliedAt)}</span>
                <span class="stamp-author">${stamp.appliedBy}</span>
                ${stamp.signature ? '<span class="stamp-signed">' + getIcon('pen-sign', { size: '10px' }) + '</span>' : ''}
            </div>
        </div>
    `;
}
/**
 * Formata valor de estampa para exibicao.
 * @param {any} value - Valor da estampa
 * @param {any} stampType - Tipo da estampa
 * @returns {string}
 */
function formatStampValue( value: any, stampType: any) {
    if (!value || typeof value !== 'object') {
        return String(value || '-');
    }
    const schema = stampType?.schema || {};
    const parts = [];
    for (const [key, val] of Object.entries(value)) {
        if (val === undefined || val === null || val === '')
            continue;
        const fieldSchema = schema[key];
        const label = fieldSchema?.label || key;
        if (fieldSchema?.type === 'enum') {
            parts.push(`<strong>${label}:</strong> ${val}`);
        }
        else if (fieldSchema?.type === 'date' || fieldSchema?.type === 'datetime') {
            parts.push(`<strong>${label}:</strong> ${formatDate(val)}`);
        }
        else if (fieldSchema?.type === 'boolean') {
            parts.push(`<strong>${label}:</strong> ${val ? 'Sim' : 'Não'}`);
        }
        else {
            parts.push(`<strong>${label}:</strong> ${val}`);
        }
    }
    return parts.join('<br>') || '-';
}
/**
 * Formata data para exibicao.
 * @param {string} isoDate - Data ISO8601
 * @returns {string}
 */
function formatDate(isoDate: any) {
    return _formatDateCanonical(isoDate, { locale: 'pt-BR', unknownLabel: '-', errorFallback: 'original' });
}
// ----------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------
/**
 * Handler para filtro de categoria.
 * @param {string|null} category - Categoria ou null para todas
 */
function handleStampCategoryFilter( category: any) {
    selectedCategory = category;
    updateStampPanel(currentElement);
}
/**
 * Handler para filtro de classificacao (passivo/ativo).
 * @param {string|null} classification - 'passive', 'active', ou null para todos
 */
function handleStampClassificationFilter( classification: any) {
    selectedClassification = classification;
    updateStampPanel(currentElement);
}
/**
 * Handler para selecao de classificacao no modal (antes de escolher tipo).
 * @param {string} classification - 'passive' ou 'active'
 */
function handlePendingClassification( classification: any) {
    pendingClassification = classification;
    // Atualizar visual dos botoes no modal
    const btns = (document.querySelectorAll('.stamp-class-select-btn')) as any;
    btns.forEach((btn: any) => {
        btn.classList.toggle('selected', btn.dataset.classification === classification);
    });
}
/**
 * Quick-add: marca elemento como Passivo ou Ativo Ambiental com um clique.
 * Cria uma estampa 'environmental_classification' automaticamente.
 * @param {string} classificationType - 'Passivo Ambiental' ou 'Ativo Ambiental'
 */
function handleQuickClassification( classificationType: any) {
    if (!currentElement) {
        showToast('Selecione um elemento primeiro', 'error');
        return;
    }
    const classification = classificationType === 'Ativo Ambiental' ? 'active' : 'passive';
    const result = addStamp(currentElement, 'environmental_classification', {
        type: classificationType,
        description: '',
    }, {
        appliedBy: 'user',
        classification,
    });
    if (result.success) {
        showToast(`Marcado como ${classificationType}`, 'success');
        updateStampPanel(currentElement);
    }
    else {
        showToast(result.errors?.join('\n') || 'Erro ao adicionar', 'error');
    }
}
/**
 * Handler para botao adicionar estampa.
 */
function handleAddStampClick() {
    if (!currentElement) {
        showToast('Selecione um elemento primeiro', 'error');
        return;
    }
    // Abrir modal de adicionar estampa
    openAddStampModal();
}
/**
 * Handler para remover estampa.
 * @param {string} stampId - ID da estampa
 */
async function handleRemoveStamp( stampId: any) {
    if (!currentElement)
        return;
    if (!(await asyncConfirm('Remover esta estampa?')))
        return;
    const result = removeStamp(currentElement, stampId);
    if (result.success) {
        showToast('Estampa removida', 'success');
        updateStampPanel(currentElement);
    }
    else {
        showToast(result.error || 'Erro ao remover', 'error');
    }
}
// ----------------------------------------------------------------
// MODAL DE ADICIONAR ESTAMPA
// ----------------------------------------------------------------
let selectedStampType: any = null;
let pendingClassification = 'passive'; // Carried from type selector to form
/**
 * Abre modal para adicionar estampa.
 */
function openAddStampModal() {
    selectedStampType = null;
    pendingClassification = 'passive';
    const modalContent = (document.getElementById('stamp-modal-content')) as any;
    if (modalContent) {
        modalContent.innerHTML = renderStampTypeSelector();
    }
    openModal('stamp-modal');
}
/**
 * Renderiza seletor de tipo de estampa.
 * @returns {string} HTML
 */
function renderStampTypeSelector() {
    let html = `
        <div class="stamp-modal-header">
            <h3>Adicionar Estampa</h3>
            <p>Selecione o tipo de estampa para <strong>${currentElement?.name}</strong></p>
        </div>
        <div class="stamp-class-selector">
            <label class="stamp-class-selector-label">Classificação:</label>
            <button type="button"
                    class="stamp-class-select-btn ${pendingClassification === 'passive' ? 'selected' : ''} passive"
                    data-classification="passive"
                    data-cc-action="cc-d7f97304">
                Passivo
            </button>
            <button type="button"
                    class="stamp-class-select-btn ${pendingClassification === 'active' ? 'selected' : ''} active"
                    data-classification="active"
                    data-cc-action="cc-b31027e1">
                Ativo
            </button>
        </div>
        <div class="stamp-type-grid">
    `;
    for (const [catId, catInfo] of Object.entries(STAMP_CATEGORIES)) {
        const types = getStampTypesByCategory(catId);
        html += `
            <div class="stamp-type-category">
                <div class="stamp-type-category-header" style="--cat-color: ${catInfo.color}">
                    ${getIcon(catInfo.icon, { size: '14px' })} ${catInfo.name}
                </div>
                <div class="stamp-type-list">
                    ${types
            .map((type: any) => `
                        <button type="button" class="stamp-type-btn" data-cc-call-click="handleStampTypeSelect|s:${encodeURIComponent(`${type.id}`)}">
                            <span class="stamp-type-icon">${getIcon(type.icon, { size: '18px' })}</span>
                            <span class="stamp-type-name">${type.name}</span>
                        </button>
                    `)
            .join('')}
                </div>
            </div>
        `;
    }
    html += `</div>`;
    return html;
}
/**
 * Handler para selecao de tipo de estampa.
 * @param {string} typeId - ID do tipo
 */
function handleStampTypeSelect( typeId: any) {
    if (!typeId) {
        selectedStampType = null;
        const modalContent = (document.getElementById('stamp-modal-content')) as any;
        if (modalContent) {
            modalContent.innerHTML = renderStampTypeSelector();
        }
        return;
    }
    selectedStampType = getStampType(typeId);
    if (!selectedStampType)
        return;
    const modalContent = (document.getElementById('stamp-modal-content')) as any;
    if (modalContent) {
        modalContent.innerHTML = renderStampForm(selectedStampType);
    }
}
/**
 * Renderiza formulario para preencher estampa.
 * @param {any} stampType - Tipo de estampa
 * @returns {string} HTML
 */
function renderStampForm( stampType: any) {
    const catInfo = (STAMP_CATEGORIES as any)[stampType.category];
    let html = `
        <div class="stamp-modal-header">
            <button type="button" class="stamp-back-btn" data-cc-action="cc-deabce72">
                ← Voltar
            </button>
            <h3>${getIcon(stampType.icon, { size: '18px' })} ${stampType.name}</h3>
            <p>${stampType.description}</p>
            <span class="stamp-category-badge" style="--cat-color: ${catInfo?.color}">
                ${getIcon(catInfo?.icon || 'tag', { size: '12px' })} ${catInfo?.name}
            </span>
        </div>
        <form id="stamp-form" class="stamp-form">
    `;
    // Classificacao passivo/ativo (pre-seleciona da escolha no seletor de tipos)
    const isPendingActive = pendingClassification === 'active';
    html += `
        <div class="form-group">
            <label class="form-label">Classificação</label>
            <div class="stamp-classification-toggle">
                <label class="stamp-class-option">
                    <input data-field-meta="true" data-field-meta-key="auto-name:stamp-classification" type="radio" name="stamp-classification" value="passive" ${!isPendingActive ? 'checked' : ''}>
                    <span class="stamp-class-label passive">Passivo</span>
                </label>
                <label class="stamp-class-option">
                    <input data-field-meta="true" data-field-meta-key="auto-name:stamp-classification" type="radio" name="stamp-classification" value="active" ${isPendingActive ? 'checked' : ''}>
                    <span class="stamp-class-label active">Ativo</span>
                </label>
            </div>
        </div>
    `;
    // Renderizar campos do schema
    for (const [fieldId, fieldSchema] of Object.entries(stampType.schema)) {
        html += renderFormField(fieldId, fieldSchema) as any;
    }
    html += `
        </form>
        <div class="stamp-modal-actions">
            <button type="button" class="btn btn-secondary" data-cc-action="cc-77303f98">
                Cancelar
            </button>
            <button type="button" class="btn btn-primary" data-cc-action="cc-4169e5a2">
                Salvar Estampa
            </button>
        </div>
    `;
    return html;
}
/**
 * Renderiza campo de formulario.
 * @param {string} fieldId - ID do campo
 * @param {any} schema - Schema do campo
 * @returns {string} HTML
 */
function renderFormField( fieldId: any, schema: any) {
    const required = schema.required ? 'required' : '';
    const label = schema.label || fieldId;
    let input: string;
    switch (schema.type) {
        case 'string':
            input = `<input data-field-meta="true" data-field-meta-key="auto-pos:stampPanel:input:L604" type="text" class="form-input" name="${fieldId}" ${required}>`;
            break;
        case 'text':
            input = `<textarea data-field-meta="true" data-field-meta-key="auto-pos:stampPanel:textarea:L608" class="form-input" name="${fieldId}" rows="3" ${required}></textarea>`;
            break;
        case 'number': {
            const min = schema.min !== undefined ? `min="${schema.min}"` : '';
            const max = schema.max !== undefined ? `max="${schema.max}"` : '';
            input = `<input data-field-meta="true" data-field-meta-key="auto-pos:stampPanel:input:L614" type="number" class="form-input" name="${fieldId}" ${min} ${max} ${required}>`;
            break;
        }
        case 'boolean':
            input = `
                <select data-field-meta="true" data-field-meta-key="auto-pos:stampPanel:select:L619" class="form-input" name="${fieldId}" ${required}>
                    <option value="">-- Selecione --</option>
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                </select>
            `;
            break;
        case 'enum': {
            const options = schema.options || [];
            input = `
                <select data-field-meta="true" data-field-meta-key="auto-pos:stampPanel:select:L630" class="form-input" name="${fieldId}" ${required}>
                    <option value="">-- Selecione --</option>
                    ${options.map((opt: any) => `<option value="${opt}">${opt}</option>`).join('')}
                </select>
            `;
            break;
        }
        case 'date':
            input = `<input data-field-meta="true" data-field-meta-key="auto-pos:stampPanel:input:L638" type="date" class="form-input" name="${fieldId}" ${required}>`;
            break;
        case 'datetime':
            input = `<input data-field-meta="true" data-field-meta-key="auto-pos:stampPanel:input:L642" type="datetime-local" class="form-input" name="${fieldId}" ${required}>`;
            break;
        default:
            input = `<input data-field-meta="true" data-field-meta-key="auto-pos:stampPanel:input:L646" type="text" class="form-input" name="${fieldId}" ${required}>`;
    }
    return `
        <div class="form-group">
            <label class="form-label">
                ${label}
                ${schema.required ? '<span class="required">*</span>' : ''}
            </label>
            ${input}
        </div>
    `;
}
/**
 * Handler para salvar estampa.
 */
function handleSaveStamp() {
    if (!currentElement || !selectedStampType)
        return;
    const form = (document.getElementById('stamp-form')) as any;
    if (!form)
        return;
    // Coletar valores do formulario
    const formData = new FormData(form);
    const value: any = {};
    for (const [key, val] of formData.entries()) {
        if (val === '' || key === 'stamp-classification')
            continue;
        // Converter tipos
        const fieldSchema = selectedStampType.schema[key];
        if (fieldSchema?.type === 'number') {
            value[key] = parseFloat(val as any);
        }
        else if (fieldSchema?.type === 'boolean') {
            value[key] = val === 'true';
        }
        else {
            value[key] = val;
        }
    }
    // Validar
    const validation = validateStampValue(selectedStampType.id, value);
    if (!validation.valid) {
        showToast(validation.errors.join('\n'), 'error');
        return;
    }
    // Ler classificacao
    const classRadio = (form.querySelector('input[name="stamp-classification"]:checked')) as any;
    const classification = classRadio?.value || 'passive';
    // Adicionar estampa
    const result = addStamp(currentElement, selectedStampType.id, value, {
        appliedBy: 'user',
        classification,
    });
    if (result.success) {
        showToast('Estampa adicionada!', 'success');
        closeModal('stamp-modal');
        updateStampPanel(currentElement);
    }
    else {
        showToast(result.errors?.join('\n') || 'Erro ao adicionar', 'error');
    }
}
// ----------------------------------------------------------------
// ESTILOS - migrados para app/css/stamp-panel.css
// injectStampStyles() mantido como no-op para compatibilidade.
// ----------------------------------------------------------------
/**
 * No-op - estilos agora vivem em css/stamp-panel.css (carregado via link tag).
 * Mantido para compatibilidade com callers existentes.
 */
export function injectStampStyles() {
    // Styles loaded via <link rel="stylesheet" href="./css/stamp-panel.css">
}
