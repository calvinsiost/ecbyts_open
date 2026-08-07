// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
import { buildCostRollupWithUncertainty } from '../../core/analytics/economics/costRollup.js';
import { openTabInPanel } from './panelManager.js';
import { adaptCostRollupToHudSnapshot } from '../../core/ecbtScore/_costRollupAdapterPure.js';
import { setEcbtHudSnapshot } from './ecbtScoreHud.js';
// HUD-UX-PAIN-DRAIN-001 W1.1 (D03+D07+D16+D21, Calvin 2026-06-11): este card
// deixou de duplicar PASSIVO/ATIVO/RATIO (semântica de balanço agora é
// exclusiva do ECBT HUD — gate G3). Vira o card "CUSTOS": total passivo +
// top-3 categorias de custo. Formatters/fitText canônicos do pure (gate G4).
import { formatMoney, fitText, HUD_TONE_COLORS } from './_hudCardTooltipsPure.js';
import { t } from '../i18n/translations.js';
// F3 (Calvin 2026-06-10): ATIVO real via extractNaturalAssets — ainda
// calculado aqui (async) porque alimenta o bridge p/ o ECBT HUD adjacente.
import { getAllElements } from '../../core/elements/manager.js';
const MIN_RENDER_INTERVAL_MS = 1200;
let _lastRenderTs = 0;
let _lastSnapshot: any = null;
let _lastAssetTotal = 0; // cache do último ATIVO calculado (async)
function _openCostAnalysisFallback() {
    // Caminho oficial (já usa openTabInPanel, que restaura painel se minimizado)
    if (typeof window.handleOpenCostAnalysis === 'function') {
        window.handleOpenCostAnalysis();
        return;
    }
    // Fallback defensivo: restaura painel + ativa tab direto
    openTabInPanel('right-panel', 'cost-analysis');
}
/** @param {*} canvas */
function _bindClick(canvas: HTMLCanvasElement) {
    if (!canvas || canvas.dataset.costHudBound === '1') return;
    canvas.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _openCostAnalysisFallback();
    });
    canvas.dataset.costHudBound = '1';
}
/** @param {*} canvas */
function _setupHiDPI(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.dataset.scaled !== '1') {
        canvas.dataset.logicalW = String(canvas.width);
        canvas.dataset.logicalH = String(canvas.height);
        canvas.width = Math.round(canvas.width * dpr);
        canvas.height = Math.round(canvas.height * dpr);
        canvas.style.width = `${canvas.dataset.logicalW}px`;
        canvas.style.height = `${canvas.dataset.logicalH}px`;
        ctx.scale(dpr, dpr);
        canvas.dataset.scaled = '1';
    }
    return {
        ctx,
        W: Number(canvas.dataset.logicalW || 100),
        H: Number(canvas.dataset.logicalH || 100),
    };
}
/**
 * F3 (Calvin 2026-06-10): calcula total de ativos naturais usando o MESMO
 * caminho que o cost-analysis board (extractNaturalAssets + seed default).
 * Async porque importa pure modules lazily; primeiro tick usa cache antigo,
 * próximo tick atualiza HUD com valor correto. W1.1: o valor NÃO é mais
 * exibido neste card — só alimenta o bridge ECBT (assetOverride).
 */
async function _computeNaturalAssetsTotal(): Promise<number> {
    try {
        const naturalAssets: any = await import(
            '../../core/ecbtScore/_naturalAssetsPure.js' as string
        );
        const catalogLoader: any = await import(
            '../../core/ecbtScore/_naturalAssetCatalogLoaderPure.js' as string
        );
        const benchmarks: any = await import(
            '../../core/ecbtScore/_naturalAssetBenchmarksPure.js' as string
        );
        const elements = getAllElements() || [];
        const userOverride = (window as any).__ecbtNaturalAssetCatalog;
        const seedCatalog = (window as any).__ecbtNaturalAssetSeedCatalog
            || (typeof benchmarks.buildSeedCatalog === 'function'
                ? benchmarks.buildSeedCatalog({ tier: 'expected' })
                : {});
        const libraries = (window as any).__ecbtNaturalAssetLibraries || [];
        const merged = catalogLoader.resolveEffectiveCatalog
            ? catalogLoader.resolveEffectiveCatalog({
                seed: seedCatalog,
                libraries,
                userOverride: userOverride && typeof userOverride === 'object' ? userOverride : undefined,
            })
            : { catalog: seedCatalog };
        const entries = naturalAssets.extractNaturalAssets(elements, merged.catalog || {}) as Array<{ value: number }>;
        let total = 0;
        for (const e of entries) {
            const v = Number(e.value || 0);
            if (v > 0) total += v;
        }
        return total;
    } catch (e: any) {
        console.debug('[costHud:assets-extract]', e?.message || e);
        return 0;
    }
}

/**
 * W1.1: achata byCategory (catId → itemId → amount) em top-N itens de custo
 * (drilling, analytical, ...) ordenados desc — conteúdo principal do card.
 */
function _topCostItems(byCategory: any, n = 3): Array<{ id: string; value: number }> {
    const totals: Record<string, number> = {};
    if (byCategory && typeof byCategory === 'object') {
        for (const items of Object.values(byCategory)) {
            if (!items || typeof items !== 'object') continue;
            for (const [itemId, amt] of Object.entries(items as Record<string, unknown>)) {
                const v = Number(amt) || 0;
                if (v > 0) totals[itemId] = (totals[itemId] || 0) + v;
            }
        }
    }
    return Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([id, value]) => ({ id, value }));
}
export function updateCostHudBadge() {
    const canvas = document.getElementById('cost-hud-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    _bindClick(canvas);
    const now = Date.now();
    if (_lastSnapshot && now - _lastRenderTs < MIN_RENDER_INTERVAL_MS) {
        _paint(canvas, _lastSnapshot);
        return;
    }
    let snapshot: any;
    let rollupForEcbt: any = null;
    try {
        const rollup = buildCostRollupWithUncertainty();
        rollupForEcbt = rollup;
        const liability = Number(rollup?.grandTotal) || 0;
        // Dispara cálculo async do ATIVO em background — alimenta o bridge
        // ECBT na próxima render (W1.1: não é mais exibido NESTE card).
        void _computeNaturalAssetsTotal().then((total) => {
            if (Math.abs(total - _lastAssetTotal) > 0.01) {
                _lastAssetTotal = total;
                // Força próxima render com o novo valor cache.
                _lastRenderTs = 0;
                _lastSnapshot = null;
            }
        }).catch((e: any) => console.debug('[costHud:asset-async]', e?.message || e));
        const uncertaintyU = Number(rollup?.uncertainty?.metrics?.u ?? NaN);
        const currency = rollup?.currency || 'BRL';
        snapshot = {
            liability,
            topItems: _topCostItems(rollup?.byCategory, 3),
            uncertaintyTxt: Number.isFinite(uncertaintyU) ? `U:${uncertaintyU.toFixed(2)}` : 'U:--',
            currency,
        };
    } catch (_err) {
        snapshot = _lastSnapshot || {
            liability: 0,
            topItems: [],
            uncertaintyTxt: 'U:--',
            currency: 'BRL',
        };
    }
    _lastSnapshot = snapshot;
    _lastRenderTs = now;
    _paint(canvas, snapshot);

    // Bridge: feed adjacent ECBT Score HUD with the same rollup (mode=absolute
    // by default; κ defaults to 1 until F2 wires real EIS confidence).
    // F3 (Calvin 2026-06-10): passa assetOverride = total real de ativos naturais
    // (calculado async, cache populado). Antes o adapter calculava asset =
    // costPerElement × N → espelhava passivo → ECBT HUD ficava em zero.
    try {
        const ecbtInput = adaptCostRollupToHudSnapshot(
            rollupForEcbt,
            _lastAssetTotal > 0 ? { assetOverride: _lastAssetTotal } : {},
        );
        // HUD-CARDS-REDESIGN-001 F3 (Calvin 2026-06-10): inject passivo/ativo
        // brutos para que o ECBT HUD use o bullet chart vertical (research
        // 2026 aprova bullet > radar/texto solto p/ <120px widgets).
        const ecbtInputWithBullet = ecbtInput
            ? { ...ecbtInput,
                passivoAmount: Number(rollupForEcbt?.grandTotal) || 0,
                ativoAmount: _lastAssetTotal > 0 ? _lastAssetTotal : 0,
            }
            : ecbtInput;
        setEcbtHudSnapshot(ecbtInputWithBullet as any);
    } catch (e) {
        console.debug('[costHud:ecbtBridge]', (e as any)?.message || e);
    }
}
/**
 * W1.1 paint — card "CUSTOS": total passivo + top-3 categorias + incerteza.
 * Borda NEUTRA por design (D21): este card informa magnitude, não veredito —
 * o julgamento verde/vermelho de balanço pertence ao ECBT HUD ao lado.
 */
/** @param {*} canvas @param {*} snapshot */
function _paint(canvas: HTMLCanvasElement, snapshot: any) {
    const setup = _setupHiDPI(canvas);
    if (!setup) return;
    const { ctx, W, H } = setup;
    ctx.clearRect(0, 0, W, H);
    const { liability, topItems, uncertaintyTxt, currency } = snapshot;
    // W3.2 (D06): card informativo → borda neutra do contrato canônico;
    // sem dado usa o mesmo neutro com alpha reduzido via slate claro.
    const hasData = Number(liability) > 0;
    const tone = hasData ? '#94a3b8' : HUD_TONE_COLORS.neutral;
    ctx.fillStyle = 'rgba(15, 20, 30, 0.85)';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 8);
    ctx.fill();
    ctx.strokeStyle = tone;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, W - 2, H - 2, 8);
    ctx.stroke();
    // Header
    const titleTxt = t('hud.cost.title');
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.font = '700 10px "JetBrains Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(fitText(ctx, titleTxt, W - 16), 8, 8);
    if (!hasData) {
        // Empty state
        ctx.fillStyle = 'rgba(148,163,184,0.85)';
        ctx.font = '600 9px "JetBrains Mono", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(fitText(ctx, t('hud.cost.empty'), W - 16), W / 2, H / 2 - 4);
        const semanticEmpty = t('hud.cost.aria.empty');
        canvas.title = semanticEmpty;
        canvas.setAttribute('aria-label', semanticEmpty);
        return;
    }
    // HUD-UX 2026-06-11 (Calvin screenshot): layout proporcional a H — antes os
    // Y eram fixos (26/45/62/+12) calibrados p/ ~120px e estouravam no default
    // vmin (~96-115px): 3º item cruzava a borda e o footer colidia com itens.
    const totalFont = Math.max(12, Math.min(18, Math.round(H * 0.13)));
    const totalY = 20;
    const subY = totalY + totalFont + 2;
    const footerTop = H - 13; // footer (incerteza) sempre reservado
    // Total passivo (grande) + sublabel
    const totalTxt = formatMoney(Number(liability) || 0, currency);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `700 ${totalFont}px "JetBrains Mono", Consolas, monospace`;
    ctx.fillText(fitText(ctx, totalTxt, W - 16), 8, totalY);
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.font = '600 8px "JetBrains Mono", Consolas, monospace';
    ctx.fillText(fitText(ctx, t('hud.cost.subtitle'), W - 16), 8, subY);
    // Top-3 categorias (label esquerda + valor direita) — desenha só o que
    // cabe acima do footer (clamp anti-corte).
    let y = subY + 13;
    const lineH = Math.max(11, Math.round(H * 0.1));
    const items: Array<{ id: string; value: number }> = Array.isArray(topItems) ? topItems : [];
    for (const item of items) {
        if (y + 9 > footerTop - 1) break;
        const valTxt = formatMoney(item.value, currency);
        ctx.font = '600 9px "JetBrains Mono", Consolas, monospace';
        const valW = ctx.measureText(valTxt).width;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.textAlign = 'right';
        ctx.fillText(valTxt, W - 8, y);
        ctx.fillStyle = 'rgba(148,163,184,0.95)';
        ctx.textAlign = 'left';
        ctx.fillText(fitText(ctx, String(item.id), W - 20 - valW), 8, y);
        y += lineH;
    }
    // Incerteza (rodapé)
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.font = '600 8px "JetBrains Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(uncertaintyTxt, 8, footerTop);
    // A11y — sem ATIVO/RATIO (gate G3): semântica exclusiva de custos.
    const topSummary = items.map((i) => `${i.id} ${formatMoney(i.value, currency)}`).join(', ');
    const aria = t('hud.cost.aria', { total: totalTxt, top: topSummary || '—' });
    canvas.title = aria;
    canvas.setAttribute('aria-label', aria);
}
//# sourceMappingURL=costHud.js.map
