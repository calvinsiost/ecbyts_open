// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// HUD-CARDS-REDESIGN-001 M3 (Calvin 2026-06-10): tile NOVO de violações de
// conformidade. Calvin reportou: "está faltando o tile adicional do número de
// violações que nunca foi colocado na tela".
//
// Render: canvas 100×100 lógico (consistente com cost-hud-canvas, eis-hud-canvas).
// Cores: borda + glyph severidade duplicados (WCAG 1.4.1 — não só cor).
// Click: chama _openViolationsPanel via complianceViolationsFab (handler existente).

import { buildViolationsHudVm, fitText, HUD_TONE_COLORS, type ViolationEntryShape } from './_hudCardTooltipsPure.js';
// HUD-UX-PAIN-DRAIN-001 W1.3 (D02): strings do paint via i18n + fitText —
// antes truncava cru ("SEM PRES", "Selecio framewor") porque pintava literal
// sem medir contra a largura disponível.
import { t } from '../i18n/translations.js';

const MIN_RENDER_INTERVAL_MS = 1500;
let _lastRenderTs = 0;
let _lastVmKey: string | null = null;
let _violationsCache: ReadonlyArray<unknown> = [];
let _presetCache: string | null = null;

interface HiDPISetup {
    ctx: CanvasRenderingContext2D;
    W: number;
    H: number;
}

function _setupHiDPI(canvas: HTMLCanvasElement): HiDPISetup | null {
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

function _openViolationsFallback(): void {
    const w = window as unknown as Record<string, unknown>;
    if (typeof w.handleOpenViolationsPanel === 'function') {
        (w.handleOpenViolationsPanel as () => void)();
        return;
    }
    // Fallback: try fab open
    if (typeof w._openViolationsPanel === 'function') {
        (w._openViolationsPanel as () => void)();
    }
}

function _bindClick(canvas: HTMLCanvasElement): void {
    if (!canvas || canvas.dataset.violationsBound === '1') return;
    canvas.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _openViolationsFallback();
    });
    canvas.dataset.violationsBound = '1';
}

interface ViolationsCollection {
    violations: ReadonlyArray<unknown>;
    preset: string | null;
}

/**
 * Coleta violations dinâmicas via window export (lazy import seria caro
 * num render loop; consumers expõem via window.__ecbtViolations OR via
 * complianceUiBootstrap._computeViolations sync wrapper).
 */
async function _collectViolations(): Promise<ViolationsCollection> {
    let preset: string | null = null;
    try {
        const w = window as unknown as Record<string, unknown>;
        // Compliance preset ID (active) — exposto pelo complianceUiBootstrap.
        preset =
            typeof w.getActiveCompliancePresetId === 'function'
                ? (w.getActiveCompliancePresetId as () => string | null)()
                : (w.__ecbtActivePresetId as string | null) || null;
        // Try sync window export first (cached by complianceUiBootstrap).
        if (Array.isArray(w.__ecbtViolations)) {
            return { violations: w.__ecbtViolations as ReadonlyArray<unknown>, preset };
        }
        // Lazy import compliance bootstrap when not cached.
        const mod = (await import('./complianceUiBootstrap.js')) as Record<string, unknown>;
        if (typeof mod._computeViolations === 'function') {
            const violations = (await (mod._computeViolations as () => Promise<unknown>)()) as ReadonlyArray<unknown>;
            w.__ecbtViolations = violations;
            return { violations: Array.isArray(violations) ? violations : [], preset };
        }
        return { violations: [], preset };
    } catch (e: unknown) {
        const err = e as Error | undefined;
        console.debug('[violationsHud:collect]', err?.message || e);
        return { violations: [], preset };
    }
}

/**
 * Update entry-point — análogo a updateCostHudBadge / updateEisHud.
 * Faz debounce 1.5s + paint sincrono usando cache.
 */
export function updateViolationsHud(): void {
    const canvas = document.getElementById('violations-hud-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    _bindClick(canvas);
    const now = Date.now();
    if (now - _lastRenderTs < MIN_RENDER_INTERVAL_MS) {
        _paintFromCache(canvas);
        return;
    }
    _lastRenderTs = now;
    // Dispara async para popular cache; pinta imediatamente com cache atual.
    void _collectViolations()
        .then((res) => {
            const newKey = `${res.violations.length}|${res.preset || '-'}`;
            if (newKey !== _lastVmKey) {
                _violationsCache = res.violations;
                _presetCache = res.preset;
                _lastVmKey = newKey;
                _paintFromCache(canvas);
            }
        })
        .catch((e: unknown) => {
            const err = e as Error | undefined;
            console.debug('[violationsHud:async]', err?.message || e);
        });
    _paintFromCache(canvas);
}

function _isViolationEntry(x: unknown): x is ViolationEntryShape {
    return typeof x === 'object' && x !== null;
}

function _paintFromCache(canvas: HTMLCanvasElement): void {
    const validated = _violationsCache.filter(_isViolationEntry);
    const vm = buildViolationsHudVm(validated, _presetCache);
    _paint(canvas, vm);
}

/**
 * Calvin 2026-06-11 ("o tile do hud deve refletir isso"): força recount no
 * próximo update — chamado pelo complianceUiBootstrap quando o preset ativo
 * muda (sem isso o debounce de 1.5s segurava o tile no estado antigo).
 */
export function invalidateViolationsHudCache(): void {
    _lastRenderTs = 0;
    _lastVmKey = null;
}

interface ViolationsHudVm {
    pulseBorder: boolean;
    medium: number;
    low: number;
    critical: number;
    counterTotal: number;
    emptyState: boolean;
    preset: string | null;
    sparkline: ReadonlyArray<number>;
}

function _paint(canvas: HTMLCanvasElement, vm: ViolationsHudVm): void {
    const setup = _setupHiDPI(canvas);
    if (!setup) return;
    const { ctx, W, H } = setup;
    ctx.clearRect(0, 0, W, H);

    const borderColor = _paintBorder(ctx, W, H, vm);
    _paintHeader(ctx, W, H, vm);

    if (vm.emptyState) {
        _paintEmptyState(ctx, W, H, vm, canvas);
        return;
    }

    _paintCounter(ctx, W, H, vm);
    _paintBreakdown(ctx, W, H, vm);
    _paintSparkline(ctx, W, H, vm, borderColor);
    _paintFooter(ctx, W, H, vm);
    _paintAria(canvas, vm);
}

function _paintBorder(ctx: CanvasRenderingContext2D, W: number, H: number, vm: ViolationsHudVm): string {
    ctx.fillStyle = 'rgba(15, 20, 30, 0.85)';
    ctx.beginPath();
    if (typeof (ctx as unknown as { roundRect?: unknown }).roundRect === 'function') {
        (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(
            0,
            0,
            W,
            H,
            8,
        );
    } else {
        ctx.rect(0, 0, W, H);
    }
    ctx.fill();

    // Borda colorida (severidade max — pulse se critical>=1).
    // W3.2 (D06): cores do contrato canônico HUD_TONE_COLORS.
    const borderColor = vm.pulseBorder
        ? HUD_TONE_COLORS.red
        : vm.medium > 0
            ? HUD_TONE_COLORS.yellow
            : vm.low > 0
                ? HUD_TONE_COLORS.green
                : HUD_TONE_COLORS.neutral;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (typeof (ctx as unknown as { roundRect?: unknown }).roundRect === 'function') {
        (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(
            1,
            1,
            W - 2,
            H - 2,
            8,
        );
    } else {
        ctx.rect(1, 1, W - 2, H - 2);
    }
    ctx.stroke();

    return borderColor;
}

function _paintHeader(ctx: CanvasRenderingContext2D, W: number, H: number, vm: ViolationsHudVm): void {
    void H;
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.font = '700 10px "JetBrains Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    // W1.3 (D02): fitText em toda string livre — nunca corta sem reticência.
    ctx.fillText(fitText(ctx, t('hud.violations.header'), W - (vm.critical > 0 ? 36 : 16)), 8, 8);
    if (vm.critical > 0) {
        ctx.fillStyle = '#ef4444';
        ctx.font = '700 11px "JetBrains Mono", Consolas, monospace';
        ctx.fillText('[!]', W - 22, 7);
    }
}

function _paintEmptyState(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    vm: ViolationsHudVm,
    canvas: HTMLCanvasElement,
): void {
    void vm;
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.font = '600 9px "JetBrains Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(fitText(ctx, t('hud.violations.empty.title'), W - 12), W / 2, H / 2 - 6);
    ctx.font = '500 8px "JetBrains Mono", Consolas, monospace';
    ctx.fillStyle = 'rgba(234,179,8,0.85)';
    // CTA em até 2 linhas — divide no espaço quando não cabe inteira.
    const cta = t('hud.violations.empty.cta');
    if (ctx.measureText(cta).width <= W - 12) {
        ctx.fillText(cta, W / 2, H / 2 + 6);
    } else {
        const words = cta.split(' ');
        const mid = Math.ceil(words.length / 2);
        ctx.fillText(fitText(ctx, words.slice(0, mid).join(' '), W - 12), W / 2, H / 2 + 6);
        ctx.fillText(fitText(ctx, words.slice(mid).join(' '), W - 12), W / 2, H / 2 + 16);
    }
    // W3.4 (D17): placeholder da sparkline mesmo em empty state — a área
    // não some, comunica "ainda sem histórico" em vez de vazio mudo.
    const phY = H - 18;
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(8, phY);
    ctx.lineTo(W - 8, phY);
    ctx.stroke();
    ctx.fillStyle = 'rgba(148,163,184,0.5)';
    ctx.font = '500 7px "JetBrains Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('—', W / 2, phY - 8);
    const ariaEmpty = t('hud.violations.aria.empty');
    canvas.title = ariaEmpty;
    canvas.setAttribute('aria-label', ariaEmpty);
}

function _paintCounter(ctx: CanvasRenderingContext2D, W: number, H: number, vm: ViolationsHudVm): void {
    void H;
    ctx.fillStyle = vm.pulseBorder ? '#ef4444' : 'rgba(255,255,255,0.92)';
    ctx.font = '700 22px "JetBrains Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(vm.counterTotal), W / 2, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.font = '600 8px "JetBrains Mono", Consolas, monospace';
    ctx.fillText(fitText(ctx, t('hud.violations.counter.label'), W - 12), W / 2, 52);
}

function _paintBreakdown(ctx: CanvasRenderingContext2D, W: number, H: number, vm: ViolationsHudVm): void {
    void H;
    ctx.font = '600 9px "JetBrains Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    let y = 65;
    if (vm.critical > 0) {
        ctx.fillStyle = '#ef4444';
        ctx.fillText(fitText(ctx, `🔴 ${vm.critical} ${t('hud.violations.label.critical')}`, W - 16), 8, y);
        y += 10;
    }
    if (vm.medium > 0) {
        ctx.fillStyle = '#eab308';
        ctx.fillText(fitText(ctx, `🟡 ${vm.medium} ${t('hud.violations.label.medium')}`, W - 16), 8, y);
        y += 10;
    }
    if (vm.low > 0) {
        ctx.fillStyle = '#22c55e';
        ctx.fillText(fitText(ctx, `🟢 ${vm.low} ${t('hud.violations.label.low')}`, W - 16), 8, y);
    }
}

function _paintSparkline(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    vm: ViolationsHudVm,
    borderColor: string,
): void {
    const sparkY = H - 18;
    const sparkW = W - 16;
    const sparkH = 8;
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(8, sparkY);
    ctx.lineTo(W - 8, sparkY);
    ctx.stroke();
    const sl = vm.sparkline;
    if (sl.length > 0) {
        const stepW = sparkW / sl.length;
        ctx.fillStyle = borderColor;
        for (let i = 0; i < sl.length; i++) {
            const v = sl[i];
            if (v === undefined) continue;
            const h = Math.max(1, v * sparkH);
            ctx.fillRect(8 + i * stepW + 0.5, sparkY - h, Math.max(1, stepW - 1), h);
        }
    }
}

function _paintFooter(ctx: CanvasRenderingContext2D, W: number, H: number, vm: ViolationsHudVm): void {
    // Preset footer — usa o chip label curto exposto pelo complianceUiBootstrap
    // quando disponível (id canônico é longo demais p/ cards de 115px).
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.font = '500 7px "JetBrains Mono", Consolas, monospace';
    ctx.textAlign = 'left';
    const presetChip = (window as unknown as Record<string, unknown>).__ecbtActivePresetChip;
    const presetTxt = vm.preset
        ? `P: ${String(presetChip || vm.preset)}`
        : `⚠ ${t('hud.violations.preset.none.short')}`;
    ctx.fillText(fitText(ctx, presetTxt, W - 16), 8, H - 6);
}

function _paintAria(canvas: HTMLCanvasElement, vm: ViolationsHudVm): void {
    const aria = t('hud.violations.aria.summary', {
        total: vm.counterTotal,
        critical: vm.critical,
        medium: vm.medium,
        low: vm.low,
        preset: vm.preset || t('hud.violations.preset.none.short'),
    });
    canvas.title = aria;
    canvas.setAttribute('aria-label', aria);
}
