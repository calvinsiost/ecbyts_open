// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under AGPL-3.0-only
/* ================================================================
   SYSTEM CATALOG MODAL — programmatic registry of all features.
   Enumerates window.handle* + ACTION_REGISTRY + API endpoints.
   Lets user invoke any action via UI, even features without dedicated screens.
   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import { exportCsv, csvDateSuffix } from '../helpers/csvExport.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { asyncConfirm } from './asyncDialogs.js';
import { guardBackendFetch } from '../../main/guestGate.js';
import { dedupeAndSortItems, filterAndSliceItems, DEFAULT_RENDER_CAP, isMasterUser, buildQualityScoreReport, mapItemToModuleScore } from './_systemCatalogPure.js';
import type { SystemCatalogItem, QualityScoreReport, ScoreModuleRow } from './_systemCatalogPure.js';
import { getCurrentUser } from '../auth/session.js';
// Email do MASTER vem do supabase-config.js gerado no build (env MASTER_EMAIL,
// LGPD PIA R4 — sem PII no fonte). Namespace import degrada com graça se o
// supabase-config for antigo e não exportar o campo (gate fail-closed).
import * as runtimeConfig from '../../supabase-config.js';
const MASTER_EMAIL: string =
    typeof (runtimeConfig as { MASTER_EMAIL?: unknown }).MASTER_EMAIL === 'string'
        ? ((runtimeConfig as { MASTER_EMAIL?: string }).MASTER_EMAIL as string)
        : '';
/** Gate MASTER com o email configurado do runtime (fail-closed sem env). */
function isMasterSession(): boolean {
    return isMasterUser(getCurrentUser(), MASTER_EMAIL);
}
const MODAL_ID = 'system-catalog-modal';
const SEARCH_DEBOUNCE_MS = 100;
let _searchTimer: ReturnType<typeof setTimeout> | null = null;
let _cachedItems: SystemCatalogItem[] | null = null;
/**
 * Cached per-module rows for the Score column (MASTER only). Loaded once per
 * modal open from fetchQualityScoreReport(); null until it arrives (then the
 * table is re-rendered). Non-master users never trigger the fetch.
 */
let _cachedPorModulo: ScoreModuleRow[] | null = null;
/** @param {unknown} e */
function errorMessage(e: any) {
    return e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
}
/**
 * Discover all registered handlers/actions/apis in the running app.
 * @returns {Promise<SystemCatalogItem[]>}
 */
async function discoverItems(): Promise<SystemCatalogItem[]> {
    if (_cachedItems)
        return _cachedItems;
    const items: SystemCatalogItem[] = [];
    // 1. window.handle* / toggle* handlers (registered via utils/handlers/index.js)
    for (const key of Object.keys(/** @type {any} */ (window))) {
        if (typeof key !== 'string')
            continue;
        if (!key.startsWith('handle') && !key.startsWith('toggle'))
            continue;
        const fn = (window)[key];
        if (typeof fn !== 'function')
            continue;
        const label = key
            .replace(/^(handle|toggle)/, '')
            .replace(/([A-Z])/g, ' $1')
            .trim() as any;
        items.push({
            kind: 'handler',
            name: key,
            label,
            run: () => fn(),
        });
    }
    // 2. Core action catalog (CORE_CATALOG_ACTIONS)
    try {
        const m = await import('../../core/actions/coreCatalog.js' as string);
        if (Array.isArray(m.CORE_CATALOG_ACTIONS)) {
            for (const a of m.CORE_CATALOG_ACTIONS) {
                items.push({
                    kind: 'action',
                    name: a.id,
                    label: a.labelKey ? t(a.labelKey) || a.labelKey : a.id,
                    source: a.handler,
                    run: () => {
                        const h = (window)[a.handler];
                        if (typeof h === 'function')
                            return (h as any)();
                        showToast(`Handler "${a.handler}" não registrado`, 'warning');
                    },
                });
            }
        }
    }
    catch (e: any) {
        console.debug('[systemCatalog] coreCatalog import:', errorMessage(e));
    }
    // 3. API endpoints — ACTION_REGISTRY is Array<{name, params, cat, headlessSafe?, destructive?}>
    // Descriptions from swarm-generated actionDescriptions.js (~453 entries pt/en/es)
    /** @type {Record<string, {pt:string,en:string,es:string}>} */
    let descMap = {};
    try {
        const dm = await import('../api/actionDescriptions.js' as string);
        descMap = dm.ACTION_DESCRIPTIONS || {};
    }
    catch (e: any) {
        console.debug('[systemCatalog] no descriptions:', errorMessage(e));
    }
    try {
        const m = (await import('../api/registry.js' as string)) as Record<string, any>;
        const registry = m.ACTION_REGISTRY || m.actionRegistry || m.default;
        if (Array.isArray(registry)) {
            const lang = typeof navigator !== 'undefined' && navigator.language?.startsWith('pt')
                ? 'pt'
                : typeof navigator !== 'undefined' && navigator.language?.startsWith('es')
                    ? 'es'
                    : 'en';
            for (const entry of registry) {
                if (!entry || typeof entry !== 'object' || !entry.name)
                    continue;
                const paramsStr = Array.isArray(entry.params) && entry.params.length > 0 ? `(${entry.params.join(', ')})` : '()';
                const cat = entry.cat || 'general';
                const isDestructive = !!entry.destructive;
                const destructive = isDestructive ? ' ⚠️ destrutivo' : '';
                const headless = entry.headlessSafe === false ? ' (requer UI)' : '';
                const apiName = entry.name;
                const desc = (descMap as any)[apiName]?.[lang] || (descMap as any)[apiName]?.pt || '';
                const labelBase = `[${cat}] ${apiName}${paramsStr}${destructive}${headless}`;
                items.push({
                    kind: 'api',
                    name: apiName,
                    label: desc ? `${labelBase} — ${desc}` : labelBase,
                    source: paramsStr,
                    destructive: isDestructive,
                    run: async () => {
                        // ECBYTS-OPEN-LOCAL-001 F1 (RF1/A11): ação — toast + abort.
                        if (!guardBackendFetch('system-catalog:api-action', 'action')) return;
                        const result = await fetch('/api/action', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: apiName }),
                        })
                            .then((r) => r.json())
                            .catch((e) => ({ error: errorMessage(e) }));
                        showToast(`API ${apiName}: ${JSON.stringify(result).slice(0, 80)}`, 'info');
                    },
                });
            }
        }
    }
    catch (e: any) {
        console.debug('[systemCatalog] api registry import:', errorMessage(e));
    }
    // Dedupe by kind+name + sort by name — pure logic in _systemCatalogPure.
    _cachedItems = dedupeAndSortItems(items);
    return _cachedItems;
}
/**
 * Color class for a module score, mirroring the MASTER section thresholds
 * (verde≥850, amarelo 700-849, vermelho<700). Pure string → class.
 * @param {number} score
 */
function scoreColorClass(score: number): string {
    if (score >= 850) return 'syscat-modscore--good';
    if (score >= 700) return 'syscat-modscore--warn';
    return 'syscat-modscore--bad';
}

/**
 * Build the Score <td> for an item (MASTER only). Shows the colored module
 * score, or "—" when the item maps to no scored module / report not loaded.
 * @param {SystemCatalogItem} item
 * @param {ScoreModuleRow[]|null} porModulo
 */
function renderScoreCell(item: SystemCatalogItem, porModulo: ScoreModuleRow[] | null): string {
    const mapped = porModulo ? mapItemToModuleScore(item, porModulo) : null;
    if (!mapped) {
        return '<td style="text-align:right;color:var(--text-tertiary,#888)">—</td>';
    }
    const cls = scoreColorClass(mapped.score);
    const title = escapeHtml(mapped.modulo);
    return `<td style="text-align:right"><span class="syscat-modscore ${cls}" title="${title}">${mapped.score}</span></td>`;
}

/**
 * Build the table HTML for the given items + query, returning both the
 * markup and the counts so the caller can warn about truncation (the cap
 * is no longer silent — see filterAndSliceItems).
 *
 * The Score column is rendered ONLY when `showScore` is true (MASTER gate,
 * decided by the caller). Non-master users get the historic 4-column table
 * with no score data — zero leakage.
 *
 * @param {SystemCatalogItem[]} items
 * @param {string} query
 * @param {boolean} showScore - true ⇒ render the MASTER-only Score column.
 * @param {ScoreModuleRow[]|null} porModulo - per-module scores (or null until loaded).
 */
function renderRows(
    items: SystemCatalogItem[],
    query: string,
    showScore: boolean = false,
    porModulo: ScoreModuleRow[] | null = null,
): { html: string; total: number; shown: number; truncated: boolean } {
    const { rows, total, shown, truncated } = filterAndSliceItems(items, query, DEFAULT_RENDER_CAP);
    // colspan tracks the actual column count (4 normally, 5 with the Score col).
    const colspan = showScore ? 5 : 4;
    if (total === 0) {
        const empty = escapeHtml(t('systemCatalog.empty') || 'Nenhum resultado');
        return {
            html: `<tr><td colspan="${colspan}" style="text-align:center;padding:20px;color:var(--text-tertiary,#888)">${empty}</td></tr>`,
            total,
            shown,
            truncated,
        };
    }
    const runLabel = escapeHtml(t('systemCatalog.run') || 'Invocar');
    const html = rows
        .map((item) => {
            const kind = escapeHtml(item.kind);
            const name = escapeHtml(item.name);
            const label = escapeHtml(item.label);
            const scoreCell = showScore ? renderScoreCell(item, porModulo) : '';
            return ('<tr>' +
                `<td><span class="syscat-kind syscat-kind--${kind}">${kind}</span></td>` +
                `<td><code style="font-size:11px">${name}</code></td>` +
                `<td>${label}</td>` +
                scoreCell +
                `<td><button class="syscat-run-btn" data-name="${name}" data-kind="${kind}">▶ ${runLabel}</button></td>` +
                '</tr>');
        })
        .join('');
    return { html, total, shown, truncated };
}
/**
 * Execute a catalog item, surfacing sync/async outcome via toasts.
 * @param {SystemCatalogItem} item
 */
function invokeItem(item: SystemCatalogItem): void {
    const name = item.name;
    try {
        const result = item.run();
        const maybePromise = result as { then?: unknown };
        if (result && typeof maybePromise.then === 'function') {
            showToast(`Invocando ${name}...`, 'info');
            Promise.resolve(result)
                .then(() => showToast(`${name} executado`, 'success'))
                .catch((e) => showToast(`${name}: ${errorMessage(e)}`, 'error'));
        }
        else {
            showToast(`${name} executado`, 'success');
        }
    }
    catch (e: any) {
        showToast(`Erro: ${errorMessage(e)}`, 'error');
    }
}
/**
 * @param {HTMLElement} tbody
 * @param {SystemCatalogItem[]} items
 */
function attachRunHandlers(tbody: HTMLElement, items: SystemCatalogItem[]): void {
    tbody.querySelectorAll('.syscat-run-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const name = btn.getAttribute('data-name');
            const kind = btn.getAttribute('data-kind');
            const item = items.find((i) => i.name === name && i.kind === kind);
            if (!item)
                return;
            // Safety gate: destructive actions require explicit confirmation
            // before running (avoids 1-click execution of destructive APIs).
            if (item.destructive) {
                const msg = `Ação destrutiva: "${item.name}".\n\nConfirma a execução?`;
                void asyncConfirm(msg, {
                    confirmLabel: 'Executar',
                    cancelLabel: 'Cancelar',
                    danger: true,
                }).then((ok) => {
                    if (ok) invokeItem(item);
                });
                return;
            }
            invokeItem(item);
        });
    });
}
/**
 * Fetch the quality score report from the api-server (read-only).
 * Same invocation pattern the catalog uses for APIs: POST /api/action.
 * @returns {Promise<QualityScoreReport|null>} null on any failure (no throw).
 */
async function fetchQualityScoreReport(): Promise<QualityScoreReport | null> {
    // ECBYTS-OPEN-LOCAL-001 F1: leitura passiva na abertura do modal — skip
    // silencioso em Modo Convidado (o caller já trata null sem quebrar).
    if (!guardBackendFetch('system-catalog:quality-score', 'boot')) return null;
    try {
        const r = await fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'quality-score-report' }),
        });
        const payload = await r.json();
        const data = payload && payload.success ? payload.data : payload?.data || payload;
        if (!data || typeof data !== 'object') return null;
        // Re-assemble defensively through the pure builder so the modal is robust
        // to shape drift: builder tolerates the already-assembled shape too.
        return buildQualityScoreReport(
            { score: data.geral?.score, grade: data.geral?.grade, bottleneck: data.geral?.bottleneck, components: data.pilares },
            data.porModulo,
        );
    } catch (e: any) {
        console.debug('[systemCatalog] score report fetch failed:', errorMessage(e));
        return null;
    }
}

/**
 * Build the MASTER-only "Score Unified" section markup from a report.
 * Returns '' when the report is empty (no leakage, no broken UI).
 * @param {QualityScoreReport} report
 */
function renderMasterScoreSection(report: QualityScoreReport): string {
    const g = report.geral;
    const hasGeral = Number.isFinite(g?.score) && g.score > 0;
    if (!hasGeral && (!report.porModulo || report.porModulo.length === 0)) return '';
    const title = escapeHtml(t('systemCatalog.scoreTitle') || '📊 Score Unified (MASTER)');
    const bn = g.bottleneck;
    const gargalo = bn
        ? `${escapeHtml(t('systemCatalog.scoreBottleneck') || 'Gargalo')}: <strong>${escapeHtml(bn.label)}</strong> ${bn.score} [${escapeHtml(bn.grade)}]`
        : '';
    const geralHtml = hasGeral
        ? `<div class="syscat-score-geral">` +
          `<span class="syscat-score-big">${g.score}<span class="syscat-score-max">/1000</span></span>` +
          `<span class="syscat-score-grade syscat-score-grade--${escapeHtml(g.grade)}">${escapeHtml(g.grade)}</span>` +
          (gargalo ? `<span class="syscat-score-gargalo">${gargalo}</span>` : '') +
          `</div>`
        : '';
    // Pilares (do score geral)
    const pilaresRows = (report.pilares || [])
        .map(
            (p) =>
                `<tr><td>${escapeHtml(p.label)}</td>` +
                `<td style="text-align:right">${p.score}</td>` +
                `<td style="text-align:center">${escapeHtml(p.grade)}</td>` +
                `<td style="text-align:right">${Math.round((p.weight || 0) * 100)}%</td></tr>`,
        )
        .join('');
    const pilaresHtml = pilaresRows
        ? `<details class="syscat-score-details"><summary>${escapeHtml(t('systemCatalog.scorePillars') || 'Pilares do score geral')} (${report.pilares.length})</summary>` +
          `<table class="syscat-score-table"><thead><tr>` +
          `<th style="text-align:left">${escapeHtml(t('systemCatalog.scorePillar') || 'Pilar')}</th>` +
          `<th style="text-align:right">Score</th><th style="text-align:center">Grade</th>` +
          `<th style="text-align:right">${escapeHtml(t('systemCatalog.scoreWeight') || 'Peso')}</th>` +
          `</tr></thead><tbody>${pilaresRows}</tbody></table></details>`
        : '';
    // Por módulo (por tela)
    const fmt = (n: number | null) => (n == null ? '—' : String(Math.round(n)));
    const moduloRows = (report.porModulo || [])
        .map(
            (m) =>
                `<tr><td><code>${escapeHtml(m.modulo)}</code></td>` +
                `<td style="text-align:right"><strong>${m.score}</strong></td>` +
                `<td style="text-align:right">${fmt(m.code)}</td>` +
                `<td style="text-align:right">${fmt(m.wcag)}</td>` +
                `<td style="text-align:right">${fmt(m.ux)}</td></tr>`,
        )
        .join('');
    const moduloHtml = moduloRows
        ? `<details class="syscat-score-details" open><summary>${escapeHtml(t('systemCatalog.scoreByModule') || 'Score por módulo')} (${report.porModulo.length})</summary>` +
          `<table class="syscat-score-table"><thead><tr>` +
          `<th style="text-align:left">${escapeHtml(t('systemCatalog.scoreModule') || 'Módulo')}</th>` +
          `<th style="text-align:right">Score</th><th style="text-align:right">code</th>` +
          `<th style="text-align:right">wcag</th><th style="text-align:right">ux</th>` +
          `</tr></thead><tbody>${moduloRows}</tbody></table></details>`
        : '';
    return (
        `<div class="syscat-score-section">` +
        `<div class="syscat-score-head"><span class="syscat-score-title">${title}</span></div>` +
        geralHtml +
        pilaresHtml +
        moduloHtml +
        `</div>`
    );
}

/**
 * Inject (or refresh) the MASTER score section at the top of the modal body.
 * Strict gate: renders NOTHING for non-master / logged-out users.
 * @param {HTMLElement} modal
 */
async function renderMasterScore(modal: HTMLElement, onPorModulo?: (rows: ScoreModuleRow[]) => void): Promise<void> {
    const mount = modal.querySelector('.syscat-score-mount') as HTMLElement | null;
    if (!mount) return;
    // GATE: non-master = zero leakage. Clear any stale content and bail.
    if (!isMasterSession()) {
        mount.innerHTML = '';
        return;
    }
    mount.innerHTML = `<div class="syscat-score-loading">${escapeHtml(t('systemCatalog.scoreLoading') || 'Carregando score...')}</div>`;
    const report = await fetchQualityScoreReport();
    // Re-check the gate after the await (defense-in-depth against session change).
    if (!isMasterSession()) {
        mount.innerHTML = '';
        return;
    }
    if (!report) {
        mount.innerHTML = `<div class="syscat-score-loading">${escapeHtml(t('systemCatalog.scoreUnavailable') || 'Score indisponível (api-server offline?)')}</div>`;
        return;
    }
    mount.innerHTML = renderMasterScoreSection(report);
    // Hand the per-module rows to the table so its Score column can fill in
    // (the report arrives async; the table first renders with "—" then refreshes).
    _cachedPorModulo = report.porModulo || [];
    if (onPorModulo) onPorModulo(_cachedPorModulo);
}

export async function openSystemCatalogModal() {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'ecbt-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        const title = escapeHtml(t('systemCatalog.title') || 'System Catalog');
        const desc = escapeHtml(t('systemCatalog.description') ||
            'Todas as funções, handlers, actions e APIs registradas no sistema. Clique em Invocar para executar.');
        const search = escapeHtml(t('systemCatalog.search') || 'Filtrar por nome ou label...');
        const h1 = escapeHtml(t('systemCatalog.kind') || 'Tipo');
        const h2 = escapeHtml(t('systemCatalog.name') || 'Nome');
        const h3 = escapeHtml(t('systemCatalog.label') || 'Descrição');
        const h4 = escapeHtml(t('systemCatalog.action') || 'Ação');
        // MASTER-only Score column header. Non-master sees the historic 4-col table.
        const showScoreCol = isMasterSession();
        const hScore = escapeHtml(t('systemCatalog.scoreColumn') || 'Score');
        const scoreTh = showScoreCol
            ? `<th class="syscat-th-score" style="text-align:right;padding:8px;width:70px">${hScore}</th>`
            : '';
        modal.innerHTML =
            '' +
                '<div class="ecbt-dialog ecbt-dialog--xl" style="max-width:960px">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
                `<h2 style="margin:0">${title}</h2>` +
                '<button class="syscat-close ecbt-btn" style="padding:4px 10px">&times;</button>' +
                '</div>' +
                `<p style="color:var(--text-tertiary,#888);font-size:12px;margin:0 0 12px">${desc}</p>` +
                // MASTER-only score section mount (populated by renderMasterScore;
                // stays empty for non-master users → zero leakage).
                '<div class="syscat-score-mount"></div>' +
                '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">' +
                `<input type="search" class="syscat-search" placeholder="${search}" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border-color,#444);background:var(--bg-primary,#121220);color:var(--text-primary,#fff)">` +
                `<button class="syscat-export-csv ecbt-btn" style="padding:8px 14px;font-size:12px;white-space:nowrap" title="${escapeHtml(t('systemCatalog.exportCsvTitle') || 'Exporta a lista filtrada como CSV')}">${escapeHtml(t('systemCatalog.exportCsv') || 'Export CSV')}</button>` +
                '</div>' +
                '<div class="syscat-count" style="color:var(--text-tertiary,#888);font-size:11px;margin-bottom:8px"></div>' +
                '<div style="max-height:60vh;overflow-y:auto;border:1px solid var(--border-color,#333);border-radius:6px">' +
                '<table class="syscat-table" style="width:100%;border-collapse:collapse;font-size:12px">' +
                '<thead style="position:sticky;top:0;background:var(--bg-secondary,#1a1a2a);z-index:1">' +
                `<tr><th style="text-align:left;padding:8px">${h1}</th><th style="text-align:left;padding:8px">${h2}</th><th style="text-align:left;padding:8px">${h3}</th>${scoreTh}<th style="text-align:left;padding:8px;width:90px">${h4}</th></tr>` +
                '</thead><tbody class="syscat-tbody"></tbody></table></div>' +
                '<style>' +
                '.syscat-kind { display:inline-block; padding:2px 6px; border-radius:3px; font-size:10px; font-weight:600; }' +
                '.syscat-kind--handler { background:rgba(96,165,250,0.2); color:#60a5fa; }' +
                '.syscat-kind--action { background:rgba(34,197,94,0.2); color:#22c55e; }' +
                '.syscat-kind--api { background:rgba(251,146,60,0.2); color:#fb923c; }' +
                '.syscat-table tbody tr:hover { background:rgba(255,255,255,0.03); }' +
                '.syscat-table td { padding:8px; border-bottom:1px solid rgba(255,255,255,0.05); }' +
                '.syscat-run-btn { padding:4px 8px; font-size:11px; cursor:pointer; background:var(--accent,#60a5fa); color:#fff; border:none; border-radius:4px; }' +
                '.syscat-run-btn:hover { background:var(--accent-hover,#3b82f6); }' +
                // MASTER-only module-score cell in the main table (gated by isMasterUser).
                '.syscat-modscore { display:inline-block; font-weight:700; font-variant-numeric:tabular-nums; }' +
                '.syscat-modscore--good { color:#22c55e; }' +
                '.syscat-modscore--warn { color:#fbbf24; }' +
                '.syscat-modscore--bad { color:#f87171; }' +
                // MASTER score section (read-only; gated by isMasterUser).
                '.syscat-score-section { margin:0 0 14px; padding:12px; border:1px solid var(--border-color,#333); border-radius:8px; background:rgba(96,165,250,0.06); }' +
                '.syscat-score-head { margin-bottom:8px; }' +
                '.syscat-score-title { font-weight:700; font-size:13px; color:var(--text-primary,#fff); }' +
                '.syscat-score-geral { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:10px; }' +
                '.syscat-score-big { font-size:28px; font-weight:800; color:var(--text-primary,#fff); line-height:1; }' +
                '.syscat-score-max { font-size:13px; font-weight:500; color:var(--text-tertiary,#888); }' +
                '.syscat-score-grade { font-weight:800; font-size:16px; padding:2px 10px; border-radius:6px; background:rgba(34,197,94,0.18); color:#22c55e; }' +
                '.syscat-score-grade--C, .syscat-score-grade--D { background:rgba(251,191,36,0.18); color:#fbbf24; }' +
                '.syscat-score-grade--E, .syscat-score-grade--F { background:rgba(248,113,113,0.18); color:#f87171; }' +
                '.syscat-score-gargalo { font-size:12px; color:var(--text-secondary,#bbb); }' +
                '.syscat-score-details { margin-top:8px; }' +
                '.syscat-score-details > summary { cursor:pointer; font-size:12px; font-weight:600; color:var(--text-secondary,#bbb); padding:4px 0; }' +
                '.syscat-score-table { width:100%; border-collapse:collapse; font-size:11px; margin-top:6px; }' +
                '.syscat-score-table th { text-align:left; padding:4px 8px; color:var(--text-tertiary,#888); border-bottom:1px solid rgba(255,255,255,0.08); position:sticky; top:0; background:var(--bg-secondary,#1a1a2a); }' +
                '.syscat-score-table td { padding:4px 8px; border-bottom:1px solid rgba(255,255,255,0.04); }' +
                '.syscat-score-loading { font-size:12px; color:var(--text-tertiary,#888); padding:8px 0; }' +
                '</style>' +
                '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal)
                closeSystemCatalogModal();
        });
        const closeBtn = modal.querySelector('.syscat-close');
        if (closeBtn)
            closeBtn.addEventListener('click', closeSystemCatalogModal);
    }
    /** @type {HTMLElement} */ (modal).style.display = 'flex';
    syncDeepLinkUrl('system-catalog');
    const items = await discoverItems();
    const tbody = (modal.querySelector('.syscat-tbody')) as HTMLElement;
    const countEl = (modal.querySelector('.syscat-count')) as HTMLElement;
    const searchEl = (modal.querySelector('.syscat-search')) as HTMLInputElement;
    // Re-evaluate the MASTER gate on every open (session may have changed).
    // Non-master ⇒ showScore=false ⇒ historic 4-column table, no score data.
    const showScore = isMasterSession();
    // The modal DOM is built once and reused; keep the Score column HEADER in
    // sync with the CURRENT gate so a session change between opens never leaks
    // (or hides) the column. Rows are already re-gated each refresh().
    const headRow = modal.querySelector('.syscat-table thead tr') as HTMLElement | null;
    const existingScoreTh = headRow?.querySelector('.syscat-th-score') as HTMLElement | null;
    if (headRow) {
        if (showScore && !existingScoreTh) {
            // Insert the Score <th> between Descrição (3rd) and Ação (last).
            const th = document.createElement('th');
            th.className = 'syscat-th-score';
            th.setAttribute('style', 'text-align:right;padding:8px;width:70px');
            th.textContent = t('systemCatalog.scoreColumn') || 'Score';
            const actionTh = headRow.lastElementChild;
            headRow.insertBefore(th, actionTh);
        } else if (!showScore && existingScoreTh) {
            existingScoreTh.remove();
        }
    }
    /** @param {string} q */
    const refresh = (q: string) => {
        const result = renderRows(items, q || '', showScore, showScore ? _cachedPorModulo : null);
        if (tbody)
            tbody.innerHTML = result.html;
        if (countEl) {
            const grandTotal = items.length;
            // result.total = matches for the query; result.shown = rows after cap.
            const base = `${result.total} / ${grandTotal} items (handlers + actions + apis)`;
            countEl.textContent = result.truncated
                ? `${base} — mostrando ${result.shown} de ${result.total}`
                : base;
        }
        if (tbody)
            attachRunHandlers(tbody, items);
    };
    refresh('');
    // MASTER-only: populate the score section AND fill the table's Score column.
    // Fire-and-forget — gated internally, renders nothing for non-master users
    // and never blocks the catalog render. When the per-module rows arrive, the
    // table is re-rendered so the "—" placeholders become real scores.
    void renderMasterScore(modal as HTMLElement, () => {
        if (showScore) refresh(searchEl ? searchEl.value : '');
    });
    if (searchEl) {
        searchEl.value = '';
        searchEl.addEventListener('input', (e) => {
            if (_searchTimer)
                clearTimeout(_searchTimer);
            _searchTimer = setTimeout(() => refresh((e.target as HTMLInputElement)?.value || ''), SEARCH_DEBOUNCE_MS);
        });
        searchEl.focus();
    }
    const exportBtn = modal.querySelector('.syscat-export-csv') as HTMLButtonElement | null;
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            try {
                const q = searchEl ? searchEl.value : '';
                // CSV exports the full filtered set (cap=0 = no truncation).
                const { rows: filtered } = filterAndSliceItems(items, q, 0);
                // MASTER-only: append module + score columns (gated, no leakage).
                const headers = showScore
                    ? ['kind', 'name', 'label', 'source', 'module', 'score']
                    : ['kind', 'name', 'label', 'source'];
                const rows = filtered.map((i) => {
                    const base = [i.kind, i.name, i.label, i.source || ''];
                    if (!showScore) return base;
                    const mapped = _cachedPorModulo ? mapItemToModuleScore(i, _cachedPorModulo) : null;
                    return [...base, mapped ? mapped.modulo : '', mapped ? String(mapped.score) : ''];
                });
                exportCsv(headers, rows, `ecbyts-system-catalog-${csvDateSuffix()}`);
                showToast(`${t('systemCatalog.exported') || 'CSV exportado'} (${filtered.length} items)`, 'success');
            } catch (e: any) {
                showToast(`Export CSV: ${errorMessage(e)}`, 'error');
            }
        });
    }
}
export function closeSystemCatalogModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) /** @type {HTMLElement} */
        (modal).style.display = 'none';
    clearDeepLinkUrl();
}
export function _resetForTests() {
    _cachedItems = null;
    _cachedPorModulo = null;
}
