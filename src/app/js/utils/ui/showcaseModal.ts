// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SHOWCASE MODAL — Capability Demos consolidated into one screen
   Substitui 15 entradas dispersas no dropdown dd-analysis-panels
   por uma tela única com cards categorizados, descrição do que é,
   como funciona, e botão "Abrir demo" que delega ao handler real.
   ================================================================ */

import { escapeHtml } from '../helpers/html.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';

const MODAL_ID = 'showcase-modal';

/**
 * Catalog of all capability demos.
 * Cada entry: id, handler global, título, categoria, ícone,
 * descrição curta, "como funciona", módulo core que sustenta.
 *
 * Adding a new demo: append to this list, the modal renders automatically.
 */
const DEMOS = [
    {
        id: 'esg-report',
        handler: 'handleShowEsgReport',
        title: 'ESG Report (CVM 193 / ISSB)',
        category: 'governance',
        icon: 'leaf',
        what: 'Relatório consolidado ESG no padrão CVM 193 + ISSB, agregando indicadores ambientais, sociais e de governança do modelo.',
        how: 'Motor lê elementos ambientais + observações + EIS multi-eixos, mapeia para taxonomia ISSB, gera markdown estruturado pronto para exportar.',
        backedBy: 'core/governance/esgReport.js + core/eis/',
    },
    {
        id: 'dama-quality',
        handler: 'handleShowDamaQuality',
        title: 'DAMA Data Quality',
        category: 'governance',
        icon: 'award',
        what: 'Avaliação de qualidade de dados em 6 dimensões DAMA-DMBOK: completeness, validity, accuracy, consistency, uniqueness, timeliness.',
        how: 'Scorer escaneia observações do modelo, aplica regras por dimensão (CONAMA bounds, duplicatas, timestamps), produz score 0–1 por dimensão + total.',
        backedBy: 'core/governance/damaQuality.js',
    },
    {
        id: 'audit-trail',
        handler: 'handleShowAuditTrailDemo',
        title: 'Audit Trail (SHA-256 chain)',
        category: 'governance',
        icon: 'lock',
        what: 'Trilha de auditoria append-only com hash chain SHA-256 — cada CRUD/EXPORT/APPROVE encadeado ao prev hash, à prova de adulteração.',
        how: 'createAuditEntry serializa canonical JSON e calcula sha256 sobre body+prevHash; validateAuditChain detecta tampering recalculando hashes.',
        backedBy: 'core/audit/auditTrailSchema.js (P1-62)',
    },
    {
        id: 'q2q-uncertainty',
        handler: 'handleShowQ2qDemo',
        title: 'Q2Q Uncertainty Propagation',
        category: 'uncertainty',
        icon: 'trending-up',
        what: 'Propagação quantidade-para-quantidade GUM Tier 1 — mostra como incerteza de uma medição se propaga para grandezas derivadas.',
        how: 'Aplica fórmulas de Guide to Uncertainty in Measurement (GUM JCGM 100:2008): combinação quadrática, coverage factor k, intervalo expandido U.',
        backedBy: 'core/uncertainty/propagation.js',
    },
    {
        id: 'decision-rules',
        handler: 'handleShowDecisionRules',
        title: 'Decision Rules (with uncertainty)',
        category: 'uncertainty',
        icon: 'git-branch',
        what: 'Regras de decisão regulatória considerando incerteza expandida — vai além de "valor > limite", aplica zona-guarda baseada em U.',
        how: 'JCGM 106:2012 / ASTM D6912: limite ± U define 4 zonas (compliant, conditional pass, conditional fail, non-compliant) em vez de binário.',
        backedBy: 'core/uncertainty/decisionRules.js',
    },
    {
        id: 'eis-weighted',
        handler: 'handleCompareEisPresets',
        title: 'EIS Weighted Presets',
        category: 'eis',
        icon: 'bar-chart-2',
        what: 'Comparação de presets de pesos EIS — vê como o score muda priorizando T (técnico), C (compliance), Cs (custos), etc.',
        how: 'EIS engine recalcula score com diferentes weight vectors mantendo eixos fixos; mostra ranking lado-a-lado (default, conservative, audit, ESG).',
        backedBy: 'core/eis/eisCalculator.js',
    },
    {
        id: 'eis-radar',
        handler: 'handleShowEisRadarAxes',
        title: 'EIS Radar 10 Axes',
        category: 'eis',
        icon: 'target',
        what: 'Radar EIS expandido para 10 eixos (Core 6 + Extended 4): T A Cp Ty Cs Cm + Reg + Stk + Tmp + Fin.',
        how: 'EIS Phase 2: além dos 6 eixos canônicos TCCCA+T, adiciona Regulatory, Stakeholder, Temporal, Financial; toggle Core/Extended na UI.',
        backedBy: 'core/eis/ + SPEC_EIS_RADAR_10AXES_PROGRESSIVE_UI',
    },
    {
        id: 'sdg-alignment',
        handler: 'handleShowSdgAlignment',
        title: 'UN SDG Alignment',
        category: 'eis',
        icon: 'globe',
        what: 'Alinhamento de elementos do modelo com os 17 Objetivos de Desenvolvimento Sustentável da ONU.',
        how: 'Mapping table SDG ↔ família ambiental + análise EIS. Ex: monitoring well → SDG 6 (Clean Water), plume → SDG 6+15.',
        backedBy: 'core/eis/sdgAlignment.js',
    },
    {
        id: 'sao-heatmap',
        handler: 'handleShowSaoHeatmap',
        title: 'SAO Risk Heatmap',
        category: 'spatial',
        icon: 'grid',
        what: 'Heatmap de risco ambiental SAO (Sensitivity-Adversity-Opportunity) — visualiza zonas de maior risco no terreno.',
        how: 'Matriz SAO ESH avalia receptor × stressor × exposição em grid 2D; cores quentes = risco alto. Padrão CETESB / PRAD.',
        backedBy: 'core/sao/',
    },
    {
        id: 'spatial-clustering',
        handler: 'handleShowSpatialClustering',
        title: 'Spatial Clustering',
        category: 'spatial',
        icon: 'map-pin',
        what: 'Clusterização espacial de pontos amostrais — identifica hotspots de contaminação automaticamente.',
        how: 'DBSCAN sobre coordenadas dos elementos; epsilon e minPts adaptativos por densidade. Outliers marcados separadamente.',
        backedBy: 'core/spatial/clustering.js',
    },
    {
        id: 'field-meta',
        handler: 'handleShowFieldMetaDemo',
        title: 'Field Meta v2',
        category: 'meta',
        icon: 'layers',
        what: 'Sistema de metadata por campo: cada input do modelo pode ter source, uncertainty, regulatory ref anexados.',
        how: 'MutationObserver wrap automático em data-field-meta="true"; middle-click/Ctrl+M abre painel de anexar metadados ao campo específico.',
        backedBy: 'core/fieldMeta/ (FIELD-META-001)',
    },
    {
        id: 'ledger-summary',
        handler: 'handleShowLedgerSummary',
        title: '$ECBT Ledger',
        category: 'meta',
        icon: 'dollar-sign',
        what: 'Ledger interno da moeda $ECBT — extrato de transações, saldo, exchange rate vs USD/BRL.',
        how: 'Append-only ledger em IndexedDB; cada credit/debit registra source, target, timestamp, balanceAfter. Reconcilia com Supabase.',
        backedBy: 'core/currency/ledger.js',
    },
    {
        id: 'product-tiers',
        handler: 'handleShowProductTiers',
        title: 'Product Tiers (Freemium)',
        category: 'meta',
        icon: 'package',
        what: 'Tabela de tiers freemium: limites por tier (Free, Pro, Team, Enterprise) e quanto cada feature consome.',
        how: 'Quota engine lê `core/metering/`; cada ação (export, AI call, upload) debita pricing tier-aware. Paywall quando estourar.',
        backedBy: 'core/metering/quota.js + creditPricing.js',
    },
    {
        id: 'parameter-groups',
        handler: 'handleShowParameterGroups',
        title: 'Parameter Groups Filter',
        category: 'spatial',
        icon: 'filter',
        what: 'Agregação canônica de parâmetros ambientais em 7 grupos (BTEX, PAH, Metals, etc.) com 6 funções de agregação.',
        how: 'aggregationEngine.js indexa observações por grupo, aplica média/máx/p95/percentiles; ElementGroupIndex O(1) lookup.',
        backedBy: 'core/filter/aggregationEngine.js (FEAT-FILTER-RADAR-001)',
    },
    {
        id: 'notifications',
        handler: 'handleShowNotificationCategories',
        title: 'Notifications Categories',
        category: 'meta',
        icon: 'bell',
        what: 'Sistema de notificações categorizadas: alerts (compliance), info (status), warning (degradação), success (ações OK).',
        how: 'Toast manager com filas por categoria, deduplicação por hash de mensagem, throttle, persistência localStorage de "lidas".',
        backedBy: 'utils/ui/toast.js + notificationsExt',
    },
];

const CATEGORIES = [
    { id: 'all', label: 'Tudo', icon: 'layout' },
    { id: 'governance', label: 'Governança / ESG', icon: 'shield' },
    { id: 'uncertainty', label: 'Incerteza', icon: 'target' },
    { id: 'eis', label: 'EIS', icon: 'activity' },
    { id: 'spatial', label: 'Espacial', icon: 'map' },
    { id: 'meta', label: 'Metadados / Meta', icon: 'database' },
];

let _modal: any = null;
let _activeCategory = 'all';
let _searchQuery = '';

export function openShowcaseModal(): void {
    if (!_modal) {
        _modal = _build();
        document.body.appendChild(_modal);
    }
    _modal.style.display = 'flex';
    _renderGrid();
    syncDeepLinkUrl('showcase');
}

export function closeShowcaseModal(): void {
    if (_modal) _modal.style.display = 'none';
    clearDeepLinkUrl();
}

function _build(): any {
    const m = document.createElement('div');
    m.id = MODAL_ID;
    m.className = 'showcase-overlay';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-label', 'Showcase de capabilities');
    m.innerHTML = `
        <div class="showcase-dialog">
            <header class="showcase-head">
                <div class="showcase-head-text">
                    <h2>Showcase de Capabilities</h2>
                    <p class="showcase-sub">Demos interativos das funcionalidades do ECBT — cada um aciona o motor real (não mock).</p>
                </div>
                <button type="button" class="showcase-close" aria-label="Fechar">&#x2715;</button>
            </header>
            <div class="showcase-controls">
                <input type="search" class="showcase-search" placeholder="Buscar demo..." aria-label="Buscar demo">
                <div class="showcase-cats" role="tablist">
                    ${CATEGORIES.map(
                        (c: any) => `
                        <button type="button" class="showcase-cat${c.id === 'all' ? ' active' : ''}"
                                data-cat="${c.id}" role="tab">${escapeHtml(c.label)}</button>
                    `,
                    ).join('')}
                </div>
            </div>
            <div class="showcase-body">
                <div class="showcase-grid" id="showcase-grid"></div>
            </div>
            <footer class="showcase-foot">
                <span class="showcase-foot-note">Cada demo é alimentado pelo motor real do ECBT — os resultados refletem o estado atual do modelo carregado.</span>
            </footer>
        </div>
    `;

    (m.querySelector('.showcase-close') as any).addEventListener('click', closeShowcaseModal);
    m.addEventListener('click', (e: any) => {
        if (e.target === m) closeShowcaseModal();
    });

    (m.querySelectorAll('.showcase-cat') as any).forEach((btn: any) => {
        btn.addEventListener('click', () => {
            _activeCategory = btn.dataset.cat;
            (m.querySelectorAll('.showcase-cat') as any).forEach((b: any) =>
                b.classList.toggle('active', b === btn),
            );
            _renderGrid();
        });
    });

    const search = m.querySelector('.showcase-search') as any;
    let timer: any = null;
    search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            _searchQuery = search.value.trim().toLowerCase();
            _renderGrid();
        }, 200);
    });

    return m;
}

function _renderGrid(): void {
    const grid = _modal.querySelector('#showcase-grid') as any;
    if (!grid) return;
    const filtered = DEMOS.filter((d: any) => {
        if (_activeCategory !== 'all' && d.category !== _activeCategory) return false;
        if (_searchQuery) {
            const hay = `${d.title} ${d.what} ${d.how} ${d.backedBy}`.toLowerCase();
            if (!hay.includes(_searchQuery)) return false;
        }
        return true;
    });
    if (filtered.length === 0) {
        grid.innerHTML = `<div class="showcase-empty">Nenhum demo encontrado.</div>`;
        return;
    }
    grid.innerHTML = filtered.map(_renderCard).join('');
    (grid.querySelectorAll('[data-demo-handler]') as any).forEach((btn: any) => {
        btn.addEventListener('click', () => {
            const fnName = btn.dataset.demoHandler || '';
            const fn = (window as any)[fnName];
            if (typeof fn === 'function') {
                closeShowcaseModal();
                fn();
            } else {
                console.warn('[showcase] handler not registered:', fnName);
            }
        });
    });
}

function _renderCard(d: any): string {
    return `
        <article class="showcase-card" data-demo-id="${escapeHtml(d.id)}">
            <header class="showcase-card-hdr">
                <span class="showcase-card-cat" data-cat="${escapeHtml(d.category)}">${escapeHtml(_categoryLabel(d.category))}</span>
                <h3 class="showcase-card-title">${escapeHtml(d.title)}</h3>
            </header>
            <div class="showcase-card-body">
                <p class="showcase-card-what"><strong>O que é:</strong> ${escapeHtml(d.what)}</p>
                <details class="showcase-card-how">
                    <summary>Como funciona</summary>
                    <p>${escapeHtml(d.how)}</p>
                    <p class="showcase-card-backed"><strong>Motor:</strong> <code>${escapeHtml(d.backedBy)}</code></p>
                </details>
            </div>
            <footer class="showcase-card-foot">
                <button type="button" class="showcase-card-open" data-demo-handler="${escapeHtml(d.handler)}">Abrir demo</button>
            </footer>
        </article>
    `;
}

function _categoryLabel(catId: any): any {
    return CATEGORIES.find((c: any) => c.id === catId)?.label || catId;
}

// Named exports for handler registry - explicit aliases for openShowcaseModal/closeShowcaseModal.
// 2026-05-01 wakeup-tick #47: makes handlers grep-detectable by ui-invariants CT-5 gate.
export const handleOpenShowcase = openShowcaseModal;
export const handleCloseShowcase = closeShowcaseModal;

export const showcaseHandlers = {
    handleOpenShowcase,
    handleCloseShowcase,
};
