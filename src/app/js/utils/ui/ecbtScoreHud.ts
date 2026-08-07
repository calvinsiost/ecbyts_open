// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Score HUD — canvas wire.
 *
 * Vertical companion widget alongside `eis-hud-canvas` and `cost-hud-canvas`
 * inside `#geo-hud`. Reads from `window.__ecbtScoreSnapshot` (set by the F5
 * dual-report dashboard once available); otherwise renders the muted "—"
 * empty state.
 *
 * Anti-N3: this widget intentionally points at the dual report. Clicking it
 * routes to the EIS Dashboard (same target as `eis-hud-canvas`) so the
 * physical EIS is always one click away from the monetary view.
 */

import {
    buildAriaLabel,
    buildEcbtHudSnapshot,
    type EcbtHudSnapshot,
    type EcbtHudSnapshotInput,
} from './_ecbtScoreHudPure.js';
// HUD-UX-PAIN-DRAIN-001 W1.3 (D02/gate G2): texto livre passa por fitText.
// W3.3 (D15): labels de balanço canônicos (PASSIVO/ATIVO/LÍQUIDO ≥90px).
import { fitText, balanceLabel, balanceLabelKey } from './_hudCardTooltipsPure.js';
import { t } from '../i18n/translations.js';

/**
 * TD-6: rótulo de balanço i18n-aware para os paints. Resolve a chave via t();
 * se o i18n ainda não carregou (key crua), cai no rótulo canônico pt — nunca
 * pinta "hud.balance.*" no canvas.
 */
function _balLabel(kind: 'passivo' | 'ativo' | 'liquido', widthPx: number): string {
    const key = balanceLabelKey(kind, widthPx);
    const translated = t(key);
    return translated && translated !== key ? translated : balanceLabel(kind, widthPx);
}
// Side-effect import: registers window.handleOpenEcbtScorePanel handler so the
// HUD canvas onclick (in index.html) can open the F5 dashboard panel.
import './ecbtScorePanel.js';

const MIN_RENDER_INTERVAL_MS = 1200;

let _lastRenderTs = 0;
let _lastSnapshot: EcbtHudSnapshot | null = null;
/** External feed (set by the future F5 dashboard / live consumer). */
let _externalInput: EcbtHudSnapshotInput | null = null;

/**
 * Public hook for the dashboard to push a fresh ECBT Score snapshot to the
 * HUD widget. Calling this with `null` clears the feed → empty state.
 */
export function setEcbtHudSnapshot(input: EcbtHudSnapshotInput | null): void {
    _externalInput = input;
    // Force a re-render on the next tick.
    _lastRenderTs = 0;
    updateEcbtHudBadge();
}

/**
 * Getter público do snapshot atual do ECBT Score (líquido R$ + tom + seta).
 * P4-1 (FRIEND-SCORE-001, Calvin loop 2026-06-14): a home precisa exibir o
 * ECBT Score — indicador PRINCIPAL (diretiva Calvin) — ao lado do EIS. Reusa
 * o mesmo feed do HUD (costHud → setEcbtHudSnapshot). Computa do input atual
 * se o HUD ainda não renderizou; nunca lança.
 */
export function getEcbtHudSnapshot(): EcbtHudSnapshot {
    if (_lastSnapshot) return _lastSnapshot;
    const w = window as any;
    const input = (_externalInput ?? (w.__ecbtScoreSnapshot as EcbtHudSnapshotInput | null) ?? null) as
        | EcbtHudSnapshotInput
        | null;
    return buildEcbtHudSnapshot(input);
}

function _openTarget(): void {
    const w = window as any;
    if (typeof w.handleOpenEisDashboard === 'function') {
        w.handleOpenEisDashboard();
        return;
    }
    if (typeof w.handleOpenCostAnalysis === 'function') {
        w.handleOpenCostAnalysis();
    }
}

function _bindClick(canvas: HTMLCanvasElement): void {
    if (canvas.dataset.ecbtHudBound === '1') return;
    canvas.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _openTarget();
    });
    canvas.dataset.ecbtHudBound = '1';
}

function _setupHiDPI(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const dpr = (window.devicePixelRatio || 1) as number;
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
        W: Number(canvas.dataset.logicalW || canvas.width),
        H: Number(canvas.dataset.logicalH || canvas.height),
    };
}

export function updateEcbtHudBadge(): void {
    const canvas = document.getElementById('ecbt-hud-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    _bindClick(canvas);
    const now = Date.now();
    if (_lastSnapshot && now - _lastRenderTs < MIN_RENDER_INTERVAL_MS) {
        _paint(canvas, _lastSnapshot);
        return;
    }
    // Source order: explicit hook > global injected snapshot > empty.
    const w = window as any;
    const input =
        _externalInput ??
        (w.__ecbtScoreSnapshot as EcbtHudSnapshotInput | null | undefined) ??
        null;
    const snapshot = buildEcbtHudSnapshot(input as EcbtHudSnapshotInput | null);
    _lastSnapshot = snapshot;
    _lastRenderTs = now;
    _paint(canvas, snapshot);
}

function _paint(canvas: HTMLCanvasElement, snap: EcbtHudSnapshot): void {
    const setup = _setupHiDPI(canvas);
    if (!setup) return;
    const { ctx, W, H } = setup;
    ctx.clearRect(0, 0, W, H);

    // Card background + colored border (sign tone).
    ctx.fillStyle = 'rgba(15, 20, 30, 0.92)';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 6);
    ctx.fill();
    ctx.strokeStyle = snap.tone;
    ctx.lineWidth = snap.available ? 1.5 : 1;
    ctx.beginPath();
    ctx.roundRect(0.75, 0.75, W - 1.5, H - 1.5, 6);
    ctx.stroke();

    if (!snap.available) {
        // Compact empty state: centered glyph + small caption.
        ctx.fillStyle = 'rgba(255,255,255,0.62)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = '700 9px "JetBrains Mono", Consolas, monospace';
        ctx.fillText('ECBT', 7, 6);
        ctx.fillStyle = 'rgba(148,163,184,0.85)';
        ctx.font = '700 32px "JetBrains Mono", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('—', W / 2, H / 2 - 22);
        ctx.font = '600 9px "JetBrains Mono", Consolas, monospace';
        ctx.fillStyle = 'rgba(148,163,184,0.72)';
        ctx.fillText('sem dados', W / 2, H - 20);
        ctx.font = '500 8px "JetBrains Mono", Consolas, monospace';
        ctx.fillText(fitText(ctx, 'clique p/ abrir', W - 12), W / 2, H - 10);
        ctx.textAlign = 'left';
    } else {
        // Title (top-left) + mode badge pill (top-right).
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = '700 9px "JetBrains Mono", Consolas, monospace';
        ctx.fillText('ECBT', 7, 6);

        const badgeText = snap.modeBadge;
        ctx.font = '700 8px "JetBrains Mono", Consolas, monospace';
        const badgeW = Math.max(16, ctx.measureText(badgeText).width + 6);
        ctx.fillStyle = snap.tone;
        ctx.beginPath();
        ctx.roundRect(W - badgeW - 5, 5, badgeW, 12, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(15,20,30,0.95)';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, W - badgeW / 2 - 5, 7);

        // HUD-CARDS-REDESIGN-001 F3 (Calvin 2026-06-10): bullet chart vertical
        // quando passivo+ativo disponíveis (research: bullet > radar p/ widgets).
        // W3.1 (D14): coordenadas proporcionais a W/H — canvas agora 200²
        // uniforme; W3.3 (D15): labels canônicos via balanceLabel (por extenso
        // quando largura ≥90px).
        const useBullet = snap.passivoAmount > 0 || snap.ativoAmount > 0;
        if (useBullet) {
            const barX = 8;
            const barW = W - 16;
            const barH = Math.max(7, Math.round(H * 0.05));
            const labelW = Math.round(W * 0.3);
            const maxAmount = Math.max(snap.passivoAmount, snap.ativoAmount, 1);
            const rowFont = `600 ${Math.max(7, Math.round(H * 0.045))}px "JetBrains Mono", Consolas, monospace`;
            const valFontPx = Math.max(8, Math.round(H * 0.05));
            const valFont = `700 ${valFontPx}px "JetBrains Mono", Consolas, monospace`;
            // PASSIVO row — HUD-UX 2026-06-11: nunca acima de 20px (em cards
            // ≤115px o H*0.17 colidia com o header/badge ABS, y=5..17).
            const passY = Math.max(Math.round(H * 0.17), 20);
            ctx.fillStyle = 'rgba(239,68,68,0.85)';
            ctx.font = rowFont;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(fitText(ctx, _balLabel('passivo', W - 16), labelW), barX, passY);
            ctx.fillStyle = 'rgba(148,163,184,0.18)';
            ctx.fillRect(barX + labelW, passY, barW - labelW, barH);
            ctx.fillStyle = 'rgba(239,68,68,0.85)';
            ctx.fillRect(barX + labelW, passY, (barW - labelW) * (snap.passivoAmount / maxAmount), barH);
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.font = valFont;
            ctx.textAlign = 'right';
            ctx.fillText(snap.passivoTxt, W - 8, passY + barH + 4);
            // ATIVO row — clamp: abaixo do valor do PASSIVO (que termina em
            // passY+barH+4+valFontPx); sem isso o valor sobrepunha a barra ATV.
            const ativY = Math.max(Math.round(H * 0.36), passY + barH + 4 + valFontPx + 5);
            ctx.fillStyle = 'rgba(34,197,94,0.85)';
            ctx.font = rowFont;
            ctx.textAlign = 'left';
            ctx.fillText(fitText(ctx, _balLabel('ativo', W - 16), labelW), barX, ativY);
            ctx.fillStyle = 'rgba(148,163,184,0.18)';
            ctx.fillRect(barX + labelW, ativY, barW - labelW, barH);
            ctx.fillStyle = 'rgba(34,197,94,0.85)';
            ctx.fillRect(barX + labelW, ativY, (barW - labelW) * (snap.ativoAmount / maxAmount), barH);
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.font = valFont;
            ctx.textAlign = 'right';
            ctx.fillText(snap.ativoTxt, W - 8, ativY + barH + 4);
            // LÍQUIDO (amount destaque) — clamp: abaixo do valor do ATIVO.
            const liqY = Math.max(Math.round(H * 0.68), ativY + barH + 4 + valFontPx + 10);
            ctx.fillStyle = snap.tone;
            ctx.font = `800 ${Math.max(12, Math.round(H * 0.085))}px "JetBrains Mono", Consolas, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${snap.arrow} ${snap.amountTxt}`, W / 2, liqY);
            ctx.fillStyle = 'rgba(203,213,225,0.72)';
            ctx.font = rowFont;
            // Offset do label nunca menor que a meia-altura do valor + folga.
            const liqLabelOff = Math.max(Math.round(H * 0.08), Math.round(Math.max(12, H * 0.085) / 2) + 8);
            ctx.fillText(fitText(ctx, _balLabel('liquido', W - 16), labelW), W / 2, liqY + liqLabelOff);
        } else {
            // Big pct line — center, big bold, with arrow + tone.
            ctx.fillStyle = snap.tone;
            const pctFontSize = snap.pctTxt.length > 7 ? 14 : 18;
            ctx.font = `800 ${pctFontSize}px "JetBrains Mono", Consolas, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${snap.arrow} ${snap.pctTxt}`, W / 2, H / 2 - 6);
        }

        // Band line + Amount line — apenas para layout legacy (pct mode).
        // No bullet layout (F3) o LÍQUIDO já foi renderizado acima.
        if (!useBullet) {
            ctx.fillStyle = 'rgba(203,213,225,0.88)';
            ctx.font = '600 9px "JetBrains Mono", Consolas, monospace';
            ctx.fillText(snap.bandTxt, W / 2, H / 2 + 11);
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.font = '700 10px "JetBrains Mono", Consolas, monospace';
            ctx.textBaseline = 'middle';
            ctx.fillText(snap.amountTxt, W / 2, H - 22);
        }

        // F8 neutrality badge (♻ Neutro) — overlay between band and amount.
        if (snap.neutralBadge) {
            ctx.font = '700 8px "JetBrains Mono", Consolas, monospace';
            const nbW = Math.max(48, ctx.measureText(snap.neutralBadge).width + 8);
            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.roundRect(W / 2 - nbW / 2, H / 2 + 18, nbW, 11, 4);
            ctx.fill();
            ctx.fillStyle = 'rgba(15,20,30,0.95)';
            ctx.textAlign = 'center';
            ctx.fillText(snap.neutralBadge, W / 2, H / 2 + 20);
            ctx.textAlign = 'left';
        }

        // Bottom row: denom kind (left) + kappa (right) — small footer.
        // HUD-UX-PAIN-DRAIN-001 W2.4 (D24): em modo ABS não há denominador —
        // "d:—" era ruído críptico; esconde quando ABS ou sem valor.
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(148,163,184,0.85)';
        ctx.font = '600 8px "JetBrains Mono", Consolas, monospace';
        if (snap.modeBadge !== 'ABS' && snap.denomKindTxt !== '—') {
            ctx.textAlign = 'left';
            ctx.fillText(`d:${snap.denomKindTxt}`, 5, H - 4);
        }
        ctx.textAlign = 'right';
        ctx.fillText(snap.kappaTxt, W - 5, H - 4);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
    }

    // W2 tooltip runtime: expõe estado p/ resolução de pseudo-keys
    // (ecbtHud.mode → ABS/MKI; ecbtHud.liquido → positive/negative).
    canvas.dataset.hudMode = snap.modeBadge;
    canvas.dataset.hudSign = snap.arrow === '▼' ? 'deficit' : snap.arrow === '▲' ? 'surplus' : 'zero';

    // a11y + tooltip.
    canvas.title = snap.available
        ? `ECBT Score: ${snap.pctTxt} (${snap.modeFull}). ${snap.amountTxt}. ${snap.kappaTxt}. Clique para abrir o painel.`
        : 'ECBT Score: dados indisponíveis. Clique para abrir o painel.';
    canvas.setAttribute('aria-label', buildAriaLabel(snap));
}

// Convenience for the bootstrap layer / panelManager: returns whether the
// canvas exists in the DOM right now. Useful for guarded init.
export function ecbtHudCanvasExists(): boolean {
    return !!document.getElementById('ecbt-hud-canvas');
}
