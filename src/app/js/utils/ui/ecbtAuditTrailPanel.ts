// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Audit Trail — Wire DOM thin panel.
 * SPEC_ECBT_SCORE_AUDIT_TRAIL F3 — wire DOM consumindo AuditTrailVM do
 * _auditTrailPure + markdown do _auditTrailMarkdownPure.
 * claude - novaspec, 2026-06-05.
 *
 * Responsabilidades thin (sem lógica):
 *   1. openEcbtAuditTrailPanel(vm, options) — monta DOM, 9 blocos colapsáveis
 *   2. Toggle individual + expand-all / collapse-all
 *   3. Botões dispatcham CustomEvent (consumer decide ação):
 *      - 'ecbt:audit-trail-export-xlsx' {detail: {vm}}
 *      - 'ecbt:audit-trail-export-markdown' {detail: {vm}}
 *      - 'ecbt:audit-trail-block-toggled' {detail: {blockId, expanded}}
 *      - 'ecbt:audit-trail-closed'
 *   4. closeEcbtAuditTrailPanel() — remove DOM
 *
 * Anti-pattern pixels-over-dom: NÃO abre em mount/route change.
 * Só abre via openEcbtAuditTrailPanel() chamado explicitamente.
 */

import type { AuditTrailVM, AuditTrailBlockVM, AuditTrailRowVM } from '../../core/ecbtScore/_auditTrailPure.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const PANEL_ROOT_ID = 'ecbt-audit-trail-panel';
const PARENT_SELECTOR = '#main-area';
const BLOCK_ID_PREFIX = 'ecbt-audit-block-';
const BTN_EXPAND_ALL = 'ecbt-audit-expand-all';
const BTN_COLLAPSE_ALL = 'ecbt-audit-collapse-all';
const BTN_EXPORT_XLSX = 'ecbt-audit-export-xlsx';
const BTN_EXPORT_MD = 'ecbt-audit-export-markdown';
const BTN_CLOSE = 'ecbt-audit-close';
const BTN_VIEW_LIST = 'ecbt-audit-view-list';
const BTN_VIEW_TREE = 'ecbt-audit-view-tree';
const BLOCKS_CONTAINER_ID = 'ecbt-audit-blocks-container';

// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------

interface PanelState {
    rootEl: HTMLElement;
    vm: AuditTrailVM;
    expanded: Set<string>; // blockIds expanded
    options: PanelOptions;
}

export interface PanelOptions {
    readonly labelResolver?: (key: string) => string;
    readonly verdictLabel?: { audit_ready: string; management_ready: string; critical: string };
    readonly i18n?: PanelI18n;
}

export interface PanelI18n {
    readonly title: string;
    readonly subtitle: string;
    readonly intro: string;
    readonly modelLabel: string;
    readonly generatedLabel: string;
    readonly expandAll: string;
    readonly collapseAll: string;
    readonly exportXlsx: string;
    readonly exportMarkdown: string;
    readonly close: string;
    readonly dashboardTitle: string;
    readonly eisLabel: string;
    readonly eisTooltip: string;
    readonly verdictLabel: string;
    readonly verdictTooltip: string;
    readonly severityLabel: string;
    readonly severityTooltip: string;
    readonly kappaLabel: string;
    readonly kappaTooltip: string;
    readonly ecbtPctLabel: string;
    readonly ecbtPctTooltip: string;
    readonly bandLabel: string;
    readonly bandTooltip: string;
    readonly viewList: string;
    readonly viewTree: string;
}

const DEFAULT_I18N: PanelI18n = Object.freeze({
    title: 'Como cheguei neste resultado',
    subtitle: 'Trilha auditável — ECBT Score',
    intro: 'Este painel mostra passo-a-passo, em 9 blocos (A → I), como o ECBT Score foi calculado a partir das observações de campo. Cada linha tem fórmula, valor e célula equivalente no Excel oficial. Use os botões abaixo para expandir tudo, exportar para Excel ou copiar como Markdown.',
    modelLabel: 'Modelo',
    generatedLabel: 'Gerado em',
    expandAll: 'Expandir tudo',
    collapseAll: 'Recolher tudo',
    exportXlsx: 'Exportar XLSX',
    exportMarkdown: 'Copiar como Markdown',
    close: 'Fechar',
    dashboardTitle: 'Resumo do resultado',
    eisLabel: 'EIS (Integridade)',
    eisTooltip: 'EnviroTech Integrity Score — média geométrica de 10 eixos (rastreabilidade, acurácia, cobertura, tempestividade, consistência, completude + 4 ESG). Escala 1.0 (ruim) a 5.0 (excelente).',
    verdictLabel: 'Veredito',
    verdictTooltip: '🔴 Critical (<3.5) = precisa corrigir antes de publicar. 🟡 Management Ready (3.5–4.5) = revisão recomendada. 🟢 Audit Ready (≥4.5) = pronto para auditoria externa.',
    severityLabel: 'Severidade',
    severityTooltip: 'S = max(Risco, Impacto). Quanto maior, mais grave o problema ambiental detectado. Escala 0 (nenhum) a 1 (máximo).',
    kappaLabel: 'Confiança κ',
    kappaTooltip: 'Confiança no resultado (0 a 1). Reflete quantidade + qualidade dos dados. Baixo κ = pouca observação ou eixos críticos zerados.',
    ecbtPctLabel: 'ECBT Score %',
    ecbtPctTooltip: 'Resultado monetário líquido (ativos − passivos ambientais) como % do valor de mercado. Negativo = passivo predomina.',
    bandLabel: 'Faixa de erro ±%',
    bandTooltip: 'Banda de incerteza (Monte Carlo P10–P90) ao redor do ECBT Score %. Quanto maior, menos preciso o resultado.',
    viewList: 'Lista',
    viewTree: 'Árvore',
});

let currentState: PanelState | null = null;

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function isBrowser(): boolean {
    return typeof document !== 'undefined' && document !== null;
}

function escapeHTML(s: unknown): string {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// F9 fix Calvin 2026-06-07 — lazy resolver de `t()` da i18n module canonical.
// Cached após primeiro resolve. window.t() NÃO é registrado pela app (só
// utils/i18n/translations.ts exporta named `t`), então import dinâmico é o
// caminho correto. Fallback null preserva keys cruas se i18n indisponível.
let _cachedT: ((key: string) => string) | null = null;
let _i18nLoadAttempted = false;
function _loadI18n(): void {
    if (_i18nLoadAttempted) return;
    _i18nLoadAttempted = true;
    if (typeof window === 'undefined') return;
    import('../i18n/translations.js')
        .then((mod) => {
            if (typeof (mod as any).t === 'function') _cachedT = (mod as any).t;
        })
        .catch((e: any) => console.debug('[ecbt-audit-trail:i18n] translations import failed', e?.message || e));
}

function getI18n(opts?: PanelOptions): PanelI18n {
    _loadI18n();
    const t = _cachedT
        ?? (typeof window !== 'undefined' && typeof (window as any).t === 'function'
            ? (window as any).t
            : null);
    const resolve = (key: string, fallback: string): string => {
        if (!t) return fallback;
        try {
            const out = t(key);
            return out && out !== key ? out : fallback;
        } catch {
            return fallback;
        }
    };
    const dynamic: PanelI18n = {
        title: resolve('ecbt.audit_trail.title', DEFAULT_I18N.title),
        subtitle: resolve('ecbt.audit_trail.subtitle', DEFAULT_I18N.subtitle),
        intro: resolve('ecbt.audit_trail.intro', DEFAULT_I18N.intro),
        modelLabel: resolve('ecbt.audit_trail.model_label', DEFAULT_I18N.modelLabel),
        generatedLabel: resolve('ecbt.audit_trail.generated_label', DEFAULT_I18N.generatedLabel),
        expandAll: resolve('ecbt.audit_trail.expand_all', DEFAULT_I18N.expandAll),
        collapseAll: resolve('ecbt.audit_trail.collapse_all', DEFAULT_I18N.collapseAll),
        exportXlsx: resolve('ecbt.audit_trail.export_xlsx', DEFAULT_I18N.exportXlsx),
        exportMarkdown: resolve('ecbt.audit_trail.copy_markdown', DEFAULT_I18N.exportMarkdown),
        close: resolve('ecbt.audit_trail.close', DEFAULT_I18N.close),
        dashboardTitle: resolve('ecbt.audit_trail.dashboard_title', DEFAULT_I18N.dashboardTitle),
        eisLabel: resolve('ecbt.audit_trail.eis_label', DEFAULT_I18N.eisLabel),
        eisTooltip: resolve('ecbt.audit_trail.eis_tooltip', DEFAULT_I18N.eisTooltip),
        verdictLabel: resolve('ecbt.audit_trail.verdict_label', DEFAULT_I18N.verdictLabel),
        verdictTooltip: resolve('ecbt.audit_trail.verdict_tooltip', DEFAULT_I18N.verdictTooltip),
        severityLabel: resolve('ecbt.audit_trail.severity_label', DEFAULT_I18N.severityLabel),
        severityTooltip: resolve('ecbt.audit_trail.severity_tooltip', DEFAULT_I18N.severityTooltip),
        kappaLabel: resolve('ecbt.audit_trail.kappa_label', DEFAULT_I18N.kappaLabel),
        kappaTooltip: resolve('ecbt.audit_trail.kappa_tooltip', DEFAULT_I18N.kappaTooltip),
        ecbtPctLabel: resolve('ecbt.audit_trail.ecbt_pct_label', DEFAULT_I18N.ecbtPctLabel),
        ecbtPctTooltip: resolve('ecbt.audit_trail.ecbt_pct_tooltip', DEFAULT_I18N.ecbtPctTooltip),
        bandLabel: resolve('ecbt.audit_trail.band_label', DEFAULT_I18N.bandLabel),
        bandTooltip: resolve('ecbt.audit_trail.band_tooltip', DEFAULT_I18N.bandTooltip),
        viewList: resolve('ecbt.audit_trail.view_list', DEFAULT_I18N.viewList),
        viewTree: resolve('ecbt.audit_trail.view_tree', DEFAULT_I18N.viewTree),
    };
    if (!opts || !opts.i18n) return dynamic;
    return { ...dynamic, ...opts.i18n };
}

function resolveLabel(key: string, opts?: PanelOptions): string {
    if (opts && typeof opts.labelResolver === 'function') {
        try {
            const out = opts.labelResolver(key);
            if (out && out !== key) return out;
        } catch (e: any) {
            console.debug('[ecbt-audit-trail:i18n] custom resolver failed', e?.message || e);
        }
    }
    // F9 fix Calvin 2026-06-07 — fallback para t() do i18n module canonical
    // (cached via _loadI18n). Garante 'ecbt.audit_trail.block_A' resolva
    // para 'A. Entradas' nos blocos collapsed.
    _loadI18n();
    if (_cachedT) {
        try {
            const out = _cachedT(key);
            if (out && out !== key) return out;
        } catch (e: any) {
            console.debug('[ecbt-audit-trail:i18n] cachedT failed', e?.message || e);
        }
    }
    if (typeof window !== 'undefined') {
        const t = (window as any).t;
        if (typeof t === 'function') {
            try {
                const out = t(key);
                if (out && out !== key) return out;
            } catch (e: any) {
                console.debug('[ecbt-audit-trail:i18n] window.t() failed', e?.message || e);
            }
        }
    }
    return key;
}

function verdictText(v: AuditTrailVM['dashboardKpis']['verdict'], opts?: PanelOptions): string {
    const labels = opts?.verdictLabel;
    if (labels) {
        if (v === 'audit_ready') return labels.audit_ready;
        if (v === 'management_ready') return labels.management_ready;
        return labels.critical;
    }
    if (v === 'audit_ready') return '🟢 Audit Ready';
    if (v === 'management_ready') return '🟡 Management Ready';
    return '🔴 Critical';
}

function cellKindBadge(kind: AuditTrailRowVM['cellKind']): string {
    if (kind === 'input') return '🔵';
    if (kind === 'output') return '🟢';
    return '⚪';
}

// ----------------------------------------------------------------
// MARKUP BUILDERS
// ----------------------------------------------------------------

function buildRowMarkup(row: AuditTrailRowVM, opts?: PanelOptions): string {
    const badge = cellKindBadge(row.cellKind);
    // F16 Calvin 2026-06-07 — labelKey de obs dinâmicas (block_A.row.{N}) não
    // existe em i18n; resolveLabel retorna key crua. Fallback: row.label inline
    // (mais legível que key + cobre dados reais sem precisar pré-criar i18n).
    const resolved = resolveLabel(row.labelKey, opts);
    const labelText = resolved !== row.labelKey ? resolved : (row.label || row.labelKey);
    const label = escapeHTML(labelText);
    const formula = escapeHTML(row.formulaSymbolic);
    const value = escapeHTML(row.value);
    const unit = row.unit ? ` <span class="ecbt-au-unit">${escapeHTML(row.unit)}</span>` : '';
    const xlsx = row.xlsxA1 ? ` <code class="ecbt-au-xlsx">${escapeHTML(row.xlsxA1)}</code>` : '';
    // F12 drill-down Calvin 2026-06-07 — cell-id clicável → modal dados brutos + SQL
    return `
        <tr class="ecbt-au-row ecbt-au-row--${escapeHTML(row.cellKind)}" data-cell-id="${escapeHTML(row.cellId)}">
            <td class="ecbt-au-cell-badge">${badge}</td>
            <td class="ecbt-au-cell-id"><button type="button" class="ecbt-au-drilldown-btn" data-action="drilldown" data-cell-id="${escapeHTML(row.cellId)}" title="Ver dado bruto + SQL"><code>${escapeHTML(row.cellId)}</code></button></td>
            <td class="ecbt-au-cell-label">${label}</td>
            <td class="ecbt-au-cell-formula">${formula}</td>
            <td class="ecbt-au-cell-value"><strong>${value}</strong>${unit}</td>
            <td class="ecbt-au-cell-xlsx">${xlsx}</td>
        </tr>
    `;
}

function buildBlockMarkup(block: AuditTrailBlockVM, expanded: boolean, opts?: PanelOptions): string {
    const title = escapeHTML(resolveLabel(block.titleKey, opts));
    const rowsHtml = block.rows.map((r) => buildRowMarkup(r, opts)).join('');
    const coreRefs = block.coreRefs.map((r) => `<code>${escapeHTML(r)}</code>`).join(' · ');
    const theoreticalRefs = block.theoreticalRefs
        .map((r) => `<span class="ecbt-au-ref-${escapeHTML(r.kind)}">${escapeHTML(r.kind.toUpperCase())}:${escapeHTML(r.id)}</span>`)
        .join(' · ');
    const expandedAttr = expanded ? ' open' : '';
    return `
        <details id="${BLOCK_ID_PREFIX}${escapeHTML(block.id)}" class="ecbt-au-block" data-block-id="${escapeHTML(block.id)}"${expandedAttr}>
            <summary class="ecbt-au-block-summary">
                <span class="ecbt-au-block-letter">${escapeHTML(block.id)}.</span>
                <span class="ecbt-au-block-title">${title}</span>
            </summary>
            <div class="ecbt-au-block-meta">
                <div class="ecbt-au-core-refs">core/: ${coreRefs}</div>
                <div class="ecbt-au-theoretical-refs">${theoreticalRefs}</div>
            </div>
            <table class="ecbt-au-block-table" role="table">
                <thead>
                    <tr>
                        <th>·</th><th>Cell</th><th>Label</th><th>Fórmula</th><th>Valor</th><th>XLSX</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </details>
    `;
}

function buildDashboardMarkup(vm: AuditTrailVM, opts?: PanelOptions): string {
    const i18n = getI18n(opts);
    const k = vm.dashboardKpis;
    // F9 fix Calvin 2026-06-07 — tooltips humanos via title= em cada termo técnico,
    // labels com explicação inline (ex: "EIS (Integridade)" em vez de "EIS" cru).
    return `
        <section class="ecbt-au-dashboard" aria-label="${escapeHTML(i18n.dashboardTitle)}">
            <h3 class="ecbt-au-dashboard-title">${escapeHTML(i18n.dashboardTitle)}</h3>
            <dl class="ecbt-au-dashboard-grid">
                <dt title="${escapeHTML(i18n.eisTooltip)}">${escapeHTML(i18n.eisLabel)}</dt><dd><strong>${escapeHTML(k.eis)}</strong></dd>
                <dt title="${escapeHTML(i18n.verdictTooltip)}">${escapeHTML(i18n.verdictLabel)}</dt><dd><strong>${escapeHTML(verdictText(k.verdict, opts))}</strong></dd>
                <dt title="${escapeHTML(i18n.severityTooltip)}">${escapeHTML(i18n.severityLabel)}</dt><dd><strong>${escapeHTML(k.severityS)}</strong></dd>
                <dt title="${escapeHTML(i18n.kappaTooltip)}">${escapeHTML(i18n.kappaLabel)}</dt><dd><strong>${escapeHTML(k.kappa)}</strong></dd>
                <dt title="${escapeHTML(i18n.ecbtPctTooltip)}">${escapeHTML(i18n.ecbtPctLabel)}</dt><dd><strong>${escapeHTML(k.ecbtPct)}%</strong></dd>
                <dt title="${escapeHTML(i18n.bandTooltip)}">${escapeHTML(i18n.bandLabel)}</dt><dd><strong>±${escapeHTML(k.ecbtBand)}%</strong></dd>
            </dl>
        </section>
    `;
}

function buildHeaderMarkup(vm: AuditTrailVM, opts?: PanelOptions): string {
    const i18n = getI18n(opts);
    // F9 fix Calvin 2026-06-07 — título amigável + subtitle + intro + view toggle (F11).
    return `
        <header class="ecbt-au-header">
            <h2 class="ecbt-au-title">${escapeHTML(i18n.title)}</h2>
            <p class="ecbt-au-subtitle">${escapeHTML(i18n.subtitle)}</p>
            <p class="ecbt-au-intro">${escapeHTML(i18n.intro)}</p>
            <div class="ecbt-au-meta">
                <span><strong>${escapeHTML(i18n.modelLabel)}:</strong> <code>${escapeHTML(vm.modelId)}</code></span>
                <span><strong>${escapeHTML(i18n.generatedLabel)}:</strong> ${escapeHTML(vm.generatedAt)}</span>
            </div>
            <div class="ecbt-au-view-toggle" role="group" aria-label="Visualização">
                <button type="button" id="${BTN_VIEW_LIST}" class="ecbt-au-btn ecbt-au-btn--toggle ecbt-au-btn--active" aria-pressed="true">${escapeHTML(i18n.viewList)}</button>
                <button type="button" id="${BTN_VIEW_TREE}" class="ecbt-au-btn ecbt-au-btn--toggle" aria-pressed="false">${escapeHTML(i18n.viewTree)}</button>
            </div>
            <div class="ecbt-au-toolbar">
                <button type="button" id="${BTN_EXPAND_ALL}" class="ecbt-au-btn">${escapeHTML(i18n.expandAll)}</button>
                <button type="button" id="${BTN_COLLAPSE_ALL}" class="ecbt-au-btn">${escapeHTML(i18n.collapseAll)}</button>
                <button type="button" id="${BTN_EXPORT_XLSX}" class="ecbt-au-btn ecbt-au-btn--primary">${escapeHTML(i18n.exportXlsx)}</button>
                <button type="button" id="${BTN_EXPORT_MD}" class="ecbt-au-btn">${escapeHTML(i18n.exportMarkdown)}</button>
                <button type="button" id="${BTN_CLOSE}" class="ecbt-au-btn ecbt-au-btn--close" aria-label="${escapeHTML(i18n.close)}">×</button>
            </div>
        </header>
    `;
}

/**
 * F11 árvore hierárquica Calvin 2026-06-07 — render markup tree indent-based.
 * Padrão WAI-ARIA tree (role=tree/treeitem, aria-expanded, aria-level).
 * Importa _auditTreeLayoutPure lazy para evitar bundle eager.
 */
async function buildTreeMarkup(vm: AuditTrailVM, opts?: PanelOptions): Promise<string> {
    try {
        const tree = await import('./_auditTreeLayoutPure.js');
        const nodes = tree.buildAuditTree(vm as any);
        if (!nodes.length) return '<p class="ecbt-au-tree-empty">Sem dados para árvore</p>';
        const root = nodes.find((n) => n.kind === 'root');
        if (!root) return '<p class="ecbt-au-tree-empty">Árvore sem raiz</p>';
        return `<ul class="ecbt-au-tree" role="tree" aria-label="Árvore hierárquica ECBT">
            ${renderTreeNode(root, nodes, tree, opts)}
        </ul>`;
    } catch (e: any) {
        console.warn('[ecbt-audit-trail:tree] build failed', e?.message || e);
        return '<p class="ecbt-au-tree-empty">Falha ao construir árvore</p>';
    }
}

function renderTreeNode(node: any, allNodes: ReadonlyArray<any>, tree: any, opts?: PanelOptions): string {
    const children = tree.getChildren(allNodes, node.id);
    const hasChildren = children.length > 0;
    const label = escapeHTML(node.labelKey ? resolveLabel(node.labelKey, opts) : node.label);
    const descendCount = hasChildren ? tree.countDescendants(allNodes, node.id) : 0;
    const countBadge = hasChildren ? ` <span class="ecbt-au-tree-count">(${descendCount})</span>` : '';
    const expanded = node.depth < 2; // root + blocks abertos por default; groups e leaves collapsed
    const toggle = hasChildren
        ? `<span class="ecbt-au-tree-toggle" aria-hidden="true">${expanded ? '▼' : '▶'}</span>`
        : '<span class="ecbt-au-tree-toggle ecbt-au-tree-toggle--leaf" aria-hidden="true">•</span>';
    const metaInline = node.kind === 'leaf' && node.meta
        ? ` <span class="ecbt-au-tree-meta">${node.meta.value ?? ''}${node.meta.xlsxRef ? ` <code>${escapeHTML(node.meta.xlsxRef)}</code>` : ''}</span>`
        : '';
    const childrenHtml = hasChildren
        ? `<ul class="ecbt-au-tree-children" role="group">
            ${children.map((c: any) => renderTreeNode(c, allNodes, tree, opts)).join('')}
        </ul>`
        : '';
    return `<li class="ecbt-au-tree-node ecbt-au-tree-node--${node.kind}" role="treeitem" aria-level="${node.depth + 1}" aria-expanded="${hasChildren ? expanded : 'false'}" data-tree-node-id="${escapeHTML(node.id)}" data-tree-depth="${node.depth}">
        <div class="ecbt-au-tree-row">
            ${toggle}
            <span class="ecbt-au-tree-label">${label}</span>${countBadge}${metaInline}
        </div>
        ${childrenHtml}
    </li>`;
}

// ----------------------------------------------------------------
// EVENTS
// ----------------------------------------------------------------

function dispatch(name: string, detail: Record<string, unknown>): void {
    if (!isBrowser()) return;
    document.dispatchEvent(new CustomEvent(name, { detail }));
}

// ----------------------------------------------------------------
// MAIN API
// ----------------------------------------------------------------

export function openEcbtAuditTrailPanel(vm: AuditTrailVM, options?: PanelOptions): void {
    if (!isBrowser()) return;
    if (!vm || typeof vm !== 'object' || !Array.isArray(vm.blocks)) return;
    if (currentState) closeEcbtAuditTrailPanel();

    const panel = document.createElement('section');
    panel.id = PANEL_ROOT_ID;
    panel.className = 'ecbt-audit-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', getI18n(options).title);

    const expanded = new Set<string>();
    const dashboard = buildDashboardMarkup(vm, options);
    const header = buildHeaderMarkup(vm, options);
    const blocksHtml = vm.blocks.map((b) => buildBlockMarkup(b, false, options)).join('');

    panel.innerHTML = `${header}${dashboard}<div id="${BLOCKS_CONTAINER_ID}" class="ecbt-au-blocks">${blocksHtml}</div>`;

    panel.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target) return;

        // Botões toolbar
        if (target.id === BTN_CLOSE) {
            closeEcbtAuditTrailPanel();
            return;
        }
        if (target.id === BTN_EXPAND_ALL) {
            for (const b of vm.blocks) {
                expanded.add(b.id);
                const el = document.getElementById(`${BLOCK_ID_PREFIX}${b.id}`);
                if (el) el.setAttribute('open', '');
            }
            return;
        }
        if (target.id === BTN_COLLAPSE_ALL) {
            for (const b of vm.blocks) {
                expanded.delete(b.id);
                const el = document.getElementById(`${BLOCK_ID_PREFIX}${b.id}`);
                if (el) el.removeAttribute('open');
            }
            return;
        }
        if (target.id === BTN_EXPORT_XLSX) {
            dispatch('ecbt:audit-trail-export-xlsx', { vm });
            return;
        }
        if (target.id === BTN_EXPORT_MD) {
            dispatch('ecbt:audit-trail-export-markdown', { vm });
            return;
        }

        // F12 drill-down Calvin 2026-06-07 — clique cell-id → modal dados brutos + SQL
        const drillBtn = target.closest('.ecbt-au-drilldown-btn') as HTMLElement | null;
        if (drillBtn) {
            const cellId = drillBtn.getAttribute('data-cell-id');
            if (cellId) {
                openDrilldownModal(cellId).catch((err: any) =>
                    console.warn('[ecbt-audit-trail:drilldown] open failed', err?.message || err),
                );
            }
            return;
        }

        // F11 view toggle Calvin 2026-06-07 — Lista | Árvore
        if (target.id === BTN_VIEW_LIST || target.id === BTN_VIEW_TREE) {
            const isTree = target.id === BTN_VIEW_TREE;
            const listBtn = document.getElementById(BTN_VIEW_LIST);
            const treeBtn = document.getElementById(BTN_VIEW_TREE);
            const container = document.getElementById(BLOCKS_CONTAINER_ID);
            if (listBtn) {
                listBtn.classList.toggle('ecbt-au-btn--active', !isTree);
                listBtn.setAttribute('aria-pressed', String(!isTree));
            }
            if (treeBtn) {
                treeBtn.classList.toggle('ecbt-au-btn--active', isTree);
                treeBtn.setAttribute('aria-pressed', String(isTree));
            }
            if (container) {
                if (isTree) {
                    buildTreeMarkup(vm, options).then((html) => {
                        const stillThere = document.getElementById(BLOCKS_CONTAINER_ID);
                        if (stillThere) stillThere.innerHTML = html;
                    }).catch((e: any) => console.warn('[ecbt-audit-trail:view-tree] build failed', e?.message || e));
                } else {
                    container.innerHTML = vm.blocks.map((b) => buildBlockMarkup(b, expanded.has(b.id), options)).join('');
                }
            }
            dispatch('ecbt:audit-trail-view-changed', { view: isTree ? 'tree' : 'list' });
            return;
        }

        // Toggle bloco
        const summary = target.closest('.ecbt-au-block-summary') as HTMLElement | null;
        if (summary && summary.parentElement) {
            const blockEl = summary.parentElement as HTMLElement;
            const blockId = blockEl.getAttribute('data-block-id');
            if (blockId) {
                const isOpen = blockEl.hasAttribute('open');
                if (isOpen) expanded.delete(blockId);
                else expanded.add(blockId);
                dispatch('ecbt:audit-trail-block-toggled', { blockId, expanded: !isOpen });
            }
        }
    });

    const parent = document.querySelector(PARENT_SELECTOR) || document.body;
    parent.appendChild(panel);

    currentState = { rootEl: panel, vm, expanded, options: options ?? {} };

    dispatch('ecbt:audit-trail-opened', { modelId: vm.modelId });
}

// ----------------------------------------------------------------
// F12 DRILL-DOWN MODAL (Calvin 2026-06-07)
// ----------------------------------------------------------------

const DRILLDOWN_MODAL_ID = 'ecbt-audit-drilldown-modal';

async function openDrilldownModal(cellId: string): Promise<void> {
    if (!isBrowser()) return;
    const drillMod = await import('../../core/ecbtScore/_auditDrilldownPure.js');
    const info = drillMod.buildDrilldown(cellId);

    // Remove modal antigo se existir (idempotente)
    document.getElementById(DRILLDOWN_MODAL_ID)?.remove();

    const modal = document.createElement('div');
    modal.id = DRILLDOWN_MODAL_ID;
    modal.className = 'ecbt-au-drilldown-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', `Dado bruto da célula ${cellId}`);

    const elementBtn = info.elementId
        ? `<button type="button" class="ecbt-au-drill-btn" data-drill-action="select-element" data-element-id="${escapeHTML(info.elementId)}">📍 Selecionar elemento ${escapeHTML(info.elementId)} no mapa</button>`
        : '';
    const escSql = escapeHTML(info.sqlQuery);

    modal.innerHTML = `
        <div class="ecbt-au-drilldown-dialog" role="document">
            <header class="ecbt-au-drilldown-header">
                <h3>Dado bruto — <code>${escapeHTML(cellId)}</code></h3>
                <button type="button" class="ecbt-au-drill-close" data-drill-action="close" aria-label="Fechar">×</button>
            </header>
            <section class="ecbt-au-drilldown-body">
                <p class="ecbt-au-drill-desc">${escapeHTML(info.description)}</p>
                <dl class="ecbt-au-drill-meta">
                    <dt>Tipo</dt><dd><span class="ecbt-au-drill-kind ecbt-au-drill-kind--${escapeHTML(info.kind)}">${escapeHTML(info.kind)}</span></dd>
                    ${info.rawHint ? `<dt>Origem dos dados</dt><dd><code>${escapeHTML(info.rawHint)}</code></dd>` : ''}
                </dl>
                ${elementBtn}
                <div class="ecbt-au-drill-sql-section">
                    <div class="ecbt-au-drill-sql-header">
                        <h4>SQL para inspeção</h4>
                        <div class="ecbt-au-drill-sql-actions">
                            <button type="button" class="ecbt-au-drill-btn ecbt-au-drill-btn--primary" data-drill-action="open-sql-editor">⌨ Abrir no SQL Editor</button>
                            <button type="button" class="ecbt-au-drill-btn" data-drill-action="copy-sql">📋 Copiar SQL</button>
                        </div>
                    </div>
                    <pre class="ecbt-au-drill-sql"><code>${escSql}</code></pre>
                </div>
            </section>
        </div>`;

    // Click handler do modal (delegated)
    modal.addEventListener('click', async (e) => {
        const t = e.target as HTMLElement;
        const action = t.closest('[data-drill-action]')?.getAttribute('data-drill-action');
        if (!action) {
            // Click fora do dialog (overlay) → fecha
            if (t === modal) modal.remove();
            return;
        }
        if (action === 'close') {
            modal.remove();
            return;
        }
        if (action === 'select-element') {
            const id = (t.closest('[data-element-id]') as HTMLElement)?.getAttribute('data-element-id');
            if (id && typeof (window as any).handleSelectElement === 'function') {
                try { (window as any).handleSelectElement(id); modal.remove(); } catch (err: any) {
                    console.warn('[ecbt-drill:select-element]', err?.message || err);
                }
            }
            return;
        }
        if (action === 'open-sql-editor') {
            try {
                const editor = await import('../datastudio/editor.js');
                if (typeof (editor as any).setEditorContent === 'function') {
                    (editor as any).setEditorContent(info.sqlQuery);
                }
                if (typeof (window as any).handleOpenDataStudio === 'function') {
                    (window as any).handleOpenDataStudio('analytics');
                }
                modal.remove();
            } catch (err: any) {
                console.warn('[ecbt-drill:open-sql-editor]', err?.message || err);
            }
            return;
        }
        if (action === 'copy-sql') {
            try {
                if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(info.sqlQuery);
                    const btn = t.closest('[data-drill-action="copy-sql"]') as HTMLButtonElement;
                    if (btn) {
                        const original = btn.textContent;
                        btn.textContent = '✓ Copiado';
                        setTimeout(() => { btn.textContent = original; }, 1500);
                    }
                }
            } catch (err: any) {
                console.warn('[ecbt-drill:copy-sql]', err?.message || err);
            }
            return;
        }
    });

    // ESC fecha modal
    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(modal);
    dispatch('ecbt:audit-trail-drilldown-opened', { cellId, kind: info.kind, elementId: info.elementId });
}

export function closeEcbtAuditTrailPanel(): void {
    if (!isBrowser() || !currentState) return;
    const { rootEl, vm } = currentState;
    if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
    currentState = null;
    clearDeepLinkUrl();
    dispatch('ecbt:audit-trail-closed', { modelId: vm.modelId });
}

export function isEcbtAuditTrailPanelOpen(): boolean {
    return currentState !== null;
}

// ----------------------------------------------------------------
// DEEP LINK ADAPTER
// ----------------------------------------------------------------

/**
 * Entry-point para deep-link `?tools=ecbt-audit-trail[&payload=...]`.
 * Aceita payload opcional contendo ModelAuditInput serializado.
 * Se payload ausente ou inválido, abre painel em modo "demo vazio"
 * com 0 observações (consumer pode fechar e popular o modelo).
 */
/**
 * F15 wire model state Calvin 2026-06-07 — antes passava input DEMO ZERADO,
 * agora extrai dados REAIS do modelo carregado para popular blocos A-I:
 *  - observations: getAllElements()[].data.observations[] (Bloco A)
 *  - liabilities: buildCostRollup() OPEX+CAPEX (Bloco H/I)
 *  - assets: extractNaturalAssets() via __ecbtNaturalAssetCatalog (Bloco H/I)
 *  - campaigns count → campaignsPlanned/Executed (Bloco D.Cp)
 *  - marketValue: from window.__ecbtMarketValue (Calvin set; default totalCost)
 *
 * F15.1: pre-load i18n cache antes de render para evitar primeira render
 * com chaves cruas (block_A, block_B...).
 */
async function _buildAuditInputFromModel(): Promise<
    import('../../core/ecbtScore/_auditTrailPure.js').ModelAuditInput
> {
    const w = window as any;
    try {
        const [{ getAllElements }, { getAllCampaigns }, { buildCostRollup }, naturalAssets] = await Promise.all([
            import('../../core/elements/manager.js'),
            import('../../core/campaigns/manager.js'),
            import('../../core/analytics/economics/costRollup.js'),
            import('../../core/ecbtScore/_naturalAssetsPure.js'),
        ]);
        const elements = (getAllElements() || []) as any[];
        const campaigns = (getAllCampaigns() || []) as any[];

        // Observations flatmap — F16 mapper: campos reais (parameterId/value/unitId)
        // → shape ObservationInput esperado (pointId/attribute/reading/unit/matrix).
        // Inferência: matrix vem do elemento pai (well=water, plume=soil, etc).
        const FAMILY_MATRIX: Record<string, 'soil' | 'water' | 'air' | 'biota' | 'sediment'> = {
            well: 'water', plume: 'soil', stratum: 'soil', river: 'water', lake: 'water', spring: 'water',
            tank: 'water', sample: 'soil', emission_source: 'air', effluent_point: 'water',
            waste_stream: 'soil', habitat: 'biota', individual: 'biota', sensor: 'air',
        };
        const observations: any[] = [];
        for (const el of elements) {
            const obs = el?.data?.observations;
            if (!Array.isArray(obs)) continue;
            const family = String(el.family || el.familyId || '').toLowerCase();
            const matrix = FAMILY_MATRIX[family] || 'soil';
            const elementLabel = String(el?.data?.name || el.id || 'unknown');
            for (const o of obs) {
                observations.push({
                    pointId: elementLabel,
                    timestamp: String(o.date || o.timestamp || ''),
                    attribute: String(o.parameterId || o.attribute || 'unknown'),
                    reading: Number(o.value ?? o.reading ?? 0),
                    unit: String(o.unitId || o.unit || ''),
                    matrix,
                    author: String(o.createdBy || o.author || 'system'),
                    credentialLevel: String(o.credentialLevel || 'common') as any,
                    traced: Boolean(o.traced ?? o.createdBy != null),
                    onTime: Boolean(o.onTime ?? (o.plannedDate ? o.date === o.plannedDate : true)),
                    unitSI: Boolean(o.unitSI ?? (typeof o.unitId === 'string' && /^[a-zA-Z_]+$/.test(o.unitId))),
                    taxonMapped: Boolean(o.taxonMapped ?? o.parameterId != null),
                    nonDetect: Boolean(o.nonDetect ?? false),
                    elementId: el.id,
                });
            }
        }

        // Liabilities via cost rollup
        const rollup = buildCostRollup() as any;
        const opex = Number(rollup?.totalOpex || 0);
        const capex = Number(rollup?.totalCapex || 0);
        const totalCost = opex + capex;
        const currency = String(rollup?.currency || 'BRL');
        const liabilities = totalCost > 0
            ? [{ value: totalCost, expected: totalCost, low: totalCost * 0.75, high: totalCost * 1.25, currency, label: `OPEX+CAPEX` }]
            : [];

        // Assets via natural assets catalog (opt-in)
        const catalog = w.__ecbtNaturalAssetCatalog || {};
        const assetEntries = (naturalAssets as any).extractNaturalAssets(elements, catalog) as any[];
        const assets = assetEntries.map((a) => ({
            value: a.value,
            expected: a.value,
            low: a.value * (1 - (a.uncertaintyFraction || 0.3)),
            high: a.value * (1 + (a.uncertaintyFraction || 0.3)),
            currency: a.currency,
            label: a.label,
        }));

        const marketValue = Number(w.__ecbtMarketValue) || totalCost || 1; // mode F denom

        // Credencial — pode vir do session/user
        const credentialLevel = String(w.__ecbtCredentialLevel || 'common');

        // Campaign counts
        let campaignsPlanned = 0;
        let campaignsExecuted = 0;
        for (const c of campaigns) {
            campaignsPlanned += Number(c?.plannedReadings || c?.planned || 0);
            campaignsExecuted += Number(c?.executedReadings || c?.executed || 0);
        }
        if (campaignsPlanned === 0) campaignsPlanned = Math.max(1, campaigns.length);

        // Thresholds (limits) — futuro RF; vazio por enquanto
        const limits: any[] = [];

        return {
            modelId: 'modelo-atual',
            observations,
            limits,
            credentialLevel: credentialLevel as any,
            campaignsPlanned,
            campaignsExecuted,
            mode: 'F',
            marketValue,
            assets,
            liabilities,
            externalImpactScore: 0,
        };
    } catch (e: any) {
        console.warn('[ecbt-audit-trail:wire] _buildAuditInputFromModel failed', e?.message || e);
        // Fallback demo zerado
        return {
            modelId: 'demo-model',
            observations: [],
            limits: [],
            credentialLevel: 'common',
            campaignsPlanned: 1,
            campaignsExecuted: 0,
            mode: 'F',
            marketValue: 0,
            assets: [],
            liabilities: [],
            externalImpactScore: 0,
        };
    }
}

export async function openEcbtAuditTrailPanelFromPayload(payload?: unknown): Promise<void> {
    if (!isBrowser()) return;

    // F15.1 — pre-load i18n cache antes de qualquer render (evita primeira render com keys cruas)
    _loadI18n();
    await new Promise((r) => setTimeout(r, 50)); // dá tempo p/ Promise resolver

    const audit = await import('../../core/ecbtScore/_auditTrailPure.js');

    let input: import('../../core/ecbtScore/_auditTrailPure.js').ModelAuditInput;

    if (payload && typeof payload === 'object' && 'input' in payload) {
        input = (payload as { input: import('../../core/ecbtScore/_auditTrailPure.js').ModelAuditInput }).input;
    } else {
        // F15 — extrai dados REAIS do modelo carregado em vez de demo zerado
        input = await _buildAuditInputFromModel();
    }

    try {
        const vm = audit.buildAuditTrail(input);
        openEcbtAuditTrailPanel(vm);
        syncDeepLinkUrl('ecbt-audit-trail');
    } catch (err) {
        console.warn('[ecbt-audit-trail] falha ao construir VM:', (err as Error)?.message ?? err);
    }
}

// Test-only
export function _getCurrentStateForTest(): { modelId: string; expandedBlocks: string[] } | null {
    if (!currentState) return null;
    return {
        modelId: currentState.vm.modelId,
        expandedBlocks: Array.from(currentState.expanded),
    };
}
