// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PROFILE MANAGER MODAL — CRUD UI for radar_profiles per project.
   Phase 4 of SPEC_DATASTUDIO_RADAR_PROFILES.

   Data Owner opens this modal to manage stakeholder profiles for a
   single project. Each profile defines RBAC + redaction + billing +
   auth_method. Profiles flagged is_seed=true are visually marked but
   freely editable/deletable.

   Pure helpers (validateProfileForm, profileToFormState,
   formStateToProfilePatch) are exported for unit testing.
   ================================================================ */

import { t } from '../../i18n/translations.js';
import { escapeHtml } from '../../helpers/html.js';
import { showToast } from '../toast.js';
import { buildRadarProfileSecurityState } from '../_ecbtCryptoModalsPure.js';
import {
    // eslint-disable-next-line
    isOperationAllowed,
    isKeyringOperation,
    buildAuditLogPayload,
    buildInviteLink,
    getSuccessToastKey,
    type KeyringOperation,
} from '../_keyringActionsPure.js';

const MODAL_ID = 'radar-profile-manager-modal';
const FORM_MODAL_ID = 'radar-profile-form-modal';

interface ProfileRecord {
    id: string;
    project_id: string;
    name: string;
    slug: string;
    description?: string;
    icon: string;
    color: string;
    auth_method: string;
    rbac: { read: boolean; write: boolean; sign: boolean; share: boolean; delete: boolean };
    redaction: { pii: string; precision_decimals: number };
    audit_retention_days: number;
    default_billing: { required: boolean; model: string };
    default_rate_limit: { tokens_per_second: number; max_tokens_per_request: number };
    is_seed?: boolean;
    // ECBT-CRYPT-001 F3.2: keyring ECDH per profile (opcional até deploy migration)
    ecdh_public_key_jwk?: unknown;
    ecdh_key_id?: string;
    ecdh_registered_at?: string;
}

interface ProfileFormState {
    name: string;
    description: string;
    icon: string;
    color: string;
    auth_method: string;
    rbac_read: boolean;
    rbac_write: boolean;
    rbac_sign: boolean;
    rbac_share: boolean;
    rbac_delete: boolean;
    redaction_pii: string;
    redaction_precision: number;
    audit_retention_days: number;
    billing_model: string;
    billing_required: boolean;
    rate_tokens_per_second: number;
    rate_max_per_request: number;
}

type ProfileValidationResult = { ok: boolean; errors: string[] };

type ProfileRegistryModule = {
    listProfiles(projectId: string | null): Promise<ProfileRecord[] | unknown>;
    updateProfile(id: string, patch: Partial<ProfileRecord>): Promise<unknown>;
    createProfile(input: Record<string, unknown>): Promise<unknown>;
    duplicateProfile(id: string, newName: string): Promise<unknown>;
    deleteProfile(id: string): Promise<unknown>;
};

type SeedProfilesModule = {
    seedRadarProfilesForProject(projectId: string, lang: string): Promise<number>;
};

let _projectId: string | null = null;
let _profiles: ProfileRecord[] = [];
let _editingId: string | null = null;

type AsyncConfirm = (
    message: string,
    options?: {
        confirmLabel?: string;
        cancelLabel?: string;
        danger?: boolean;
    },
) => Promise<boolean>;

async function confirmProfileDelete(message: string): Promise<boolean> {
    const moduleUrl = new URL('../asyncDialogs.js', import.meta.url).href;
    const mod = (await import(moduleUrl)) as { asyncConfirm: AsyncConfirm };
    return mod.asyncConfirm(message, { danger: true });
}

// ----------------------------------------------------------------
// PURE HELPERS (exported for tests)
// ----------------------------------------------------------------

const AUTH_METHODS = Object.freeze([
    'email',
    'sso',
    'cnpj_verify',
    'oab_credential',
    'crea_credential',
    'e_signature',
    'invite_link',
    'project_owner',
]) as readonly string[];

const BILLING_MODELS = Object.freeze(['free', 'tokens', 'none']) as readonly string[];

const PII_LEVELS = Object.freeze(['none', 'mask', 'remove']) as readonly string[];

const SLUG_RE = /^[a-z0-9_]+$/;

/**
 * Validate a profile form payload before submission. Pure.
 *
 * @param {Partial<ProfileFormState>} formData
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateProfileForm(formData: Partial<ProfileFormState> | null | undefined): ProfileValidationResult {
    const errors: string[] = [];
    if (!formData || typeof formData !== 'object') {
        return { ok: false, errors: ['form_data_required'] };
    }
    const name = typeof formData.name === 'string' ? formData.name.trim() : '';
    if (name.length < 1) errors.push('name_required');
    if (name.length > 80) errors.push('name_too_long');

    if (formData.auth_method && !AUTH_METHODS.includes(String(formData.auth_method))) {
        errors.push('auth_method_invalid');
    }
    if (formData.billing_model && !BILLING_MODELS.includes(String(formData.billing_model))) {
        errors.push('billing_model_invalid');
    }
    if (formData.redaction_pii && !PII_LEVELS.includes(String(formData.redaction_pii))) {
        errors.push('redaction_pii_invalid');
    }

    const prec = Number(formData.redaction_precision);
    if (!Number.isFinite(prec) || prec < 0 || prec > 10 || Math.floor(prec) !== prec) {
        errors.push('redaction_precision_invalid');
    }
    const rate = Number(formData.rate_tokens_per_second);
    if (!Number.isFinite(rate) || rate <= 0 || Math.floor(rate) !== rate) {
        errors.push('rate_tokens_per_second_invalid');
    }
    const maxReq = Number(formData.rate_max_per_request);
    if (!Number.isFinite(maxReq) || maxReq <= 0 || Math.floor(maxReq) !== maxReq) {
        errors.push('rate_max_per_request_invalid');
    }
    const retention = Number(formData.audit_retention_days);
    if (!Number.isFinite(retention) || retention < 1 || retention > 3650) {
        errors.push('audit_retention_days_invalid');
    }

    if (formData.color && typeof formData.color === 'string') {
        if (!/^#[0-9a-fA-F]{6}$/.test(formData.color)) {
            errors.push('color_invalid');
        }
    }

    return { ok: errors.length === 0, errors };
}

/**
 * Convert a stored ProfileRecord to a flat form state. Pure.
 * Missing fields are filled with safe defaults so the form always
 * renders.
 *
 * @param {Partial<ProfileRecord>} profile
 * @returns {ProfileFormState}
 */
export function profileToFormState(profile: Partial<ProfileRecord> | null | undefined): ProfileFormState {
    const safe = profile || {};
    const rbac = safe.rbac || {
        read: true,
        write: false,
        sign: false,
        share: false,
        delete: false,
    };
    const red = safe.redaction || {
        pii: 'none',
        precision_decimals: 6,
    };
    const billing = safe.default_billing || {
        required: false,
        model: 'free',
    };
    const rate = safe.default_rate_limit || {
        tokens_per_second: 10,
        max_tokens_per_request: 1000,
    };
    return {
        name: safe.name || '',
        description: safe.description || '',
        icon: safe.icon || 'user',
        color: safe.color || '#6b7280',
        auth_method: safe.auth_method || 'email',
        rbac_read: Boolean(rbac.read),
        rbac_write: Boolean(rbac.write),
        rbac_sign: Boolean(rbac.sign),
        rbac_share: Boolean(rbac.share),
        rbac_delete: Boolean(rbac.delete),
        redaction_pii: red.pii || 'none',
        redaction_precision: Number.isFinite(red.precision_decimals) ? red.precision_decimals : 6,
        audit_retention_days: Number.isFinite(safe.audit_retention_days) ? Number(safe.audit_retention_days) : 365,
        billing_model: billing.model || 'free',
        billing_required: Boolean(billing.required),
        rate_tokens_per_second: Number.isFinite(rate.tokens_per_second) ? rate.tokens_per_second : 10,
        rate_max_per_request: Number.isFinite(rate.max_tokens_per_request) ? rate.max_tokens_per_request : 1000,
    };
}

/**
 * Convert a validated form state into a patch ready for updateProfile().
 * Pure. Does NOT include `slug` (slug is immutable post-creation).
 *
 * @param {Partial<ProfileFormState>} formData
 * @returns {Partial<ProfileRecord>}
 */
export function formStateToProfilePatch(formData: Partial<ProfileFormState> | null | undefined): Partial<ProfileRecord> {
    const f = formData || {};
    return {
        name: typeof f.name === 'string' ? f.name.trim() : '',
        description: typeof f.description === 'string' ? f.description.trim() : '',
        icon: typeof f.icon === 'string' && f.icon ? f.icon : 'user',
        color: typeof f.color === 'string' && f.color ? f.color : '#6b7280',
        auth_method: typeof f.auth_method === 'string' ? f.auth_method : 'email',
        rbac: {
            read: Boolean(f.rbac_read),
            write: Boolean(f.rbac_write),
            sign: Boolean(f.rbac_sign),
            share: Boolean(f.rbac_share),
            delete: Boolean(f.rbac_delete),
        },
        redaction: {
            pii: typeof f.redaction_pii === 'string' ? f.redaction_pii : 'none',
            precision_decimals: Number(f.redaction_precision) || 6,
        },
        audit_retention_days: Number(f.audit_retention_days) || 365,
        default_billing: {
            required: Boolean(f.billing_required),
            model: typeof f.billing_model === 'string' ? f.billing_model : 'free',
        },
        default_rate_limit: {
            tokens_per_second: Number(f.rate_tokens_per_second) || 10,
            max_tokens_per_request: Number(f.rate_max_per_request) || 1000,
        },
    };
}

/**
 * Slug-safe transform of a free-text name. Pure. Same algorithm as
 * profileRegistry.slugify so callers can preview slugs in the UI.
 * @param {string} e
 * @returns {string}
 */
import { slugify as _slugifyCanonical } from '../../helpers/slugify.js';
export function slugifyName(name: string): string {
    const slug = _slugifyCanonical(name, { separator: '_' });
    return SLUG_RE.test(slug) ? slug : 'profile';
}

// ----------------------------------------------------------------
// PROFILE REGISTRY ACCESS — lazy import
// ----------------------------------------------------------------

async function _loadRegistry(): Promise<ProfileRegistryModule> {
    const registryPath = '../../../core/radar/profileRegistry.js';
    return (await import(/* @vite-ignore */ registryPath)) as ProfileRegistryModule;
}

async function _loadSeeder(): Promise<SeedProfilesModule> {
    const seederPath = '../../../core/random/generators/seedRadarProfiles.js';
    return (await import(/* @vite-ignore */ seederPath)) as SeedProfilesModule;
}

/**
 * @param {unknown} e
 * @returns {string}
 */
function errorMessage(e: unknown): string {
    return e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : String(e);
}

// ----------------------------------------------------------------
// LIST + ROW RENDER
// ----------------------------------------------------------------

/**
 * Render a single profile row HTML.
 * @param {ProfileRecord} profile
 * @returns {string}
 */
function renderRow(profile: ProfileRecord): string {
    const id = escapeHtml(profile.id);
    const name = escapeHtml(profile.name || '');
    const slug = escapeHtml(profile.slug || '');
    const icon = escapeHtml(profile.icon || '');
    const color = escapeHtml(profile.color || '#6b7280');
    const billingModel = escapeHtml(profile.default_billing?.model || 'free');
    const rate = String(profile.default_rate_limit?.tokens_per_second ?? '—');
    const seedBadge = profile.is_seed
        ? `<span class="rpm-badge rpm-badge--seed">${escapeHtml(t('radarProfiles.seedBadge') || 'seed')}</span>`
        : '';

    const editLbl = escapeHtml(t('radarProfiles.edit') || 'Editar');
    const dupLbl = escapeHtml(t('radarProfiles.duplicate') || 'Duplicar');
    const delLbl = escapeHtml(t('radarProfiles.delete') || 'Excluir');

    // ECBT-CRYPT-001 F3.2: keyring status badge (gracefully degrades 'missing' até migration deploy + register)
    const sec = buildRadarProfileSecurityState({
        profileId: profile.id,
        publicJwk: profile.ecdh_public_key_jwk,
        keyId: profile.ecdh_key_id,
        registeredAt: profile.ecdh_registered_at,
    });
    const secLabel = escapeHtml(t(sec.badgeLabelKey) || sec.keyringStatus);
    const secKid = sec.displayKeyId ? `<code style="font-size:10px;opacity:0.7">${escapeHtml(sec.displayKeyId)}</code>` : '';

    return (
        '<tr data-profile-id="' +
        id +
        '">' +
        `<td><span class="rpm-color-dot" style="background:${color}"></span> ${name} ${seedBadge}</td>` +
        `<td><code style="font-size:11px">${slug}</code></td>` +
        `<td>${icon}</td>` +
        `<td><span class="rpm-pill rpm-pill--${billingModel}">${billingModel}</span></td>` +
        `<td style="text-align:right">${rate} tok/s</td>` +
        `<td><span class="rpm-pill rpm-pill--keyring-${sec.keyringStatus}" data-keyring-status="${escapeHtml(sec.keyringStatus)}">${secLabel}</span> ${secKid}</td>` +
        '<td style="white-space:nowrap">' +
        `<button class="rpm-btn rpm-btn--edit" data-id="${id}">${editLbl}</button> ` +
        `<button class="rpm-btn rpm-btn--dup" data-id="${id}">${dupLbl}</button> ` +
        `<button class="rpm-btn rpm-btn--del" data-id="${id}">${delLbl}</button>` +
        '</td>' +
        '</tr>'
    );
}

/**
 * @param {HTMLElement} container
 * @param {ProfileRecord[]} profiles
 */
function renderTable(container: HTMLElement, profiles: ProfileRecord[]): void {
    if (!profiles || profiles.length === 0) {
        const empty = escapeHtml(
            t('radarProfiles.empty') ||
                'Nenhum profile cadastrado neste projeto. Crie um novo ou faça seed dos 9 templates padrão.',
        );
        container.innerHTML = `<div class="rpm-empty">${empty}</div>`;
        return;
    }
    const hName = escapeHtml(t('radarProfiles.name') || 'Nome');
    const hSlug = escapeHtml(t('radarProfiles.slug') || 'Slug');
    const hIcon = escapeHtml(t('radarProfiles.icon') || 'Ícone');
    const hBilling = escapeHtml(t('radarProfiles.billing') || 'Billing');
    const hRate = escapeHtml(t('radarProfiles.rate') || 'Rate');
    const hSecurity = escapeHtml(t('radarProfiles.security') || 'Segurança');
    const hActions = escapeHtml(t('radarProfiles.actions') || 'Ações');

    container.innerHTML =
        '<table class="rpm-table">' +
        '<thead><tr>' +
        `<th>${hName}</th><th>${hSlug}</th><th>${hIcon}</th><th>${hBilling}</th><th style="text-align:right">${hRate}</th><th>${hSecurity}</th><th>${hActions}</th>` +
        '</tr></thead><tbody>' +
        profiles.map(renderRow).join('') +
        '</tbody></table>';
}

// ----------------------------------------------------------------
// FORM MODAL (Create/Edit)
// ----------------------------------------------------------------

/**
 * Render the form modal markup for create/edit.
 * @param {ProfileFormState} state
 * @param {boolean} isCreate
 * @returns {string}
 */
function renderFormMarkup(state: ProfileFormState, isCreate: boolean): string {
    const title = escapeHtml(
        isCreate ? t('radarProfiles.createTitle') || 'Novo Profile' : t('radarProfiles.editTitle') || 'Editar Profile',
    );
    const lblName = escapeHtml(t('radarProfiles.name') || 'Nome');
    const lblDescription = escapeHtml(t('radarProfiles.description') || 'Descrição');
    const lblIcon = escapeHtml(t('radarProfiles.icon') || 'Ícone (lucide)');
    const lblColor = escapeHtml(t('radarProfiles.color') || 'Cor');
    const lblAuth = escapeHtml(t('radarProfiles.authMethod') || 'Método de autenticação');
    const lblRbac = escapeHtml(t('radarProfiles.rbac') || 'RBAC');
    const lblRedaction = escapeHtml(t('radarProfiles.redaction') || 'Redaction');
    const lblPii = escapeHtml(t('radarProfiles.pii') || 'PII');
    const lblPrec = escapeHtml(t('radarProfiles.precision') || 'Precisão decimal');
    const lblBilling = escapeHtml(t('radarProfiles.billing') || 'Billing');
    const lblModel = escapeHtml(t('radarProfiles.billingModel') || 'Modelo');
    const lblRequired = escapeHtml(t('radarProfiles.billingRequired') || 'Pagamento obrigatório');
    const lblRate = escapeHtml(t('radarProfiles.rateLimit') || 'Rate limit');
    const lblTokSec = escapeHtml(t('radarProfiles.tokensPerSecond') || 'tokens/segundo');
    const lblMaxReq = escapeHtml(t('radarProfiles.maxTokensPerRequest') || 'max tokens/request');
    const lblAudit = escapeHtml(t('radarProfiles.auditRetention') || 'Retenção audit (dias)');
    const lblSave = escapeHtml(t('common.save') || 'Salvar');
    const lblCancel = escapeHtml(t('common.cancel') || 'Cancelar');

    const authOpts = AUTH_METHODS.map(
        (m) =>
            `<option value="${escapeHtml(m)}"${m === state.auth_method ? ' selected' : ''}>${escapeHtml(m)}</option>`,
    ).join('');
    const billingOpts = BILLING_MODELS.map(
        (m) =>
            `<option value="${escapeHtml(m)}"${m === state.billing_model ? ' selected' : ''}>${escapeHtml(m)}</option>`,
    ).join('');
    const piiOpts = PII_LEVELS.map(
        (m) =>
            `<option value="${escapeHtml(m)}"${m === state.redaction_pii ? ' selected' : ''}>${escapeHtml(m)}</option>`,
    ).join('');

    const checkbox = (name: string, label: string, checked: boolean): string =>
        `<label class="rpm-check"><input type="checkbox" data-form="${name}"${checked ? ' checked' : ''}> ${escapeHtml(label)}</label>`;

    return (
        '<div class="ecbt-dialog rpm-form-dialog" role="document">' +
        '<div class="rpm-form-head">' +
        `<h2>${title}</h2>` +
        `<button class="rpm-form-close ecbt-btn" aria-label="${lblCancel}">&times;</button>` +
        '</div>' +
        '<form class="rpm-form" autocomplete="off">' +
        // name
        `<label class="rpm-field"><span>${lblName}</span><input type="text" data-form="name" value="${escapeHtml(state.name)}" maxlength="80" required></label>` +
        // description
        `<label class="rpm-field"><span>${lblDescription}</span><textarea data-form="description" rows="2">${escapeHtml(state.description)}</textarea></label>` +
        // icon + color
        '<div class="rpm-row">' +
        `<label class="rpm-field"><span>${lblIcon}</span><input type="text" data-form="icon" value="${escapeHtml(state.icon)}" maxlength="40"></label>` +
        `<label class="rpm-field"><span>${lblColor}</span><input type="color" data-form="color" value="${escapeHtml(state.color)}"></label>` +
        '</div>' +
        // auth method
        `<label class="rpm-field"><span>${lblAuth}</span><select data-form="auth_method">${authOpts}</select></label>` +
        // RBAC
        '<fieldset class="rpm-fieldset">' +
        `<legend>${lblRbac}</legend>` +
        '<div class="rpm-checks">' +
        checkbox('rbac_read', 'read', state.rbac_read) +
        checkbox('rbac_write', 'write', state.rbac_write) +
        checkbox('rbac_sign', 'sign', state.rbac_sign) +
        checkbox('rbac_share', 'share', state.rbac_share) +
        checkbox('rbac_delete', 'delete', state.rbac_delete) +
        '</div></fieldset>' +
        // Redaction
        '<fieldset class="rpm-fieldset">' +
        `<legend>${lblRedaction}</legend>` +
        '<div class="rpm-row">' +
        `<label class="rpm-field"><span>${lblPii}</span><select data-form="redaction_pii">${piiOpts}</select></label>` +
        `<label class="rpm-field"><span>${lblPrec}</span><input type="number" data-form="redaction_precision" min="0" max="10" step="1" value="${state.redaction_precision}"></label>` +
        '</div></fieldset>' +
        // Billing
        '<fieldset class="rpm-fieldset">' +
        `<legend>${lblBilling}</legend>` +
        '<div class="rpm-row">' +
        `<label class="rpm-field"><span>${lblModel}</span><select data-form="billing_model">${billingOpts}</select></label>` +
        `<label class="rpm-check"><input type="checkbox" data-form="billing_required"${state.billing_required ? ' checked' : ''}> ${lblRequired}</label>` +
        '</div></fieldset>' +
        // Rate limit
        '<fieldset class="rpm-fieldset">' +
        `<legend>${lblRate}</legend>` +
        '<div class="rpm-row">' +
        `<label class="rpm-field"><span>${lblTokSec}</span><input type="number" data-form="rate_tokens_per_second" min="1" step="1" value="${state.rate_tokens_per_second}"></label>` +
        `<label class="rpm-field"><span>${lblMaxReq}</span><input type="number" data-form="rate_max_per_request" min="1" step="1" value="${state.rate_max_per_request}"></label>` +
        '</div></fieldset>' +
        // Audit retention
        `<label class="rpm-field"><span>${lblAudit}</span><input type="number" data-form="audit_retention_days" min="1" max="3650" step="1" value="${state.audit_retention_days}"></label>` +
        // Footer
        '<div class="rpm-form-footer">' +
        `<button type="button" class="rpm-form-cancel ecbt-btn">${lblCancel}</button>` +
        `<button type="submit" class="rpm-form-save ecbt-btn ecbt-btn--primary">${lblSave}</button>` +
        '</div>' +
        '</form>' +
        '</div>'
    );
}

/**
 * Read the current form state from the DOM.
 * @param {HTMLElement} form
 * @returns {ProfileFormState}
 */
function readFormState(form: HTMLElement): ProfileFormState {
    const get = (name: string): Element | null => form.querySelector(`[data-form="${name}"]`);
    const val = (name: string): string => {
        const el = get(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        return el ? el.value : '';
    };
    const checked = (name: string): boolean => {
        const el = get(name) as HTMLInputElement | null;
        return Boolean(el && el.checked);
    };
    return {
        name: val('name'),
        description: val('description'),
        icon: val('icon'),
        color: val('color'),
        auth_method: val('auth_method'),
        rbac_read: checked('rbac_read'),
        rbac_write: checked('rbac_write'),
        rbac_sign: checked('rbac_sign'),
        rbac_share: checked('rbac_share'),
        rbac_delete: checked('rbac_delete'),
        redaction_pii: val('redaction_pii'),
        redaction_precision: Number(val('redaction_precision')) || 0,
        audit_retention_days: Number(val('audit_retention_days')) || 365,
        billing_model: val('billing_model'),
        billing_required: checked('billing_required'),
        rate_tokens_per_second: Number(val('rate_tokens_per_second')) || 10,
        rate_max_per_request: Number(val('rate_max_per_request')) || 1000,
    };
}

/**
 * Open the create/edit form sub-modal.
 * @param {ProfileRecord|null} profile  null = create
 */
function openFormModal(profile: ProfileRecord | null): void {
    closeFormModal();
    _editingId = profile ? profile.id : null;
    const state = profileToFormState(profile || {});

    const overlay = document.createElement('div');
    overlay.id = FORM_MODAL_ID;
    overlay.className = 'ecbt-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = renderFormMarkup(state, !profile);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeFormModal();
    });

    const closeBtn = overlay.querySelector('.rpm-form-close');
    if (closeBtn) closeBtn.addEventListener('click', closeFormModal);
    const cancelBtn = overlay.querySelector('.rpm-form-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeFormModal);

    const form = overlay.querySelector<HTMLFormElement>('.rpm-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formState = readFormState(form);
            const v = validateProfileForm(formState);
            if (!v.ok) {
                showToast(`${t('radarProfiles.validationError') || 'Erros'}: ${v.errors.join(', ')}`, 'error');
                return;
            }
            const patch = formStateToProfilePatch(formState);
            try {
                const registry = await _loadRegistry();
                if (_editingId) {
                    await registry.updateProfile(_editingId, patch);
                    showToast(t('radarProfiles.updated') || 'Profile atualizado', 'success');
                } else {
                    await registry.createProfile({
                        projectId: _projectId,
                        ...patch,
                    });
                    showToast(t('radarProfiles.created') || 'Profile criado', 'success');
                }
                closeFormModal();
                await refreshList();
            } catch (err) {
                showToast(`${t('radarProfiles.saveFailed') || 'Falha ao salvar'}: ${errorMessage(err)}`, 'error');
            }
        });
    }

    const nameInput = overlay.querySelector<HTMLInputElement>('[data-form="name"]');
    if (nameInput) nameInput.focus();

    // MOD-LIB-MIG-001 — presets da Library como ponto de partida (só create-mode).
    // Pré-preenche name/description; usuário revisa o resto antes de salvar.
    if (!profile && form) {
        import('../../../core/radar/libraryPresets.js')
            .then(({ listLibraryBroadcastPresets }) => {
                const presets = listLibraryBroadcastPresets();
                if (!presets.length) return;
                const wrap = document.createElement('label');
                wrap.className = 'rpm-field rpm-library-preset';
                const span = document.createElement('span');
                span.textContent = t('radarProfiles.libraryPreset') || 'Começar de um preset da Library';
                const select = document.createElement('select');
                select.setAttribute('data-form', 'library_preset');
                const optNone = document.createElement('option');
                optNone.value = '';
                optNone.textContent = '—';
                select.appendChild(optNone);
                for (const p of presets) {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = `${p.name} (${p.visibility === 'public' ? 'público' : 'restrito'})`;
                    select.appendChild(opt);
                }
                select.addEventListener('change', () => {
                    const chosen = presets.find((p) => p.id === select.value);
                    if (!chosen) return;
                    const nameEl = form.querySelector<HTMLInputElement>('[data-form="name"]');
                    const descEl = form.querySelector<HTMLTextAreaElement>('[data-form="description"]');
                    if (nameEl && !nameEl.value.trim()) nameEl.value = chosen.name;
                    if (descEl && !descEl.value.trim()) descEl.value = chosen.description;
                });
                wrap.appendChild(span);
                wrap.appendChild(select);
                form.insertBefore(wrap, form.firstChild);
            })
            .catch((e: any) => console.debug('[rpm:libraryPresets]', e?.message || e));
    }
}

function closeFormModal(): void {
    const el = document.getElementById(FORM_MODAL_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    _editingId = null;
}

// ----------------------------------------------------------------
// MAIN LIST FLOW
// ----------------------------------------------------------------

async function refreshList(): Promise<void> {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const tableHost = modal.querySelector<HTMLElement>('.rpm-list');
    if (!tableHost) return;
    try {
        const registry = await _loadRegistry();
        const result = await registry.listProfiles(_projectId);
        _profiles = Array.isArray(result) ? (result.slice() as ProfileRecord[]) : [];
        renderTable(tableHost, _profiles);
        _attachRowHandlers(tableHost);
    } catch (e) {
        console.debug('[profileManagerModal] refreshList failed:', errorMessage(e));
        tableHost.innerHTML = `<div class="rpm-empty rpm-empty--error">${escapeHtml(errorMessage(e))}</div>`;
    }
}

/** @param {HTMLElement} host */
function _attachRowHandlers(host: HTMLElement): void {
    host.querySelectorAll('.rpm-btn--edit').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const profile = _profiles.find((p) => p.id === id);
            if (profile) openFormModal(profile);
        });
    });
    host.querySelectorAll('.rpm-btn--dup').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            if (!id) return;
            const profile = _profiles.find((p) => p.id === id);
            if (!profile) return;
            try {
                const registry = await _loadRegistry();
                const newName = `${profile.name} (copy)`;
                await registry.duplicateProfile(id, newName);
                showToast(t('radarProfiles.duplicated') || 'Profile duplicado', 'success');
                await refreshList();
            } catch (e) {
                showToast(`${t('radarProfiles.duplicateFailed') || 'Falha ao duplicar'}: ${errorMessage(e)}`, 'error');
            }
        });
    });
    host.querySelectorAll('.rpm-btn--del').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            if (!id) return;
            const confirmMsg = t('radarProfiles.confirmDelete') || 'Excluir este profile?';
            if (!(await confirmProfileDelete(confirmMsg))) return;
            try {
                const registry = await _loadRegistry();
                await registry.deleteProfile(id);
                showToast(t('radarProfiles.deleted') || 'Profile excluído', 'success');
                await refreshList();
            } catch (e) {
                showToast(`${t('radarProfiles.deleteFailed') || 'Falha ao excluir'}: ${errorMessage(e)}`, 'error');
            }
        });
    });
    // ECBT-CRYPT-001 F3.4: keyring action buttons (rotate/revoke/invite)
    host.querySelectorAll<HTMLButtonElement>(
        '.rpm-btn--rotate, .rpm-btn--revoke, .rpm-btn--invite',
    ).forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const opAttr = btn.getAttribute('data-op');
            if (!id || !opAttr || !isKeyringOperation(opAttr)) return;
            const profile = _profiles.find((p) => p.id === id);
            if (!profile) return;
            await _handleKeyringAction(opAttr, profile);
        });
    });
}

/**
 * F3.4 — handler de uma operação de keyring (rotate/revoke/invite).
 * Compõe pure-logic + wire side-effects (Web Crypto + Supabase + audit + i18n toast).
 */
async function _handleKeyringAction(op: KeyringOperation, profile: ProfileRecord): Promise<void> {
    try {
        const confirmKey = `ecbtCrypto.profile.confirm.${op}`;
        const confirmMsg = t(confirmKey) || `Confirma ${op}?`;
        if (!(await confirmProfileDelete(confirmMsg))) return;
        const status =
            profile.ecdh_public_key_jwk && profile.ecdh_registered_at ? 'registered' : 'missing';
        const ownerUserId = ((globalThis as any).window?.__currentUserId ?? 'unknown') as string;
        const payload = buildAuditLogPayload(
            op,
            { profileId: profile.id, currentStatus: status, ownerUserId },
            { profile_slug: profile.slug },
        );
        if (op === 'rotate') {
            await _rotateKeyringForProfile(profile);
        } else if (op === 'revoke') {
            await _revokeKeyringForProfile(profile);
        } else if (op === 'invite') {
            await _copyInviteLinkForProfile(profile);
        }
        await _insertAuditLog(payload).catch((e: any) =>
            console.debug('[profileManagerModal:audit]', e?.message || e),
        );
        showToast(t(getSuccessToastKey(op)) || `${op} OK`, 'success');
        await refreshList();
    } catch (e) {
        const errKey = `ecbtCrypto.profile.toast.${op}.error`;
        showToast(`${t(errKey) || 'Erro'}: ${errorMessage(e)}`, 'error');
    }
}

async function _rotateKeyringForProfile(profile: ProfileRecord): Promise<void> {
    const subtle = (globalThis as any).crypto?.subtle as SubtleCrypto | undefined;
    if (!subtle) throw new Error('Web Crypto API unavailable');
    const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    const publicJwk = await subtle.exportKey('jwk', kp.publicKey);
    const keyId = `kid-${Date.now().toString(16)}-${Math.floor(Math.random() * 0xffff).toString(16)}`;
    const registry = await _loadRegistry();
    await registry.updateProfile(profile.id, {
        ecdh_public_key_jwk: publicJwk,
        ecdh_key_id: keyId,
        ecdh_registered_at: new Date().toISOString(),
    } as any);
}

async function _revokeKeyringForProfile(profile: ProfileRecord): Promise<void> {
    const registry = await _loadRegistry();
    await registry.updateProfile(profile.id, {
        ecdh_public_key_jwk: null,
        ecdh_key_id: null,
        ecdh_registered_at: null,
    } as any);
}

async function _copyInviteLinkForProfile(profile: ProfileRecord): Promise<void> {
    const origin =
        (globalThis as any).window?.location?.origin || 'https://ecbyts.com';
    const link = buildInviteLink({
        profileId: profile.id,
        profileSlug: profile.slug || 'profile',
        projectId: _projectId || '',
        origin,
    });
    const clip = (globalThis as any).navigator?.clipboard;
    if (clip && typeof clip.writeText === 'function') {
        await clip.writeText(link);
    } else {
        (globalThis as any).window?.alert?.(link);
    }
}

async function _insertAuditLog(payload: any): Promise<void> {
    const supabase =
        (globalThis as any).__test_supabase__ ||
        (globalThis as any).window?.__supabase ||
        null;
    if (!supabase || typeof supabase.from !== 'function') return; // sem supabase = no-op gracioso
    const { error } = await supabase.from('ecbt_encryption_audit').insert({
        user_id: payload.ownerUserId,
        project_id: _projectId,
        profile_id: payload.profileId,
        model_id: payload.modelId || null,
        action: payload.action,
        metadata: payload.metadata,
        created_at: payload.timestamp,
    });
    if (error) throw new Error(`audit insert: ${error.message || error}`);
}

// ----------------------------------------------------------------
// MODAL SHELL
// ----------------------------------------------------------------

function _buildModalShell(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'ecbt-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const title = escapeHtml(t('radarProfiles.title') || 'Profiles do Projeto');
    const desc = escapeHtml(
        t('radarProfiles.description') ||
            'Stakeholder profiles definem RBAC, redaction e billing para cada público do radar.',
    );
    const newLbl = escapeHtml(t('radarProfiles.new') || '+ Novo Profile');
    const seedLbl = escapeHtml(t('radarProfiles.seedDefaults') || 'Seed 9 profiles padrão');
    const closeLbl = escapeHtml(t('common.close') || 'Fechar');

    overlay.innerHTML =
        '<div class="ecbt-dialog ecbt-dialog--xl rpm-dialog" role="document" style="max-width:900px">' +
        '<div class="rpm-head">' +
        `<h2 style="margin:0">${title}</h2>` +
        `<button class="rpm-close ecbt-btn" aria-label="${closeLbl}">&times;</button>` +
        '</div>' +
        `<p class="rpm-desc">${desc}</p>` +
        '<div class="rpm-toolbar">' +
        `<button class="rpm-new ecbt-btn ecbt-btn--primary">${newLbl}</button> ` +
        `<button class="rpm-seed ecbt-btn">${seedLbl}</button>` +
        '</div>' +
        '<div class="rpm-list"></div>' +
        // Inline styles to avoid needing a separate CSS file in Phase 4.
        '<style>' +
        '.rpm-dialog { padding:18px; }' +
        '.rpm-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }' +
        '.rpm-desc { color:var(--text-tertiary,#888); font-size:12px; margin:0 0 12px; }' +
        '.rpm-toolbar { margin-bottom:12px; display:flex; gap:8px; }' +
        '.rpm-table { width:100%; border-collapse:collapse; font-size:12px; }' +
        '.rpm-table th, .rpm-table td { padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.06); text-align:left; }' +
        '.rpm-table th { background:var(--bg-secondary,#1a1a2a); position:sticky; top:0; }' +
        '.rpm-color-dot { display:inline-block; width:10px; height:10px; border-radius:50%; vertical-align:middle; margin-right:4px; }' +
        '.rpm-badge { display:inline-block; padding:1px 5px; border-radius:3px; font-size:10px; margin-left:4px; }' +
        '.rpm-badge--seed { background:rgba(234,179,8,0.18); color:#eab308; }' +
        '.rpm-pill { display:inline-block; padding:1px 6px; border-radius:10px; font-size:10px; }' +
        '.rpm-pill--free { background:rgba(34,197,94,0.18); color:#22c55e; }' +
        '.rpm-pill--tokens { background:rgba(96,165,250,0.18); color:#60a5fa; }' +
        '.rpm-pill--none { background:rgba(148,163,184,0.18); color:#94a3b8; }' +
        '.rpm-btn { padding:2px 8px; font-size:11px; cursor:pointer; background:transparent; color:inherit; border:1px solid var(--border-color,#444); border-radius:3px; }' +
        '.rpm-btn:hover { background:rgba(255,255,255,0.04); }' +
        '.rpm-btn--del { color:#ef4444; }' +
        '.rpm-empty { padding:20px; text-align:center; color:var(--text-tertiary,#888); font-size:12px; }' +
        '.rpm-empty--error { color:#ef4444; }' +
        // Form modal
        '.rpm-form-dialog { padding:18px; max-width:560px; width:100%; }' +
        '.rpm-form-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }' +
        '.rpm-form { display:flex; flex-direction:column; gap:10px; }' +
        '.rpm-field { display:flex; flex-direction:column; gap:3px; font-size:12px; }' +
        '.rpm-field span { color:var(--text-tertiary,#aaa); font-size:11px; }' +
        '.rpm-field input, .rpm-field select, .rpm-field textarea { padding:6px 8px; border-radius:4px; border:1px solid var(--border-color,#444); background:var(--bg-primary,#121220); color:var(--text-primary,#fff); font-size:12px; }' +
        '.rpm-row { display:flex; gap:10px; }' +
        '.rpm-row .rpm-field { flex:1; }' +
        '.rpm-fieldset { border:1px solid var(--border-color,#333); border-radius:4px; padding:8px 12px; }' +
        '.rpm-fieldset legend { font-size:11px; color:var(--text-tertiary,#aaa); padding:0 6px; }' +
        '.rpm-checks { display:flex; flex-wrap:wrap; gap:10px; }' +
        '.rpm-check { display:inline-flex; align-items:center; gap:4px; font-size:12px; cursor:pointer; }' +
        '.rpm-form-footer { display:flex; justify-content:flex-end; gap:8px; margin-top:8px; }' +
        '</style>' +
        '</div>';

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeProfileManagerModal();
    });
    const closeBtn = overlay.querySelector('.rpm-close');
    if (closeBtn) closeBtn.addEventListener('click', closeProfileManagerModal);

    const newBtn = overlay.querySelector('.rpm-new');
    if (newBtn) newBtn.addEventListener('click', () => openFormModal(null));

    const seedBtn = overlay.querySelector('.rpm-seed');
    if (seedBtn) {
        seedBtn.addEventListener('click', async () => {
            if (!_projectId) {
                showToast(t('radarProfiles.noProject') || 'Projeto não selecionado', 'error');
                return;
            }
            try {
                const seeder = await _loadSeeder();
                const lang = (typeof navigator !== 'undefined' && navigator.language) || 'pt-BR';
                const count = await seeder.seedRadarProfilesForProject(_projectId, lang);
                if (count > 0) {
                    showToast(`${t('radarProfiles.seeded') || 'Profiles padrão criados'}: ${count}`, 'success');
                } else {
                    showToast(t('radarProfiles.seedSkipped') || 'Profiles já existem (idempotente)', 'info');
                }
                await refreshList();
            } catch (e) {
                showToast(`${t('radarProfiles.seedFailed') || 'Falha no seed'}: ${errorMessage(e)}`, 'error');
            }
        });
    }

    return overlay;
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Open the ProfileManager modal for the given project.
 * @param {{ projectId: string }} opts
 * @returns {Promise<void>}
 */
export async function openProfileManagerModal(opts: { projectId: string }): Promise<void> {
    const projectId = opts && opts.projectId;
    if (!projectId) {
        showToast(t('radarProfiles.noProject') || 'projectId obrigatório', 'error');
        return;
    }
    _projectId = projectId;

    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = _buildModalShell();
        document.body.appendChild(modal);
    }
    /** @type {HTMLElement} */ (modal).style.display = 'flex';

    await refreshList();
}

/** Close the ProfileManager modal and any open form sub-modal. */
export function closeProfileManagerModal(): void {
    closeFormModal();
    const modal = document.getElementById(MODAL_ID);
    if (modal) /** @type {HTMLElement} */ (modal).style.display = 'none';
    _projectId = null;
    _profiles = [];
}
