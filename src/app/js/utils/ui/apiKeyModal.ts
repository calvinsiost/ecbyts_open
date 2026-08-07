// @ts-check
// Generated from src/app/js/utils/ui/apiKeyModal.ts by TS-MIGRATION-001. Do not edit manually.
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
   API KEY MODAL — Fase 2 Freemium
   Gerenciamento de chaves de API para acesso programático (MCP)

   FUNCIONALIDADES:
   - Lista chaves existentes (ativas e revogadas)
   - Botão "Generate New Key": solicita nome, gera, exibe UMA vez
   - Geração: caixa destacada com chave + botão "Copy" + checkbox
     "I've saved my key" + botão "Done" (desabilitado até checkbox)
   - Revogação: botão "Revoke" em cada chave ativa
   ================================================================ */
import { generateApiKey, revokeApiKey, listApiKeys } from '../cloud/apiKeys.js';
import { getCurrentUser } from '../auth/session.js';
import { showToast } from './toast.js';
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let _escHandler: ((e: KeyboardEvent) => void) | null = null;
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Open the API Keys management modal.
 * Abre o modal de gerenciamento de chaves de API.
 */
export async function openApiKeyModal() {
    if (!document.getElementById('api-key-modal')) {
        _injectModal();
    }
    const modal = document.getElementById('api-key-modal') as HTMLElement | null;
    if (!modal)
        return;
    modal.style.display = 'flex';
    _renderKeyList(null, undefined); // mostra "loading" enquanto carrega
    await _loadAndRenderKeys();
    if (_escHandler) document.removeEventListener('keydown', _escHandler);
    _escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeApiKeyModal();
    };
    document.addEventListener('keydown', _escHandler);
}
/**
 * Close the API Keys modal.
 * Fecha o modal de gerenciamento de chaves de API.
 */
export function closeApiKeyModal() {
    const modal = document.getElementById('api-key-modal') as HTMLElement | null;
    if (modal) modal.style.display = 'none';
    if (_escHandler) {
        document.removeEventListener('keydown', _escHandler);
        _escHandler = null;
    }
    // Limpa estado de nova chave se ainda exibida
    _clearNewKeyBox();
}
// ----------------------------------------------------------------
// INTERNAL - RENDER
// ----------------------------------------------------------------
/**
 * Load keys from Supabase and render the list.
 */
async function _loadAndRenderKeys() {
    if (!getCurrentUser()) {
        _renderKeyList([], undefined);
        return;
    }
    try {
        const keys = await listApiKeys();
        _renderKeyList(keys, undefined);
    } catch (e: any) {
        console.error('[ecbyts] apiKeyModal load error:', e);
        _renderKeyList([], e?.message);
    }
}
/**
 * Render the key list into #api-key-list.
 * @param {Array<any>|null} keys - null = loading
 * @param {string} [error]
 */
function _renderKeyList(keys: any[] | null, error?: string) {
    const container = /** @type {any} */ (document.getElementById('api-key-list'));
    if (!container) return;
    if (keys === null) {
        container.innerHTML = `<div class="api-key-empty">${t('loading') || 'Loading...'}</div>`;
        return;
    }
    if (error) {
        container.innerHTML = `<div class="api-key-empty api-key-error">${escapeHtml(error)}</div>`;
        return;
    }
    if (!getCurrentUser()) {
        container.innerHTML = `<div class="api-key-empty">${t('apiKey.loginRequired') || 'Login required to manage API keys.'}</div>`;
        return;
    }
    if (keys.length === 0) {
        container.innerHTML = `<div class="api-key-empty">${t('apiKey.noKeys') || 'No API keys yet. Generate one to get started.'}</div>`;
        return;
    }
    const rows = keys.map((k: any) => {
        const isRevoked = !!k.revoked_at;
        const revokedClass = isRevoked ? ' api-key-row--revoked' : '';
        const lastUsed = k.last_used ? new Date(k.last_used).toLocaleDateString() : t('apiKey.never') || 'Never';
        const createdAt = new Date(k.created_at).toLocaleDateString();
        const statusLabel = isRevoked
            ? `<span class="api-key-badge api-key-badge--revoked">${t('apiKey.revoked') || 'Revoked'}</span>`
            : `<span class="api-key-badge api-key-badge--active">${t('apiKey.active') || 'Active'}</span>`;
        const revokeBtn = isRevoked
            ? ''
            : `
            <button class="btn btn-sm btn-danger api-key-revoke-btn"
                    data-cc-call-click="_apiKeyRevoke|j:${encodeURIComponent(String(JSON.stringify(k.id)))}">
                ${t('apiKey.revoke') || 'Revoke'}
            </button>`;
        return `
        <div class="api-key-row${revokedClass}">
            <div class="api-key-row-info">
                <span class="api-key-name">${escapeHtml(k.name || 'API Key')}</span>
                <span class="api-key-prefix">${escapeHtml(k.prefix)}...</span>
                ${statusLabel}
            </div>
            <div class="api-key-row-meta">
                <span>${t('apiKey.created') || 'Created'}: ${createdAt}</span>
                <span>${t('apiKey.lastUsed') || 'Last used'}: ${lastUsed}</span>
            </div>
            <div class="api-key-row-actions">
                ${revokeBtn}
            </div>
        </div>`;
    });
    container.innerHTML = rows.join('');
}
/**
 * Show the "new key" box with the generated key.
 * @param {string} fullKey
 */
function _showNewKeyBox(fullKey: string) {
    const box = document.getElementById('api-key-new-box') as HTMLElement | null;
    const keyDisplay = document.getElementById('api-key-new-value') as HTMLInputElement | null;
    const doneBtn = document.getElementById('api-key-done-btn') as HTMLButtonElement | null;
    const savedCheckbox = document.getElementById('api-key-saved-checkbox') as HTMLInputElement | null;
    if (!box || !keyDisplay) return;
    keyDisplay.value = fullKey;
    if (doneBtn) doneBtn.disabled = true;
    if (savedCheckbox) savedCheckbox.checked = false;
    box.style.display = 'block';
}
/**
 * Clear and hide the new key box.
 */
function _clearNewKeyBox() {
    const box = document.getElementById('api-key-new-box') as HTMLElement | null;
    const keyDisplay = document.getElementById('api-key-new-value') as HTMLInputElement | null;
    if (box) box.style.display = 'none';
    if (keyDisplay) keyDisplay.value = '';
}
// ----------------------------------------------------------------
// INTERNAL - ACTIONS (exposed on window for onclick attributes)
// ----------------------------------------------------------------
/**
 * Handle "Generate New Key" button.
 * Solicita nome, chama generateApiKey(), exibe resultado.
 */
window._apiKeyGenerate = async function () {
    const nameInput = document.getElementById('api-key-name-input') as HTMLInputElement | null;
    const name = nameInput?.value?.trim() || 'API Key';
    const generateBtn = document.getElementById('api-key-generate-btn') as HTMLButtonElement | null;
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.textContent = t('apiKey.generating') || 'Generating...';
    }
    try {
        const fullKey = await generateApiKey(name);
        _showNewKeyBox(fullKey);
        if (nameInput) nameInput.value = '';
        // Recarrega lista para refletir nova chave
        await _loadAndRenderKeys();
    } catch (e: any) {
        showToast(e?.message || t('apiKey.generateError') || 'Error generating key', 'error');
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = t('apiKey.generate') || 'Generate New Key';
        }
    }
};
/**
 * Handle "Copy" button next to new key.
 */
window._apiKeyCopy = function () {
    const keyDisplay = document.getElementById('api-key-new-value') as HTMLInputElement | null;
    if (!keyDisplay?.value) return;
    navigator.clipboard
        .writeText(keyDisplay.value)
        .then(() => {
            showToast(t('apiKey.copied') || 'Key copied to clipboard', 'success');
        })
        .catch(() => {
            // Fallback para browsers sem clipboard API
            keyDisplay.select();
            document.execCommand('copy');
            showToast(t('apiKey.copied') || 'Key copied to clipboard', 'success');
        });
};
/**
 * Handle checkbox "I've saved my key" - enables Done button.
 */
window._apiKeySavedChange = function (checkbox: HTMLInputElement) {
    const doneBtn = document.getElementById('api-key-done-btn') as HTMLButtonElement | null;
    if (doneBtn) doneBtn.disabled = !checkbox.checked;
};
/**
 * Handle "Done" button - hides new key box.
 */
window._apiKeyDone = function () {
    _clearNewKeyBox();
};
/**
 * Handle "Revoke" button for a key.
 * @param {string} keyId
 */
window._apiKeyRevoke = async function (keyId: string) {
    const confirmed = await _confirmRevoke();
    if (!confirmed) return;
    try {
        await revokeApiKey(keyId);
        showToast(t('apiKey.revokeSuccess') || 'API key revoked', 'success');
        await _loadAndRenderKeys();
    } catch (e: any) {
        showToast(e?.message || t('apiKey.revokeError') || 'Error revoking key', 'error');
    }
};
/**
 * Confirm dialog for revoke action (uses gold-standard asyncConfirm).
 * @returns {Promise<boolean>}
 */
async function _confirmRevoke() {
    const { asyncConfirm } = await import('./asyncDialogs.js');
    return asyncConfirm(
        t('apiKey.revokeConfirm') || 'Revogar esta chave de API? Esta ação não pode ser desfeita.',
        /** @type {any} */ ({
            confirmLabel: t('revoke') || 'Revogar',
            cancelLabel: t('cancel') || 'Cancelar',
            danger: true,
        }),
    );
}
// ----------------------------------------------------------------
// INTERNAL - MODAL INJECTION
// ----------------------------------------------------------------
/**
 * Inject modal HTML into document.body (criado apenas uma vez).
 */
function _injectModal() {
    const div = document.createElement('div');
    div.innerHTML = `
<div id="api-key-modal" class="usage-dashboard-overlay" style="display:none;"
     role="dialog" aria-modal="true" aria-label="${escapeHtml(t('apiKey.title') || 'API Keys')}">
    <div class="usage-dashboard-modal api-key-modal-content">

        <!-- Header -->
        <div class="usage-dashboard-header">
            <h3 class="usage-dashboard-title">${t('apiKey.title') || 'API Keys'}</h3>
            <button class="usage-dashboard-close" data-cc-action="cc-708bf89a"
                    aria-label="${escapeHtml(t('close') || 'Close')}">&#10005;</button>
        </div>

        <!-- Description -->
        <p class="api-key-description">
            ${escapeHtml(t('apiKey.description') || 'API keys allow external tools (MCP, integrations) to authenticate with ecbyts on your behalf.')}
        </p>

        <!-- Generate form -->
        <div class="api-key-generate-form">
            <input data-field-meta="true" data-field-meta-key="auto:api-key-name-input" type="text" id="api-key-name-input"
                   class="form-input form-input-sm"
                   maxlength="64"
                   placeholder="${escapeHtml(t('apiKey.namePlaceholder') || 'Key name (e.g. Claude Desktop)')}"
                   style="flex:1;">
            <button id="api-key-generate-btn" class="btn btn-primary btn-sm"
                    data-cc-action="cc-7bd90b0d">
                ${t('apiKey.generate') || 'Generate New Key'}
            </button>
        </div>

        <!-- New key reveal box (hidden until key is generated) -->
        <div id="api-key-new-box" class="api-key-new-box" style="display:none;">
            <p class="api-key-new-warning">
                <strong>${t('apiKey.saveWarning') || 'Save this key now — it will not be shown again.'}</strong>
            </p>
            <div class="api-key-new-row">
                <input data-field-meta="true" data-field-meta-key="auto:api-key-new-value" type="text" id="api-key-new-value" class="form-input api-key-value-input"
                       readonly aria-label="${escapeHtml(t('apiKey.keyValue') || 'Generated API key')}">
                <button class="btn btn-sm btn-secondary" data-cc-action="cc-676a3c8f">
                    ${t('apiKey.copy') || 'Copy'}
                </button>
            </div>
            <label class="api-key-confirm-label">
                <input data-field-meta="true" data-field-meta-key="auto:api-key-saved-checkbox" type="checkbox" id="api-key-saved-checkbox"
                       data-cc-change="cc-906e1243">
                ${t('apiKey.savedConfirm') || "I've saved my key"}
            </label>
            <button id="api-key-done-btn" class="btn btn-sm btn-primary"
                    data-cc-action="cc-9e62b98e" disabled>
                ${t('apiKey.done') || 'Done'}
            </button>
        </div>

        <!-- Key list -->
        <div class="api-key-list-header">
            <span class="usage-dashboard-label">${t('apiKey.yourKeys') || 'Your API Keys'}</span>
        </div>
        <div id="api-key-list" class="api-key-list" role="list">
            <div class="api-key-empty">${t('loading') || 'Loading...'}</div>
        </div>

        <!-- Footer -->
        <div class="usage-dashboard-footer">
            <button class="btn btn-sm btn-secondary" data-cc-action="cc-708bf89a">
                ${t('close') || 'Close'}
            </button>
        </div>
    </div>
</div>`;
    if (div.firstElementChild)
        document.body.appendChild(div.firstElementChild);
    _injectStyles();
}
/**
 * Inject scoped CSS for the API key modal.
 * Reutiliza variáveis CSS do design system existente.
 */
function _injectStyles() {
    // Styles now in css/api-key.css - no-op stub kept for call-site compatibility
}
//# sourceMappingURL=apiKeyModal.js.map
