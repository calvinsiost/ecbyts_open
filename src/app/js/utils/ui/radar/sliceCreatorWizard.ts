// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   SLICE CREATOR WIZARD — 4-step modal per SPEC_DATASTUDIO_RADAR_PROFILES §8.2
   Step 1: Profile selection
   Step 2: Data selection (paths + temporal + spatial filters)
   Step 3: Billing configuration
   Step 4: Review + generate URL with [Copy] [Send Email]

   Phase 5 / 5 of the Radar Profiles feature (UI surface only).
   Pure helper `validateWizardData(step, formData)` extracted for testing.
   ================================================================ */
import { t } from '../../i18n/translations.js';
import { escapeHtml } from '../../helpers/html.js';
import { showToast } from '../toast.js';
import { validateWizardData as _validateWizardData } from './_pureHelpers.js';
import {
    isOpenPublication,
    profileFromDbRow,
} from '../../../core/radar/_invertedMonetizationPure.js';
export { validateWizardData } from './_pureHelpers.js';
const MODAL_ID = 'radar-slice-wizard-modal';
const TOTAL_STEPS = 4;
let _state: any = null;
let _profilesCache: any[] = [];
let _defaultCosts = {};
// ----------------------------------------------------------------
// INTERNALS
// ----------------------------------------------------------------
/** @param {unknown} e */
function errorMessage(e: any) {
    return e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
}
/** @returns {WizardState} */
function freshState() {
    return {
        step: 1,
        radarId: null,
        projectId: null,
        profileId: null,
        includePaths: '',
        excludePaths: '',
        temporalFrom: '',
        temporalTo: '',
        temporalAggregation: 'daily_mean',
        bboxLonMin: '',
        bboxLatMin: '',
        bboxLonMax: '',
        bboxLatMax: '',
        billingRequired: false,
        billingContractedTotal: '',
        billingRatePerSecond: '',
        billingMaxPerRequest: '',
        billingCurrency: 'BRL',
        sliceName: '',
        generatedUrl: '',
        generatedSliceSlug: null,
    };
}
async function loadProfiles() {
    try {
        const registryPath = '../../../core/radar/profileRegistry.js';
        const mod = await import(/* @vite-ignore */ registryPath);
        if (typeof mod.listProfiles === 'function' && _state?.projectId) {
            const list = await mod.listProfiles(_state.projectId);
            _profilesCache = Array.isArray(list) ? list : [];
        }
    } catch (e: any) {
        console.debug('[sliceWizard] profileRegistry not yet available:', errorMessage(e));
        _profilesCache = [];
    }
}
async function loadDefaultCosts() {
    try {
        const costsPath = '../../../core/radar/endpointCosts.js';
        const mod = await import(/* @vite-ignore */ costsPath);
        if (mod.DEFAULT_COSTS && typeof mod.DEFAULT_COSTS === 'object') {
            _defaultCosts = mod.DEFAULT_COSTS;
        }
    } catch (e: any) {
        console.debug('[sliceWizard] endpointCosts not yet available:', errorMessage(e));
        _defaultCosts = {};
    }
}
/**
 * @param {string} key
 * @param {string} fallback
 */
function tr(key: any, fallback: any) {
    return t(key) || fallback;
}
/**
 * Constrói SliceLike a partir do _state atual (estado do wizard).
 * Usado para classificação isOpenPublication em tempo real (badge UI).
 */
function _sliceFromState(): any {
    if (!_state) return null;
    const inc = (_state.includePaths || '').trim();
    const exc = (_state.excludePaths || '').trim();
    return {
        includePaths: inc ? inc.split(/\r?\n/).filter(Boolean) : null,
        excludePaths: exc ? exc.split(/\r?\n/).filter(Boolean) : null,
        temporalFilter:
            _state.temporalFrom || _state.temporalTo
                ? {
                      from: _state.temporalFrom || null,
                      to: _state.temporalTo || null,
                      aggregation: _state.temporalAggregation || null,
                  }
                : null,
        spatialFilter:
            _state.bboxLonMin || _state.bboxLatMin || _state.bboxLonMax || _state.bboxLatMax
                ? {
                      bbox: [
                          Number(_state.bboxLonMin) || 0,
                          Number(_state.bboxLatMin) || 0,
                          Number(_state.bboxLonMax) || 0,
                          Number(_state.bboxLatMax) || 0,
                      ],
                  }
                : null,
        billing: _state.billingRequired ? { required: true } : null,
    };
}

/**
 * Badge live "Publicação aberta — gratuita" vs "Recorte pago"
 * RADAR-INVERTED-MONET F3 RF4. Reflete classificação isOpenPublication
 * em tempo real conforme usuário edita o slice.
 */
function _renderOpennessBadge(): string {
    if (!_state || !_state.profileId) return '';
    const profileRow = _profilesCache.find((p: any) => p.id === _state.profileId);
    if (!profileRow) return '';
    const profile = profileFromDbRow(profileRow);
    const slice = _sliceFromState();
    const isOpen = isOpenPublication(profile, slice);
    const label = isOpen
        ? tr('radar.openPublication.free', 'Publicação aberta — gratuita')
        : tr('radar.restrictedSlice.paid', 'Recorte pago');
    const cls = isOpen ? 'rsw-badge--open' : 'rsw-badge--paid';
    const ariaLabel = escapeHtml(label);
    return `<div class="rsw-badge ${cls}" role="status" aria-label="${ariaLabel}">${escapeHtml(label)}</div>`;
}

function renderStepIndicator() {
    if (!_state) return '';
    const stepLabel = tr('radarSlice.step', 'Etapa');
    let html = '<div class="rsw-steps">';
    for (let i = 1; i <= TOTAL_STEPS; i++) {
        const active = i === _state.step ? ' rsw-step--active' : '';
        const done = i < _state.step ? ' rsw-step--done' : '';
        html += `<span class="rsw-step${active}${done}">${stepLabel} ${i}</span>`;
    }
    html += '</div>';
    html += _renderOpennessBadge();
    return html;
}
function renderStep1() {
    if (!_state) return '';
    const state = _state;
    const title = escapeHtml(tr('radarSlice.stepProfile', 'Perfil'));
    const desc = escapeHtml(tr('radarSlice.stepProfileDesc', 'Selecione um perfil já criado para este projeto.'));
    const labelProfile = escapeHtml(tr('radarSlice.profile', 'Perfil'));
    const empty = escapeHtml(tr('radarSlice.noProfiles', 'Nenhum perfil disponível. Crie um na aba Profiles.'));
    if (_profilesCache.length === 0) {
        return (
            `<h3 class="rsw-step-title">${title}</h3>` +
            `<p class="rsw-step-desc">${desc}</p>` +
            `<div class="rsw-empty">${empty}</div>`
        );
    }
    const options = _profilesCache
        .map((p: any) => {
            const sel = p.id === state.profileId ? ' selected' : '';
            return `<option value="${escapeHtml(p.id)}"${sel}>${escapeHtml(p.name)} (${escapeHtml(p.slug)})</option>`;
        })
        .join('');
    const selected = _profilesCache.find((p: any) => p.id === state.profileId);
    let badge = '';
    if (selected) {
        const color = selected.color || '#60a5fa';
        const icon = selected.icon || '*';
        badge =
            `<div class="rsw-profile-badge" style="background:${escapeHtml(color)}22;border-left:3px solid ${escapeHtml(color)}">` +
            `<span class="rsw-profile-icon">${escapeHtml(icon)}</span>` +
            `<span><strong>${escapeHtml(selected.name)}</strong> — <code>${escapeHtml(selected.slug)}</code></span>` +
            '</div>';
    }
    return (
        `<h3 class="rsw-step-title">${title}</h3>` +
        `<p class="rsw-step-desc">${desc}</p>` +
        '<div class="rsw-field">' +
        `<label>${labelProfile}</label>` +
        `<select class="rsw-input rsw-profile-select">${options}</select>` +
        '</div>' +
        badge
    );
}
function renderStep2() {
    if (!_state) return '';
    const title = escapeHtml(tr('radarSlice.stepData', 'Seleção de dados'));
    const desc = escapeHtml(
        tr(
            'radarSlice.stepDataDesc',
            'Defina paths de inclusão/exclusão (glob suportado), filtro temporal e bounding box espacial.',
        ),
    );
    const incLabel = escapeHtml(tr('radarSlice.includes', 'Include paths (um por linha)'));
    const excLabel = escapeHtml(tr('radarSlice.excludes', 'Exclude paths (um por linha)'));
    const tempLabel = escapeHtml(tr('radarSlice.temporal', 'Filtro temporal'));
    const fromLabel = escapeHtml(tr('radarSlice.from', 'De'));
    const toLabel = escapeHtml(tr('radarSlice.to', 'Até'));
    const aggrLabel = escapeHtml(tr('radarSlice.aggregation', 'Agregação'));
    const spatialLabel = escapeHtml(tr('radarSlice.spatial', 'Filtro espacial (bbox)'));
    const lonMin = escapeHtml(tr('radarSlice.lonMin', 'Longitude mín'));
    const latMin = escapeHtml(tr('radarSlice.latMin', 'Latitude mín'));
    const lonMax = escapeHtml(tr('radarSlice.lonMax', 'Longitude máx'));
    const latMax = escapeHtml(tr('radarSlice.latMax', 'Latitude máx'));
    const placeholderInc = 'elements/*/raw_measurements\nobservations/*';
    const placeholderExc = 'elements/private/*';
    const inc = escapeHtml(_state.includePaths);
    const exc = escapeHtml(_state.excludePaths);
    /** @param {string} dialog */
    const aggrOpt = (v: any) => `<option value="${v}"${_state?.temporalAggregation === v ? ' selected' : ''}>${v}</option>`;
    return (
        `<h3 class="rsw-step-title">${title}</h3>` +
        `<p class="rsw-step-desc">${desc}</p>` +
        '<div class="rsw-field">' +
        `<label>${incLabel}</label>` +
        `<textarea class="rsw-input rsw-include" rows="3" placeholder="${placeholderInc}">${inc}</textarea>` +
        '</div>' +
        '<div class="rsw-field">' +
        `<label>${excLabel}</label>` +
        `<textarea class="rsw-input rsw-exclude" rows="2" placeholder="${placeholderExc}">${exc}</textarea>` +
        '</div>' +
        '<div class="rsw-field">' +
        `<label>${tempLabel}</label>` +
        '<div class="rsw-row">' +
        `<div><span class="rsw-sublabel">${fromLabel}</span><input type="date" class="rsw-input rsw-temp-from" value="${escapeHtml(_state.temporalFrom)}"></div>` +
        `<div><span class="rsw-sublabel">${toLabel}</span><input type="date" class="rsw-input rsw-temp-to" value="${escapeHtml(_state.temporalTo)}"></div>` +
        `<div><span class="rsw-sublabel">${aggrLabel}</span><select class="rsw-input rsw-temp-aggr">${aggrOpt('daily_mean')}${aggrOpt('weekly_mean')}${aggrOpt('monthly_mean')}</select></div>` +
        '</div></div>' +
        '<div class="rsw-field">' +
        `<label>${spatialLabel}</label>` +
        '<div class="rsw-row rsw-row--4">' +
        `<div><span class="rsw-sublabel">${lonMin}</span><input type="number" step="any" class="rsw-input rsw-bbox-lonmin" value="${escapeHtml(_state.bboxLonMin)}"></div>` +
        `<div><span class="rsw-sublabel">${latMin}</span><input type="number" step="any" class="rsw-input rsw-bbox-latmin" value="${escapeHtml(_state.bboxLatMin)}"></div>` +
        `<div><span class="rsw-sublabel">${lonMax}</span><input type="number" step="any" class="rsw-input rsw-bbox-lonmax" value="${escapeHtml(_state.bboxLonMax)}"></div>` +
        `<div><span class="rsw-sublabel">${latMax}</span><input type="number" step="any" class="rsw-input rsw-bbox-latmax" value="${escapeHtml(_state.bboxLatMax)}"></div>` +
        '</div></div>'
    );
}
function renderStep3() {
    if (!_state) return '';
    const title = escapeHtml(tr('radarSlice.stepBilling', 'Cobrança'));
    const desc = escapeHtml(tr('radarSlice.stepBillingDesc', 'Configure o modelo de cobrança em tokens (opcional).'));
    const billingLabel = escapeHtml(tr('radarSlice.billingRequired', 'Cobrança obrigatória'));
    const totalLabel = escapeHtml(tr('radarSlice.contractedTotal', 'Tokens contratados (total)'));
    const rateLabel = escapeHtml(tr('radarSlice.ratePerSecond', 'Rate (tokens/segundo)'));
    const maxLabel = escapeHtml(tr('radarSlice.maxPerRequest', 'Max tokens por request'));
    const currencyLabel = escapeHtml(tr('radarSlice.currency', 'Moeda'));
    const costsTitle = escapeHtml(tr('radarSlice.endpointCosts', 'Custos estimados por endpoint'));
    const checked = _state.billingRequired ? ' checked' : '';
    const billingBlock = _state.billingRequired
        ? '<div class="rsw-row rsw-row--4">' +
          `<div><span class="rsw-sublabel">${totalLabel}</span><input type="number" min="0" class="rsw-input rsw-billing-total" value="${escapeHtml(_state.billingContractedTotal)}"></div>` +
          `<div><span class="rsw-sublabel">${rateLabel}</span><input type="number" min="0" class="rsw-input rsw-billing-rate" value="${escapeHtml(_state.billingRatePerSecond)}"></div>` +
          `<div><span class="rsw-sublabel">${maxLabel}</span><input type="number" min="0" class="rsw-input rsw-billing-max" value="${escapeHtml(_state.billingMaxPerRequest)}"></div>` +
          `<div><span class="rsw-sublabel">${currencyLabel}</span><select class="rsw-input rsw-billing-currency">` +
          `<option value="BRL"${_state.billingCurrency === 'BRL' ? ' selected' : ''}>BRL</option>` +
          `<option value="ECBT"${_state.billingCurrency === 'ECBT' ? ' selected' : ''}>$ECBT</option>` +
          '</select></div>' +
          '</div>'
        : '';
    const costRows = Object.keys(_defaultCosts).length
        ? Object.entries(_defaultCosts)
              .map(([ep, c]) => {
                  return (
                      '<tr>' +
                      `<td><code>${escapeHtml(ep)}</code></td>` +
                      `<td>${escapeHtml(String((c as any).base_cost ?? '-'))}</td>` +
                      `<td>${escapeHtml(String((c as any).multiplier_per_unit ?? '-'))}</td>` +
                      `<td>${escapeHtml(String((c as any).unit_label ?? '-'))}</td>` +
                      '</tr>'
                  );
              })
              .join('')
        : `<tr><td colspan="4" class="rsw-empty-cell">${escapeHtml(tr('radarSlice.noCosts', 'Endpoint costs ainda não disponíveis (Phase 1-4 pendente).'))}</td></tr>`;
    return (
        `<h3 class="rsw-step-title">${title}</h3>` +
        `<p class="rsw-step-desc">${desc}</p>` +
        '<div class="rsw-field">' +
        `<label class="rsw-checkbox-label"><input type="checkbox" class="rsw-billing-required"${checked}> ${billingLabel}</label>` +
        '</div>' +
        billingBlock +
        `<div class="rsw-field"><label>${costsTitle}</label>` +
        '<table class="rsw-costs-table">' +
        '<thead><tr><th>endpoint</th><th>base_cost</th><th>multiplier</th><th>unit</th></tr></thead>' +
        `<tbody>${costRows}</tbody></table></div>`
    );
}
function renderStep4() {
    if (!_state) return '';
    const state = _state;
    const title = escapeHtml(tr('radarSlice.stepReview', 'Revisão + URL'));
    const desc = escapeHtml(tr('radarSlice.stepReviewDesc', 'Confira e clique em Gerar URL para criar a slice.'));
    const nameLabel = escapeHtml(tr('radarSlice.name', 'Nome da slice'));
    const generateLabel = escapeHtml(tr('radarSlice.generateUrl', 'Gerar URL'));
    const profile = _profilesCache.find((p: any) => p.id === state.profileId);
    const summaryRows = [
        ['profile', profile ? profile.name : '-'],
        ['include_paths', _state.includePaths || '-'],
        ['exclude_paths', _state.excludePaths || '-'],
        ['temporal', `${_state.temporalFrom || '-'} → ${_state.temporalTo || '-'} (${_state.temporalAggregation})`],
        [
            'spatial_bbox',
            [_state.bboxLonMin, _state.bboxLatMin, _state.bboxLonMax, _state.bboxLatMax]
                .filter((v: any) => v !== '')
                .join(', ') || '-',
        ],
        [
            'billing',
            _state.billingRequired
                ? `${_state.billingContractedTotal} tokens (${_state.billingCurrency}) @ ${_state.billingRatePerSecond}/s`
                : '-',
        ],
    ];
    const summary = summaryRows
        .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td><code>${escapeHtml(String(v))}</code></td></tr>`)
        .join('');
    const urlBlock = _state.generatedUrl
        ? '<div class="rsw-url-block">' +
          `<input type="text" readonly class="rsw-input rsw-url-input" value="${escapeHtml(_state.generatedUrl)}">` +
          '<div class="rsw-url-actions">' +
          `<button class="ecbt-btn rsw-copy-url">${escapeHtml(tr('radarSlice.copy', 'Copiar'))}</button>` +
          `<button class="ecbt-btn rsw-email-url">${escapeHtml(tr('radarSlice.sendEmail', 'Enviar email'))}</button>` +
          '</div></div>'
        : `<button class="ecbt-btn ecbt-btn--primary rsw-generate">${generateLabel}</button>`;
    return (
        `<h3 class="rsw-step-title">${title}</h3>` +
        `<p class="rsw-step-desc">${desc}</p>` +
        '<div class="rsw-field">' +
        `<label>${nameLabel}</label>` +
        `<input type="text" class="rsw-input rsw-slice-name" value="${escapeHtml(_state.sliceName)}" placeholder="ClientePremium">` +
        '</div>' +
        '<table class="rsw-summary-table">' +
        `<tbody>${summary}</tbody>` +
        '</table>' +
        urlBlock
    );
}
function renderBody() {
    if (!_state) return '';
    switch (_state.step) {
        case 1:
            return renderStep1();
        case 2:
            return renderStep2();
        case 3:
            return renderStep3();
        case 4:
            return renderStep4();
        default:
            return '';
    }
}
function renderNav() {
    if (!_state) return '';
    const back = escapeHtml(tr('radarSlice.back', 'Voltar'));
    const next = escapeHtml(tr('radarSlice.next', 'Próximo'));
    const cancel = escapeHtml(tr('radarSlice.cancel', 'Cancelar'));
    const finish = escapeHtml(tr('radarSlice.finish', 'Concluir'));
    const isFirst = _state.step === 1;
    const isLast = _state.step === TOTAL_STEPS;
    const backBtn = `<button class="ecbt-btn rsw-back"${isFirst ? ' disabled' : ''}>${back}</button>`;
    const nextLabel = isLast ? finish : next;
    return (
        '<div class="rsw-nav">' +
        `<button class="ecbt-btn rsw-cancel">${cancel}</button>` +
        '<div class="rsw-nav-spacer"></div>' +
        backBtn +
        `<button class="ecbt-btn ecbt-btn--primary rsw-next">${nextLabel}</button>` +
        '</div>'
    );
}
/** @param {HTMLElement} dialog */
function syncStateFromDOM(dialog: any) {
    if (!_state) return;
    const q = (sel: any) => dialog.querySelector(sel);
    if (_state.step === 1) {
        const sel = q('.rsw-profile-select');
        if (sel) _state.profileId = sel.value || null;
    } else if (_state.step === 2) {
        const inc = q('.rsw-include');
        const exc = q('.rsw-exclude');
        const from = q('.rsw-temp-from');
        const to = q('.rsw-temp-to');
        const aggr = q('.rsw-temp-aggr');
        const lonMin = q('.rsw-bbox-lonmin');
        const latMin = q('.rsw-bbox-latmin');
        const lonMax = q('.rsw-bbox-lonmax');
        const latMax = q('.rsw-bbox-latmax');
        if (inc) _state.includePaths = inc.value;
        if (exc) _state.excludePaths = exc.value;
        if (from) _state.temporalFrom = from.value;
        if (to) _state.temporalTo = to.value;
        if (aggr) _state.temporalAggregation = aggr.value;
        if (lonMin) _state.bboxLonMin = lonMin.value;
        if (latMin) _state.bboxLatMin = latMin.value;
        if (lonMax) _state.bboxLonMax = lonMax.value;
        if (latMax) _state.bboxLatMax = latMax.value;
    } else if (_state.step === 3) {
        const req = dialog.querySelector('.rsw-billing-required');
        if (req) _state.billingRequired = req.checked;
        if (_state.billingRequired) {
            const total = q('.rsw-billing-total');
            const rate = q('.rsw-billing-rate');
            const max = q('.rsw-billing-max');
            const currency = q('.rsw-billing-currency');
            if (total) _state.billingContractedTotal = total.value;
            if (rate) _state.billingRatePerSecond = rate.value;
            if (max) _state.billingMaxPerRequest = max.value;
            if (currency) _state.billingCurrency = currency.value;
        }
    } else if (_state.step === 4) {
        const name = q('.rsw-slice-name');
        if (name) _state.sliceName = name.value;
    }
}
/** @param {string[]} errors */
function reportErrors(errors: any) {
    if (!errors.length) return;
    showToast(`Wizard: ${errors.join(', ')}`, 'warning');
}
function parsePathsBlock(text: any) {
    return (text || '')
        .split('\n')
        .map((s: any) => s.trim())
        .filter(Boolean);
}
async function handleGenerate() {
    if (!_state) return;
    if (!_state.radarId || !_state.projectId) {
        showToast(tr('radarSlice.errMissingIds', 'radarId/projectId ausentes'), 'error');
        return;
    }
    const includePaths = parsePathsBlock(_state.includePaths);
    const excludePaths = parsePathsBlock(_state.excludePaths);
    let temporalFilter = null;
    if (_state.temporalFrom || _state.temporalTo) {
        temporalFilter = {
            from: _state.temporalFrom || null,
            to: _state.temporalTo || null,
            aggregation: _state.temporalAggregation,
        };
    }
    let spatialFilter = null;
    if (_state.bboxLonMin !== '' && _state.bboxLatMin !== '' && _state.bboxLonMax !== '' && _state.bboxLatMax !== '') {
        spatialFilter = {
            bbox: [
                Number(_state.bboxLonMin),
                Number(_state.bboxLatMin),
                Number(_state.bboxLonMax),
                Number(_state.bboxLatMax),
            ],
        };
    }
    let billing = null;
    if (_state.billingRequired) {
        billing = {
            required: true,
            currency: _state.billingCurrency,
            // Token-based wallet defaults — copied into per-grant wallet at issuance.
            wallet_defaults: {
                contracted_total: Number(_state.billingContractedTotal),
                rate_per_second: Number(_state.billingRatePerSecond),
                max_per_request: Number(_state.billingMaxPerRequest),
            },
        };
    }
    try {
        const sliceManagerPath = '../../../core/radar/sliceManager.js';
        const mod = await import(/* @vite-ignore */ sliceManagerPath);
        if (typeof mod.createSlice !== 'function') {
            throw new Error('createSlice not implemented yet (Phase 1-4 pending)');
        }
        const slice = await mod.createSlice({
            radarId: _state.radarId,
            projectId: _state.projectId,
            name: _state.sliceName,
            profileId: _state.profileId,
            includePaths,
            excludePaths,
            temporalFilter,
            spatialFilter,
            redaction: null,
            rateLimit: null,
            billing,
            expiresAt: null,
        });
        const slug = (slice && (slice.slug || slice.id)) || 'unknown';
        _state.generatedSliceSlug = String(slug);
        // Token preview is just a placeholder — real signing happens in edge function.
        const tokenPreview = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ slice: slug, exp: Date.now() + 86400000 })).replace(/=+$/, '')}.PREVIEW`;
        _state.generatedUrl = `https://ecbyts.com/api/radar?token=${tokenPreview}&slice=${encodeURIComponent(String(slug))}`;
        showToast(tr('radarSlice.created', 'Slice criada com sucesso'), 'success');
        renderBody4Live();
    } catch (e: any) {
        showToast(`Slice: ${errorMessage(e)}`, 'error');
    }
}
function renderBody4Live() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const body = modal.querySelector('.rsw-body');
    if (body) body.innerHTML = renderBody();
    attachStepHandlers();
}
function attachStepHandlers() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal || !_state) return;
    const on = (sel: any, ev: any, cb: any) => {
        const el = modal.querySelector(sel);
        if (el) el.addEventListener(ev, cb);
    };
    if (_state.step === 1) {
        on('.rsw-profile-select', 'change', () => {
            const dialog = modal.querySelector('.ecbt-dialog');
            if (dialog) syncStateFromDOM(dialog);
            renderBody4Live();
        });
    } else if (_state.step === 4) {
        on('.rsw-generate', 'click', () => handleGenerate());
        on('.rsw-copy-url', 'click', () => {
            if (!_state || !_state.generatedUrl) return;
            try {
                navigator.clipboard.writeText(_state.generatedUrl);
                showToast(tr('radarSlice.copied', 'URL copiada'), 'success');
            } catch (e: any) {
                showToast(`Clipboard: ${errorMessage(e)}`, 'error');
            }
        });
        on('.rsw-email-url', 'click', () => {
            if (!_state || !_state.generatedUrl) return;
            const subject = encodeURIComponent(tr('radarSlice.emailSubject', 'Seu acesso ao Radar ECBT'));
            const body = encodeURIComponent(_state.generatedUrl);
            window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
        });
    }
}
function rerenderShell() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const indicator = modal.querySelector('.rsw-steps-wrap');
    if (indicator) indicator.innerHTML = renderStepIndicator();
    const body = modal.querySelector('.rsw-body');
    if (body) body.innerHTML = renderBody();
    const nav = modal.querySelector('.rsw-nav-wrap');
    if (nav) nav.innerHTML = renderNav();
    attachShellHandlers();
    attachStepHandlers();
}
function attachShellHandlers() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const cancel = modal.querySelector('.rsw-cancel');
    if (cancel) cancel.addEventListener('click', () => closeSliceCreatorWizard());
    const back = modal.querySelector('.rsw-back');
    if (back) {
        back.addEventListener('click', () => {
            if (!_state) return;
            const dialog = modal.querySelector('.ecbt-dialog');
            if (dialog) syncStateFromDOM(dialog);
            if (_state.step > 1) {
                _state.step -= 1;
                rerenderShell();
            }
        });
    }
    const next = modal.querySelector('.rsw-next');
    if (next) {
        next.addEventListener('click', () => {
            if (!_state) return;
            const dialog = modal.querySelector('.ecbt-dialog');
            if (dialog) syncStateFromDOM(dialog);
            const validation = _validateWizardData(_state.step, _state);
            if (!validation.ok) {
                reportErrors(validation.errors);
                return;
            }
            if (_state.step < TOTAL_STEPS) {
                _state.step += 1;
                rerenderShell();
            } else {
                // Last step "Finish" = close if URL generated, otherwise trigger generate
                if (_state.generatedUrl) {
                    closeSliceCreatorWizard();
                } else {
                    handleGenerate();
                }
            }
        });
    }
}
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Open the 4-step Slice Creator Wizard.
 *
 * @param {{ radarId: string, projectId: string, initialStep?: number }} opts
 * @returns {Promise<void>}
 */
export async function openSliceCreatorWizard(opts: any) {
    if (!opts || !opts.radarId || !opts.projectId) {
        showToast(tr('radarSlice.errMissingIds', 'radarId/projectId ausentes'), 'error');
        return;
    }
    _state = freshState();
    _state.radarId = opts.radarId;
    _state.projectId = opts.projectId;
    if (
        Number.isInteger(opts.initialStep) &&
        opts.initialStep &&
        opts.initialStep >= 1 &&
        opts.initialStep <= TOTAL_STEPS
    ) {
        _state.step = opts.initialStep;
    }
    await Promise.all([loadProfiles(), loadDefaultCosts()]);
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'ecbt-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML =
            '<div class="ecbt-dialog ecbt-dialog--xl" style="max-width:880px">' +
            '<div class="rsw-header">' +
            `<h2 style="margin:0">${escapeHtml(tr('radarSlice.title', 'Criar Slice de Dados'))}</h2>` +
            '<button class="ecbt-btn rsw-close-x" aria-label="close" style="padding:4px 10px">&times;</button>' +
            '</div>' +
            '<div class="rsw-steps-wrap"></div>' +
            '<div class="rsw-body"></div>' +
            '<div class="rsw-nav-wrap"></div>' +
            '<style>' +
            '.rsw-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }' +
            '.rsw-steps { display:flex; gap:8px; margin-bottom:16px; }' +
            '.rsw-step { padding:4px 10px; border-radius:14px; font-size:11px; background:rgba(255,255,255,0.05); color:var(--text-tertiary,#888); border:1px solid rgba(255,255,255,0.08); }' +
            '.rsw-step--done { background:rgba(34,197,94,0.12); color:#22c55e; border-color:rgba(34,197,94,0.3); }' +
            '.rsw-step--active { background:rgba(96,165,250,0.18); color:#60a5fa; border-color:rgba(96,165,250,0.4); font-weight:600; }' +
            '.rsw-step-title { margin:0 0 6px; font-size:15px; }' +
            '.rsw-step-desc { color:var(--text-tertiary,#888); font-size:12px; margin:0 0 14px; }' +
            '.rsw-field { margin-bottom:12px; }' +
            '.rsw-field label { display:block; font-size:12px; font-weight:600; margin-bottom:4px; }' +
            '.rsw-checkbox-label { display:flex; align-items:center; gap:6px; font-weight:500 !important; }' +
            '.rsw-input { width:100%; padding:6px 8px; border-radius:4px; background:var(--bg-primary,#121220); border:1px solid var(--border-color,#444); color:var(--text-primary,#fff); font-size:12px; box-sizing:border-box; }' +
            '.rsw-input:focus { outline:1px solid var(--accent,#60a5fa); }' +
            '.rsw-row { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }' +
            '.rsw-row--4 { grid-template-columns:repeat(4,1fr); }' +
            '.rsw-sublabel { display:block; font-size:10px; color:var(--text-tertiary,#888); margin-bottom:2px; }' +
            '.rsw-profile-badge { padding:8px 10px; border-radius:6px; display:flex; align-items:center; gap:8px; font-size:12px; margin-top:8px; }' +
            '.rsw-profile-icon { font-size:16px; }' +
            '.rsw-empty { padding:14px; text-align:center; color:var(--text-tertiary,#888); border:1px dashed rgba(255,255,255,0.1); border-radius:6px; font-size:12px; }' +
            '.rsw-empty-cell { text-align:center; color:var(--text-tertiary,#888); padding:10px; font-style:italic; }' +
            '.rsw-summary-table, .rsw-costs-table { width:100%; border-collapse:collapse; font-size:11px; margin-top:6px; }' +
            '.rsw-summary-table th, .rsw-summary-table td, .rsw-costs-table th, .rsw-costs-table td { padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.06); text-align:left; }' +
            '.rsw-summary-table th { width:140px; color:var(--text-tertiary,#888); font-weight:500; }' +
            '.rsw-costs-table th { background:rgba(255,255,255,0.04); font-size:10px; text-transform:uppercase; color:var(--text-tertiary,#888); }' +
            '.rsw-url-block { margin-top:12px; padding:10px; border:1px solid rgba(34,197,94,0.3); border-radius:6px; background:rgba(34,197,94,0.05); }' +
            '.rsw-url-input { font-family:monospace; font-size:11px; margin-bottom:8px; }' +
            '.rsw-url-actions { display:flex; gap:8px; }' +
            '.rsw-nav { display:flex; gap:8px; margin-top:16px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.08); }' +
            '.rsw-nav-spacer { flex:1; }' +
            '</style>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeSliceCreatorWizard();
        });
        const x = modal.querySelector('.rsw-close-x');
        if (x) x.addEventListener('click', closeSliceCreatorWizard);
    }
    /** @type {HTMLElement} */ (modal).style.display = 'flex';
    rerenderShell();
}
export function closeSliceCreatorWizard() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) /** @type {HTMLElement} */ (modal).style.display = 'none';
    _state = null;
}
export function _resetForTests() {
    _state = null;
    _profilesCache = [];
    _defaultCosts = {};
}
