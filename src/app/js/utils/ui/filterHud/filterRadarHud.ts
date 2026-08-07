// @ts-check
// Generated from src/app/js/utils/ui/filterHud/filterRadarHud.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   FILTER RADAR HUD — UI integration layer (FEAT-FILTER-RADAR-001)

   Entry point for the grouped parameter radar HUD.
   Wires pure core modules (radarConfig, aggregations, elementGroupIndex,
   searchIndex, visibilityEngine) into the 3D viewport.

   Current phase: integration shell — Canvas renderer (radarHud.js)
   and drill-down panel (drillDownPanel.js) are loaded on first open.
   ================================================================ */
import { t } from '../../i18n/translations.js';
import { computeAggregatedRadar, buildGroupIndex } from '../../../core/filter/elementGroupIndex.js';
import { lazyImport } from '../../helpers/lazyImport.js';
let _initialized = false;
let _panelOpen = false;
// Stores last rendered group positions for click hit-testing
let _lastRenderedGroups: any = [];
/** @type {any} */
let _drillDownModule: any = null;
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Open / toggle the filter radar HUD panel.
 * Lazy-loads renderer modules on first use.
 */
export async function toggleFilterRadarHud() {
    if (!_initialized) {
        await _init();
    }
    _panelOpen = !_panelOpen;
    const panel = document.getElementById('filter-radar-hud');
    if (panel) {
        panel.style.display = _panelOpen ? 'block' : 'none';
    }
    if (_panelOpen) {
        _refresh();
    }
}
/**
 * Close the filter radar HUD.
 */
export function closeFilterRadarHud() {
    _panelOpen = false;
    const panel = document.getElementById('filter-radar-hud');
    if (panel) panel.style.display = 'none';
}
/**
 * Refresh radar data from current model.
 * @param {Object} [opts]
 * @param {string} [opts.aggregationId='mean']
 * @param {string} [opts.searchQuery='']
 * @param {string[]} [opts.visibleGroupIds]
 */
export async function refreshFilterRadar( opts: any = {}) {
    if (!_panelOpen) return;
    // REF-SWEEPS RF-2: refreshFilterRadar e chamado fire-and-forget (setTimeout do
    // debounce de busca e handlers de click) — o import() cru virava
    // 'Uncaught (in promise)'. Sem o chunk mantemos o painel como esta.
    const _mgr = await lazyImport('../../../core/elements/manager.js', { importer: () => import('../../../core/elements/manager.js' as string) });
    if (!_mgr) return;
    const elements = _mgr.getAllElements?.() || [];
    const index = buildGroupIndex(elements);
    const radarData = computeAggregatedRadar(index, opts.aggregationId || 'mean');
    _render(radarData, opts);
}
// ----------------------------------------------------------------
// INTERNALS
// ----------------------------------------------------------------
async function _init() {
    if (_initialized) return;
    _ensureDom();
    // Lazy-load drill-down module
    _drillDownModule = await import('./drillDownPanel.js' as string).catch(() => null);
    _initialized = true;
}
function _ensureDom() {
    if (document.getElementById('filter-radar-hud')) return;
    const panel = document.createElement('div');
    panel.id = 'filter-radar-hud';
    panel.className = 'filter-radar-hud';
    panel.style.display = 'none';
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', t('filter.radar.title') || 'Parameter Radar');
    panel.innerHTML = `
        <div class="filter-radar-header">
            <span class="filter-radar-title">${t('filter.radar.title') || 'Parameter Radar'}</span>
            <button type="button" class="filter-radar-close" aria-label="${t('close') || 'Close'}">×</button>
        </div>
        <div class="filter-radar-search">
            <input type="text" class="filter-radar-search-input"
                   placeholder="${t('filter.search.placeholder') || 'Search parameters...'}"
                   aria-label="${t('filter.search.placeholder') || 'Search parameters...'}" />
            <button type="button" class="filter-radar-search-clear" style="display:none">${t('filter.search.clear') || 'Clear'}</button>
        </div>
        <div class="filter-radar-canvas-wrap">
            <canvas id="filter-radar-canvas" width="280" height="200" aria-hidden="true"></canvas>
            <div class="filter-radar-empty" style="display:none">
                ${t('filter.radar.noData') || 'No data'}
            </div>
        </div>
        <div class="filter-radar-legend" id="filter-radar-legend"></div>
    `;
    panel.querySelector('.filter-radar-close')?.addEventListener('click', closeFilterRadarHud);
    // Canvas click - detect which axis label was clicked for drill-down
    const canvasEl = (panel.querySelector('#filter-radar-canvas')) as HTMLCanvasElement|null;
    canvasEl?.addEventListener('click', (e: any) => {
        if (!_drillDownModule || _lastRenderedGroups.length === 0) return;
        const rect = canvasEl.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const cx = canvasEl.width / 2;
        const cy = canvasEl.height / 2;
        const maxR = Math.min(cx, cy) - 24;
        const groups = _lastRenderedGroups;
        const angleStep = (Math.PI * 2) / Math.max(groups.length, 1);
        let hit: any = null;
        for (let i = 0; i < groups.length; i++) {
            const angle = i * angleStep - Math.PI / 2;
            const lx = cx + Math.cos(angle) * (maxR + 12);
            const ly = cy + Math.sin(angle) * (maxR + 12);
            if (Math.hypot(mx - lx, my - ly) < 18) {
                hit = groups[i];
                break;
            }
        }
        if (hit) {
            _openDrillDown(hit);
        }
    });
    const searchInput = (panel.querySelector('.filter-radar-search-input')) as HTMLInputElement|null;
    const clearBtn = (panel.querySelector('.filter-radar-search-clear')) as HTMLElement|null;
    let searchDebounce: any = null;
    searchInput?.addEventListener('input', (e: any) => {
        clearTimeout(searchDebounce);
        const q = e.target.value.trim();
        if (clearBtn) clearBtn.style.display = q ? 'inline-block' : 'none';
        searchDebounce = setTimeout(() => {
            refreshFilterRadar({ searchQuery: q });
        }, 150);
    });
    clearBtn?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (clearBtn) clearBtn.style.display = 'none';
        refreshFilterRadar({ searchQuery: '' });
    });
    document.body.appendChild(panel);
}
function _render(radarData: any, _opts: any) {
    const canvas = (document.getElementById('filter-radar-canvas')) as HTMLCanvasElement|null;
    const empty = (document.querySelector('.filter-radar-empty')) as HTMLElement|null;
    if (!canvas) return;
    const hasData = radarData.some((g: any) => g.count > 0);
    if (!hasData) {
        canvas.style.display = 'none';
        if (empty) empty.style.display = 'block';
        return;
    }
    canvas.style.display = 'block';
    if (empty) empty.style.display = 'none';
    const ctx = (canvas.getContext('2d')) as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Minimal placeholder radar draw - full renderer loads lazily
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxR = Math.min(cx, cy) - 24;
    const groups = radarData.filter((g: any) => g.count > 0);
    _lastRenderedGroups = groups; // Store for click hit-testing
    const angleStep = (Math.PI * 2) / Math.max(groups.length, 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (maxR / 3) * i, 0, Math.PI * 2);
        ctx.stroke();
    }
    groups.forEach((g: any, i: number) => {
        const angle = i * angleStep - Math.PI / 2;
        const val = g.aggregatedValue != null ? Math.min(g.aggregatedValue, 1) : 0;
        const r = maxR * val;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        ctx.fillStyle = g.color || '#4A90D9';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        // Label
        const lx = cx + Math.cos(angle) * (maxR + 12);
        const ly = cy + Math.sin(angle) * (maxR + 12);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = t(g.labelKey) || g.id;
        ctx.fillText(label, lx, ly);
    });
    _updateLegend(groups);
}
function _updateLegend(groups: any) {
    const legend = document.getElementById('filter-radar-legend');
    if (!legend) return;
    legend.innerHTML = groups
        .map((g: any) => {
            const label = t(g.labelKey) || g.id;
            return `<span class="filter-radar-legend-item" style="color:${g.color || '#ccc'}">● ${label}</span>`;
        })
        .join(' ');
}
function _refresh() {
    refreshFilterRadar();
}
/**
 * Open the drill-down panel for a given group.
 * Lazy-imports element manager to resolve element names.
 * @param {Object} group
 */
async function _openDrillDown(group: any) {
    if (!_drillDownModule) return;
    const { showDrillDown, getDrillDownGroupId } = /** @type {any} */ (_drillDownModule);
    // Toggle: clicking the same group again closes the panel
    if (getDrillDownGroupId() === group.id) {
        _drillDownModule.hideDrillDown();
        return;
    }
    let elements: any[] = [];
    try {
        const { getAllElements } = await import('../../../core/elements/manager.js' as string);
        elements = getAllElements?.() || [];
    } catch (e: any) {
        console.debug('[filterRadarHud] getAllElements:', /** @type {any} */ (e)?.message || e);
        // element manager unavailable - drill-down still works without names
    }
    showDrillDown(group, elements);
}
