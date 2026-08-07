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
/**
 * productWizard.js - Service Productization Wizard (5-step modal)
 *
 * Creates and manages the product configuration wizard for the Library marketplace.
 * Follows createElement + root pattern per codebase conventions.
 *
 * Steps:
 *   1. Identity - name, category, description, license, visibility
 *   2. Scope - deliverables tree (add/remove scope items)
 *   3. Pricing - type, value, IP scenarios, legal limits
 *   4. AI Governance - 6 dimensions (only if ai_enabled)
 *   5. Review - summary + generate document + publish
 *
 * @module utils/ui/productWizard
 */
import { t } from '../i18n/translations.js';
// eslint-disable-next-line
import { Z_INDEX } from './zIndex.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { lazyImport } from '../helpers/lazyImport.js';
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
/** @type {any} */
let _modalRoot: any = null;
/** @type {any} */
let _keydownHandler: any = null;
let _currentStep = 1;
/** @type {any} */
let _product: any = null; // Full product object from API
/** @type {any} */
let _pricing: any = null; // Pricing model
/** @type {any[]} */
let _ipOptionals = []; // IP optional modules
let _scopeItems: any[] = []; // Scope tree
/** @type {any} */
let _governance: any = null; // Governance profile
let _clauses: any[] = []; // Clause configs
let _isNew = false; // Creating new vs editing existing
/** @type {any} */
let _onComplete: any = null; // Callback after publish
const STEPS = [
    { key: 'identity', label: () => t('wizardStepIdentity') || 'Identidade' },
    { key: 'scope', label: () => t('wizardStepScope') || 'Escopo' },
    { key: 'pricing', label: () => t('wizardStepPricing') || 'Preco' },
    { key: 'governance', label: () => t('wizardStepGovernance') || 'Governanca IA' },
    { key: 'review', label: () => t('wizardStepReview') || 'Revisao' },
];
const CATEGORIES = [
    { value: 'environmental_monitoring', label: () => t('catEnvMonitoring') || 'Monitoramento Ambiental' },
    { value: 'environmental_consulting', label: () => t('catEnvConsulting') || 'Consultoria Ambiental' },
    { value: 'environmental_remediation', label: () => t('catEnvRemediation') || 'Remediacao Ambiental' },
    { value: 'ai_ml', label: () => t('catAiMl') || 'IA / Machine Learning' },
    { value: 'data_engineering', label: () => t('catDataEng') || 'Engenharia de Dados' },
    { value: 'software_development', label: () => t('catSoftware') || 'Desenvolvimento de Software' },
    { value: 'consulting_general', label: () => t('catConsulting') || 'Consultoria Geral' },
    { value: 'training', label: () => t('catTraining') || 'Treinamento' },
    { value: 'audit', label: () => t('catAudit') || 'Auditoria' },
    { value: 'other', label: () => t('catOther') || 'Outro' },
];
const _NODE_TYPES = [
    { value: 'deliverable', label: () => t('scopeDeliverable') || 'Entrega' },
    { value: 'milestone', label: () => t('scopeMilestone') || 'Marco' },
    { value: 'exclusion', label: () => t('scopeExclusion') || 'Exclusao' },
];
// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
/** @type {boolean} Fallback local quando Edge Function nao esta disponivel.
 *  Default true ate Edge Function service-products ser deployada no Supabase.
 *  Trocar para false apos deploy. */
let _offlineMode = true;
/** @param {string} path @param {string} [method] @param {any} [body] */
async function _apiCall(path: any, method: any = "GET", body: any = null) {
    // Se ja estamos em modo offline, usar fallback local
    if (_offlineMode) return _localFallback(path, method, body);
    try {
        // OPT-3: use cached `getAccessToken()` instead of `auth.getSession()`
        // - single bootstrap fetches session, this read is O(1).
        const sessionMod = (await import('../auth/session.js' as string)) as any;
        const { getSupabaseClient, getAccessToken } = sessionMod;
        const supabase = (getSupabaseClient()) as any;
        if (!supabase) throw new Error('Not authenticated');
        const accessToken = getAccessToken();
        if (!accessToken) throw new Error('No session');
        const url = `${supabase.supabaseUrl}/functions/v1/service-products/${path}`;
        /** @type {any} */
        const opts: any = {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                apikey: supabase.supabaseKey,
            },
        };
        if (body && method !== 'GET') opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        return json;
    } catch (err: any) {
        // Fallback para modo local se Edge Function nao esta disponivel
        // Captura QUALQUER erro: 404, HTML parse, network, auth - tudo vai para local mode
        console.warn('[ecbyts] service-products API unavailable, using local mode:', /** @type {any} */ (err).message);
        _offlineMode = true;
        return _localFallback(path, method, body);
    }
}
/**
 * Fallback local quando Edge Function nao esta deployada.
 * Usa dados em memoria - nao persiste no Supabase.
 * Permite testar o wizard completo offline.
 * @private
 */
/** @param {string} path @param {string} method @param {any} [body] */
function _localFallback(path: any, method: any, body: any) {
    const id = _product?.id || crypto.randomUUID();
    // POST /products (create)
    if (path === '' && method === 'POST') {
        const now = new Date().toISOString();
        return {
            id,
            owner_id: 'local',
            name: body?.name || 'Novo Servico',
            slug: (body?.name || 'novo-servico')
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, ''),
            description: null,
            short_description: null,
            category: body?.category || 'consulting_general',
            tags: [],
            version: '1.0.0',
            locale: 'pt-BR',
            license_type: 'proprietary',
            status: 'draft',
            visibility: 'private',
            ai_enabled: body?.ai_enabled || false,
            lowcode_enabled: false,
            created_at: now,
            updated_at: now,
            pricing_model: {
                id: crypto.randomUUID(),
                product_id: id,
                pricing_type: 'fixed',
                base_value: 1.0,
                currency: 'BRL',
                ip_scenario_a_multiplier: 1.0,
                ip_scenario_b_multiplier: 1.0,
                late_fee_pct: 2.0,
                late_interest_monthly_pct: 1.0,
                warranty_days: 90,
                tacit_acceptance_business_days: 10,
                rescission_fee_pct_remaining: 20.0,
                rescission_fee_pct_total: 10.0,
                installments_count: 1,
                installments_type: 'equal',
            },
            ip_optionals: [
                {
                    code: 'PI-01',
                    name: 'Acesso ao codigo-fonte',
                    description: 'Direito de acesso ao codigo-fonte.',
                    price: 0,
                    enabled: true,
                    depends_on_code: null,
                    is_recurring: false,
                },
                {
                    code: 'PI-02',
                    name: 'Direito de modificacao',
                    description: 'Direito de modificar codigo-fonte.',
                    price: 0,
                    enabled: true,
                    depends_on_code: 'PI-01',
                    is_recurring: false,
                },
                {
                    code: 'PI-03',
                    name: 'Sublicenciamento',
                    description: 'Direito de sublicenciar.',
                    price: 0,
                    enabled: true,
                    depends_on_code: null,
                    is_recurring: false,
                },
                {
                    code: 'PI-04',
                    name: 'Uso para IA/ML',
                    description: 'Uso como dados de treinamento.',
                    price: 0,
                    enabled: true,
                    depends_on_code: null,
                    is_recurring: false,
                },
                {
                    code: 'PI-05',
                    name: 'Escrow de codigo',
                    description: 'Deposito em agente escrow.',
                    price: 0,
                    enabled: true,
                    depends_on_code: null,
                    is_recurring: false,
                },
                {
                    code: 'PI-06',
                    name: 'Atualizacoes pos-garantia',
                    description: 'Atualizacoes apos garantia.',
                    price: 0,
                    enabled: true,
                    depends_on_code: null,
                    is_recurring: true,
                    recurring_period: 'annual',
                },
            ],
            clause_configs: [
                'preamble',
                'object',
                'scope',
                'term',
                'remuneration',
                'warranty_acceptance',
                'ip',
                'jurisdiction',
                'confidentiality',
                'lgpd',
            ].map((k: any) => ({ clause_key: k, enabled: true, config: {}, custom_text: null })),
            governance_profile: body?.ai_enabled
                ? {
                      dim_autonomy: 1,
                      dim_data_sensitivity: 1,
                      dim_integrations: 1,
                      dim_users: 1,
                      dim_decision_impact: 1,
                      dim_reversibility: 1,
                      computed_score: 6,
                  }
                : null,
        };
    }
    // PATCH /products/:id
    if (method === 'PATCH' && !path.includes('/')) {
        Object.assign(_product, body);
        return _product;
    }
    // POST scope item
    if (path.endsWith('/scope') && method === 'POST') {
        const item = {
            id: crypto.randomUUID(),
            product_id: id,
            code: String((_scopeItems?.length || 0) + 1),
            name: body?.name || 'Item',
            node_type: body?.node_type || 'deliverable',
            description: body?.description || null,
            effort_hours: body?.effort_hours || null,
            acceptance_criteria: body?.acceptance_criteria || null,
            acceptance_type: body?.acceptance_type || 'fit_for_purpose',
            sort_order: _scopeItems?.length || 0,
            depends_on: [],
        };
        return item;
    }
    // DELETE scope item
    if (path.includes('/scope/') && method === 'DELETE') {
        return { ok: true };
    }
    // PATCH pricing
    if (path.endsWith('/pricing') && method === 'PATCH') {
        Object.assign(_pricing, body);
        return _pricing;
    }
    // PATCH governance
    if (path.endsWith('/governance') && method === 'PATCH') {
        if (_governance) Object.assign(_governance, body);
        return _governance;
    }
    // POST publish (local validation)
    if (path.endsWith('/publish') && method === 'POST') {
        const errors = [];
        if (!_product?.name || _product.name.length < 3)
            errors.push({ code: 'PRODUCT_NAME_INVALID', message: 'Nome: 3-200 caracteres.' });
        if (!_product?.description || _product.description.length < 10)
            errors.push({ code: 'PRODUCT_DESC_INVALID', message: 'Descricao: 10-5000 caracteres.' });
        const deliverables = (_scopeItems || []).filter((i: any) => i.node_type === 'deliverable');
        if (deliverables.length === 0)
            errors.push({ code: 'SCOPE_NO_DELIVERABLES', message: 'Min 1 entrega necessaria.' });
        if (Number(_pricing?.base_value) <= 0)
            errors.push({ code: 'PRICING_MISSING', message: 'Valor base > 0 necessario.' });
        if (errors.length > 0) return { errors };
        _product.status = 'published';
        _product.published_at = new Date().toISOString();
        return _product;
    }
    return {};
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Open the wizard to create a new product.
 * @param {{ onComplete?: Function }} [opts]
 */
export async function openProductWizard(opts: any = {}) {
    _onComplete = opts.onComplete || null;
    _isNew = true;
    _currentStep = 1;
    // Pre-load docx-js CDN while user fills form (fire-and-forget)
    import('./productDocGenerator.js' as string)
        .then((m) => m.preloadDocx())
        .catch((_e) => console.debug('[utils/ui/productWizard:silent-catch]', _e?.message || _e));
    try {
        const result = await _apiCall('', 'POST', {
            name: t('wizardNewProductName') || 'Novo Servico',
            category: 'consulting_general',
        });
        _product = result;
        _pricing = result.pricing_model;
        _ipOptionals = result.ip_optionals || [];
        _scopeItems = [];
        _governance = result.governance_profile;
        _clauses = result.clause_configs || [];
        _renderModal();
        // Sprint 3 Tier-B wire (Calvin 2026-06-03)
        syncDeepLinkUrl('product-wizard');
    } catch (err: any) {
        console.error('[ecbyts] Failed to create product:', err);
        const { showToast } = await import('./toast.js' as string);
        showToast(t('wizardCreateError') || 'Erro ao criar produto', 'error');
    }
}
/**
 * Open the wizard to edit an existing product.
 * @param {string} productId
 * @param {{ onComplete?: Function }} [opts]
 */
export async function editProductWizard(productId: any, opts: any = {}) {
    _onComplete = opts.onComplete || null;
    _isNew = false;
    _currentStep = 1;
    try {
        const result = await _apiCall(productId);
        _product = result;
        _pricing = result.pricing_model?.[0] || result.pricing_model;
        _ipOptionals = result.ip_optional || [];
        _scopeItems = result.product_scope_item || [];
        _governance = result.governance_profile?.[0] || result.governance_profile;
        _clauses = result.contract_clause_config || [];
        _renderModal();
    } catch (err: any) {
        console.error('[ecbyts] Failed to load product:', err);
        const { showToast } = await import('./toast.js' as string);
        showToast(t('wizardLoadError') || 'Erro ao carregar produto', 'error');
    }
}
/**
 * Close the wizard modal.
 */
export function closeProductWizard() {
    if (_keydownHandler) {
        document.removeEventListener('keydown', _keydownHandler);
        _keydownHandler = null;
    }
    if (_modalRoot) _modalRoot.innerHTML = '';
    _product = null;
    _pricing = null;
    _ipOptionals = [];
    _scopeItems = [];
    _governance = null;
    _clauses = [];
    _currentStep = 1;
    clearDeepLinkUrl();
}
// ---------------------------------------------------------------------------
// Modal construction
// ---------------------------------------------------------------------------
function _renderModal() {
    _modalRoot = document.getElementById('product-wizard-root');
    if (!_modalRoot) {
        _modalRoot = document.createElement('div');
        _modalRoot.id = 'product-wizard-root';
        document.body.appendChild(_modalRoot);
    }
    _modalRoot.innerHTML = '';
    // Overlay
    // B2 migração 2026-05-29: .modal-overlay active → .ecbt-overlay canônico.
    // Drena #3: maxWidth:720px/95vw inline + Z_INDEX já provido pela classe canônica.
    const overlay = document.createElement('div');
    overlay.className = 'ecbt-overlay product-wizard-overlay';
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeProductWizard();
    });
    // Escape key closes wizard
    if (_keydownHandler) document.removeEventListener('keydown', _keydownHandler);
    /** @param {KeyboardEvent} num */
    const _onKeyDown = (e: any) => {
        if (e.key === 'Escape') {
            closeProductWizard();
            document.removeEventListener('keydown', _onKeyDown);
            return;
        }
        // Focus trap: Tab cycles within modal
        if (e.key === 'Tab' && dialog) {
            const focusable = (dialog.querySelectorAll('input,select,textarea,button:not([disabled]),[tabindex]:not([tabindex="-1"])')) as NodeListOf<HTMLElement>;
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                (last as any).focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                (first as any).focus();
            }
        }
    };
    _keydownHandler = _onKeyDown;
    document.addEventListener('keydown', _onKeyDown);
    // Dialog
    const dialog = document.createElement('div');
    dialog.className = 'ecbt-dialog ecbt-dialog--lg product-wizard-dialog';
    // -- Disclaimer banner (non-dismissible, spec v2.2 §6.0)
    const banner = document.createElement('div');
    banner.id = 'pw-disclaimer-banner';
    banner.style.cssText =
        'padding:8px 16px;background:var(--neutral-100);border-bottom:1px solid var(--neutral-200);font-size:12px;color:var(--neutral-600);line-height:1.4;';
    banner.innerHTML = `&#9432; ${t('wizardDisclaimer') || 'Os documentos gerados sao propostas de escopo e termos sugeridos. Requerem revisao juridica para validade contratual.'}`;
    // -- Header
    const header = document.createElement('div');
    header.className = 'ecbt-dialog-header';
    header.innerHTML = `
    <h2 class="ecbt-dialog-title" style="font-size:16px;margin:0;flex:1;min-width:0;">
      ${t('wizardTitle') || 'Produtizar Servico'}
      <span style="color:var(--neutral-400);font-weight:normal;font-size:13px;margin-left:8px;">
        ${t('wizardStep') || 'Passo'} <span id="pw-step-num">1</span>/5
      </span>
    </h2>
    <button class="ecbt-dialog-close" id="pw-close">&#10005;</button>
  `;
    // -- Step tabs
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    tabs.id = 'pw-tabs';
    tabs.style.padding = '0 16px';
    STEPS.forEach((step: any, i: any) => {
        const tab = document.createElement('button');
        tab.className = `tab${i === 0 ? ' active' : ''}`;
        tab.dataset.step = String(i + 1);
        tab.textContent = step.label();
        tab.style.fontSize = '12px';
        tab.addEventListener('click', () => _goToStep(i + 1));
        // Skip governance tab if not AI
        if (step.key === 'governance' && !_product?.ai_enabled) {
            tab.style.display = 'none';
        }
        tabs.appendChild(tab);
    });
    // -- Body
    const body = document.createElement('div');
    body.className = 'ecbt-dialog-body';
    body.id = 'pw-body';
    body.style.maxHeight = 'clamp(250px, 60vh, 550px)';
    // -- Footer
    const footer = document.createElement('div');
    footer.className = 'ecbt-dialog-footer';
    footer.id = 'pw-footer';
    // Assemble
    dialog.appendChild(banner);
    dialog.appendChild(header);
    dialog.appendChild(tabs);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    _modalRoot.appendChild(overlay);
    // Bind close
    document.getElementById('pw-close')?.addEventListener('click', closeProductWizard);
    // Render first step
    _renderStep(_currentStep);
    _renderFooter();
}
// ---------------------------------------------------------------------------
// Step navigation
// ---------------------------------------------------------------------------
/** @param {number} num */
function _goToStep(num: any) {
    // Skip governance step if not AI
    if (num === 4 && !_product?.ai_enabled) {
        num = _currentStep < 4 ? 5 : 3;
    }
    if (num < 1 || num > 5) return;
    // Save current step data before leaving
    _saveCurrentStepData();
    _currentStep = num;
    // Update tabs
    const tabs = document.querySelectorAll('#pw-tabs .tab');
    tabs.forEach((tab: any) => {
        tab.classList.toggle('active', /** @type {HTMLElement} */ (tab).dataset.step === String(num));
    });
    // Update step number
    const stepNum = document.getElementById('pw-step-num');
    if (stepNum) stepNum.textContent = String(num);
    _renderStep(num);
    _renderFooter();
}
/**
 * Shows inline error message below a form field.
 * @param {HTMLElement} fieldEl - The input/select element
 * @param {string} message - Error text to display
 */
function _showFieldError(fieldEl: any, message: any) {
    if (!fieldEl) return;
    const err = document.createElement('span');
    err.className = 'pw-field-error';
    err.style.cssText = 'color:#f85149;font-size:12px;margin-top:2px;display:block;';
    err.textContent = message;
    fieldEl.parentElement?.appendChild(err);
}
/**
 * Validates Step 1 (Identity) required fields before advancing.
 * Campos obrigatorios: nome (3-200 chars) e categoria.
 * @returns {boolean}
 */
function _validateIdentity() {
    const nameEl = (document.getElementById('pw-name')) as HTMLInputElement|null;
    const catEl = (document.getElementById('pw-category')) as HTMLSelectElement|null;
    const name = nameEl?.value?.trim() || '';
    const category = catEl?.value || '';
    document.querySelectorAll('.pw-field-error').forEach((el: any) => el.remove());
    let valid = true;
    if (name.length < 3) {
        if (nameEl) _showFieldError(nameEl, t('wizardNameMinLength') || 'Nome deve ter ao menos 3 caracteres');
        valid = false;
    }
    if (!category) {
        if (catEl) _showFieldError(catEl, t('wizardCategoryRequired') || 'Selecione uma categoria');
        valid = false;
    }
    return valid;
}
function _nextStep() {
    // Gate: validate required identity fields before leaving step 1
    if (_currentStep === 1 && !_validateIdentity()) return;
    _saveCurrentStepData();
    let next = _currentStep + 1;
    if (next === 4 && !_product?.ai_enabled) next = 5;
    if (next > 5) return;
    _goToStep(next);
}
function _prevStep() {
    let prev = _currentStep - 1;
    if (prev === 4 && !_product?.ai_enabled) prev = 3;
    if (prev < 1) return;
    _goToStep(prev);
}
function _renderFooter() {
    const footer = document.getElementById('pw-footer');
    if (!footer) return;
    footer.innerHTML = '';
    if (_currentStep > 1) {
        const backBtn = document.createElement('button');
        backBtn.id = 'pw-btn-back';
        backBtn.className = 'btn btn-secondary';
        backBtn.textContent = t('wizardBack') || 'Voltar';
        backBtn.addEventListener('click', _prevStep);
        footer.appendChild(backBtn);
    }
    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    footer.appendChild(spacer);
    if (_currentStep < 5) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-primary';
        nextBtn.textContent = t('wizardNext') || 'Proximo';
        nextBtn.addEventListener('click', _nextStep);
        footer.appendChild(nextBtn);
    } else {
        // Review step: save + publish buttons
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-secondary';
        saveBtn.textContent = t('wizardSaveDraft') || 'Salvar Rascunho';
        saveBtn.addEventListener('click', _handleSaveDraft);
        footer.appendChild(saveBtn);
        const pubBtn = document.createElement('button');
        pubBtn.className = 'btn btn-primary';
        pubBtn.textContent = t('wizardPublish') || 'Publicar';
        pubBtn.addEventListener('click', _handlePublish);
        footer.appendChild(pubBtn);
    }
}
// ---------------------------------------------------------------------------
// Step rendering
// ---------------------------------------------------------------------------
/** @param {number} num */
function _renderStep(num: any) {
    const body = document.getElementById('pw-body');
    if (!body) return;
    body.innerHTML = '';
    switch (num) {
        case 1:
            body.appendChild(_buildStepIdentity());
            break;
        case 2:
            body.appendChild(_buildStepScope());
            break;
        case 3:
            body.appendChild(_buildStepPricing());
            break;
        case 4:
            body.appendChild(_buildStepGovernance());
            break;
        case 5:
            body.appendChild(_buildStepReview());
            break;
    }
}
// ---------------------------------------------------------------------------
// Step 1: Identity
// ---------------------------------------------------------------------------
function _buildStepIdentity() {
    const container = document.createElement('div');
    container.className = 'wizard-form';
    container.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
    container.innerHTML = `
    <div class="form-group">
      <label class="form-label">${t('wizardProductName') || 'Nome do Servico'} *</label>
      <input class="form-input" id="pw-name" type="text" value="${_esc(_product?.name || '')}"
        placeholder="${t('wizardNamePlaceholder') || 'Ex: Consultoria em Monitoramento Ambiental'}"
        maxlength="200"
        data-field-meta="true"
        data-field-meta-key="product:${_esc(_product?.id || 'draft')}:name">
    </div>

    <div class="form-group">
      <label class="form-label">${t('wizardCategory') || 'Categoria'} *</label>
      <select data-field-meta="true" data-field-meta-key="auto:pw-category" class="form-input" id="pw-category">
        <option value="" disabled ${!_product?.category ? 'selected' : ''}>${t('wizardSelectCategory') || 'Selecione uma categoria...'}</option>
        ${CATEGORIES.map((c: any) => `<option value="${c.value}" ${c.value === _product?.category ? 'selected' : ''}>${c.label()}</option>`).join('')}
      </select>
    </div>

    <div class="form-group">
      <label class="form-label">${t('wizardDescription') || 'Descricao'}</label>
      <textarea data-field-meta="true" data-field-meta-key="auto:pw-description" class="form-input" id="pw-description" rows="4"
        placeholder="${t('wizardDescPlaceholder') || 'Descreva o servico oferecido (10-5000 caracteres)'}"
        maxlength="5000">${_esc(_product?.description || '')}</textarea>
    </div>

    <div class="form-group">
      <label class="form-label">${t('wizardShortDesc') || 'Descricao Curta'}</label>
      <input data-field-meta="true" data-field-meta-key="auto:pw-short-desc" class="form-input" id="pw-short-desc" type="text"
        value="${_esc(_product?.short_description || '')}"
        placeholder="${t('wizardShortDescPlaceholder') || 'Resumo em 280 caracteres'}"
        maxlength="280">
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group">
        <label class="form-label">${t('wizardLicense') || 'Licenca'}</label>
        <select data-field-meta="true" data-field-meta-key="auto:pw-license" class="form-input" id="pw-license">
          <option value="proprietary" ${_product?.license_type === 'proprietary' ? 'selected' : ''}>Proprietaria</option>
          <option value="mit" ${_product?.license_type === 'mit' ? 'selected' : ''}>MIT</option>
          <option value="mpl-2.0" ${_product?.license_type === 'mpl-2.0' ? 'selected' : ''}>MPL 2.0</option>
          <option value="apache-2.0" ${_product?.license_type === 'apache-2.0' ? 'selected' : ''}>Apache 2.0</option>
          <option value="agpl-3.0" ${_product?.license_type === 'agpl-3.0' ? 'selected' : ''}>AGPL 3.0</option>
          <option value="custom" ${_product?.license_type === 'custom' ? 'selected' : ''}>Custom</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">${t('wizardVisibility') || 'Visibilidade'}</label>
        <select data-field-meta="true" data-field-meta-key="auto:pw-visibility" class="form-input" id="pw-visibility">
          <option value="private" ${_product?.visibility === 'private' ? 'selected' : ''}>Privado</option>
          <option value="unlisted" ${_product?.visibility === 'unlisted' ? 'selected' : ''}>Nao-listado</option>
          <option value="public" ${_product?.visibility === 'public' ? 'selected' : ''}>Publico</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" style="display:flex;align-items:center;gap:8px;">
        <input data-field-meta="true" data-field-meta-key="auto:pw-ai-enabled" type="checkbox" id="pw-ai-enabled" ${_product?.ai_enabled ? 'checked' : ''}>
        ${t('wizardAiEnabled') || 'Este servico utiliza IA/ML'}
      </label>
      <span style="font-size:11px;color:var(--neutral-500);">
        ${t('wizardAiEnabledHint') || 'Ativa o passo de Governanca IA e exige perfil de governanca para publicacao.'}
      </span>
    </div>
  `;
    // Toggle governance tab visibility when AI checkbox changes
    const aiCheckbox = (container.querySelector('#pw-ai-enabled')) as HTMLInputElement|null;
    aiCheckbox?.addEventListener('change', () => {
        const govTab = (document.querySelector('#pw-tabs [data-step="4"]')) as HTMLElement|null;
        if (govTab) govTab.style.display = aiCheckbox.checked ? '' : 'none';
    });
    return container;
}
// ---------------------------------------------------------------------------
// Step 2: Scope
// ---------------------------------------------------------------------------
function _buildStepScope() {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
    // Add button
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:8px;align-items:center;';
    toolbar.innerHTML = `
    <button class="btn btn-primary" id="pw-add-scope" style="font-size:12px;">
      &#10010; ${t('wizardAddDeliverable') || 'Adicionar Entrega'}
    </button>
    <button class="btn btn-secondary" id="pw-add-milestone" style="font-size:12px;">
      &#10010; ${t('wizardAddMilestone') || 'Adicionar Marco'}
    </button>
    <button class="btn btn-secondary" id="pw-add-exclusion" style="font-size:12px;">
      &#10010; ${t('wizardAddExclusion') || 'Adicionar Exclusao'}
    </button>
  `;
    container.appendChild(toolbar);
    // Scope items list
    const list = document.createElement('div');
    list.id = 'pw-scope-list';
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    if (_scopeItems.length === 0) {
        list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--neutral-400);font-size:13px;">
      ${t('wizardNoScope') || 'Nenhum item de escopo. Adicione entregas, marcos ou exclusoes.'}
    </div>`;
    } else {
        _scopeItems
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
            .forEach((item: any) => list.appendChild(_buildScopeCard(item)));
    }
    container.appendChild(list);
    // Bind add buttons
    setTimeout(() => {
        document.getElementById('pw-add-scope')?.addEventListener('click', () => _addScopeItem('deliverable'));
        document.getElementById('pw-add-milestone')?.addEventListener('click', () => _addScopeItem('milestone'));
        document.getElementById('pw-add-exclusion')?.addEventListener('click', () => _addScopeItem('exclusion'));
    }, 0);
    return container;
}
/** @param {any} item */
function _buildScopeCard(item: any) {
    const card = document.createElement('div');
    card.style.cssText =
        'padding:10px 12px;border:1px solid var(--neutral-200);border-radius:var(--radius-sm);background:var(--neutral-50);';
    card.dataset.scopeId = item.id;
    /** @type {Record<string, string>} */
    const typeColors = {
        deliverable: 'var(--primary)',
        milestone: '#f59e0b',
        exclusion: '#ef4444',
    };
    /** @type {Record<string, string>} */
    const typeLabels = {
        deliverable: t('scopeDeliverable') || 'Entrega',
        milestone: t('scopeMilestone') || 'Marco',
        exclusion: t('scopeExclusion') || 'Exclusao',
    };
    card.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <span style="font-size:11px;padding:2px 6px;border-radius:3px;background:${(typeColors as Record<string, any>)[item.node_type] || 'var(--neutral-300)'};color:white;font-weight:500;">
        ${item.code} ${(typeLabels as Record<string, any>)[item.node_type] || item.node_type}
      </span>
      <span style="flex:1;font-size:13px;font-weight:500;">${_esc(item.name)}</span>
      <button class="btn btn-danger" style="font-size:11px;padding:2px 8px;" data-delete-scope="${item.id}">
        &#10005;
      </button>
    </div>
    ${item.description ? `<div style="font-size:12px;color:var(--neutral-600);margin-bottom:4px;">${_esc(item.description)}</div>` : ''}
    ${item.effort_hours ? `<span style="font-size:11px;color:var(--neutral-500);">${item.effort_hours}h</span>` : ''}
    ${
        item.node_type === 'deliverable' && item.acceptance_criteria
            ? `<div style="font-size:11px;color:var(--neutral-500);margin-top:4px;">&#9679; ${_esc(item.acceptance_criteria)}</div>`
            : ''
    }
  `;
    card.querySelector(`[data-delete-scope="${item.id}"]`)?.addEventListener('click', () => _deleteScopeItem(item.id));
    return card;
}
/** @param {string} nodeType */
async function _addScopeItem(nodeType: any) {
    const { asyncPrompt } = await import('./asyncDialogs.js' as string);
    const name = await asyncPrompt(t('wizardScopeItemName') || 'Nome do item:', '', {
        placeholder: t('wizardScopeNamePlaceholder') || 'Ex: Relatorio de Monitoramento',
        confirmLabel: 'OK',
    });
    if (!name) return;
    let acceptanceCriteria = null;
    if (nodeType === 'deliverable') {
        acceptanceCriteria = await asyncPrompt(
            t('wizardAcceptanceCriteria') || 'Criterio de aceite (min 10 caracteres):',
            '',
            {
                placeholder:
                    t('wizardAcceptancePlaceholder') || 'Ex: Relatorio aprovado pelo cliente conforme modelo padrao',
                confirmLabel: 'OK',
            },
        );
        if (!acceptanceCriteria || acceptanceCriteria.length < 10) {
            const { showToast } = await import('./toast.js' as string);
            showToast(
                t('wizardAcceptanceTooShort') || 'Criterio de aceite deve ter no minimo 10 caracteres',
                'warning',
            );
            return;
        }
    }
    try {
        const item = await _apiCall(`${_product.id}/scope`, 'POST', {
            name,
            node_type: nodeType,
            acceptance_criteria: acceptanceCriteria,
        });
        _scopeItems.push(item);
        _renderStep(2);
    } catch (err: any) {
        console.error('[ecbyts] Failed to add scope item:', err);
        const { showToast } = await import('./toast.js' as string);
        showToast(/** @type {any} */ (err).message, 'error');
    }
}
/** @param {string} itemId */
async function _deleteScopeItem(itemId: any) {
    const { asyncConfirm } = await import('./asyncDialogs.js' as string);
    const confirmed = await asyncConfirm(t('wizardDeleteScopeConfirm') || 'Remover este item de escopo?', {
        confirmLabel: t('delete') || 'Remover',
        danger: true,
    });
    if (!confirmed) return;
    try {
        await _apiCall(`${_product.id}/scope/${itemId}`, 'DELETE');
        _scopeItems = _scopeItems.filter((i: any) => i.id !== itemId);
        _renderStep(2);
    } catch (err: any) {
        console.error('[ecbyts] Failed to delete scope item:', err);
    }
}
// ---------------------------------------------------------------------------
// Step 3: Pricing
// ---------------------------------------------------------------------------
function _buildStepPricing() {
    const container = document.createElement('div');
    container.className = 'wizard-form';
    container.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
    const p = _pricing || {};
    container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group">
        <label class="form-label">${t('wizardPricingType') || 'Tipo de Precificacao'} *</label>
        <select data-field-meta="true" data-field-meta-key="auto:pw-pricing-type" class="form-input" id="pw-pricing-type">
          <option value="fixed" ${p.pricing_type === 'fixed' ? 'selected' : ''}>${t('pricingFixed') || 'Preco Fixo'}</option>
          <option value="hourly" ${p.pricing_type === 'hourly' ? 'selected' : ''}>${t('pricingHourly') || 'Por Hora'}</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">${t('wizardBaseValue') || 'Valor Base (BRL)'} *</label>
        <input class="form-input" id="pw-base-value" type="number" min="0.01" step="0.01"
          value="${p.base_value || ''}" placeholder="0.00"
          data-field-meta="true"
          data-field-meta-key="product:${_esc(_product?.id || 'draft')}:base_value">
      </div>
    </div>

    <div id="pw-hourly-fields" style="display:${p.pricing_type === 'hourly' ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:12px;">
      <div class="form-group">
        <label class="form-label">${t('wizardEstimatedHours') || 'Horas Estimadas'}</label>
        <input data-field-meta="true" data-field-meta-key="auto:pw-est-hours" class="form-input" id="pw-est-hours" type="number" min="0.5" step="0.5"
          value="${p.estimated_hours || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('wizardHourlyRate') || 'Valor/Hora (BRL)'}</label>
        <input data-field-meta="true" data-field-meta-key="auto:pw-hourly-rate" class="form-input" id="pw-hourly-rate" type="number" min="0.01" step="0.01"
          value="${p.hourly_rate || ''}">
      </div>
    </div>

    <fieldset style="border:1px solid var(--neutral-200);border-radius:var(--radius-sm);padding:12px;">
      <legend style="font-size:13px;font-weight:500;padding:0 6px;">${t('wizardIpScenarios') || 'Cenarios de PI'}</legend>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label class="form-label">${t('wizardScenarioA') || 'Cenario A: PI com Contratante'}</label>
          <label class="form-label" style="font-weight:normal;font-size:11px;color:var(--neutral-500);">${t('wizardMultiplier') || 'Multiplicador'} (min 1.00)</label>
          <input data-field-meta="true" data-field-meta-key="auto:pw-ip-a" class="form-input" id="pw-ip-a" type="number" min="1.0" step="0.01"
            value="${p.ip_scenario_a_multiplier || 1.0}">
        </div>
        <div class="form-group">
          <label class="form-label">${t('wizardScenarioB') || 'Cenario B: PI com Contratada'}</label>
          <label class="form-label" style="font-weight:normal;font-size:11px;color:var(--neutral-500);">${t('wizardMultiplier') || 'Multiplicador'} (0.80 - 1.00)</label>
          <input data-field-meta="true" data-field-meta-key="auto:pw-ip-b" class="form-input" id="pw-ip-b" type="number" min="0.80" max="1.00" step="0.01"
            value="${p.ip_scenario_b_multiplier || 1.0}">
        </div>
      </div>
    </fieldset>

    <fieldset style="border:1px solid var(--neutral-200);border-radius:var(--radius-sm);padding:12px;">
      <legend style="font-size:13px;font-weight:500;padding:0 6px;">${t('wizardLegalLimits') || 'Termos Financeiros'}</legend>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        <div class="form-group">
          <label class="form-label">${t('wizardLateFee') || 'Multa Moratoria %'}</label>
          <input data-field-meta="true" data-field-meta-key="auto:pw-late-fee" class="form-input" id="pw-late-fee" type="number" min="0" max="2.00" step="0.01"
            value="${p.late_fee_pct ?? 2.0}">
          <span style="font-size:10px;color:var(--neutral-500);">Max 2% (CDC Art. 52)</span>
        </div>
        <div class="form-group">
          <label class="form-label">${t('wizardLateInterest') || 'Juros Mora %/mes'}</label>
          <input data-field-meta="true" data-field-meta-key="auto:pw-late-interest" class="form-input" id="pw-late-interest" type="number" min="0" max="1.00" step="0.01"
            value="${p.late_interest_monthly_pct ?? 1.0}">
          <span style="font-size:10px;color:var(--neutral-500);">Max 1% (CC Art. 406)</span>
        </div>
        <div class="form-group">
          <label class="form-label">${t('wizardWarrantyDays') || 'Garantia (dias)'}</label>
          <input data-field-meta="true" data-field-meta-key="auto:pw-warranty" class="form-input" id="pw-warranty" type="number" min="0" max="365"
            value="${p.warranty_days ?? 90}">
        </div>
      </div>
    </fieldset>
  `;
    // Toggle hourly fields
    setTimeout(() => {
        const typeSelect = (document.getElementById('pw-pricing-type')) as HTMLSelectElement|null;
        typeSelect?.addEventListener('change', () => {
            const hourlyFields = document.getElementById('pw-hourly-fields');
            if (hourlyFields) hourlyFields.style.display = typeSelect.value === 'hourly' ? 'grid' : 'none';
        });
    }, 0);
    return container;
}
// ---------------------------------------------------------------------------
// Step 4: AI Governance
// ---------------------------------------------------------------------------
function _buildStepGovernance() {
    const container = document.createElement('div');
    container.className = 'wizard-form';
    container.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
    if (!_product?.ai_enabled) {
        container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--neutral-400);">
      ${t('wizardGovernanceDisabled') || 'Governanca IA nao aplicavel. Este produto nao utiliza IA.'}
    </div>`;
        return container;
    }
    const g = _governance || {};
    const dimensions = [
        {
            key: 'dim_autonomy',
            label: t('govAutonomy') || 'Autonomia',
            options: ['Sugestiva', 'Semi-autonoma', 'Autonoma'],
        },
        {
            key: 'dim_data_sensitivity',
            label: t('govDataSensitivity') || 'Sensibilidade Dados',
            options: ['Sem dados pessoais', 'Dados pessoais', 'Dados sensiveis (LGPD Art.11)'],
        },
        {
            key: 'dim_integrations',
            label: t('govIntegrations') || 'Integracoes',
            options: ['<=1 sistema (leitura)', '2-3 sistemas', '>3 sistemas ou escrita'],
        },
        {
            key: 'dim_users',
            label: t('govUsers') || 'Usuarios',
            options: ['Interno/equipe', 'Departamento', 'Externo/publico'],
        },
        {
            key: 'dim_decision_impact',
            label: t('govDecisionImpact') || 'Impacto Decisao',
            options: ['Informacional', 'Operacional', 'Estrategico/regulatorio'],
        },
        {
            key: 'dim_reversibility',
            label: t('govReversibility') || 'Reversibilidade',
            options: ['Totalmente reversivel', 'Parcialmente reversivel', 'Irreversivel'],
        },
    ];
    // Compute score
    const score = dimensions.reduce((sum: any, d: any) => sum + (g[d.key] || 1), 0);
    const tier = score <= 9 ? 1 : score <= 14 ? 2 : 3;
    const tierLabels = ['', 'PoC (Tier 1)', 'Padrao (Tier 2)', 'Critico (Tier 3)'];
    const tierColors = ['', '#22c55e', '#f59e0b', '#ef4444'];
    container.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:10px;background:var(--neutral-100);border-radius:var(--radius-sm);">
      <span style="font-size:13px;font-weight:500;">${t('govTier') || 'Tier de Governanca'}:</span>
      <span id="pw-gov-tier" style="font-size:14px;font-weight:600;color:${tierColors[tier]};">${tierLabels[tier]}</span>
      <span style="font-size:12px;color:var(--neutral-500);">(Score: <span id="pw-gov-score">${score}</span>/18)</span>
    </div>

    ${dimensions
        .map((d: any) => `
      <div class="form-group">
        <label class="form-label">${d.label}</label>
        <select data-field-meta="true" data-field-meta-key="auto-pos:productWizard:select:L1088" class="form-input pw-gov-dim" data-dim="${d.key}">
          ${d.options.map((opt: any, i: any) => `<option value="${i + 1}" ${(g[d.key] || 1) === i + 1 ? 'selected' : ''}>${i + 1} &#8212; ${opt}</option>`).join('')}
        </select>
      </div>
    `,
        )
        .join('')}
  `;
    // Live tier recalculation
    setTimeout(() => {
        document.querySelectorAll('.pw-gov-dim').forEach((sel: any) => {
            sel.addEventListener('change', () => {
                let s = 0;
                document.querySelectorAll('.pw-gov-dim').forEach((el: any) => {
                    s += Number(/** @type {HTMLInputElement} */ (el).value);
                });
                const t2 = s <= 9 ? 1 : s <= 14 ? 2 : 3;
                const scoreEl = document.getElementById('pw-gov-score');
                const tierEl = document.getElementById('pw-gov-tier');
                if (scoreEl) scoreEl.textContent = String(s);
                if (tierEl) {
                    tierEl.textContent = (tierLabels as Record<string, any>)[t2];
                    tierEl.style.color = (tierColors as Record<string, any>)[t2];
                }
            });
        });
    }, 0);
    return container;
}
// ---------------------------------------------------------------------------
// Step 5: Review
// ---------------------------------------------------------------------------
function _buildStepReview() {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
    const deliverables = _scopeItems.filter((i: any) => i.node_type === 'deliverable');
    const totalEffort = _scopeItems.reduce((s: any, i: any) => s + (Number(i.effort_hours) || 0), 0);
    container.innerHTML = `
    <h3 style="font-size:15px;margin:0;">${t('wizardReviewTitle') || 'Resumo do Produto'}</h3>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="padding:12px;background:var(--neutral-50);border-radius:var(--radius-sm);border:1px solid var(--neutral-200);">
        <div style="font-size:11px;color:var(--neutral-500);text-transform:uppercase;">${t('wizardProductName') || 'Nome'}</div>
        <div style="font-size:14px;font-weight:500;margin-top:4px;">${_esc(_product?.name || '—')}</div>
      </div>
      <div style="padding:12px;background:var(--neutral-50);border-radius:var(--radius-sm);border:1px solid var(--neutral-200);">
        <div style="font-size:11px;color:var(--neutral-500);text-transform:uppercase;">${t('wizardCategory') || 'Categoria'}</div>
        <div style="font-size:14px;font-weight:500;margin-top:4px;">${_esc(_product?.category || '—')}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
      <div style="padding:12px;background:var(--neutral-50);border-radius:var(--radius-sm);border:1px solid var(--neutral-200);">
        <div style="font-size:11px;color:var(--neutral-500);text-transform:uppercase;">${t('wizardDeliverables') || 'Entregas'}</div>
        <div style="font-size:18px;font-weight:600;margin-top:4px;">${deliverables.length}</div>
      </div>
      <div style="padding:12px;background:var(--neutral-50);border-radius:var(--radius-sm);border:1px solid var(--neutral-200);">
        <div style="font-size:11px;color:var(--neutral-500);text-transform:uppercase;">${t('wizardTotalEffort') || 'Esforco Total'}</div>
        <div style="font-size:18px;font-weight:600;margin-top:4px;">${totalEffort}h</div>
      </div>
      <div style="padding:12px;background:var(--neutral-50);border-radius:var(--radius-sm);border:1px solid var(--neutral-200);">
        <div style="font-size:11px;color:var(--neutral-500);text-transform:uppercase;">${t('wizardBaseValue') || 'Valor Base'}</div>
        <div style="font-size:18px;font-weight:600;margin-top:4px;">R$ ${Number(_pricing?.base_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
      </div>
    </div>

    ${
        _product?.ai_enabled
            ? `
    <div style="padding:12px;background:var(--neutral-50);border-radius:var(--radius-sm);border:1px solid var(--neutral-200);">
      <div style="font-size:11px;color:var(--neutral-500);text-transform:uppercase;">${t('govTier') || 'Governanca IA'}</div>
      <div style="font-size:14px;font-weight:500;margin-top:4px;">
        Tier ${_governance ? (_governance.computed_score <= 9 ? '1 (PoC)' : _governance.computed_score <= 14 ? '2 (Padrao)' : '3 (Critico)') : '—'}
      </div>
    </div>
    `
            : ''
    }

    <div style="padding:12px;background:var(--neutral-50);border-radius:var(--radius-sm);border:1px solid var(--neutral-200);">
      <div style="font-size:11px;color:var(--neutral-500);text-transform:uppercase;">${t('wizardStatus') || 'Status'}</div>
      <div style="font-size:14px;font-weight:500;margin-top:4px;">${_product?.status === 'published' ? '&#9679; Publicado' : '&#9679; Rascunho'}</div>
    </div>

    <div style="padding:12px;background:var(--neutral-50);border-radius:var(--radius-sm);border:1px solid var(--neutral-200);">
      <div style="font-size:11px;color:var(--neutral-500);text-transform:uppercase;margin-bottom:8px;">${t('wizardDocument') || 'Documento de Escopo e Termos'}</div>
      <button class="btn btn-secondary" id="pw-generate-doc" style="font-size:12px;">
        &#9654; ${t('wizardGenerateDoc') || 'Gerar e Baixar .docx'}
      </button>
      <span id="pw-doc-status" style="margin-left:8px;font-size:12px;color:var(--neutral-500);"></span>
    </div>

    <div id="pw-validation-errors" style="display:none;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:var(--radius-sm);color:#991b1b;font-size:12px;"></div>
  `;
    // Bind generate document button
    setTimeout(() => {
        document.getElementById('pw-generate-doc')?.addEventListener('click', _handleGenerateDocument);
    }, 0);
    return container;
}
// ---------------------------------------------------------------------------
// Data persistence
// ---------------------------------------------------------------------------
async function _saveCurrentStepData() {
    if (!_product?.id) return;
    try {
        switch (_currentStep) {
            case 1:
                await _saveIdentity();
                break;
            case 3:
                await _savePricing();
                break;
            case 4:
                await _saveGovernance();
                break;
        }
    } catch (err: any) {
        console.error('[ecbyts] Failed to save step data:', err);
    }
}
async function _saveIdentity() {
    const name = ((document.getElementById('pw-name')) as any)?.value?.trim() as HTMLInputElement|null;
    const category = ((document.getElementById('pw-category')) as any)?.value;
    const description = ((document.getElementById("pw-description")) as any)?.value?.trim();
    const shortDesc = ((document.getElementById('pw-short-desc')) as any)?.value?.trim() as HTMLInputElement|null;
    const license = ((document.getElementById('pw-license')) as any)?.value;
    const visibility = /** @type {HTMLSelectElement|null} */ ((document.getElementById('pw-visibility')) as any)?.value;
    const aiEnabled = /** @type {HTMLInputElement|null} */ ((document.getElementById('pw-ai-enabled')) as any)?.checked;
    const updates: any = {};
    if (name && name !== _product.name) updates.name = name;
    if (category !== _product.category) updates.category = category;
    if (description !== (_product.description || '')) updates.description = description || null;
    if (shortDesc !== (_product.short_description || '')) updates.short_description = shortDesc || null;
    if (license !== _product.license_type) updates.license_type = license;
    if (visibility !== _product.visibility) updates.visibility = visibility;
    if (aiEnabled !== _product.ai_enabled) updates.ai_enabled = aiEnabled;
    if (Object.keys(updates).length > 0) {
        const result = await _apiCall(_product.id, 'PATCH', updates) as HTMLSelectElement|null;
        Object.assign(_product, result);
    }
}
async function _savePricing() {
    const $ = (id: any): any => document.getElementById(id);
    const pricingType = $('pw-pricing-type')?.value;
    const baseValue = $('pw-base-value')?.value;
    const estHours = $('pw-est-hours')?.value;
    const hourlyRate = $('pw-hourly-rate')?.value;
    const ipA = $('pw-ip-a')?.value;
    const ipB = $('pw-ip-b')?.value;
    const lateFee = $('pw-late-fee')?.value;
    const lateInterest = $('pw-late-interest')?.value;
    const warranty = $('pw-warranty')?.value;
    const updates: any = {};
    if (pricingType) updates.pricing_type = pricingType;
    if (baseValue) updates.base_value = Number(baseValue);
    if (estHours) updates.estimated_hours = Number(estHours);
    if (hourlyRate) updates.hourly_rate = Number(hourlyRate);
    if (ipA) updates.ip_scenario_a_multiplier = Number(ipA);
    if (ipB) updates.ip_scenario_b_multiplier = Number(ipB);
    if (lateFee !== undefined) updates.late_fee_pct = Number(lateFee);
    if (lateInterest !== undefined) updates.late_interest_monthly_pct = Number(lateInterest);
    if (warranty !== undefined) updates.warranty_days = Number(warranty);
    if (Object.keys(updates).length > 0) {
        const result = await _apiCall(`${_product.id}/pricing`, 'PATCH', updates);
        _pricing = result;
    }
}
async function _saveGovernance() {
    if (!_product?.ai_enabled || !_governance) return;
    const updates: any = {};
    document.querySelectorAll('.pw-gov-dim').forEach((sel: any) => {
        const el = (sel) as HTMLSelectElement;
        const dim = el.dataset.dim || '';
        const val = Number(el.value);
        if (val && val !== _governance[dim]) updates[dim] = val;
    });
    if (Object.keys(updates).length > 0) {
        const result = await _apiCall(`${_product.id}/governance`, 'PATCH', updates);
        _governance = result;
    }
}
// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
/** @param {Blob} blob @param {string} filename */
async function _registerGeneratedDoc(blob: any, filename: any) {
    if (!blob || !filename) return;
    try {
        const { register } = await import('../files/fileManager.js' as string);
        const { getModelIdSync } = await import('../../core/io/modelLink.js' as string);
        const docxFile = new File([blob], filename, {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        const result = await register(docxFile, {
            source: 'automation',
            scopeType: 'model',
            modelId: getModelIdSync() || undefined,
            tags: ['product-wizard', 'scope-terms', 'docx'],
        });
        if (result.ok) {
            try {
                const { renderFilesPanel } = await import('../files/filePanel.js' as string);
                renderFilesPanel();
            } catch (e: any) {
                console.debug('[productWizard] renderFilesPanel:', /** @type {any} */ (e)?.message || e);
                /* panel refresh is non-critical */
            }
        } else {
            console.warn('[ecbyts] File registration failed:', result.code, result.error);
        }
    } catch (err: any) {
        console.warn('[ecbyts] File registration skipped:', /** @type {any} */ (err).message);
    }
}
async function _handleGenerateDocument() {
    const statusEl = document.getElementById('pw-doc-status');
    const btn = (document.getElementById('pw-generate-doc')) as HTMLButtonElement|null;
    if (statusEl) statusEl.textContent = t('wizardGenerating') || 'Gerando...';
    if (btn) btn.disabled = true;
    try {
        await _saveCurrentStepData();
        // Gerar hash + metadados ECO1 do modelo atual para Anexo (sem chave completa)
        let eco1Meta = null;
        try {
            const { generateKeySimple } = await import('../../core/io/export.js' as string);
            const key = await generateKeySimple();
            if (key) {
                // Hash SHA-256 da chave
                const encoder = new TextEncoder();
                const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(key));
                const hashHex = Array.from(new Uint8Array(hashBuf))
                    .map((b: any) => b.toString(16).padStart(2, '0'))
                    .join('');
                // Metadados do modelo
                const { getModelIdSync } = await import('../../core/io/modelLink.js' as string);
                const { countByFamily, getElementCount } = await import('../../core/elements/manager.js' as string);
                const { getAllCampaigns } = await import('../../core/campaigns/manager.js' as string);
                const { getAllScenes } = await import('../scenes/manager.js' as string);
                const familyCounts = countByFamily ? countByFamily() : {};
                const familySummary =
                    Object.entries(familyCounts)
                        .filter(([, v]: any) => (v as any) > 0)
                        .map(([k, v]: any) => `${v} ${k}`)
                        .join(', ') || '—';
                eco1Meta = {
                    hash: hashHex,
                    modelId: getModelIdSync ? getModelIdSync() : '—',
                    elementCount: getElementCount ? getElementCount() : 0,
                    familySummary,
                    campaignCount: getAllCampaigns ? getAllCampaigns().length : 0,
                    sceneCount: getAllScenes ? getAllScenes().length : 0,
                    exportedAt: new Date().toISOString(),
                };
            }
        } catch (err: any) {
            console.warn('[ecbyts] ECO1 metadata generation skipped:', /** @type {any} */ (err).message);
        }
        const { downloadProductDocument } = await import('./productDocGenerator.js' as string);
        const docResult = await downloadProductDocument(
            _product,
            _pricing,
            _scopeItems,
            _governance,
            _clauses,
            eco1Meta,
        );
        // Metering: document generation tracked via eco1_exports when exported (fire-and-forget)
        // Register in Files module (fire-and-forget - DA-4: toast on auth failure)
        _registerGeneratedDoc(docResult?.blob, docResult?.filename);
        if (statusEl) {
            statusEl.textContent = docResult?.hadInvalidChars
                ? t('wizardDocGeneratedSanitized') ||
                  'Documento gerado com sucesso. Caracteres invalidos foram removidos automaticamente.'
                : t('wizardDocGenerated') || 'Documento gerado com sucesso';
        }
        if (statusEl) statusEl.style.color = 'var(--success)';
    } catch (err: any) {
        console.error('[ecbyts] Document generation failed:', err);
        if (statusEl) statusEl.textContent = /** @type {any} */ (err).message;
        if (statusEl) statusEl.style.color = 'var(--error)';
    } finally {
        if (btn) btn.disabled = false;
    }
}
async function _handleSaveDraft() {
    await _saveCurrentStepData();
    // REF-SWEEPS RF-2: _handleSaveDraft e registrado via addEventListener no botao
    // "Salvar Rascunho" -> roda fire-and-forget; o import() cru virava
    // 'Uncaught (in promise)'. O toast e COSMETICO: se o chunk cair seguimos o fluxo
    // (fechar wizard + callback de conclusao) e degradamos para console — abortar
    // aqui perderia o fechamento do wizard, pior que perder a notificacao.
    const _toast = await lazyImport('./toast.js', { importer: () => import('./toast.js' as string) });
    const _msg = t('wizardDraftSaved') || 'Rascunho salvo';
    if (_toast) _toast.showToast(_msg, 'success');
    else console.info('[productWizard]', _msg);
    closeProductWizard();
    if (_onComplete) _onComplete(_product);
}
async function _handlePublish() {
    await _saveCurrentStepData();
    try {
        const result = await _apiCall(`${_product.id}/publish`, 'POST');
        if (result.errors) {
            // Show validation errors
            const errDiv = document.getElementById('pw-validation-errors');
            if (errDiv) {
                errDiv.style.display = 'block';
                errDiv.innerHTML = `<strong>${t('wizardValidationFailed') || 'Validacao falhou'}:</strong><ul style="margin:6px 0 0 16px;">
          ${result.errors.map((e: any) => `<li>${_esc(e.message)}</li>`).join('')}
        </ul>`;
            }
            return;
        }
        Object.assign(_product, result);
        // Metering: product publish tracked via elements count (fire-and-forget)
        const { showToast } = await import('./toast.js' as string);
        showToast(t('wizardPublished') || 'Produto publicado com sucesso', 'success');
        closeProductWizard();
        if (_onComplete) _onComplete(_product);
    } catch (err: any) {
        console.error('[ecbyts] Publish failed:', err);
        // Este import() esta no bloco CATCH — o try acima nao o cobre, entao ele
        // vazava 'Uncaught (in promise)' e ainda MASCARAVA o erro de publish original.
        const _toast = await lazyImport('./toast.js', { importer: () => import('./toast.js' as string) });
        if (_toast) _toast.showToast(/** @type {any} */ (err).message, 'error');
    }
}
// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
/** @param {any} str */
function _esc(str: any) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
