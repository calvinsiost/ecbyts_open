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
   ECBT — Symbology Editor Modal
   utils/ui/symbologyModal.js

   Editor modal de perfis de simbologia. Usa createElement (sem
   innerHTML monolítico). Cada seção é uma função que retorna um
   elemento DOM isolado.
   Licença: AGPL-3.0
   ================================================================ */
import { getProfiles, getActiveIndex, getActiveProfile, createProfile, deleteProfile, duplicateProfile, applyProfile, openDraft, getDraft, updateDraft, previewDraft, commitDraft, discardDraft, } from '../../core/symbology/manager.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { getEnabledFamilies, getFamilyName } from '../../core/elements/families.js';
import { getAllElements } from '../../core/elements/manager.js';
import { getAllLayers } from '../../core/interpolation/manager.js';
import { showToast } from './toast.js';
import { asyncPrompt, asyncConfirm } from './asyncDialogs.js';
import { t } from '../i18n/translations.js';
// ----------------------------------------------------------------
// ESTADO DO MODAL
// ----------------------------------------------------------------
let _modalRoot: HTMLElement | null = null;
let _currentProfileId: string | null = null;
let _symbologyChangedListener: EventListener | null = null;
let _symIdCounter = 0;
// ----------------------------------------------------------------
// API PÚBLICA
// ----------------------------------------------------------------
/**
 * Abre o editor de simbologia.
 * Se um perfil estiver ativo, abre diretamente para ele.
 * Caso contrário, mostra lista de perfis.
 */
export function openSymbologyEditor() {
    if (_modalRoot && document.getElementById('symbology-modal')) {
        return; // Já está aberto
    }
    _modalRoot = document.getElementById('symbology-modal-root');
    if (!_modalRoot) {
        _modalRoot = document.createElement('div');
        _modalRoot.id = 'symbology-modal-root';
        document.body.appendChild(_modalRoot);
    }
    const activeProfile = getActiveProfile();
    _currentProfileId = activeProfile?.id ?? null;
    if (_currentProfileId) {
        openDraft(_currentProfileId);
    }
    _modalRoot.innerHTML = '';
    _modalRoot.appendChild(_buildModal());
    // Escuta mudança externa de perfil (ciclo com editor aberto)
    _symbologyChangedListener = (_event: Event) => {
        const listEl = /** @type {any} */ (document.getElementById('sym-profile-list'));
        if (listEl) {
            listEl.replaceWith(_renderProfileList());
        }
    };
    window.addEventListener('symbologyChanged', _symbologyChangedListener);
    // Sprint 3 Tier-B wire (Calvin 2026-06-03)
    syncDeepLinkUrl('symbology');
}
/**
 * Fecha o editor e descarta o draft.
 */
export function closeSymbologyEditor() {
    if (_symbologyChangedListener) {
        window.removeEventListener('symbologyChanged', _symbologyChangedListener);
        _symbologyChangedListener = null;
    }
    if (_currentProfileId) {
        discardDraft();
    }
    _currentProfileId = null;
    if (_modalRoot)
        _modalRoot.innerHTML = '';
    clearDeepLinkUrl();
}
// ----------------------------------------------------------------
// CONSTRUÇÃO DO MODAL
// ----------------------------------------------------------------
function _buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'symbology-modal';
    overlay.className = 'sym-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'sym-dialog';
    // Cabeçalho
    const header = document.createElement('div');
    header.className = 'sym-header';
    const title = document.createElement('h2');
    title.className = 'sym-title';
    title.textContent = t('symbology.title');
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sym-close-btn';
    closeBtn.innerHTML = '&#10005;';
    closeBtn.title = t('symbology.close');
    closeBtn.onclick = closeSymbologyEditor;
    header.appendChild(title);
    header.appendChild(closeBtn);
    // Corpo
    const body = document.createElement('div');
    body.className = 'sym-body';
    // Painel esquerdo: lista de perfis
    const sidebar = document.createElement('div');
    sidebar.className = 'sym-sidebar';
    sidebar.appendChild(_renderProfileList());
    sidebar.appendChild(_renderNewProfileBtn());
    sidebar.appendChild(_renderImportEcbtBtn());
    // Painel direito: editor do perfil selecionado
    const content = document.createElement('div');
    content.id = 'sym-content';
    content.className = 'sym-content';
    content.appendChild(_currentProfileId ? _renderProfileEditor() : _renderEmptyState());
    body.appendChild(sidebar);
    body.appendChild(content);
    // Rodapé
    const footer = _renderFooter();
    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    // Fecha ao clicar fora do dialog
    overlay.addEventListener('click', (/** @type {any} */ e) => {
        if (e.target === overlay)
            closeSymbologyEditor();
    });
    return overlay;
}
// ----------------------------------------------------------------
// LISTA DE PERFIS (sidebar)
// ----------------------------------------------------------------
function _renderProfileList() {
    const profiles = getProfiles();
    const activeIdx = getActiveIndex();
    const container = document.createElement('ul');
    container.id = 'sym-profile-list';
    container.className = 'sym-profile-list';
    if (profiles.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'sym-profile-empty';
        empty.textContent = t('symbology.noProfiles');
        container.appendChild(empty);
        return container;
    }
    profiles.forEach((/** @type {any} */ p, /** @type {any} */ idx) => {
        const item = document.createElement('li');
        item.className =
            'sym-profile-item' +
                (p.id === _currentProfileId ? ' sym-profile-item--selected' : '') +
                (idx === activeIdx ? ' sym-profile-item--active' : '');
        const nameBtn = document.createElement('button');
        nameBtn.type = 'button';
        nameBtn.className = 'sym-profile-name';
        nameBtn.textContent = p.name;
        nameBtn.title = p.name;
        nameBtn.onclick = () => _selectProfile(p.id);
        const actions = document.createElement('div');
        actions.className = 'sym-profile-actions';
        // Aplicar
        const applyBtn = _mkIconBtn('&#9654;', 'Aplicar perfil', () => {
            applyProfile(p.id);
            showToast(t('symbology.profileApplied', { name: p.name }), 'success');
        });
        // Duplicar
        const dupBtn = _mkIconBtn('&#10063;', 'Duplicar', () => {
            duplicateProfile(p.id);
            _refreshSidebar();
        });
        // Excluir
        const delBtn = _mkIconBtn('&#10005;', 'Excluir', async () => {
            const ok = await asyncConfirm(t('symbology.deleteProfileConfirm', { name: p.name }), /** @type {any} */ ({
                confirmLabel: 'Excluir',
                cancelLabel: 'Cancelar',
                danger: true,
            }));
            if (!ok)
                return;
            if (_currentProfileId === p.id) {
                _currentProfileId = null;
                _refreshContent(_renderEmptyState());
            }
            deleteProfile(p.id);
            _refreshSidebar();
        });
        // Export .ecbt (P1-10 kind symbology_profile)
        const ecbtBtn = _mkIconBtn('&#8681;', t('symPortable.exportTitle') || 'Exportar .ecbt', async () => {
            (await import('../handlers/symbologyPortable.js')).exportSymbologyProfileEcbt(p.id);
        });
        actions.appendChild(applyBtn);
        actions.appendChild(dupBtn);
        actions.appendChild(ecbtBtn);
        actions.appendChild(delBtn);
        item.appendChild(nameBtn);
        item.appendChild(actions);
        container.appendChild(item);
    });
    return container;
}
function _renderImportEcbtBtn() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sym-new-profile-btn';
    btn.innerHTML = '&#8682; ' + (t('symPortable.import') || 'Importar .ecbt');
    btn.title = t('symPortable.importTitle') || 'Importar perfil de simbologia de uma chave .ecbt (Library ecbyts ou dispositivo local)';
    btn.onclick = async () => {
        (await import('../handlers/symbologyPortable.js')).importSymbologyProfileEcbt();
    };
    return btn;
}
function _renderNewProfileBtn() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sym-new-profile-btn';
    btn.innerHTML = '&#43; ' + t('symbology.newProfile');
    btn.onclick = async () => {
        const name = await asyncPrompt(t('symbology.newProfilePrompt'), '', {
            placeholder: 'Ex: Perfil CETESB investigação',
            confirmLabel: 'Criar',
            cancelLabel: 'Cancelar',
        });
        if (!name?.trim())
            return;
        const p = createProfile(name.trim());
        _selectProfile(p.id);
        _refreshSidebar();
    };
    return btn;
}
// ----------------------------------------------------------------
// EDITOR DO PERFIL (painel direito)
// ----------------------------------------------------------------
function _renderProfileEditor() {
    const draft = getDraft();
    if (!draft)
        return _renderEmptyState();
    const container = document.createElement('div');
    container.className = 'sym-editor';
    // Nome do perfil (editável inline)
    const nameRow = document.createElement('div');
    nameRow.className = 'sym-editor-namerow';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'symbology-profile-name';
    nameInput.className = 'sym-name-input';
    nameInput.value = draft.name;
    nameInput.placeholder = t('symbology.profileNamePlaceholder');
    nameInput.setAttribute('aria-label', 'Profile name');
    nameInput.onchange = () => {
        updateDraft({ name: nameInput.value.trim() || draft.name });
    };
    nameRow.appendChild(nameInput);
    container.appendChild(nameRow);
    // Tabs de seções
    const tabs = ['Elementos', 'Regras', 'Labels', 'Superfícies', 'Cena'];
    const tabBar = document.createElement('div');
    tabBar.className = 'sym-tab-bar';
    const tabContent = document.createElement('div');
    tabContent.className = 'sym-tab-content';
    let activeTab = 0;
    /**
     * @param {any} draft
     */
    const renderTab = (idx: number) => {
        tabBar.querySelectorAll('.sym-tab').forEach((t: Element, i: number) => {
            t.classList.toggle('sym-tab--active', i === idx);
        });
        tabContent.innerHTML = '';
        switch (idx) {
            case 0:
                tabContent.appendChild(_renderElementSection(getDraft()));
                break;
            case 1:
                tabContent.appendChild(_renderRulesSection(getDraft()));
                break;
            case 2:
                tabContent.appendChild(_renderLabelsSection(getDraft()));
                break;
            case 3:
                tabContent.appendChild(_renderSurfacesSection(getDraft()));
                break;
            case 4:
                tabContent.appendChild(_renderSceneSection(getDraft()));
                break;
        }
    };
    tabs.forEach((label: string, idx: number) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'sym-tab' + (idx === activeTab ? ' sym-tab--active' : '');
        tab.textContent = label;
        tab.onclick = () => {
            activeTab = idx;
            renderTab(idx);
        };
        tabBar.appendChild(tab);
    });
    renderTab(activeTab);
    container.appendChild(tabBar);
    container.appendChild(tabContent);
    return container;
}
function _renderEmptyState() {
    const el = document.createElement('div');
    el.className = 'sym-empty-state';
    el.textContent = t('symbology.selectOrCreate');
    return el;
}
// ----------------------------------------------------------------
// SEÇÃO ELEMENTOS
// ----------------------------------------------------------------
/**
 * @param {any} draft
 */
function _renderElementSection(draft: any) {
    const container = document.createElement('div');
    container.className = 'sym-section';
    const help = document.createElement('p');
    help.className = 'sym-help';
    help.textContent = t('symbology.configureVisualStyle');
    container.appendChild(help);
    // Por família
    const famHeading = _mkHeading('Por Família');
    container.appendChild(famHeading);
    const families = getEnabledFamilies()
        .slice()
        .sort((/** @type {any} */ a, /** @type {any} */ b) => getFamilyName(a).localeCompare(getFamilyName(b)));
    families.forEach((/** @type {any} */ famDef) => {
        const fam = famDef.id;
        container.appendChild(_renderElementStyleRow(getFamilyName(famDef), draft.elements.byFamily[fam] || {}, (style: any) => {
            if (!getDraft())
                return;
            getDraft().elements.byFamily[fam] = style;
            updateDraft({ elements: getDraft().elements });
        }));
    });
    // Por elemento individual
    const elHeading = _mkHeading('Por Elemento Individual');
    container.appendChild(elHeading);
    const elements = getAllElements();
    if (elements.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'sym-help';
        msg.textContent = t('symbology.noElements');
        container.appendChild(msg);
    }
    else {
        elements.forEach((/** @type {any} */ el) => {
            const label = (el.data?.name || el.id) + ' (' + el.family + ')';
            container.appendChild(_renderElementStyleRow(label, draft.elements.byElement[el.id] || {}, (style: any) => {
                if (!getDraft())
                    return;
                getDraft().elements.byElement[el.id] = style;
                updateDraft({ elements: getDraft().elements });
            }));
        });
    }
    return container;
}
/**
 * Renderiza uma linha de estilo de elemento (cor, opacidade, wireframe, escala, visível).
 */
/**
 * @param {any} label
 * @param {any} style
 * @param {any} onChange
 */
function _renderElementStyleRow(label: string, style: any, onChange: (style: any) => void) {
    const row = document.createElement('div');
    row.className = 'sym-style-row';
    const lbl = document.createElement('span');
    lbl.className = 'sym-row-label';
    lbl.textContent = label;
    const controls = document.createElement('div');
    controls.className = 'sym-row-controls';
    // Cor
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = `symbology-elem-color-${_symIdCounter++}`;
    colorInput.title = t('symbology.color');
    colorInput.setAttribute('aria-label', 'Element color');
    colorInput.value = style.color || '#4488ff';
    colorInput.onchange = () => {
        style.color = colorInput.value;
        onChange({ ...style });
    };
    // Opacidade
    const opacityInput = document.createElement('input');
    opacityInput.type = 'range';
    opacityInput.id = `symbology-elem-opacity-${_symIdCounter++}`;
    opacityInput.min = '0';
    opacityInput.max = '1';
    opacityInput.step = '0.05';
    opacityInput.title = t('symbology.opacity');
    opacityInput.setAttribute('aria-label', 'Element opacity');
    opacityInput.value = style.opacity !== undefined ? style.opacity : 1;
    opacityInput.oninput = () => {
        style.opacity = parseFloat(opacityInput.value);
        onChange({ ...style });
    };
    // Wireframe
    const wireCheck = document.createElement('input');
    wireCheck.type = 'checkbox';
    wireCheck.id = `symbology-elem-wire-${_symIdCounter++}`;
    wireCheck.title = t('symbology.wireframe');
    wireCheck.setAttribute('aria-label', 'Wireframe');
    wireCheck.checked = !!style.wireframe;
    wireCheck.onchange = () => {
        style.wireframe = wireCheck.checked;
        onChange({ ...style });
    };
    const wireLabel = document.createElement('label');
    wireLabel.className = 'sym-inline-label';
    wireLabel.htmlFor = wireCheck.id;
    wireLabel.appendChild(wireCheck);
    wireLabel.appendChild(document.createTextNode(' Wire'));
    // Visível
    const visCheck = document.createElement('input');
    visCheck.type = 'checkbox';
    visCheck.id = `symbology-elem-vis-${_symIdCounter++}`;
    visCheck.title = t('symbology.visible');
    visCheck.setAttribute('aria-label', 'Visible');
    visCheck.checked = style.visible !== false;
    visCheck.onchange = () => {
        style.visible = visCheck.checked;
        onChange({ ...style });
    };
    const visLabel = document.createElement('label');
    visLabel.className = 'sym-inline-label';
    visLabel.htmlFor = visCheck.id;
    visLabel.appendChild(visCheck);
    visLabel.appendChild(document.createTextNode(' Visível'));
    // Escala
    const scaleInput = document.createElement('input');
    scaleInput.type = 'number';
    scaleInput.id = `symbology-elem-scale-${_symIdCounter++}`;
    scaleInput.min = '0.1';
    scaleInput.max = '5';
    scaleInput.step = '0.1';
    scaleInput.title = t('symbology.scaleMultiplier');
    scaleInput.placeholder = t('symbology.scalePlaceholder');
    scaleInput.setAttribute('aria-label', 'Scale multiplier');
    scaleInput.value = style.scaleMultiplier !== undefined ? style.scaleMultiplier : '';
    scaleInput.className = 'sym-scale-input';
    scaleInput.onchange = () => {
        const val = parseFloat(scaleInput.value);
        if (!isNaN(val))
            style.scaleMultiplier = Math.max(0.1, Math.min(5, val));
        else
            delete style.scaleMultiplier;
        onChange({ ...style });
    };
    controls.appendChild(colorInput);
    controls.appendChild(opacityInput);
    controls.appendChild(wireLabel);
    controls.appendChild(visLabel);
    controls.appendChild(scaleInput);
    row.appendChild(lbl);
    row.appendChild(controls);
    return row;
}
// ----------------------------------------------------------------
// SEÇÃO REGRAS
// ----------------------------------------------------------------
/**
 * @param {any} draft
 */
function _renderRulesSection(draft: any) {
    const container = document.createElement('div');
    container.className = 'sym-section';
    const help = document.createElement('p');
    help.className = 'sym-help';
    help.textContent = t('symbology.conditionalRules');
    container.appendChild(help);
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'sym-add-rule-btn';
    addBtn.innerHTML = '&#43; ' + t('symbology.addRule');
    addBtn.onclick = () => {
        const newRule = {
            id: 'rule-' + Math.random().toString(36).slice(2, 8),
            name: 'Nova regra',
            match: { operator: '>', value: 0 },
            style: {},
        };
        getDraft().rules.push(newRule);
        updateDraft({ rules: getDraft().rules });
        container.insertBefore(_renderRuleRow(newRule, draft), addBtn);
    };
    (draft.rules || []).forEach((rule: any) => {
        container.appendChild(_renderRuleRow(rule, draft));
    });
    container.appendChild(addBtn);
    return container;
}
/**
 * @param {any} rule
 * @param {any} draft
 */
function _renderRuleRow(rule: any, draft: any) {
    const row = document.createElement('div');
    row.className = 'sym-rule-row';
    const commitRule = () => updateDraft({ rules: draft.rules });
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = `symbology-rule-name-${_symIdCounter++}`;
    nameInput.placeholder = t('symbology.namePlaceholder');
    nameInput.value = rule.name || '';
    nameInput.className = 'sym-rule-name';
    nameInput.setAttribute('aria-label', 'Rule name');
    nameInput.onchange = () => {
        rule.name = nameInput.value;
        commitRule();
    };
    const famInput = document.createElement('input');
    famInput.type = 'text';
    famInput.id = `symbology-rule-family-${_symIdCounter++}`;
    famInput.placeholder = t('symbology.familyOptionalPlaceholder');
    famInput.value = rule.match.family || '';
    famInput.className = 'sym-rule-family';
    famInput.setAttribute('aria-label', 'Rule family filter');
    famInput.onchange = () => {
        rule.match.family = famInput.value.trim() || undefined;
        commitRule();
    };
    const paramInput = document.createElement('input');
    paramInput.type = 'text';
    paramInput.id = `symbology-rule-param-${_symIdCounter++}`;
    paramInput.placeholder = t('symbology.parameterIdPlaceholder');
    paramInput.value = rule.match.parameter || '';
    paramInput.className = 'sym-rule-param';
    paramInput.setAttribute('aria-label', 'Rule parameter ID');
    paramInput.onchange = () => {
        rule.match.parameter = paramInput.value.trim() || undefined;
        commitRule();
    };
    const opSelect = document.createElement('select');
    opSelect.id = `symbology-rule-op-${_symIdCounter++}`;
    opSelect.className = 'sym-rule-op';
    opSelect.setAttribute('aria-label', 'Rule operator');
    [
        ['>', '>'],
        ['>=', '>='],
        ['<', '<'],
        ['<=', '<='],
        ['=', '='],
    ].forEach(([val, txt]: string[]) => {
        const opt = document.createElement('option');
        opt.value = val || '';
        opt.textContent = txt || '';
        if (rule.match.operator === val)
            opt.selected = true;
        opSelect.appendChild(opt);
    });
    opSelect.onchange = () => {
        rule.match.operator = opSelect.value;
        commitRule();
    };
    const valInput = document.createElement('input');
    valInput.type = 'number';
    valInput.id = `symbology-rule-value-${_symIdCounter++}`;
    valInput.placeholder = t('symbology.valuePlaceholder');
    valInput.value = rule.match.value ?? '';
    valInput.className = 'sym-rule-val';
    valInput.setAttribute('aria-label', 'Rule threshold value');
    valInput.onchange = () => {
        const v = parseFloat(valInput.value);
        rule.match.value = Number.isFinite(v) ? v : 0;
        commitRule();
    };
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = `symbology-rule-color-${_symIdCounter++}`;
    colorInput.title = t('symbology.ruleColor');
    colorInput.setAttribute('aria-label', 'Rule color');
    colorInput.value = rule.style?.color || '#ff0000';
    colorInput.onchange = () => {
        rule.style = { ...rule.style, color: colorInput.value };
        commitRule();
    };
    const opacityInput = document.createElement('input');
    opacityInput.type = 'range';
    opacityInput.id = `symbology-rule-opacity-${_symIdCounter++}`;
    opacityInput.min = '0';
    opacityInput.max = '1';
    opacityInput.step = '0.05';
    opacityInput.title = t('symbology.opacity');
    opacityInput.setAttribute('aria-label', 'Rule opacity');
    opacityInput.value = rule.style?.opacity ?? 1;
    opacityInput.oninput = () => {
        rule.style = { ...rule.style, opacity: parseFloat(opacityInput.value) };
        commitRule();
    };
    const wireCheck = document.createElement('input');
    wireCheck.type = 'checkbox';
    wireCheck.id = `symbology-rule-wire-${_symIdCounter++}`;
    wireCheck.setAttribute('aria-label', 'Rule wireframe');
    wireCheck.checked = !!rule.style?.wireframe;
    wireCheck.onchange = () => {
        rule.style = { ...rule.style, wireframe: wireCheck.checked };
        commitRule();
    };
    const visCheck = document.createElement('input');
    visCheck.type = 'checkbox';
    visCheck.id = `symbology-rule-vis-${_symIdCounter++}`;
    visCheck.setAttribute('aria-label', 'Rule visible');
    visCheck.checked = rule.style?.visible !== false;
    visCheck.onchange = () => {
        rule.style = { ...rule.style, visible: visCheck.checked };
        commitRule();
    };
    const scaleInput = document.createElement('input');
    scaleInput.type = 'number';
    scaleInput.id = `symbology-rule-scale-${_symIdCounter++}`;
    scaleInput.min = '0.1';
    scaleInput.max = '5';
    scaleInput.step = '0.1';
    scaleInput.placeholder = t('symbology.scalePlaceholder');
    scaleInput.className = 'sym-rule-val';
    scaleInput.setAttribute('aria-label', 'Rule scale multiplier');
    scaleInput.value = rule.style?.scaleMultiplier ?? '';
    scaleInput.onchange = () => {
        const v = parseFloat(scaleInput.value);
        if (Number.isFinite(v)) {
            rule.style = { ...rule.style, scaleMultiplier: Math.max(0.1, Math.min(5, v)) };
        }
        else {
            const { _scaleMultiplier, ...rest } = rule.style || {};
            rule.style = rest;
        }
        commitRule();
    };
    const removeBtn = _mkIconBtn('&#10005;', 'Remover regra', () => {
        const idx = draft.rules.indexOf(rule);
        if (idx > -1)
            draft.rules.splice(idx, 1);
        updateDraft({ rules: draft.rules });
        row.remove();
    });
    row.appendChild(nameInput);
    row.appendChild(famInput);
    row.appendChild(paramInput);
    row.appendChild(opSelect);
    row.appendChild(valInput);
    row.appendChild(colorInput);
    row.appendChild(opacityInput);
    row.appendChild(_mkInlineCheck('Wire', wireCheck));
    row.appendChild(_mkInlineCheck('Visible', visCheck));
    row.appendChild(scaleInput);
    row.appendChild(removeBtn);
    return row;
}
// ----------------------------------------------------------------
// SEÇÃO LABELS
// ----------------------------------------------------------------
/**
 * @param {any} draft
 */
function _renderLabelsSection(draft: any) {
    const container = document.createElement('div');
    container.className = 'sym-section';
    const help = document.createElement('p');
    help.className = 'sym-help';
    help.textContent = t('symbology.adjust3DLabels');
    container.appendChild(help);
    const categories = ['elementNames', 'observations', 'geology', 'modelTitle'];
    categories.forEach((cat: string) => {
        const catStyle = draft.labels?.categories?.[cat] || {};
        const group = document.createElement('div');
        group.className = 'sym-label-group';
        const heading = _mkHeading(cat);
        group.appendChild(heading);
        group.appendChild(_mkCheckRow('Habilitado', !!catStyle.enabled, (/** @type {any} */ val) => {
            _ensureLabelCat(draft, cat).enabled = val;
            updateDraft({ labels: draft.labels });
        }));
        group.appendChild(_mkNumberRow('Tamanho fonte', catStyle.fontSize || 12, 8, 36, (/** @type {any} */ val) => {
            _ensureLabelCat(draft, cat).fontSize = val;
            updateDraft({ labels: draft.labels });
        }));
        group.appendChild(_mkTextRow('Fonte', catStyle.fontFamily || '', (/** @type {any} */ val) => {
            _ensureLabelCat(draft, cat).fontFamily = val || undefined;
            updateDraft({ labels: draft.labels });
        }));
        group.appendChild(_mkNumberRow('Distancia maxima', catStyle.maxDistance ?? 0, 0, 100000, (/** @type {any} */ val) => {
            _ensureLabelCat(draft, cat).maxDistance = Number.isFinite(val) ? val : 0;
            updateDraft({ labels: draft.labels });
        }));
        group.appendChild(_mkColorRow('Cor', catStyle.color || '#ffffff', (/** @type {any} */ val) => {
            _ensureLabelCat(draft, cat).color = val;
            updateDraft({ labels: draft.labels });
        }));
        group.appendChild(_mkColorRow('Fundo', catStyle.background || '#000000', (/** @type {any} */ val) => {
            _ensureLabelCat(draft, cat).background = val;
            updateDraft({ labels: draft.labels });
        }));
        if (cat === 'elementNames') {
            group.appendChild(_mkCheckRow('Mostrar familia', !!catStyle.showFamily, (/** @type {any} */ val) => {
                _ensureLabelCat(draft, cat).showFamily = val;
                updateDraft({ labels: draft.labels });
            }));
        }
        if (cat === 'observations') {
            group.appendChild(_mkCheckRow('Mostrar unidade', !!catStyle.showUnit, (/** @type {any} */ val) => {
                _ensureLabelCat(draft, cat).showUnit = val;
                updateDraft({ labels: draft.labels });
            }));
            group.appendChild(_mkCheckRow('Mostrar data', !!catStyle.showDate, (/** @type {any} */ val) => {
                _ensureLabelCat(draft, cat).showDate = val;
                updateDraft({ labels: draft.labels });
            }));
        }
        container.appendChild(group);
    });
    const perElementHeading = _mkHeading('Overrides por elemento');
    container.appendChild(perElementHeading);
    const elements = getAllElements();
    if (elements.length === 0) {
        container.appendChild(_mkHelpText('Nenhum elemento no modelo.'));
    }
    else {
        elements.forEach((/** @type {any} */ el) => {
            const row = document.createElement('div');
            row.className = 'sym-form-row';
            const label = document.createElement('span');
            label.className = 'sym-form-label';
            label.textContent = (el.data?.name || el.id) + ' (' + el.family + ')';
            const pe = _ensurePerElementLabel(draft, el.id);
            const nameCheck = document.createElement('input');
            nameCheck.type = 'checkbox';
            nameCheck.id = `symbology-label-name-${_symIdCounter++}`;
            nameCheck.setAttribute('aria-label', 'Show name label');
            nameCheck.checked = pe.nameLabel !== false;
            nameCheck.onchange = () => {
                _ensurePerElementLabel(draft, el.id).nameLabel = nameCheck.checked;
                updateDraft({ labels: draft.labels });
            };
            const obsCheck = document.createElement('input');
            obsCheck.type = 'checkbox';
            obsCheck.id = `symbology-label-obs-${_symIdCounter++}`;
            obsCheck.setAttribute('aria-label', 'Show observation label');
            obsCheck.checked = pe.obsLabel !== false;
            obsCheck.onchange = () => {
                _ensurePerElementLabel(draft, el.id).obsLabel = obsCheck.checked;
                updateDraft({ labels: draft.labels });
            };
            const right = document.createElement('div');
            right.className = 'sym-row-controls';
            right.appendChild(_mkInlineCheck('Nome', nameCheck));
            right.appendChild(_mkInlineCheck('Obs', obsCheck));
            row.appendChild(label);
            row.appendChild(right);
            container.appendChild(row);
        });
    }
    return container;
}
/**
 * @param {any} draft
 * @param {any} cat
 */
function _ensureLabelCat(draft: any, cat: string) {
    if (!draft.labels)
        draft.labels = { categories: {}, perElement: {} };
    if (!draft.labels.categories)
        draft.labels.categories = {};
    if (!draft.labels.categories[cat])
        draft.labels.categories[cat] = {};
    return draft.labels.categories[cat];
}
/**
 * @param {any} draft
 * @param {any} elementId
 */
function _ensurePerElementLabel(draft: any, elementId: string) {
    if (!draft.labels)
        draft.labels = { categories: {}, perElement: {} };
    if (!draft.labels.perElement)
        draft.labels.perElement = {};
    if (!draft.labels.perElement[elementId])
        draft.labels.perElement[elementId] = {};
    return draft.labels.perElement[elementId];
}
// ----------------------------------------------------------------
// SEÇÃO SUPERFÍCIES
// ----------------------------------------------------------------
/**
 * @param {any} draft
 */
function _renderSurfacesSection(draft: any) {
    const container = document.createElement('div');
    container.className = 'sym-section';
    const help = document.createElement('p');
    help.className = 'sym-help';
    help.textContent = t('symbology.configureInterpolation');
    container.appendChild(help);
    /** @type {any[]} */ let layers = [];
    try {
        layers = getAllLayers();
    }
    catch (e: any) {
        console.debug('[symbologyModal] getAllLayers:', /** @type {any} */ (e)?.message || e);
        /* nenhuma superficie */
    }
    if (layers.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'sym-help';
        msg.textContent = t('symbology.noInterpolationSurfaces');
        container.appendChild(msg);
        return container;
    }
    layers.forEach((/** @type {any} */ layer) => {
        const style = draft.surfaces?.byLayer?.[layer.id] || {};
        const group = document.createElement('div');
        group.className = 'sym-surface-group';
        const heading = _mkHeading(layer.name || layer.id);
        group.appendChild(heading);
        group.appendChild(_mkRangeRow('Opacidade', style.opacity ?? 1, 0, 1, 0.05, (/** @type {any} */ val) => {
            _ensureSurface(draft, layer.id).opacity = val;
            updateDraft({ surfaces: draft.surfaces });
        }));
        group.appendChild(_mkTextRow('Color Ramp', style.colorRamp || '', (/** @type {any} */ val) => {
            _ensureSurface(draft, layer.id).colorRamp = val || undefined;
            updateDraft({ surfaces: draft.surfaces });
        }));
        group.appendChild(_mkCheckRow('Wireframe', !!style.wireframe, (/** @type {any} */ val) => {
            _ensureSurface(draft, layer.id).wireframe = val;
            updateDraft({ surfaces: draft.surfaces });
        }));
        group.appendChild(_mkCheckRow('Visivel', style.visible !== false, (/** @type {any} */ val) => {
            _ensureSurface(draft, layer.id).visible = val;
            updateDraft({ surfaces: draft.surfaces });
        }));
        group.appendChild(_mkCheckRow('Mostrar contornos', !!style.showContours, (/** @type {any} */ val) => {
            _ensureSurface(draft, layer.id).showContours = val;
            updateDraft({ surfaces: draft.surfaces });
        }));
        group.appendChild(_mkCheckRow('Mostrar labels de contorno', !!style.showContourLabels, (/** @type {any} */ val) => {
            _ensureSurface(draft, layer.id).showContourLabels = val;
            updateDraft({ surfaces: draft.surfaces });
        }));
        const densityRow = document.createElement('div');
        densityRow.className = 'sym-form-row';
        const densityLbl = document.createElement('span');
        densityLbl.className = 'sym-form-label';
        densityLbl.textContent = t('symbology.contourDensity');
        const densitySelect = document.createElement('select');
        densitySelect.id = `symbology-contour-density-${_symIdCounter++}`;
        densitySelect.setAttribute('aria-label', 'Contour density');
        ['low', 'medium', 'high'].forEach((/** @type {any} */ v) => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            if ((style.contourDensity || 'medium') === v)
                opt.selected = true;
            densitySelect.appendChild(opt);
        });
        densitySelect.onchange = () => {
            _ensureSurface(draft, layer.id).contourDensity = densitySelect.value;
            updateDraft({ surfaces: draft.surfaces });
        };
        densityRow.appendChild(densityLbl);
        densityRow.appendChild(densitySelect);
        group.appendChild(densityRow);
        const bandsHeading = _mkHeading('Faixas de valor');
        group.appendChild(bandsHeading);
        group.appendChild(_renderValueBandEditor(style.valueBands || [], (bands: any[]) => {
            _ensureSurface(draft, layer.id).valueBands = bands;
            updateDraft({ surfaces: draft.surfaces });
        }));
        container.appendChild(group);
    });
    return container;
}
/**
 * @param {any} draft
 * @param {any} layerId
 */
function _ensureSurface(draft: any, layerId: string) {
    if (!draft.surfaces)
        draft.surfaces = { byLayer: {} };
    if (!draft.surfaces.byLayer)
        draft.surfaces.byLayer = {};
    if (!draft.surfaces.byLayer[layerId])
        draft.surfaces.byLayer[layerId] = {};
    return draft.surfaces.byLayer[layerId];
}
/**
 * @param {any} bands
 * @param {any} onChange
 */
function _renderValueBandEditor(bands: any[], onChange: (bands: any[]) => void) {
    const container = document.createElement('div');
    container.className = 'sym-bands';
    const list = document.createElement('div');
    list.className = 'sym-bands-list';
    const refreshList = () => {
        list.innerHTML = '';
        bands.forEach((band: any, idx: number) => {
            const row = document.createElement('div');
            row.className = 'sym-band-row';
            const maxInput = document.createElement('input');
            maxInput.type = 'number';
            maxInput.id = `symbology-band-max-${_symIdCounter++}`;
            maxInput.setAttribute('aria-label', 'Band maximum value');
            maxInput.placeholder = band.max === null ? '(catch-all)' : 'Máximo';
            maxInput.value = band.max !== null ? band.max : '';
            maxInput.className = 'sym-band-max';
            maxInput.onchange = () => {
                const v = parseFloat(maxInput.value);
                bands[idx].max = isNaN(v) ? null : v;
                onChange([...bands]);
            };
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.id = `symbology-band-color-${_symIdCounter++}`;
            colorInput.value = band.color || '#4488ff';
            colorInput.title = t('symbology.color');
            colorInput.setAttribute('aria-label', 'Band color');
            colorInput.onchange = () => {
                bands[idx].color = colorInput.value;
                onChange([...bands]);
            };
            const labelInput = document.createElement('input');
            labelInput.type = 'text';
            labelInput.id = `symbology-band-label-${_symIdCounter++}`;
            labelInput.placeholder = t('symbology.labelPlaceholder');
            labelInput.value = band.label || '';
            labelInput.className = 'sym-band-label';
            labelInput.setAttribute('aria-label', 'Band label');
            labelInput.onchange = () => {
                bands[idx].label = labelInput.value;
                onChange([...bands]);
            };
            const removeBtn = _mkIconBtn('&#10005;', 'Remover faixa', () => {
                bands.splice(idx, 1);
                onChange([...bands]);
                refreshList();
            });
            row.appendChild(maxInput);
            row.appendChild(colorInput);
            row.appendChild(labelInput);
            row.appendChild(removeBtn);
            list.appendChild(row);
        });
    };
    refreshList();
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'sym-add-band-btn';
    addBtn.innerHTML = '&#43; ' + t('symbology.addRange');
    addBtn.onclick = () => {
        bands.push({ max: null, color: '#4488ff', label: '' });
        onChange([...bands]);
        refreshList();
    };
    container.appendChild(list);
    container.appendChild(addBtn);
    return container;
}
// ----------------------------------------------------------------
// SEÇÃO CENA
// ----------------------------------------------------------------
/**
 * @param {any} draft
 */
function _renderSceneSection(draft: any) {
    const container = document.createElement('div');
    container.className = 'sym-section';
    const help = document.createElement('p');
    help.className = 'sym-help';
    help.textContent = t('symbology.overrideGlobalSettings');
    container.appendChild(help);
    const scene = draft.scene || {};
    /**
     * @param {any} profileId
     * @param {any} val
     */
    const setScene = (key: string, val: any) => {
        const current = getDraft();
        if (!current)
            return;
        if (!current.scene)
            current.scene = {};
        current.scene[key] = val;
        updateDraft({ scene: current.scene });
    };
    container.appendChild(_mkCheckRow('Wireframe global', !!scene.wireframe, (/** @type {any} */ v) => setScene('wireframe', v)));
    container.appendChild(_mkRangeRow('Intensidade ambiental', scene.ambientIntensity ?? 0.5, 0, 2, 0.05, (/** @type {any} */ v) => setScene('ambientIntensity', v)));
    container.appendChild(_mkRangeRow('Intensidade direcional', scene.directionalIntensity ?? 1, 0, 3, 0.1, (/** @type {any} */ v) => setScene('directionalIntensity', v)));
    container.appendChild(_mkRangeRow('Exagero vertical', scene.verticalExaggeration ?? 1, 0.1, 10, 0.1, (/** @type {any} */ v) => setScene('verticalExaggeration', v)));
    container.appendChild(_mkCheckRow('Sombras', !!scene.shadows, (/** @type {any} */ v) => setScene('shadows', v)));
    container.appendChild(_mkColorRow('Fundo', scene.background || '#2d2d2d', (/** @type {any} */ v) => setScene('background', v)));
    const fog = scene.fog || {};
    container.appendChild(_mkCheckRow('Neblina', !!fog.enabled, (/** @type {any} */ v) => {
        const next = { ...fog, enabled: v };
        setScene('fog', next);
    }));
    container.appendChild(_mkNumberRow('Fog near', fog.near ?? 20, 0, 100000, (/** @type {any} */ v) => {
        const next = { ...fog, near: Number.isFinite(v) ? v : 20 };
        setScene('fog', next);
    }));
    container.appendChild(_mkNumberRow('Fog far', fog.far ?? 200, 1, 1000000, (/** @type {any} */ v) => {
        const near = Number.isFinite(fog.near) ? fog.near : 20;
        const value = Number.isFinite(v) ? Math.max(v, near + 1) : 200;
        const next = { ...fog, far: value };
        setScene('fog', next);
    }));
    return container;
}
// ----------------------------------------------------------------
// RODAPÉ
// ----------------------------------------------------------------
function _renderFooter() {
    const footer = document.createElement('div');
    footer.className = 'sym-footer';
    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'sym-btn sym-btn--secondary';
    previewBtn.textContent = t('symbology.applyLive');
    previewBtn.title = t('symbology.previewTooltip');
    previewBtn.onclick = () => {
        if (!_currentProfileId)
            return;
        updateDraft({ name: _getNameInputValue() });
        previewDraft();
        showToast(t('symbology.previewApplied'), 'info');
    };
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'sym-btn sym-btn--primary';
    saveBtn.textContent = t('symbology.save');
    saveBtn.onclick = () => {
        if (!_currentProfileId)
            return;
        updateDraft({ name: _getNameInputValue() });
        commitDraft();
        showToast(t('symbology.profileSaved'), 'success');
        closeSymbologyEditor();
    };
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'sym-btn sym-btn--ghost';
    cancelBtn.textContent = t('symbology.cancel');
    cancelBtn.onclick = closeSymbologyEditor;
    footer.appendChild(cancelBtn);
    footer.appendChild(previewBtn);
    if (_currentProfileId)
        footer.appendChild(saveBtn);
    return footer;
}
// ----------------------------------------------------------------
// NAVEGAÇÃO INTERNA
// ----------------------------------------------------------------
/**
 * @param {any} profileId
 */
function _selectProfile(profileId: string) {
    if (_currentProfileId && _currentProfileId !== profileId) {
        discardDraft();
    }
    _currentProfileId = profileId;
    openDraft(profileId);
    _refreshContent(_renderProfileEditor());
    _refreshSidebar();
}
function _refreshSidebar() {
    const old = /** @type {any} */ (document.getElementById('sym-profile-list'));
    if (old)
        old.replaceWith(_renderProfileList());
}
/**
 * @param {any} el
 */
function _refreshContent(el: HTMLElement) {
    const content = /** @type {any} */ (document.getElementById('sym-content'));
    if (content) {
        content.innerHTML = '';
        content.appendChild(el);
    }
}
function _getNameInputValue() {
    const input = /** @type {any} */ (document.querySelector('#sym-content .sym-name-input'));
    return input?.value?.trim() || getDraft()?.name || '';
}
// ----------------------------------------------------------------
// HELPERS DOM
// ----------------------------------------------------------------
/**
 * @param {any} html
 * @param {any} title
 * @param {any} onClick
 */
function _mkIconBtn(html: string, title: string, onClick: () => void) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sym-icon-btn';
    btn.innerHTML = html;
    btn.title = title;
    btn.onclick = onClick;
    return btn;
}
/**
 * @param {any} text
 */
function _mkHeading(text: string) {
    const h = document.createElement('h4');
    h.className = 'sym-section-heading';
    h.textContent = text;
    return h;
}
/**
 * @param {any} label
 * @param {any} checked
 * @param {any} onChange
 * @param {any} id
 */
function _mkCheckRow(label: string, checked: boolean, onChange: (value: boolean) => void, id: string | undefined = undefined) {
    const row = document.createElement('div');
    row.className = 'sym-form-row';
    const lbl = document.createElement('label');
    lbl.className = 'sym-form-label';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id = id || `symbology-chk-${_symIdCounter++}`;
    chk.setAttribute('aria-label', label);
    chk.checked = checked;
    chk.onchange = () => onChange(chk.checked);
    lbl.htmlFor = chk.id;
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode(' ' + label));
    row.appendChild(lbl);
    return row;
}
/**
 * @param {any} label
 * @param {any} input
 */
function _mkInlineCheck(label: string, input: HTMLInputElement) {
    if (!input.id) {
        input.id = `symbology-ichk-${_symIdCounter++}`;
    }
    if (!input.getAttribute('aria-label')) {
        input.setAttribute('aria-label', label);
    }
    const wrap = document.createElement('label');
    wrap.className = 'sym-inline-check';
    wrap.htmlFor = input.id;
    wrap.appendChild(input);
    wrap.appendChild(document.createTextNode(' ' + label));
    return wrap;
}
/**
 * @param {any} label
 * @param {any} value
 * @param {any} min
 * @param {any} max
 * @param {any} onChange
 * @param {any} id
 */
function _mkNumberRow(label: string, value: number | string, min: number | string, max: number | string, onChange: (value: number) => void, id: string | undefined = undefined) {
    const row = document.createElement('div');
    row.className = 'sym-form-row';
    const lbl = document.createElement('label');
    lbl.className = 'sym-form-label';
    const input = document.createElement('input');
    input.type = 'number';
    input.id = id || `symbology-num-${_symIdCounter++}`;
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.className = 'sym-number-input';
    input.setAttribute('aria-label', label);
    input.onchange = () => onChange(parseFloat(input.value));
    lbl.htmlFor = input.id;
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
}
/**
 * @param {any} label
 * @param {any} value
 * @param {any} onChange
 * @param {any} id
 */
function _mkTextRow(label: string, value: string, onChange: (value: string) => void, id: string | undefined = undefined) {
    const row = document.createElement('div');
    row.className = 'sym-form-row';
    const lbl = document.createElement('label');
    lbl.className = 'sym-form-label';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = id || `symbology-txt-${_symIdCounter++}`;
    input.value = value || '';
    input.className = 'sym-text-input';
    input.setAttribute('aria-label', label);
    input.onchange = () => onChange(input.value.trim());
    lbl.htmlFor = input.id;
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
}
/**
 * @param {any} text
 */
function _mkHelpText(text: string) {
    const p = document.createElement('p');
    p.className = 'sym-help';
    p.textContent = text;
    return p;
}
/**
 * @param {any} label
 * @param {any} value
 * @param {any} onChange
 * @param {any} id
 */
function _mkColorRow(label: string, value: string, onChange: (value: string) => void, id: string | undefined = undefined) {
    const row = document.createElement('div');
    row.className = 'sym-form-row';
    const lbl = document.createElement('label');
    lbl.className = 'sym-form-label';
    const input = document.createElement('input');
    input.type = 'color';
    input.id = id || `symbology-clr-${_symIdCounter++}`;
    input.value = value;
    input.setAttribute('aria-label', label);
    input.onchange = () => onChange(input.value);
    lbl.htmlFor = input.id;
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
}
/**
 * @param {any} label
 * @param {any} value
 * @param {any} min
 * @param {any} max
 * @param {any} step
 * @param {any} onChange
 * @param {any} id
 */
function _mkRangeRow(label: string, value: number | string, min: number | string, max: number | string, step: number | string, onChange: (value: number) => void, id: string | undefined = undefined) {
    const row = document.createElement('div');
    row.className = 'sym-form-row';
    const lbl = document.createElement('label');
    lbl.className = 'sym-form-label';
    const rangeWrap = document.createElement('div');
    rangeWrap.className = 'sym-range-wrap';
    const input = document.createElement('input');
    input.type = 'range';
    input.id = id || `symbology-rng-${_symIdCounter++}`;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', label);
    lbl.htmlFor = input.id;
    lbl.textContent = label;
    const display = document.createElement('span');
    display.className = 'sym-range-val';
    display.textContent = String(value);
    input.oninput = () => {
        const v = parseFloat(input.value);
        display.textContent = v.toFixed(2);
        onChange(v);
    };
    rangeWrap.appendChild(input);
    rangeWrap.appendChild(display);
    row.appendChild(lbl);
    row.appendChild(rangeWrap);
    return row;
}
//# sourceMappingURL=symbologyModal.js.map
