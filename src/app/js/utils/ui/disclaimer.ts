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

/**
 * Disclaimer & Terms of Use - consent modal + persistent footer.
 * Modal de consentimento no primeiro acesso e rodape persistente com
 * credito de autoria da plataforma.
 *
 * - Primeiro acesso: modal obrigatorio (sem fechar por X, Escape ou overlay)
 * - Acessos seguintes: footer clicavel abre modal informativo (fechavel)
 */

import { t } from '../i18n/translations.js';
import { openModal, closeModal } from './modals.js';
import { safeSetItem } from '../storage/storageMonitor.js';

const STORAGE_KEY = 'ecbyts-terms-accepted';
const MODAL_ID = 'disclaimer-modal';

let _consentMode = false;
let _escapeBlocker: ((e: KeyboardEvent) => void) | null = null;

/* ── helpers ────────────────────────────────────────────────────── */

/** Popula o footer persistente com texto traduzido. */
function _populateFooter(): void {
    const txt = document.getElementById('disclaimer-footer-text');
    const link = document.getElementById('disclaimer-footer-link');
    if (txt) txt.textContent = t('disclaimerFooterCredit');
    if (link) link.textContent = t('disclaimerTermsLink');
}

/** Monta o HTML do corpo do modal com todas as secoes traduzidas. */
function _populateDisclaimerContent(): void {
    const body = document.getElementById('disclaimer-body');
    if (!body) return;
    body.innerHTML = `
        <p>${t('disclaimerCredit')}</p>
        <p>${t('disclaimerTermsIntro')}</p>
        <ul>
            <li><strong>${t('disclaimerUseGeneralTitle')}:</strong> ${t('disclaimerUseGeneral')}</li>
            <li><strong>${t('disclaimerUseRiskTitle')}:</strong> ${t('disclaimerUseRisk')}</li>
            <li><strong>${t('disclaimerAccuracyTitle')}:</strong> ${t('disclaimerAccuracy')}</li>
            <li><strong>${t('disclaimerModificationsTitle')}:</strong> ${t('disclaimerModifications')}</li>
            <li><strong>${t('disclaimerLicenseTitle')}:</strong> ${t('disclaimerLicense')}
                <a href="https://www.gnu.org/licenses/agpl-3.0.txt" target="_blank" rel="noopener">${t('disclaimerLicenseLink')}</a>.</li>
            <li><strong>${t('disclaimerTechDocTitle')}:</strong> ${t('disclaimerTechDoc')}
                <a href="/docs/Especificacao_Tecnica_Modelo_Dados_Ambientais.docx" download>${t('disclaimerTechDocDownload')}</a>.</li>
            <li><strong>${t('disclaimerSubstackTitle')}:</strong> ${t('disclaimerSubstack')}
                <a href="https://substack.com/@calviniost" target="_blank" rel="noopener">${t('disclaimerSubstackLink')}</a>.</li>
        </ul>
        <p><strong>${t('disclaimerFooterClause')}</strong></p>
    `;
}

/**
 * Configura botoes do footer do modal conforme o modo.
 */
function _setModalButtons(consent: boolean): void {
    const footer = document.getElementById('disclaimer-footer-buttons');
    if (!footer) return;
    if (consent) {
        footer.innerHTML = `<button class="disclaimer-agree-btn" data-cc-action="cc-d3b282b2">${t('disclaimerAgree')}</button>`;
    } else {
        footer.innerHTML = `<button class="disclaimer-close-btn" data-cc-call-click="closeModal|s:${encodeURIComponent(`${MODAL_ID}`)}">${t('disclaimerClose')}</button>`;
    }
}

/**
 * Bloqueia Escape enquanto modal de consentimento esta aberto.
 */
function _blockEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
    }
}

/* ── consent mode ───────────────────────────────────────────────── */

function _openConsentMode(): void {
    _consentMode = true;
    // Esconde botao X do header
    const closeBtn = document.getElementById('disclaimer-close-btn');
    if (closeBtn) closeBtn.style.display = 'none';
    _populateDisclaimerContent();
    _setModalButtons(true);
    // Bloqueia Escape (capture phase para interceptar antes de tudo)
    _escapeBlocker = _blockEscape;
    document.addEventListener('keydown', _escapeBlocker, true);
    openModal(MODAL_ID);
}

function _closeConsentMode(): void {
    _consentMode = false;
    closeModal(MODAL_ID);
    // Remove bloqueio de Escape
    if (_escapeBlocker) {
        document.removeEventListener('keydown', _escapeBlocker, true);
        _escapeBlocker = null;
    }
    // Restaura botao X para futuras aberturas manuais
    const closeBtn = document.getElementById('disclaimer-close-btn');
    if (closeBtn) closeBtn.style.display = '';
}

/* ── public API ─────────────────────────────────────────────────── */

/**
 * Abre o modal em modo informativo (com X e botao Fechar).
 * Chamado pelo link no footer apos termos ja aceitos.
 */
export function openDisclaimer(): void {
    _consentMode = false;
    const closeBtn = document.getElementById('disclaimer-close-btn');
    if (closeBtn) closeBtn.style.display = '';
    _populateDisclaimerContent();
    _setModalButtons(false);
    openModal(MODAL_ID);
}

/**
 * Inicializa o sistema de disclaimer.
 * - Popula footer
 * - Checa localStorage e abre modal de consentimento se necessario
 * - Registra handlers globais e listener de idioma
 */
export function initDisclaimer(): void {
    _populateFooter();
    // Registra handlers no window
    (window as any).handleOpenDisclaimer = openDisclaimer;
    (window as any)._handleDisclaimerAgree = () => {
        safeSetItem(STORAGE_KEY, 'true');
        _closeConsentMode();
        // Pulsa o botao de tour na titlebar para guiar o novo usuario
        const tourBtn = document.getElementById('tour-titlebar-btn');
        if (tourBtn) {
            tourBtn.classList.add('tour-first-visit');
            setTimeout(() => tourBtn.classList.remove('tour-first-visit'), 8000);
        }
    };
    // Bloqueia overlay click no modal de disclaimer quando em consent
    const overlay = document.getElementById(MODAL_ID);
    if (overlay) {
        overlay.addEventListener('click', (e: Event) => {
            if (_consentMode && e.target === overlay) {
                e.stopPropagation();
            }
        });
    }
    // Checa se precisa mostrar consentimento
    const accepted = (localStorage.getItem(STORAGE_KEY) || '') === 'true';
    if (!accepted) {
        _openConsentMode();
    }
    // Re-popula textos ao trocar idioma
    window.addEventListener('languageChanged', () => {
        _populateFooter();
        // Se modal esta aberto, atualiza conteudo
        const modal = document.getElementById(MODAL_ID);
        if (modal && modal.classList.contains('active')) {
            _populateDisclaimerContent();
            _setModalButtons(_consentMode);
        }
    });
}
