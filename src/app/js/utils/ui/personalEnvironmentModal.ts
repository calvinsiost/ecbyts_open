// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PERSONAL ENVIRONMENT MODAL — SPEC_PERSONAL_ENVIRONMENT_IDENTITY

   Modal "Meu Ambiente" com dados pessoais do usuario.
   - Lazy load: so busca user_personal_data quando abre
   - Validacao CPF/CNPJ, mascara telefone/CEP
   - Autopreenchimento ViaCEP com fallback manual
   - Nunca persiste numero completo de cartao
   ================================================================ */

import * as _sessionMod from '../auth/session.js';
const getCurrentUser = (_sessionMod as any).getCurrentUser;
const getAccessToken = (_sessionMod as any).getAccessToken;
const getSupabaseClient = (_sessionMod as any).getSupabaseClient;
import { showToast } from './toast.js';
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import {
    isValidCPF,
    isValidCNPJ,
    formatCPF,
    formatCNPJ,
    formatCEP,
    formatPhoneBR,
    maskCardNumber,
    // eslint-disable-next-line
    validateAddress,
    extractInitials,
} from '../../core/identity/personalDataValidator.js';
import { CONFIG } from '../../config.js';

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

/** @type {any} */ let _escHandler: any = null;
/** @type {any} */ let _data: any = null; // cached personal data
/** @type {any} */ let _payment: any = null; // cached payment method
let _sensitiveVisible = true;
/** @type {any} */ let _supabase: any = null;

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

export async function openPersonalEnvironmentModal() {
    if (!CONFIG.FEATURES?.PERSONAL_ENVIRONMENT_CARD) return;

    if (!document.getElementById('personal-environment-modal')) {
        _injectModal();
    }

    const modal = (document.getElementById('personal-environment-modal') as any);
    modal.style.display = 'flex';

    _sensitiveVisible = true;
    _updateSensitiveToggle();
    _renderLoading();

    await _loadData();
    _renderData();

    if (_escHandler) document.removeEventListener('keydown', _escHandler);
    _escHandler = (/** @type {any} */ e: any) => {
        if (e.key === 'Escape') closePersonalEnvironmentModal();
    };
    document.addEventListener('keydown', _escHandler);
}

export function closePersonalEnvironmentModal() {
    const modal = (document.getElementById('personal-environment-modal') as any);
    if (modal) {
        modal.style.display = 'none';
    }
    if (_escHandler) {
        document.removeEventListener('keydown', _escHandler);
        _escHandler = null;
    }
}

// ----------------------------------------------------------------
// DATA LOADING
// ----------------------------------------------------------------

async function _ensureSupabase() {
    if (!_supabase) {
        _supabase = getSupabaseClient();
    }
    return _supabase;
}

async function _loadData() {
    const user = getCurrentUser();
    if (!user) {
        _data = null;
        _payment = null;
        return;
    }

    try {
        const sb = await _ensureSupabase();

        // Load personal data - OPT-1: explicit columns matching seed fallback shape
        const { data, error } = await sb
            .schema('api')
            .from('user_personal_data')
            .select(
                'id, full_name, address_line_1, address_line_2, city, state, zip_code, country, tax_id, phone, updated_at',
            )
            .eq('id', user.id)
            // 406-safe: usuario logado SEM dados pessoais preenchidos e estado NORMAL,
            // nao erro. .single() manda Accept: application/vnd.pgrst.object+json e o
            // PostgREST responde 406 quando ha 0 linhas — poluindo console e
            // error-ingest toda vez que o modal abre. .maybeSingle() manda application/json
            // no GET, entao 0 linhas volta 200 [] e o client resolve data=null.
            .maybeSingle();

        // Com maybeSingle, 0 linhas nao gera erro. O guard PGRST116 fica como defesa
        // para o caso >1 linha (impossivel hoje: id e PK) e p/ nao regredir se a
        // query virar filtro nao-unico.
        if (error && error.code !== 'PGRST116') {
            console.debug('[personalEnv] load error:', error?.message || error);
        }

        if (data) {
            _data = data;
        } else {
            // Seed from user metadata if empty
            _data = {
                id: user.id,
                full_name: user.displayName || '',
                address_line_1: '',
                address_line_2: '',
                city: '',
                state: '',
                zip_code: '',
                country: 'BR',
                tax_id: '',
                phone: '',
            };
        }
    } catch (e: any) {
        console.debug('[personalEnv] supabase load failed:', (e as any)?.message || e);
        _data = null;
    }

    // Load payment method from Edge Function
    try {
        const token = getAccessToken();
        if (token) {
            const baseUrl = (CONFIG as any).SUPABASE_URL || '';
            const resp = await fetch(`${baseUrl}/functions/v1/billing/payment-method`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (resp.ok) {
                const json = await resp.json();
                _payment = json.paymentMethod || null;
            } else {
                _payment = null;
            }
        }
    } catch (e: any) {
        console.debug('[personalEnv] payment load failed:', (e as any)?.message || e);
        _payment = null;
    }
}

// ----------------------------------------------------------------
// RENDER
// ----------------------------------------------------------------

function _renderLoading() {
    const body = (document.getElementById('pe-modal-body') as any);
    if (body) body.innerHTML = `<div class="pe-loading">${escapeHtml(t('loading') || 'Loading...')}</div>`;
}

function _renderData() {
    const user = getCurrentUser();
    const body = (document.getElementById('pe-modal-body') as any);
    if (!body) return;

    if (!user) {
        body.innerHTML = `<div class="pe-empty">${escapeHtml(t('loginRequired') || 'Login required.')}</div>`;
        return;
    }

    const d = _data || {};
    const initials = extractInitials(d.full_name || user.displayName || '');
    const name = escapeHtml(d.full_name || user.displayName || '');
    const email = escapeHtml(user.email || '');

    // eslint-disable-next-line
    const taxIdMasked = _sensitiveVisible ? escapeHtml(_maskTaxId(d.tax_id || '')) : '***.***.***-**';
    // eslint-disable-next-line
    const phoneMasked = _sensitiveVisible ? escapeHtml(formatPhoneBR(d.phone || '')) : '(**) *****-****';

    const addressLine1 = _sensitiveVisible ? escapeHtml(d.address_line_1 || '') : '********';
    const addressLine2 = _sensitiveVisible ? escapeHtml(d.address_line_2 || '') : '';
    const city = _sensitiveVisible ? escapeHtml(d.city || '') : '********';
    const state = _sensitiveVisible ? escapeHtml(d.state || '') : '**';
    const zipCode = _sensitiveVisible ? escapeHtml(formatCEP(d.zip_code || '')) : '*****-***';
    const country = _sensitiveVisible ? escapeHtml(d.country || 'BR') : '**';

    const paymentSection = _renderPaymentSection();

    body.innerHTML = `
        <div class="pe-header">
            <div class="pe-avatar">${escapeHtml(initials)}</div>
            <div class="pe-header-info">
                <div class="pe-name">${name}</div>
                <div class="pe-email">${email}</div>
            </div>
        </div>

        <div class="pe-section">
            <div class="pe-section-title">
                <span data-icon="user" data-icon-size="14px"></span>
                ${escapeHtml(t('personalEnvironment.identityLabel') || 'Identidade')}
            </div>
            <div class="pe-form-grid">
                <label class="pe-field">
                    <span>${escapeHtml(t('personalEnvironment.nameLabel') || 'Nome completo')}</span>
                    <input type="text" id="pe-full-name" value="${name}" data-field-meta="true" data-field-meta-key="auto:pe:full-name">
                </label>
                <label class="pe-field">
                    <span>${escapeHtml(t('personalEnvironment.emailLabel') || 'Email')}</span>
                    <input type="email" id="pe-email" value="${email}" disabled data-field-meta="true" data-field-meta-key="auto:pe:email">
                </label>
                <label class="pe-field">
                    <span>${escapeHtml(t('personalEnvironment.taxIdLabel') || 'CPF/CNPJ')}</span>
                    <input type="text" id="pe-tax-id" value="${d.tax_id || ''}" maxlength="18"
                           placeholder="000.000.000-00"
                           data-field-meta="true" data-field-meta-key="auto:pe:tax-id">
                    <small id="pe-tax-id-error" class="pe-field-error" style="display:none"></small>
                </label>
                <label class="pe-field">
                    <span>${escapeHtml(t('personalEnvironment.phoneLabel') || 'Telefone')}</span>
                    <input type="tel" id="pe-phone" value="${d.phone || ''}" maxlength="15"
                           placeholder="(00) 00000-0000"
                           data-field-meta="true" data-field-meta-key="auto:pe:phone">
                </label>
            </div>
        </div>

        <div class="pe-section">
            <div class="pe-section-title">
                <span data-icon="map-pin" data-icon-size="14px"></span>
                ${escapeHtml(t('personalEnvironment.addressLabel') || 'Endereco')}
            </div>
            <div class="pe-form-grid pe-address-grid">
                <label class="pe-field pe-field-wide">
                    <span>${escapeHtml(t('personalEnvironment.addressLine1') || 'Logradouro')}</span>
                    <input type="text" id="pe-address-1" value="${addressLine1}"
                           data-field-meta="true" data-field-meta-key="auto:pe:address-1">
                </label>
                <label class="pe-field">
                    <span>${escapeHtml(t('personalEnvironment.addressLine2') || 'Numero/Compl.')}</span>
                    <input type="text" id="pe-address-2" value="${addressLine2}"
                           data-field-meta="true" data-field-meta-key="auto:pe:address-2">
                </label>
                <label class="pe-field">
                    <span>${escapeHtml(t('personalEnvironment.city') || 'Cidade')}</span>
                    <input type="text" id="pe-city" value="${city}"
                           data-field-meta="true" data-field-meta-key="auto:pe:city">
                </label>
                <label class="pe-field">
                    <span>${escapeHtml(t('personalEnvironment.state') || 'Estado')}</span>
                    <input type="text" id="pe-state" value="${state}" maxlength="2"
                           data-field-meta="true" data-field-meta-key="auto:pe:state">
                </label>
                <label class="pe-field">
                    <span>${escapeHtml(t('personalEnvironment.zipCode') || 'CEP')}</span>
                    <input type="text" id="pe-zip" value="${_sensitiveVisible ? formatCEP(d.zip_code || '') : zipCode}"
                           maxlength="9" placeholder="00000-000"
                           data-field-meta="true" data-field-meta-key="auto:pe:zip">
                </label>
                <label class="pe-field">
                    <span>${escapeHtml(t('personalEnvironment.country') || 'Pais')}</span>
                    <input type="text" id="pe-country" value="${country}" maxlength="2"
                           data-field-meta="true" data-field-meta-key="auto:pe:country">
                </label>
            </div>
        </div>

        <div class="pe-section">
            <div class="pe-section-title">
                <span data-icon="credit-card" data-icon-size="14px"></span>
                ${escapeHtml(t('personalEnvironment.paymentLabel') || 'Pagamento')}
            </div>
            ${paymentSection}
        </div>

        <div class="pe-banner">
            <span data-icon="shield" data-icon-size="16px"></span>
            <span>${escapeHtml(t('personalEnvironment.securityBanner') || 'Este e o seu ambiente privado. Nunca compartilhe sua senha ou sessao de acesso.')}</span>
        </div>
    `;

    _attachInputHandlers();
    if (typeof (window as any).hydrateIcons === 'function') (window as any).hydrateIcons(body);
}

function _renderPaymentSection() {
    if (!_payment) {
        return `
            <div class="pe-payment-empty">
                <div class="pe-payment-empty-text">
                    ${escapeHtml(t('personalEnvironment.noPaymentMethod') || 'Nenhum metodo de pagamento cadastrado.')}
                </div>
                <button type="button" class="btn btn-sm" id="pe-add-card-btn">
                    ${escapeHtml(t('personalEnvironment.addCardCta') || 'Adicionar cartao')}
                </button>
            </div>
        `;
    }

    const brand = _payment.brand || 'unknown';
    const last4 = _payment.last4 || '****';
    const expMonth = String(_payment.exp_month || '').padStart(2, '0');
    const expYear = _payment.exp_year || '****';
    const cardMask = _sensitiveVisible ? escapeHtml(maskCardNumber(last4)) : '•••• •••• •••• ••••';

    return `
        <div class="pe-payment-card">
            <div class="pe-payment-card-brand">${escapeHtml(brand.toUpperCase())}</div>
            <div class="pe-payment-card-number">${cardMask}</div>
            <div class="pe-payment-card-exp">${escapeHtml(t('personalEnvironment.expires') || 'Expira')} ${expMonth}/${expYear}</div>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" id="pe-manage-stripe-btn">
            ${escapeHtml(t('personalEnvironment.manageStripe') || 'Gerenciar no Stripe')}
        </button>
    `;
}

/**
 * @param {any} taxId
 */
function _maskTaxId(taxId: any) {
    if (!taxId) return '';
    const digits = taxId.replace(/\D/g, '');
    if (digits.length === 11) return formatCPF(digits);
    if (digits.length === 14) return formatCNPJ(digits);
    return taxId;
}

// ----------------------------------------------------------------
// INPUT HANDLERS
// ----------------------------------------------------------------

function _attachInputHandlers() {
    const taxInput = (document.getElementById('pe-tax-id') as any);
    if (taxInput) {
        taxInput.addEventListener('input', (e: any) => {
            const val = e.target.value.replace(/\D/g, '');
            if (val.length <= 11) {
                e.target.value = formatCPF(val);
            } else {
                e.target.value = formatCNPJ(val);
            }
            _validateTaxId();
        });
    }

    const phoneInput = (document.getElementById('pe-phone') as any);
    if (phoneInput) {
        phoneInput.addEventListener('input', (e: any) => {
            e.target.value = formatPhoneBR(e.target.value);
        });
    }

    const zipInput = (document.getElementById('pe-zip') as any);
    if (zipInput) {
        zipInput.addEventListener('input', (e: any) => {
            e.target.value = formatCEP(e.target.value);
            const digits = e.target.value.replace(/\D/g, '');
            if (digits.length === 8) {
                _fetchViaCep(digits).catch((/** @type {any} */ err) =>
                    console.debug('[personalEnv] ViaCEP:', err?.message || err),
                );
            }
        });
    }

    const addCardBtn = (document.getElementById('pe-add-card-btn') as any);
    if (addCardBtn) {
        addCardBtn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('actions:open-upgrade'));
            closePersonalEnvironmentModal();
        });
    }

    const manageStripeBtn = (document.getElementById('pe-manage-stripe-btn') as any);
    if (manageStripeBtn) {
        manageStripeBtn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('actions:open-subscription'));
            closePersonalEnvironmentModal();
        });
    }
}

function _validateTaxId() {
    const input = (document.getElementById('pe-tax-id') as any);
    const error = (document.getElementById('pe-tax-id-error') as any);
    if (!input || !error) return;

    const val = input.value.trim();
    if (!val) {
        error.style.display = 'none';
        input.classList.remove('pe-input-invalid');
        return;
    }

    const digits = val.replace(/\D/g, '');
    const valid = digits.length === 11 ? isValidCPF(val) : digits.length === 14 ? isValidCNPJ(val) : false;

    if (!valid) {
        error.textContent = t('personalEnvironment.taxIdInvalid') || 'Documento invalido';
        error.style.display = 'block';
        input.classList.add('pe-input-invalid');
    } else {
        error.style.display = 'none';
        input.classList.remove('pe-input-invalid');
    }
}

/**
 * @param {any} cep
 */
async function _fetchViaCep(cep: any) {
    try {
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await resp.json();
        if (data.erro) return;

        const cityInput = (document.getElementById('pe-city') as any);
        const stateInput = (document.getElementById('pe-state') as any);
        const addr1Input = (document.getElementById('pe-address-1') as any);

        if (cityInput && data.localidade) cityInput.value = data.localidade;
        if (stateInput && data.uf) stateInput.value = data.uf;
        if (addr1Input && data.logradouro) {
            const current = addr1Input.value.trim();
            if (!current) addr1Input.value = data.logradouro;
        }
    } catch (e: any) {
        console.debug('[personalEnv] ViaCEP failed:', (e as any)?.message || e);
    }
}

// ----------------------------------------------------------------
// ACTIONS
// ----------------------------------------------------------------

function _updateSensitiveToggle() {
    const btn = (document.getElementById('pe-toggle-sensitive') as any);
    if (!btn) return;
    btn.textContent = _sensitiveVisible
        ? t('personalEnvironment.hideSensitive') || 'Ocultar dados sensiveis'
        : t('personalEnvironment.showSensitive') || 'Exibir dados sensiveis';
}

(window as any)._peToggleSensitive = function () {
    _sensitiveVisible = !_sensitiveVisible;
    _updateSensitiveToggle();
    _renderData();
};

(window as any)._peSave = async function () {
    const user = getCurrentUser();
    if (!user) {
        showToast(t('loginRequired') || 'Login required', 'error');
        return;
    }

    /** @param {string} id */
    const _gv = (id: any) => (document.getElementById(id) as any)?.value || '';
    const fullName = _gv('pe-full-name').trim();
    const taxId = _gv('pe-tax-id').trim();
    const phone = _gv('pe-phone').trim();
    const addressLine1 = _gv('pe-address-1').trim();
    const addressLine2 = _gv('pe-address-2').trim();
    const city = _gv('pe-city').trim();
    const state = _gv('pe-state').trim();
    const zipCode = _gv('pe-zip').replace(/\D/g, '');
    const country = _gv('pe-country').trim().toUpperCase() || 'BR';

    // Validate tax ID if provided
    const taxDigits = taxId.replace(/\D/g, '');
    if (taxId && taxDigits.length === 11 && !isValidCPF(taxId)) {
        showToast(t('personalEnvironment.taxIdInvalid') || 'CPF invalido', 'error');
        return;
    }
    if (taxId && taxDigits.length === 14 && !isValidCNPJ(taxId)) {
        showToast(t('personalEnvironment.taxIdInvalid') || 'CNPJ invalido', 'error');
        return;
    }

    const payload = {
        id: user.id,
        full_name: fullName,
        tax_id: taxId,
        phone,
        address_line_1: addressLine1,
        address_line_2: addressLine2,
        city,
        state,
        zip_code: zipCode,
        country,
    };

    try {
        const sb = await _ensureSupabase();
        const { error } = await sb.schema('api').rpc('upsert_user_personal_data', {
            p_full_name: fullName,
            p_tax_id: taxId,
            p_phone: phone,
            p_address_line_1: addressLine1,
            p_address_line_2: addressLine2,
            p_city: city,
            p_state: state,
            p_zip_code: zipCode,
            p_country: country,
        });
        if (error) throw error;

        _data = payload;
        showToast(t('personalEnvironment.saveSuccess') || 'Seus dados pessoais foram atualizados.', 'success');

        // Update avatar in header if name changed
        window.dispatchEvent(new CustomEvent('personalEnvironment:updated', { detail: { fullName } }));
    } catch (e: any) {
        console.debug('[personalEnv] save error:', (e as any)?.message || e);
        showToast(t('personalEnvironment.saveError') || 'Erro ao salvar dados.', 'error');
    }
};

(window as any)._peClose = function () {
    closePersonalEnvironmentModal();
};

// ----------------------------------------------------------------
// DOM INJECTION
// ----------------------------------------------------------------

function _injectModal() {
    // B2 migração 2026-05-29: .modal-overlay → .ecbt-overlay + .ecbt-dialog--md canônicos.
    // Persist-toggle preservado via style.display flex/none (já era usado junto com
    // classList.active redundante — open/close já tinham style.display, o .active virou
    // dead cargo). Drena #3: max-width:560px;width:95% inline → clamp --ecbt-modal-md.
    // 4 XSS onclick (_peToggleSensitive/_peClose×2/_peSave) → data-attrs + AbortController.
    const overlay = document.createElement('div');
    overlay.id = 'personal-environment-modal';
    overlay.className = 'ecbt-overlay';
    overlay.style.display = 'none';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', t('personalEnvironment.title') || 'Meu Ambiente');
    overlay.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--md pe-modal">
            <div class="ecbt-dialog-header">
                <div class="ecbt-dialog-title">${escapeHtml(t('personalEnvironment.title') || 'Meu Ambiente')}</div>
                <div class="modal-header-actions">
                    <button type="button" class="btn btn-sm btn-secondary" id="pe-toggle-sensitive"
                            data-pe-toggle-sensitive>
                        ${escapeHtml(t('personalEnvironment.hideSensitive') || 'Ocultar dados sensiveis')}
                    </button>
                    <button type="button" class="ecbt-dialog-close" data-pe-close aria-label="${escapeHtml(t('close') || 'Fechar')}">
                        <span data-icon="x" data-icon-size="16px"></span>
                    </button>
                </div>
            </div>
            <div class="ecbt-dialog-body" id="pe-modal-body">
                <div class="pe-loading">${escapeHtml(t('loading') || 'Loading...')}</div>
            </div>
            <div class="ecbt-dialog-footer">
                <button type="button" class="btn btn-primary" data-pe-save>
                    ${escapeHtml(t('personalEnvironment.saveButton') || 'Salvar alteracoes')}
                </button>
                <button type="button" class="btn btn-secondary" data-pe-close>
                    ${escapeHtml(t('personalEnvironment.closeButton') || 'Fechar')}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    if (typeof (window as any).hydrateIcons === 'function') (window as any).hydrateIcons(overlay);
    // Substitui inline onclick por addEventListener + AbortController (PERF-MASTER S3.3).
    const controller = new AbortController();
    const { signal } = controller;
    (overlay as any)._peAbort = controller;
    const w = window as any;
    overlay.querySelectorAll('[data-pe-close]').forEach((btn: any) =>
        btn.addEventListener('click', () => w._peClose?.(), { signal }),
    );
    overlay.querySelectorAll('[data-pe-toggle-sensitive]').forEach((btn: any) =>
        btn.addEventListener('click', () => w._peToggleSensitive?.(), { signal }),
    );
    overlay.querySelectorAll('[data-pe-save]').forEach((btn: any) =>
        btn.addEventListener('click', () => w._peSave?.(), { signal }),
    );
}
