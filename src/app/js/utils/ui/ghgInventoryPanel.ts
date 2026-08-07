// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.1.6

/* ================================================================
   GHG INVENTORY PANEL — Relatorio oficial 8 tabelas (T1..T8 + Capa)

   Spec: docs/specs/features/SPEC_GHG_PROTOCOL_INVENTARIO_RESUMO.md
   Feature flag: CONFIG.FEATURES.GHG_INVENTORY_REPORT (default off ate GA)

   Renderiza modal .ecbt-dialog--2xl com tab bar (Capa + T1..T8) e
   exporta XLSX via template `ghg-protocol` (9 sheets).

   Pure-UI: nenhum calculo aqui. Le elements/observations, delega
   buildGhgInventory() (core/reports/ghgInventory.ts) via dynamic
   import (modulo opcional, nao-bloqueante quando flag off).
   ================================================================ */

import { escapeHtml } from '../helpers/html.js';
import { CONFIG } from '../../config.js';
import type { GhgInventoryReport, T1Row, T2Row, T3Row, T7Row, T8Row } from '../../core/reports/ghgInventory.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';

// ----------------------------------------------------------------
// Lazy module access — toast.js + translations.js sao JS legacy
// (ainda nao migrados para TS). Dynamic import com variable path
// segue padrao estabelecido em analyticsRunner.ts.
// ----------------------------------------------------------------

type ToastType = 'success' | 'error' | 'warning' | 'info';
type ShowToast = (msg: string, type?: ToastType) => void;
type TFn = (key: string) => string;

let _cachedShowToast: ShowToast | null = null;
let _cachedT: TFn | null = null;

async function ensureToast(): Promise<ShowToast> {
    if (_cachedShowToast) return _cachedShowToast;
    try {
        const toastPath = './toast.js';
        const mod = (await import(/* @vite-ignore */ toastPath)) as { showToast?: ShowToast };
        _cachedShowToast = mod.showToast ?? ((m, _type) => console.warn('[ghgInventoryPanel]', m));
    } catch {
        _cachedShowToast = (m) => console.warn('[ghgInventoryPanel]', m);
    }
    return _cachedShowToast;
}

async function ensureT(): Promise<TFn> {
    if (_cachedT) return _cachedT;
    try {
        const translationsPath = '../i18n/translations.js';
        const mod = (await import(/* @vite-ignore */ translationsPath)) as { t?: TFn };
        _cachedT = mod.t ?? ((k: string) => k);
    } catch {
        _cachedT = (k: string) => k;
    }
    return _cachedT;
}

/** Synchronous toast — usa cache; se nao houver fallback no-op silencioso. */
function toast(msg: string, type?: ToastType): void {
    if (_cachedShowToast) {
        _cachedShowToast(msg, type);
        return;
    }
    void ensureToast().then((fn) => fn(msg, type));
}

/** Synchronous t — quando cache nao foi inicializado, retorna a key. */
function t(key: string): string {
    return _cachedT ? _cachedT(key) : key;
}

/**
 * Wrapper i18n com fallback explicito. `t(key)` retorna a propria key
 * quando ausente, dificultando `t(k) || fb`. Helper testa equivalencia.
 */
function tt(key: string, fallback: string): string {
    const v = t(key);
    return v === key || v == null ? fallback : v;
}

const MODAL_ID = 'ghg-inventory-modal';

interface TabDef {
    readonly id: string;
    readonly i18nKey: string;
    readonly label: string;
}

const TAB_DEFS: readonly TabDef[] = [
    { id: 'cover', i18nKey: 'ghgInventory.cover', label: 'Capa' },
    { id: 't1', i18nKey: 'ghgInventory.t1.title', label: 'T1: GEE x Escopos' },
    { id: 't2', i18nKey: 'ghgInventory.t2.title', label: 'T2: Biogenicas' },
    { id: 't3', i18nKey: 'ghgInventory.t3.title', label: 'T3: Escopo 1' },
    { id: 't4', i18nKey: 'ghgInventory.t4.title', label: 'T4: Escopo 2 (loc)' },
    { id: 't5', i18nKey: 'ghgInventory.t5.title', label: 'T5: Escopo 2 (mb)' },
    { id: 't6', i18nKey: 'ghgInventory.t6.title', label: 'T6: Escopo 3' },
    { id: 't7', i18nKey: 'ghgInventory.t7.title', label: 'T7: Intensidade' },
    { id: 't8', i18nKey: 'ghgInventory.t8.title', label: 'T8: Ano a ano' },
];

export interface OpenGhgInventoryPanelOptions {
    readonly inventoryYear?: number;
    /**
     * Versão do relatório IPCC para fatores GWP-100.
     * 'AR6' (default, 2021) | 'AR5' (2013) | 'AR4' (2007) | 'AR3' (TAR 2001).
     * Calvin diretiva 2026-06-03: usuário escolhe via dropdown UI.
     */
    readonly gwpVersion?: 'AR6' | 'AR5' | 'AR4' | 'AR3';
    readonly baselineYear?: number;
}

export interface OpenGhgInventoryPanelResult {
    readonly confirmed: boolean;
}

/**
 * Abre painel GHG Inventory Report.
 * Pre-condicoes:
 * - CONFIG.FEATURES.GHG_INVENTORY_REPORT === true
 * - core/reports/ghgInventory.{ts,js} carregavel via dynamic import
 * - >= 1 elemento com family === 'emission_source' no modelo
 */
interface ElementShape {
    readonly id?: string;
    readonly family?: string;
    readonly data?: { readonly observations?: ReadonlyArray<Record<string, unknown>> };
    readonly [key: string]: unknown;
}

type BuildGhgInventoryFn = (input: unknown) => GhgInventoryReport;

function _isFeatureEnabled(): boolean {
    const cfg = CONFIG as unknown as { FEATURES?: { GHG_INVENTORY_REPORT?: boolean } };
    return cfg.FEATURES?.GHG_INVENTORY_REPORT === true;
}

function _warnFeatureDisabled(): void {
    toast(
        tt(
            'ghgInventory.errors.featureDisabled',
            'Feature flag GHG_INVENTORY_REPORT desativada. Habilite em config.js.',
        ),
        'warning',
    );
}

async function _loadBuildGhgInventory(): Promise<BuildGhgInventoryFn | null> {
    try {
        const mod = (await import('../../core/reports/ghgInventory.js')) as unknown as {
            buildGhgInventory?: BuildGhgInventoryFn;
        };
        if (typeof mod.buildGhgInventory !== 'function') {
            throw new Error('buildGhgInventory export not found');
        }
        return mod.buildGhgInventory;
    } catch (err) {
        const msg = (err as { message?: string })?.message || String(err);
        toast(tt('ghgInventory.errors.moduleNotLoaded', 'Modulo GHG nao carregado: ') + msg, 'error');
        return null;
    }
}

async function _collectEmissionSources(): Promise<readonly ElementShape[]> {
    const elementsMod = (await import('../../core/elements/manager.js')) as unknown as {
        getAllElements: () => readonly ElementShape[] | undefined;
    };
    const elements = elementsMod.getAllElements() || [];
    return elements.filter((e) => e?.family === 'emission_source');
}

function _warnNoEmissionSources(): void {
    toast(
        tt(
            'ghgInventory.errors.noEmissionSources',
            'Adicione pelo menos 1 fonte de emissao (family: emission_source) para gerar inventario.',
        ),
        'warning',
    );
}

function _collectObservations(emissionSources: readonly ElementShape[]): Array<Record<string, unknown>> {
    const observations: Array<Record<string, unknown>> = [];
    for (const el of emissionSources) {
        const obsList = el?.data?.observations || [];
        for (const obs of obsList) {
            observations.push({ ...obs, elementId: el.id });
        }
    }
    return observations;
}

function _buildInventoryInput(
    emissionSources: readonly ElementShape[],
    observations: Array<Record<string, unknown>>,
    opts: OpenGhgInventoryPanelOptions,
): unknown {
    return {
        elements: emissionSources,
        observations,
        inventoryYear: opts.inventoryYear ?? new Date().getFullYear(),
        baselineYear: opts.baselineYear,
        organizationalBoundary: 'operational_control',
        gwpVersion: opts.gwpVersion ?? 'AR6',
    };
}

function _buildInventoryReport(
    buildGhgInventory: BuildGhgInventoryFn,
    emissionSources: readonly ElementShape[],
    observations: Array<Record<string, unknown>>,
    opts: OpenGhgInventoryPanelOptions,
): GhgInventoryReport | null {
    try {
        return buildGhgInventory(_buildInventoryInput(emissionSources, observations, opts));
    } catch (err) {
        const msg = (err as { message?: string })?.message || String(err);
        toast(tt('ghgInventory.errors.buildFailed', 'Falha ao calcular inventario: ') + msg, 'error');
        return null;
    }
}

function _mountModal(report: GhgInventoryReport): OpenGhgInventoryPanelResult {
    const old = document.getElementById(MODAL_ID);
    if (old) old.remove();

    const overlay = _buildOverlay(report, () => {
        overlay.remove();
        // Sprint 3 Tier-B (Calvin 2026-06-03): limpa ?tools=ghg-inventory
        clearDeepLinkUrl();
        // FINDING-012 (UI/UX Audit 2026-06-04, claude - ui): resolve
        // já foi chamado no mount — close callback só faz cleanup.
        // Antes resolve era aqui, bloqueando await fn() do dispatcher
        // até pixel-real close. Outros consumers (ghgRmspDemoLoader,
        // ghgInventoryHandler) fazem await sem usar o resultado —
        // semântica preservada.
    });
    document.body.appendChild(overlay);
    // Sprint 3 Tier-B (Calvin 2026-06-03): URL = estado painel aberto
    syncDeepLinkUrl('ghg-inventory');
    requestAnimationFrame(() => {
        const firstTab = overlay.querySelector('.ghg-tab') as HTMLElement | null;
        firstTab?.focus();
    });
    return { confirmed: false };
}

export async function openGhgInventoryPanel(
    opts: OpenGhgInventoryPanelOptions = {},
): Promise<null | OpenGhgInventoryPanelResult> {
    // 0. Pre-load legacy JS dependencies (toast + translations).
    await Promise.all([ensureToast(), ensureT()]);

    // 1. Feature flag check
    if (!_isFeatureEnabled()) {
        _warnFeatureDisabled();
        return null;
    }

    // 2. Dynamic import — modulo opcional, nao-bloqueante quando ausente
    const buildGhgInventory = await _loadBuildGhgInventory();
    if (!buildGhgInventory) return null;

    // 3. Coletar emission_sources
    const emissionSources = await _collectEmissionSources();
    if (emissionSources.length === 0) {
        _warnNoEmissionSources();
        return null;
    }

    // 4. Coletar observations (flat, vindas de el.data.observations)
    const observations = _collectObservations(emissionSources);

    // 5. Build inventory (pure function, sincrono)
    const report = _buildInventoryReport(buildGhgInventory, emissionSources, observations, opts);
    if (!report) return null;

    // 6. Renderizar modal
    return _mountModal(report);
}

/**
 * Constroi overlay completo (.ecbt-overlay + .ecbt-dialog--2xl).
 */
function _buildOverlay(report: GhgInventoryReport, onClose: () => void): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'ecbt-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ghg-modal-title');

    const dialog = document.createElement('div');
    dialog.className = 'ecbt-dialog ecbt-dialog--2xl';
    dialog.style.display = 'flex';
    dialog.style.flexDirection = 'column';

    // Header
    const header = document.createElement('div');
    header.className = 'ecbt-header';

    const titleEl = document.createElement('h2');
    titleEl.className = 'ecbt-title';
    titleEl.id = 'ghg-modal-title';
    const yr = report?.coverPage?.inventoryYear;
    const titleBase = tt('ghgInventory.title', 'Inventario GHG Protocol');
    titleEl.textContent = yr ? `${titleBase} — ${yr}` : titleBase;

    // Sprint 3 (Calvin 2026-06-03): seletor de versão IPCC GWP no header.
    // Permite usuário trocar AR3/AR4/AR5/AR6 em runtime sem fechar modal.
    // Re-trigger openGhgInventoryPanel com nova versão (recomputa report).
    const versionSelect = document.createElement('select');
    versionSelect.className = 'ghg-gwp-version-select';
    versionSelect.setAttribute('aria-label', tt('ghgInventory.gwpVersion', 'Versão IPCC'));
    versionSelect.style.cssText =
        'margin-right:12px;padding:4px 8px;border:1px solid var(--border-color,#333);border-radius:6px;background:var(--bg-secondary,#1e1e2e);color:var(--text-primary,#fff);font-size:12px;';
    const currentVer = report?.coverPage?.gwpVersion;
    const versions: Array<{ id: 'AR6' | 'AR5' | 'AR4' | 'AR3'; label: string }> = [
        { id: 'AR6', label: 'IPCC AR6 (2021)' },
        { id: 'AR5', label: 'IPCC AR5 (2013)' },
        { id: 'AR4', label: 'IPCC AR4 (2007)' },
        { id: 'AR3', label: 'IPCC TAR (2001)' },
    ];
    for (const v of versions) {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.label;
        if (currentVer === v.id) opt.selected = true;
        versionSelect.appendChild(opt);
    }
    versionSelect.addEventListener('change', () => {
        const newVer = versionSelect.value as 'AR6' | 'AR5' | 'AR4' | 'AR3';
        // Re-open with new version (overlay anterior é removido em openGhgInventoryPanel:214)
        const inventoryYear = report?.coverPage?.inventoryYear;
        const baselineYear = report?.coverPage?.baselineYear;
        onClose();
        void openGhgInventoryPanel({
            gwpVersion: newVer,
            ...(inventoryYear !== undefined ? { inventoryYear } : {}),
            ...(baselineYear !== undefined ? { baselineYear } : {}),
        });
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ecbt-close';
    closeBtn.innerHTML = '&#10005;';
    closeBtn.setAttribute('aria-label', tt('close', 'Fechar'));
    closeBtn.addEventListener('click', onClose);

    header.appendChild(titleEl);
    header.appendChild(versionSelect);
    header.appendChild(closeBtn);

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.className = 'ghg-tabs';
    tabBar.setAttribute('role', 'tablist');
    tabBar.style.cssText =
        'display:flex;flex-wrap:wrap;gap:4px;padding:8px 16px;border-bottom:1px solid var(--border-color,#333);background:var(--bg-secondary,#1e1e2e);';

    for (const tabDef of TAB_DEFS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ghg-tab';
        btn.dataset['tab'] = tabDef.id;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-controls', `ghg-panel-${tabDef.id}`);
        btn.setAttribute('aria-selected', tabDef.id === 'cover' ? 'true' : 'false');
        btn.tabIndex = tabDef.id === 'cover' ? 0 : -1;
        btn.style.cssText =
            'padding:6px 12px;border:1px solid var(--border-color,#333);border-radius:6px;background:transparent;color:var(--text-secondary,#aaa);font-size:12px;cursor:pointer;';
        btn.textContent = tt(tabDef.i18nKey, tabDef.label);
        if (tabDef.id === 'cover') {
            btn.classList.add('active');
            btn.style.background = 'var(--accent,#60a5fa)';
            btn.style.color = '#fff';
        }
        btn.addEventListener('click', () => _switchTab(dialog, tabDef.id));
        btn.addEventListener('keydown', (e) => _handleTabKey(e, dialog));
        tabBar.appendChild(btn);
    }

    // Body (scrollable container for tab panels)
    const body = document.createElement('div');
    body.className = 'ecbt-form';
    body.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px;min-height:280px;';
    body.innerHTML = _renderAllPanels(report);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'ecbt-actions';
    footer.style.cssText =
        'padding:12px 20px;border-top:1px solid var(--border-color,#333);background:var(--bg-secondary,#1e1e2e);';

    const btnXlsx = _btn('ghgInventory.actions.export.xlsx', 'Exportar XLSX', 'primary');
    btnXlsx.addEventListener('click', () => {
        void _exportXlsx(report, btnXlsx);
    });

    const btnPdf = _btn('ghgInventory.actions.export.pdf', 'Exportar PDF', 'cancel');
    btnPdf.addEventListener('click', () => _exportPdfPlaceholder(report));

    const btnClose = _btn('cancel', 'Fechar', 'cancel');
    btnClose.addEventListener('click', onClose);

    footer.appendChild(btnXlsx);
    footer.appendChild(btnPdf);
    footer.appendChild(btnClose);

    dialog.appendChild(header);
    dialog.appendChild(tabBar);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);

    // Close on overlay click (fora do dialog)
    overlay.addEventListener('click', (e: Event) => {
        if (e.target === overlay) onClose();
    });
    // Esc
    overlay.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    });

    return overlay;
}

/**
 * Cria botao com classe .ecbt-btn--<variant>.
 */
function _btn(
    i18nKey: string,
    fallback: string,
    variant: 'primary' | 'cancel' | 'danger' | 'outline',
): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ecbt-btn ecbt-btn--${variant}`;
    btn.textContent = tt(i18nKey, fallback);
    return btn;
}

/**
 * Troca tab visivel.
 */
function _switchTab(dialog: HTMLElement, tabId: string): void {
    dialog.querySelectorAll('.ghg-tab').forEach((tab) => {
        const el = tab as HTMLElement;
        const isActive = el.dataset['tab'] === tabId;
        el.classList.toggle('active', isActive);
        el.setAttribute('aria-selected', isActive ? 'true' : 'false');
        el.tabIndex = isActive ? 0 : -1;
        if (isActive) {
            el.style.background = 'var(--accent,#60a5fa)';
            el.style.color = '#fff';
        } else {
            el.style.background = 'transparent';
            el.style.color = 'var(--text-secondary,#aaa)';
        }
    });
    dialog.querySelectorAll('.ghg-panel').forEach((p) => {
        const el = p as HTMLElement;
        el.hidden = el.dataset['tab'] !== tabId;
    });
}

/**
 * Navegacao por teclado entre tabs (ArrowLeft/Right).
 */
function _handleTabKey(e: KeyboardEvent, dialog: HTMLElement): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const tabs = Array.from(dialog.querySelectorAll('.ghg-tab')).map((tab) => tab as HTMLElement);
    const idx = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    if (idx < 0) return;
    const nextIdx = e.key === 'ArrowLeft' ? (idx - 1 + tabs.length) % tabs.length : (idx + 1) % tabs.length;
    const next = tabs[nextIdx];
    if (!next) return;
    _switchTab(dialog, next.dataset['tab'] || '');
    next.focus();
}

function _renderScopeCategoryPanel(
    tabId: 't3' | 't4' | 't5' | 't6',
    rows: readonly T3Row[],
    i18nKey: string,
    fallback: string,
): string {
    return _wrapPanel(tabId, _renderCategoryTable(rows, tt(i18nKey, fallback)));
}

function _renderIntroPanels(report: GhgInventoryReport): string[] {
    return [
        _wrapPanel('cover', _renderCover(report)),
        _wrapPanel('t1', _renderT1(report?.t1_consolidatedByGasAndScope || [])),
        _wrapPanel('t2', _renderT2(report?.t2_biogenicEmissions || [])),
    ];
}

function _renderScopeCategoryPanels(report: GhgInventoryReport): string[] {
    return [
        _renderScopeCategoryPanel(
            't3',
            report?.t3_scope1ByCategory || [],
            'ghgInventory.t3.title',
            'Emissoes por categoria — Escopo 1',
        ),
        _renderScopeCategoryPanel(
            't4',
            report?.t4_scope2LocationByCategory || [],
            'ghgInventory.t4.title',
            'Emissoes por categoria — Escopo 2 (localizacao)',
        ),
        _renderScopeCategoryPanel(
            't5',
            report?.t5_scope2MarketBasedByCategory || [],
            'ghgInventory.t5.title',
            'Emissoes por categoria — Escopo 2 (escolha de compra)',
        ),
        _renderScopeCategoryPanel(
            't6',
            report?.t6_scope3ByCategory || [],
            'ghgInventory.t6.title',
            'Emissoes por categoria — Escopo 3',
        ),
    ];
}

function _renderTailPanels(report: GhgInventoryReport): string[] {
    return [
        _wrapPanel('t7', _renderT7(report?.t7_intensityIndicators || [])),
        _wrapPanel('t8', _renderT8(report?.t8_yearOverYearComparison)),
    ];
}

/**
 * Renderiza todos os 9 panels (so o ativo fica visivel via [hidden]).
 */
function _renderAllPanels(report: GhgInventoryReport): string {
    return [..._renderIntroPanels(report), ..._renderScopeCategoryPanels(report), ..._renderTailPanels(report)].join('');
}

/**
 * Envelope semantico de panel com role=tabpanel + aria-labelledby.
 */
function _wrapPanel(tabId: string, contentHtml: string): string {
    const hidden = tabId === 'cover' ? '' : 'hidden';
    return `<section class="ghg-panel" data-tab="${escapeHtml(tabId)}" id="ghg-panel-${escapeHtml(tabId)}" role="tabpanel" ${hidden}>${contentHtml}</section>`;
}

// ─── Capa ───────────────────────────────────────────────────────

function _renderCover(report: GhgInventoryReport): string {
    if (!report) return _renderEmpty('Sem dados de capa.');
    const cover = report.coverPage || ({} as GhgInventoryReport['coverPage']);
    const meta = report.metadata || ({} as GhgInventoryReport['metadata']);
    const metaAny = meta as unknown as Record<string, unknown>;
    const coverAny = cover as unknown as Record<string, unknown>;
    const rows: ReadonlyArray<readonly [string, string | number]> = [
        [tt('ghgInventory.year', 'Ano do inventario'), (cover.inventoryYear as number | undefined) ?? '-'],
        ['GWP Version', String(meta.gwpVersion ?? coverAny['gwpVersion'] ?? '-')],
        [
            tt('ghgInventory.cover.boundary', 'Limite organizacional'),
            escapeHtml(String(cover.organizationalBoundary ?? '-')),
        ],
        [tt('ghgInventory.cover.totalCo2e', 'Total tCO2e'), `<strong>${_fmtNum(report.totalTCO2e)}</strong>`],
        [tt('ghgInventory.cover.generatedAt', 'Gerado em'), escapeHtml(String(meta.generatedAt ?? '-'))],
        [tt('ghgInventory.cover.toolVersion', 'Versao da ferramenta'), escapeHtml(String(metaAny['toolVersion'] ?? '-'))],
    ];
    const tbody = rows.map(([k, v]) => `<tr><th scope="row">${escapeHtml(String(k))}</th><td>${v}</td></tr>`).join('');
    return `
        <table class="ecbt-table" aria-describedby="ghg-cover-caption">
            <caption id="ghg-cover-caption" style="text-align:left;padding:0 0 8px;color:var(--text-secondary,#aaa);">
                ${escapeHtml(tt('ghgInventory.cover', 'Capa do Inventario'))}
            </caption>
            <tbody>${tbody}</tbody>
        </table>
    `;
}

// ─── T1 ─────────────────────────────────────────────────────────

function _renderT1(rows: readonly T1Row[]): string {
    if (!rows || rows.length === 0) {
        return _renderEmpty(tt('ghgInventory.empty.t1', 'Sem emissoes para consolidar.'));
    }
    const tbody = rows
        .map(
            (r) => `<tr>
                <th scope="row">${escapeHtml(String(r.gas ?? ''))}</th>
                <td>${_fmtNum(r.tonnesScope1)}</td>
                <td>${_fmtNum(r.tonnesScope2Loc)}</td>
                <td>${_fmtNum(r.tonnesScope2Mb)}</td>
                <td>${_fmtNum(r.tonnesScope3)}</td>
                <td>${_fmtNum(r.co2eScope1)}</td>
                <td>${_fmtNum(r.co2eScope2Loc)}</td>
                <td>${_fmtNum(r.co2eScope2Mb)}</td>
                <td>${_fmtNum(r.co2eScope3)}</td>
            </tr>`,
        )
        .join('');
    return `
        <table class="ecbt-table">
            <caption style="text-align:left;padding:0 0 8px;color:var(--text-secondary,#aaa);">
                ${escapeHtml(tt('ghgInventory.t1.title', 'Emissoes consolidadas por GEE x Escopos'))}
            </caption>
            <thead>
                <tr>
                    <th scope="col">${escapeHtml(tt('ghgInventory.t1.gasColumn', 'GEE (t)'))}</th>
                    <th scope="col">t E1</th>
                    <th scope="col">t E2 loc</th>
                    <th scope="col">t E2 mb</th>
                    <th scope="col">t E3</th>
                    <th scope="col">tCO2e E1</th>
                    <th scope="col">tCO2e E2 loc</th>
                    <th scope="col">tCO2e E2 mb</th>
                    <th scope="col">tCO2e E3</th>
                </tr>
            </thead>
            <tbody>${tbody}</tbody>
        </table>
    `;
}

// ─── T2 ─────────────────────────────────────────────────────────

function _renderT2(rows: readonly T2Row[]): string {
    if (!rows || rows.length === 0) {
        return _renderEmpty(tt('ghgInventory.empty.t2', 'Sem emissoes biogenicas registradas.'));
    }
    const tbody = rows
        .map(
            (r) => `<tr>
                <th scope="row">${escapeHtml(String(r.source ?? ''))}</th>
                <td>${_fmtNum(r.biogenicCo2t)}</td>
                <td>${escapeHtml(String(r.note ?? ''))}</td>
            </tr>`,
        )
        .join('');
    return `
        <table class="ecbt-table">
            <caption style="text-align:left;padding:0 0 8px;color:var(--text-secondary,#aaa);">
                ${escapeHtml(tt('ghgInventory.t2.title', 'Emissoes de CO2 biogenico'))}
                <span class="ecbt-badge ecbt-badge--info" style="margin-left:8px;">
                    ${escapeHtml(tt('ghgInventory.notes.biogenic', 'Nao contam no total principal (GHG Protocol).'))}
                </span>
            </caption>
            <thead>
                <tr>
                    <th scope="col">${escapeHtml(tt('ghgInventory.t2.source', 'Fonte'))}</th>
                    <th scope="col">${escapeHtml(tt('ghgInventory.t2.biogenicCo2t', 'CO2 biogenico (t)'))}</th>
                    <th scope="col">${escapeHtml(tt('ghgInventory.t2.note', 'Observacao'))}</th>
                </tr>
            </thead>
            <tbody>${tbody}</tbody>
        </table>
    `;
}

// ─── T3..T6 (mesma estrutura: categoria, tCO2e, share%, sources) ──

function _renderCategoryTable(rows: readonly T3Row[], captionText: string): string {
    if (!rows || rows.length === 0) {
        return _renderEmpty(tt('ghgInventory.empty.category', 'Sem categorias para este escopo.'));
    }
    const tbody = rows
        .map(
            (r) => `<tr>
                <th scope="row">${escapeHtml(String(r.category ?? ''))}</th>
                <td>${_fmtNum(r.tco2e)}</td>
                <td>${_fmtPct(r.share)}</td>
                <td>${_fmtInt(r.sourceCount)}</td>
            </tr>`,
        )
        .join('');
    return `
        <table class="ecbt-table">
            <caption style="text-align:left;padding:0 0 8px;color:var(--text-secondary,#aaa);">
                ${escapeHtml(captionText)}
            </caption>
            <thead>
                <tr>
                    <th scope="col">${escapeHtml(tt('ghgInventory.category', 'Categoria'))}</th>
                    <th scope="col">tCO2e</th>
                    <th scope="col">${escapeHtml(tt('ghgInventory.share', 'Participacao'))}</th>
                    <th scope="col">${escapeHtml(tt('ghgInventory.sources', '# Fontes'))}</th>
                </tr>
            </thead>
            <tbody>${tbody}</tbody>
        </table>
    `;
}

// ─── T7 ─────────────────────────────────────────────────────────

function _renderT7(rows: readonly T7Row[]): string {
    if (!rows || rows.length === 0) {
        return _renderEmpty(
            tt(
                'ghgInventory.empty.t7',
                'Sem indicadores de intensidade. Configure denominadores em emission_source.data.intensityDenominators.',
            ),
        );
    }
    const tbody = rows
        .map(
            (r) => `<tr>
                <th scope="row">${escapeHtml(String(r.denominator ?? ''))}</th>
                <td>${_fmtNum(r.value)}</td>
                <td>${escapeHtml(String(r.unit ?? ''))}</td>
                <td>${_fmtNum(r.tco2ePerUnit)}</td>
                <td>${escapeHtml(String(r.trend ?? ''))}</td>
            </tr>`,
        )
        .join('');
    return `
        <table class="ecbt-table">
            <caption style="text-align:left;padding:0 0 8px;color:var(--text-secondary,#aaa);">
                ${escapeHtml(tt('ghgInventory.t7.title', 'Indicadores de intensidade'))}
            </caption>
            <thead>
                <tr>
                    <th scope="col">${escapeHtml(tt('ghgInventory.t7.denominator', 'Denominador'))}</th>
                    <th scope="col">${escapeHtml(tt('ghgInventory.t7.value', 'Valor'))}</th>
                    <th scope="col">${escapeHtml(tt('ghgInventory.t7.unit', 'Unidade'))}</th>
                    <th scope="col">tCO2e / un</th>
                    <th scope="col">${escapeHtml(tt('ghgInventory.t7.trend', 'Tendencia'))}</th>
                </tr>
            </thead>
            <tbody>${tbody}</tbody>
        </table>
    `;
}

// ─── T8 ─────────────────────────────────────────────────────────

function _renderT8(rows: readonly T8Row[] | null | undefined): string {
    if (!rows || rows.length === 0) {
        return _renderEmpty(
            tt('ghgInventory.empty.t8', 'Sem comparativo. Informe baselineYear ao abrir o painel para gerar T8.'),
        );
    }
    const tbody = rows
        .map(
            (r) => `<tr>
                <th scope="row">${escapeHtml(String(r.metric ?? ''))}</th>
                <td>${_fmtNum(r.baselineValue)}</td>
                <td>${_fmtNum(r.currentValue)}</td>
                <td>${_fmtNum(r.absoluteDelta)}</td>
                <td>${_fmtPct(r.percentDelta)}</td>
            </tr>`,
        )
        .join('');
    return `
        <table class="ecbt-table">
            <caption style="text-align:left;padding:0 0 8px;color:var(--text-secondary,#aaa);">
                ${escapeHtml(tt('ghgInventory.t8.title', 'Comparativo ano-base x ano-corrente'))}
            </caption>
            <thead>
                <tr>
                    <th scope="col">${escapeHtml(tt('ghgInventory.t8.metric', 'Metrica'))}</th>
                    <th scope="col">${escapeHtml(tt('ghgInventory.t8.baseline', 'Ano base'))}</th>
                    <th scope="col">${escapeHtml(tt('ghgInventory.t8.current', 'Ano atual'))}</th>
                    <th scope="col">${escapeHtml(tt('ghgInventory.t8.absDelta', 'Delta absoluto'))}</th>
                    <th scope="col">${escapeHtml(tt('ghgInventory.t8.pctDelta', 'Delta %'))}</th>
                </tr>
            </thead>
            <tbody>${tbody}</tbody>
        </table>
    `;
}

// ─── Helpers ────────────────────────────────────────────────────

function _renderEmpty(message: string): string {
    return `<div class="ecbt-empty">${escapeHtml(message)}</div>`;
}

function _fmtNum(v: unknown): string {
    if (v === null || v === undefined || v === '') return '-';
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    return n.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
    });
}

function _fmtPct(v: unknown): string {
    if (v === null || v === undefined || v === '') return '-';
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    // Aceita tanto fracao (0.42) quanto percentual ja resolvido (42).
    const pct = Math.abs(n) <= 1 ? n * 100 : n;
    return pct.toFixed(1) + '%';
}

function _fmtInt(v: unknown): string {
    if (v === null || v === undefined || v === '') return '0';
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    return String(Math.round(n));
}

// ─── Exports ────────────────────────────────────────────────────

/**
 * Exporta inventario para XLSX (9 sheets) via template `ghg-protocol`.
 * Passa `model.ghg = report` para xlsxTemplates.js:resolveGhgSource ler.
 */
async function _exportXlsx(report: GhgInventoryReport, btn: HTMLButtonElement): Promise<void> {
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = tt('ghgInventory.exporting', 'Exportando...');
    try {
        type ExportXLSXFn = (
            model: { elements: unknown[]; campaigns: unknown[]; ghg: GhgInventoryReport },
            opts: { template: string },
        ) => Promise<Blob>;
        const mod = (await import('../../core/io/formats/xlsx.js')) as unknown as { exportXLSX: ExportXLSXFn };
        const exportXLSX = mod.exportXLSX;
        // Modelo minimo: apenas o necessario para o engine de export resolver
        // sources `meta` e `ghgT1..ghgT8`. Elements/campaigns ausentes ok.
        const model = { elements: [], campaigns: [], ghg: report };
        const blob = await exportXLSX(model, { template: 'ghg-protocol' });
        const yr = report?.coverPage?.inventoryYear ?? new Date().getFullYear();
        _downloadBlob(blob, `ghg-inventario-${yr}.xlsx`);
        toast(tt('ghgInventory.exportSuccess', 'XLSX exportado com sucesso.'), 'success');
    } catch (err) {
        const msg = (err as { message?: string })?.message || String(err);
        toast(tt('ghgInventory.errors.exportFailed', 'Falha no export: ') + msg, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

/**
 * Stub para export PDF — fase 2 do roadmap.
 */
function _exportPdfPlaceholder(_report: GhgInventoryReport): void {
    toast(tt('ghgInventory.pdfPending', 'Export PDF pendente (Fase 2). Use XLSX por enquanto.'), 'info');
}

/**
 * Baixa blob como arquivo via anchor temporario.
 */
function _downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Re-renderiza painel quando aberto (no-op se fechado).
 * Caller pode invocar apos mudanca em emission_sources.
 */
export function refreshGhgInventoryPanel(): void {
    const existing = document.getElementById(MODAL_ID);
    if (!existing) return; // no-op
    existing.remove();
    void openGhgInventoryPanel();
}
