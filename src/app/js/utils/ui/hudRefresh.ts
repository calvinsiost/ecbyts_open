// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// HUD-REFRESH (Calvin 2026-06-11): "botão de refresh todos os huds do dom e
// organizar da melhor forma conforme a configuração atual do usuário".
//
// Orquestra o re-render + re-layout de TODOS os HUDs flutuantes a partir do
// estado PERSISTIDO do usuário (não factory-reset): geo-hud (6 cards: compass,
// globe, EIS radar, custos, ECBT, violações) re-aplica tamanho/posição salvos
// e repinta; compliance banner re-renderiza do estado do manager; FAB ⌘K e
// perf monitor reconciliam com as preferências persistidas.
//
// Cada etapa é isolada em try/catch com log estruturado {etapa, motivo} —
// falha em um HUD nunca impede o refresh dos demais (grammar global:
// observabilidade). Entrada de UI: view menu "Exibição" (homeHeader.ts).

interface RefreshStepResult {
    step: string;
    ok: boolean;
    detail?: string;
}

async function _step(step: string, fn: () => Promise<void> | void): Promise<RefreshStepResult> {
    try {
        await fn();
        return { step, ok: true };
    } catch (e: any) {
        const detail = e?.message || String(e);
        console.debug(`[hudRefresh:${step}]`, detail);
        return { step, ok: false, detail };
    }
}

/**
 * Re-renderiza e reorganiza todos os HUDs conforme a configuração salva.
 * Retorna o relatório por etapa (consumido por testes e pelo toast).
 */
export async function refreshAllHuds(): Promise<RefreshStepResult[]> {
    const results: RefreshStepResult[] = [];

    // 1. geo-hud — initGeoHud é idempotente: relê o layout salvo (tamanho,
    //    posição, visibilidade), re-aplica nos 6 canvases e dispara o repaint
    //    de cada card (compass redraw, globe CSS size, EIS/custos/ECBT/
    //    violações updates) + clamp ao viewport.
    results.push(await _step('geoHud', async () => {
        const mod: any = await import('./geoHud.js');
        mod.initGeoHud();
    }));

    // 2. Tile de violações — invalida o cache (debounce 1.5s) antes do update
    //    para refletir preset/violations atuais imediatamente.
    results.push(await _step('violationsHud', async () => {
        const mod: any = await import('./violationsHud.js');
        mod.invalidateViolationsHudCache?.();
        mod.updateViolationsHud?.();
    }));

    // 3. Compliance banner — re-render do estado atual do manager + re-sync
    //    dos exports consumidos pelo tile.
    results.push(await _step('complianceBanner', async () => {
        const mod: any = await import('./complianceUiBootstrap.js');
        mod.refreshComplianceBanner?.();
    }));

    // 4. FAB ⌘K — reconcilia com a preferência persistida (instala/mostra ou
    //    esconde conforme ecbyts-palette-fab-visible).
    results.push(await _step('paletteFab', async () => {
        const mod: any = await import('./commandPaletteAccess.js');
        mod.refreshPaletteFab?.();
    }));

    // 5. Perf monitor — initPerfHud é idempotente e restaura a visibilidade
    //    salva (ecbyts-perf-hud) caso o elemento tenha se perdido do DOM.
    results.push(await _step('perfHud', async () => {
        const mod: any = await import('../performance/hud.js');
        mod.initPerfHud?.();
    }));

    // 6. Ghost-bar sweep (G14, print Calvin 2026-06-11) — barras/linhas finas
    //    órfãs sobre o canvas (resto de painel vazio de layout persistido)
    //    são identificadas no console e escondidas. Decisão pura em
    //    _ghostBarPure (conservadora: texto/visual/whitelist nunca varre).
    results.push(await _step('ghostBarSweep', async () => {
        const swept = await _sweepGhostBars();
        if (swept.length) {
            console.warn('[hudRefresh:ghostBarSweep] barras-fantasma escondidas:', swept);
        }
    }));

    // 7. Canvas 3D — depois de mover/redimensionar HUDs, recalcular o
    //    renderer (regra canônica do panel system).
    results.push(await _step('canvasResize', async () => {
        const container = document.getElementById('canvas-container');
        if (!container) return;
        const mod: any = await import('../scene/setup.js');
        if (typeof mod.handleResize === 'function') {
            requestAnimationFrame(() => mod.handleResize(container));
        }
    }));

    const failed = results.filter((r) => !r.ok);
    console.debug('[hudRefresh] done —', `${results.length - failed.length}/${results.length} ok`,
        failed.length ? `falhas: ${failed.map((f) => f.step).join(',')}` : '');

    // Feedback discreto ao usuário (toast é opcional — não é erro se ausente).
    try {
        const w = window as any;
        if (typeof w.showToast === 'function') {
            const { t } = await import('../i18n/translations.js');
            w.showToast(t('hudRefresh.done') || 'HUDs reorganizados', failed.length ? 'warning' : 'success');
        }
    } catch (e: any) {
        console.debug('[hudRefresh:toast]', e?.message || e);
    }
    return results;
}

/**
 * Varre o DOM por "barras-fantasma": elementos finos (≤10px de altura,
 * 100-700px de largura) sobrepostos ao canvas 3D, sem texto nem conteúdo
 * visual — assinatura de painel/cabeçalho vazio deixado por layout
 * persistido. Loga a identidade completa (diagnóstico remoto via console)
 * e esconde. Registro em window.__ecbytsGhostBars para inspeção.
 */
async function _sweepGhostBars(): Promise<string[]> {
    const { decideGhostBar, GHOST_WHITELIST_SELECTORS, GHOST_MAX_HEIGHT } = await import('./_ghostBarPure.js');
    const canvas = document.getElementById('canvas-container');
    if (!canvas) return [];
    const canvasRect = canvas.getBoundingClientRect();
    const swept: string[] = [];
    const records: any[] = [];

    for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const e = el as HTMLElement;
        if (!(e instanceof HTMLElement)) continue;
        if (e === canvas || canvas.contains(e)) continue;
        const r = e.getBoundingClientRect();
        if (r.height <= 0 || r.height > GHOST_MAX_HEIGHT) continue; // pré-filtro barato
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;

        const whitelisted = GHOST_WHITELIST_SELECTORS.some((sel: string) => e.matches(sel) || !!e.closest(sel));
        const hasText = (e.textContent || '').trim().length > 0;
        const hasVisualContent = !!e.querySelector('canvas, img, svg, video');
        const verdict = decideGhostBar({
            rect: { x: r.x, y: r.y, width: r.width, height: r.height },
            canvasRect: { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height },
            hasText,
            hasVisualContent,
            whitelisted,
        });
        if (!verdict.ghost) continue;

        const identity = `${e.tagName.toLowerCase()}#${e.id || '-'}.${String(e.className).slice(0, 60)}`;
        records.push({
            identity,
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            parent: e.parentElement ? `${e.parentElement.tagName.toLowerCase()}#${e.parentElement.id || '-'}` : null,
            outerHTML: e.outerHTML.slice(0, 200),
        });
        e.style.display = 'none';
        e.setAttribute('data-ghost-bar-swept', 'true');
        swept.push(identity);
    }

    try {
        (window as any).__ecbytsGhostBars = records;
    } catch (e: any) {
        console.debug('[hudRefresh:ghostBars-record]', e?.message || e);
    }
    return swept;
}

// Handler global — consumido pelo view menu e pela command palette.
if (typeof window !== 'undefined' && typeof (window as any).handleRefreshAllHuds !== 'function') {
    (window as any).handleRefreshAllHuds = () => { void refreshAllHuds(); };
}
