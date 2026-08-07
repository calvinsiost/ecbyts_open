// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/utils/ui/launchpad/feed.js
// V3 Phase 2: feed cronológico "Situação atual" do Launchpad.
// Fontes (ordem de prioridade):
//   1. Alertas de compliance (severity=critical - fixos no topo)
//   2. Audit trail recente (últimos N)
//   3. Ingestion events (staging)
//   4. Autosave eventos
//
// Design: critical fixos no topo + timeline cronológica abaixo.
// Max 5 no fold; "ver todos (N)" abre drawer - Phase 2 entrega só
// os 5 do fold.


import { CONFIG } from '../../../config.js';
import { t } from '../../i18n/translations.js';
import { escapeHtml } from '../../helpers/html.js';

let _feedEl: any = null;
let _rendering = false;

const MAX_ITEMS_IN_FOLD = 5;

/**
 * Ensure feed container within a parent (idempotent).
 */
export function ensureFeedContainer(parent: any) {
    if (!CONFIG.FEATURES?.LAUNCHPAD_V3_FEED) return null;
    if (!parent) return null;
    let el = parent.querySelector('#launchpad-feed');
    if (!el) {
        el = document.createElement('section');
        el.id = 'launchpad-feed';
        el.className = 'launchpad-feed';
        el.setAttribute('data-testid', 'launchpad-feed');
        el.setAttribute('role', 'region');
        el.setAttribute('aria-label', t('launchpad.feed.aria') || 'Current situation');
        parent.appendChild(el);
    }
    _feedEl = el;
    return el;
}

/**
 * Render feed - main entry point.
 */
export async function renderFeed() {
    if (!CONFIG.FEATURES?.LAUNCHPAD_V3_FEED) return;
    if (!_feedEl || _rendering) return;
    _rendering = true;
    try {
        const items = await collectFeedItems();
        if (!items.length) {
            _feedEl.innerHTML = `
                <h3 class="launchpad-feed-title">${escapeHtml(t('launchpad.feed.title') || 'Current situation')}</h3>
                <p class="launchpad-feed-empty">${escapeHtml(t('launchpad.feed.empty') || 'No recent activity.')}</p>
            `;
            return;
        }
        const criticals = items.filter((i: any) => i.severity === 'critical');
        const rest = items
            .filter((i: any) => i.severity !== 'critical')
            .slice(0, Math.max(0, MAX_ITEMS_IN_FOLD - criticals.length));

        _feedEl.innerHTML = `
            <h3 class="launchpad-feed-title">${escapeHtml(t('launchpad.feed.title') || 'Current situation')}</h3>
            <ul class="launchpad-feed-list" data-testid="launchpad-feed-list">
                ${[...criticals, ...rest].map(_renderItem).join('')}
            </ul>
        `;
    } catch (/** @type {any} */ e) {
        console.debug('[launchpad:feed] render failed:', (e as any)?.message);
    } finally {
        _rendering = false;
    }
}

function _renderItem(item: any) {
    const severity = item.severity || 'info';
    const when = _formatRelativeTime(item.timestamp);
    const title = escapeHtml(item.title || '');
    const detail = escapeHtml(item.detail || '');
    return `
        <li class="launchpad-feed-item launchpad-feed-${severity}" data-testid="launchpad-feed-item"
            data-source="${escapeHtml(item.source || 'unknown')}">
            <span class="launchpad-feed-dot" aria-hidden="true"></span>
            <div class="launchpad-feed-content">
                <div class="launchpad-feed-item-title">${title}</div>
                ${detail ? `<div class="launchpad-feed-item-detail">${detail}</div>` : ''}
                <div class="launchpad-feed-item-meta">
                    <span class="launchpad-feed-item-when">${escapeHtml(when)}</span>
                    <span class="launchpad-feed-item-source">${escapeHtml(item.source || '')}</span>
                </div>
            </div>
        </li>
    `;
}

function _formatRelativeTime(isoStr: any) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('feed.justNow') || 'agora';
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

/**
 * Coletor assíncrono com tolerância a falhas por fonte.
 * Cada fonte em try/catch isolado - uma fonte quebrada não impede as
 * outras de renderizar.
 *
 * @returns {Promise<any[]>}
 */
export async function collectFeedItems() {
    /** @type {any[]} */
    const all: any[] = [];
    await Promise.all([
        _fromAuditTrail(all).catch((_e: any) => console.debug('[feed:audit]', (_e as any)?.message)),
        _fromCompliance(all).catch((_e: any) => console.debug('[feed:compliance]', (_e as any)?.message)),
    ]);
    // Sort by timestamp desc (criticals por severity na renderização)
    all.sort((a: any, b: any) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    return all;
}

async function _fromAuditTrail(out: any[]) {
    try {
        const mod = await import('../../../core/governance/auditTrail.js' as string);
        if (!mod?.getAuditLog) return;
        const entries = await mod.getAuditLog({ limit: 10 });
        for (const e of entries || []) {
            out.push({
                timestamp: e.timestamp,
                severity: 'info',
                source: 'audit',
                title: _actionToTitle(e.action),
                detail: e.resourceId || '',
            });
        }
    } catch (/** @type {any} */ e) {
        console.debug('[feed] auditTrail:', (e as any)?.message || e);
        /* noop */
    }
}

async function _fromCompliance(out: any[]) {
    try {
        const mod = await import('../../../core/validation/globalCompliance.js' as string);
        const elMod = await import('../../../core/elements/manager.js' as string);
        if (!mod?.computeGlobalCompliance || !elMod?.getAllElements) return;
        const elements = (elMod.getAllElements() || []) as any[];
        // Flatten observations
        const observations = [];
        for (const el of elements) {
            if (!el?.data?.observations) continue;
            for (const o of el.data.observations) observations.push({ ...o, _el: el });
        }
        if (observations.length === 0) return;
        const report = mod.computeGlobalCompliance(observations, 'groundwater');
        if (!report) return;
        const exceedances = report.exceedances || report.violations || [];
        for (const x of exceedances.slice(0, 3)) {
            out.push({
                timestamp: x.timestamp || x.date || new Date().toISOString(),
                severity: 'critical',
                source: 'compliance',
                title: (t('feed.complianceExceedance') || 'Limite excedido: {param}').replace(
                    '{param}',
                    x.parameterId || x.param || '—',
                ),
                detail: x.elementId || x.site || '',
            });
        }
    } catch (/** @type {any} */ e) {
        console.debug('[feed] compliance:', (e as any)?.message || e);
        /* noop */
    }
}

function _actionToTitle(action: any) {
    /** @type {Record<string, string>} */
    const map = {
        'element.create': t('feed.action.elementCreate') || 'Novo elemento',
        'element.update': t('feed.action.elementUpdate') || 'Elemento atualizado',
        'element.delete': t('feed.action.elementDelete') || 'Elemento removido',
        'observation.create': t('feed.action.observationCreate') || 'Observação registrada',
        'campaign.create': t('feed.action.campaignCreate') || 'Campanha criada',
        'model.export': t('feed.action.modelExport') || 'Modelo exportado',
        'model.import': t('feed.action.modelImport') || 'Modelo importado',
    };
    return (map as Record<string,any>)[action] || action || t('feed.action.unknown') || 'Ação';
}

export function disposeFeed() {
    if (_feedEl) {
        _feedEl.innerHTML = '';
        _feedEl.remove();
        _feedEl = null;
    }
}

