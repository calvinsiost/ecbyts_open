// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   DATA STUDIO — Aba Extração (Extraction Panel)
   Hub de entrada de dados: EDD Wizard, Entrada Manual, Sensores IoT.
   Redireciona para fluxos existentes — não duplica lógica.
   SPEC_DATA_STUDIO_ETLC_REFRAME §7.2
   ================================================================ */
import { t } from '../i18n/translations.js';
/**
 * Build the Extraction (Extração) panel DOM.
 * Returns a section element - caller appends to the module panel container.
 *
 * @returns {HTMLElement}
 */
export function buildExtractionPanel() {
    const wrap = document.createElement('section');
    wrap.className = 'ds-extraction-panel ds-module-shell';
    wrap.setAttribute('aria-labelledby', 'ds-extraction-title');
    const title = document.createElement('h3');
    title.id = 'ds-extraction-title';
    title.className = 'ds-module-title';
    title.textContent = t('dataStudio.extractionTitle') || 'Extração de Dados';
    wrap.appendChild(title);
    // Status bar - última campanha
    const status = document.createElement('div');
    status.className = 'ds-extraction-status';
    status.id = 'ds-extraction-status';
    _refreshStatusBar(status);
    wrap.appendChild(status);
    // Cards
    const cards = document.createElement('div');
    cards.className = 'ds-extraction-cards';
    cards.setAttribute('role', 'list');
    cards.appendChild(_buildCard({
        icon: '&#x1F4E5;',
        title: t('dataStudio.openEddWizard') || 'Importar EDD / XLSX',
        desc: t('dataStudio.openEddWizardDesc') || 'Importe dados laboratoriais de planilha',
        handler: () => {
            if (typeof window.handleOpenIngestionWizard === 'function') {
                window.handleOpenIngestionWizard();
            }
            else {
                // Lazy fallback — ingestionWizard.js is optional and not always present.
                // Path computed at runtime to keep typechecker tolerant of missing module.
                const wizardPath = '../ui/ingestionWizard.js';
                import(/* @vite-ignore */ wizardPath)
                    .then((mod) => mod?.openIngestionWizard?.())
                    .catch((e) => console.error('[ecbyts:extraction] EDD wizard failed:', e));
            }
        },
    }));
    cards.appendChild(_buildCard({
        icon: '&#x270E;',
        title: t('dataStudio.openManualEntry') || 'Entrada Manual',
        desc: t('dataStudio.openManualEntryDesc') || 'Lance observações diretamente',
        handler: () => {
            if (typeof window.handleOpenDataEntryMatrix === 'function') {
                window.handleOpenDataEntryMatrix();
            }
            else {
                import('../ui/dataEntryMatrix.js' as string)
                    .then(({ openDataEntryMatrix }) => openDataEntryMatrix?.())
                    .catch((e) => console.error('[ecbyts:extraction] manual entry failed:', e));
            }
        },
    }));
    cards.appendChild(_buildCard({
        icon: '&#x1F4E1;',
        title: t('dataStudio.openSensors') || 'Sensores IoT',
        desc: t('dataStudio.openSensorsDesc') || 'Conecte sensores para dados em tempo real',
        handler: () => {
            if (typeof window.handleOpenSensorCenter === 'function') {
                window.handleOpenSensorCenter();
            }
            else {
                import('../ui/tabs.js' as string)
                    .then(({ activateTabById }) => activateTabById?.('sensor'))
                    .catch((e) => console.error('[ecbyts:extraction] sensor center failed:', e));
            }
        },
    }));
    wrap.appendChild(cards);
    return wrap;
}
/** @deprecated use buildExtractionPanel */
export const buildIntakePanel = buildExtractionPanel;
/**
 * Build a single action card.
 * @param {{ icon: string, title: string, desc: string, handler: Function }} opts
 * @returns {HTMLElement}
 */
function _buildCard({ icon, title, desc, handler }: any) {
    const card = document.createElement('article');
    card.className = 'ds-extraction-card';
    card.setAttribute('role', 'listitem');
    const iconEl = document.createElement('span');
    iconEl.className = 'ds-extraction-card-icon';
    iconEl.innerHTML = icon;
    iconEl.setAttribute('aria-hidden', 'true');
    card.appendChild(iconEl);
    const titleEl = document.createElement('h4');
    titleEl.className = 'ds-extraction-card-title';
    titleEl.textContent = title;
    card.appendChild(titleEl);
    const descEl = document.createElement('p');
    descEl.className = 'ds-extraction-card-desc';
    descEl.textContent = desc;
    card.appendChild(descEl);
    const btn = document.createElement('button');
    btn.className = 'btn-sm ds-extraction-card-btn ds-module-action-primary';
    btn.type = 'button';
    btn.textContent = 'Abrir ►';
    btn.addEventListener('click', () => {
        try {
            handler();
        }
        catch (e: any) {
            console.error('[ecbyts:extraction] card handler error:', e);
        }
    });
    card.appendChild(btn);
    return card;
}
/**
 * Populate the extraction status bar with the most recent campaign.
 * Falls back to a friendly empty state.
 * @param {HTMLElement} el
 */
function _refreshStatusBar(el: any) {
    try {
        const getAllCampaigns = typeof window.getAllCampaigns === 'function' ? window.getAllCampaigns : null;
        if (!getAllCampaigns) {
            _setStatusEmpty(el);
            return;
        }
        const campaigns = getAllCampaigns();
        if (!campaigns || !campaigns.length) {
            _setStatusEmpty(el);
            return;
        }
        const sorted = [...campaigns].sort((a: any, b: any) => {
            const ta = a.openedAt || a.createdAt || 0;
            const tb = b.openedAt || b.createdAt || 0;
            return tb > ta ? 1 : tb < ta ? -1 : 0;
        });
        const latest = sorted[0];
        const obsCount = (latest.observations || []).length;
        const dateStr = _relativeTime(latest.openedAt || latest.createdAt);
        const tmpl = t('dataStudio.lastExtraction') || 'Última extração: {title} — {count} obs · {timeAgo}';
        el.textContent = tmpl
            .replace('{title}', latest.title || latest.id || '?')
            .replace('{count}', obsCount)
            .replace('{timeAgo}', dateStr);
    }
    catch (_e: any) {
        _setStatusEmpty(el);
    }
}
/**
 * @param {HTMLElement} el
 */
function _setStatusEmpty(el: any) {
    el.textContent = t('dataStudio.noExtractions') || 'Nenhuma extração registrada. Comece pela importação EDD.';
}
/**
 * Simple relative time formatter.
 * @param {number|string} ts - timestamp or ISO string
 * @returns {string}
 */
function _relativeTime(ts: any) {
    if (!ts)
        return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)
        return 'agora';
    if (mins < 60)
        return `há ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
        return `há ${hours}h`;
    return `há ${Math.floor(hours / 24)} dias`;
}
