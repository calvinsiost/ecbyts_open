// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   A11Y CONTRAST — WCAG 2.1 contrast ratio calculator + validator
   SPEC_CONTRAST_TESTING_9_77 §4 (tokens de cor acessíveis)

   Pure, node-testable. Zero deps.

   Algoritmo:
   - Parse de cores: #rgb, #rrggbb, rgb()/rgba(), named colors básicos
   - Relative luminance via fórmula sRGB (WCAG 2.1 §1.4.3)
   - Contrast ratio = (L_lighter + 0.05) / (L_darker + 0.05)
   - AA: ≥4.5 (texto normal) ou ≥3.0 (texto grande ≥18pt/14pt bold)
   - AAA: ≥7.0 (texto normal) ou ≥4.5 (texto grande)

   ALPHA / COMPOSIÇÃO (A11Y-ALPHA-001, 2026-08-06)
   -----------------------------------------------
   A luminância relativa do WCAG é definida sobre um PIXEL — uma cor opaca. Cor
   com alpha < 1 NÃO tem luminância própria: só existe depois de composta sobre
   o que está atrás dela. Até 2026-08-06 este motor fazia `parseColor` devolver
   `a` e `relativeLuminance` DESCARTAR — media a cor da tinta, não o pixel que o
   olho vê, e devolvia um número errado em silêncio (nem null, nem aviso).

   Caso concreto que expôs o bug: `.nfse-badge--success { background:
   rgba(34,197,94,0.15) }` media 1.62:1 (REPROVA) contra o verde opaco; composto
   source-over sobre a superfície escura do modal dá 9.03:1 (passa AA folgado).

   Contrato atual:
   - `relativeLuminance()` continua puro sobre {r,g,b} — é a fórmula do WCAG e
     por definição não conhece alpha. Recebendo cor translúcida ele AVISA
     (console.warn) em vez de aceitar calado.
   - `contrastRatio(fg, bg)` com AMBAS opacas: comportamento inalterado.
   - `contrastRatio(fg, bg)` com `bg` translúcido e SEM backdrop: retorna null
     (não dá para medir sem saber o que há atrás). Use `{ over }`.
   - `contrastRatio(fg, bg, { over })`: compõe a pilha `over` ← `bg` ← `fg`
     (source-over) e mede o pixel resultante.
   - `fg` translúcido sobre um `bg` já opaco é resolvido sem backdrop extra: o
     próprio `bg` é o que está atrás da tinta do texto.
   ================================================================ */

interface RgbColor {
    r: number;
    g: number;
    b: number;
    a?: number;
}

type ColorInput = string | object;

/** Motivo pelo qual um par não pôde ser medido (null-safe: ausente = medido). */
type UnmeasurableReason = 'invalid-color' | 'translucent-background' | 'translucent-backdrop';

interface ContrastOptions {
    /**
     * Backdrop: o que está ATRÁS do `bg`. Aceita uma cor ou uma pilha de camadas
     * ordenada do TOPO para o FUNDO (`[maisEmCima, ..., baseOpaca]`). A última
     * camada precisa ser opaca — senão o par continua não-mensurável.
     */
    over?: ColorInput | ColorInput[] | undefined;
}

interface ResolvedPair {
    ok: boolean;
    /** Ratio WCAG do pixel composto, ou null se não-mensurável. */
    ratio: number | null;
    /** Foreground já composto (opaco), ou null. */
    fg: RgbColor | null;
    /** Background já composto (opaco), ou null. */
    bg: RgbColor | null;
    /** true se qualquer entrada tinha alpha < 1 e precisou de composição. */
    composited: boolean;
    reason?: UnmeasurableReason | undefined;
}

interface PairResult {
    ratio: number | null;
    level: 'AAA' | 'AA' | 'A' | 'fail';
    aa: boolean;
    aaa: boolean;
    passes: boolean;
    /** Presente só quando o par NÃO pôde ser medido — anti-falso-verde. */
    reason?: UnmeasurableReason | undefined;
    /** true quando houve alpha e a medida saiu do pixel composto. */
    composited?: boolean | undefined;
}

interface ScanEntry extends PairResult {
    id: string;
    fg: string | object;
    bg: string | object;
}

interface ScanResult {
    violations: ScanEntry[];
    passed: ScanEntry[];
    /**
     * Subconjunto de `violations` que falhou por NÃO SER MENSURÁVEL (cor inválida
     * ou alpha sem backdrop) — não por contraste baixo. Continua dentro de
     * `violations` de propósito: ausência de medida nunca vira verde.
     */
    unmeasurable: ScanEntry[];
    summary: { total: number; passed: number; failed: number; unmeasurable: number; aaaRate: number };
}

// ──────────────────────────────────────────────────────────────────────
// Named colors (subset canônico para parsing de design tokens)
// ──────────────────────────────────────────────────────────────────────

const NAMED_COLORS = Object.freeze({
    black: { r: 0, g: 0, b: 0 },
    white: { r: 255, g: 255, b: 255 },
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 128, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    yellow: { r: 255, g: 255, b: 0 },
    gray: { r: 128, g: 128, b: 128 },
    grey: { r: 128, g: 128, b: 128 },
    transparent: { r: 0, g: 0, b: 0, a: 0 },
});

// ──────────────────────────────────────────────────────────────────────
// Parsers
// ──────────────────────────────────────────────────────────────────────

function _hexToRgb(hex: string): RgbColor | null {
    const s = hex.replace('#', '').trim();
    if (!/^[0-9a-f]+$/i.test(s)) return null;
    if (s.length === 3) {
        return {
            r: parseInt(s[0]! + s[0]!, 16),
            g: parseInt(s[1]! + s[1]!, 16),
            b: parseInt(s[2]! + s[2]!, 16),
        };
    }
    if (s.length === 6) {
        return {
            r: parseInt(s.slice(0, 2), 16),
            g: parseInt(s.slice(2, 4), 16),
            b: parseInt(s.slice(4, 6), 16),
        };
    }
    if (s.length === 8) {
        return {
            r: parseInt(s.slice(0, 2), 16),
            g: parseInt(s.slice(2, 4), 16),
            b: parseInt(s.slice(4, 6), 16),
            a: parseInt(s.slice(6, 8), 16) / 255,
        };
    }
    return null;
}

/**
 * Parse CSS color string para { r, g, b, a? } com canais 0-255.
 * Aceita: '#rgb', '#rrggbb', '#rrggbbaa', 'rgb(r,g,b)', 'rgba(r,g,b,a)', named colors.
 * Retorna null se não conseguir parsear.
 */
export function parseColor(color: string | object): RgbColor | null {
    if (color == null) return null;
    if (typeof color === 'object') {
        const { r, g, b, a } = color as any;
        if ([r, g, b].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) {
            const out: any = { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
            if (Number.isFinite(a)) out.a = Math.max(0, Math.min(1, a));
            return out;
        }
        return null;
    }
    if (typeof color !== 'string') return null;

    const s = color.trim().toLowerCase();
    if (s === '') return null;

    if (s.startsWith('#')) return _hexToRgb(s);

    if (s.startsWith('rgb')) {
        const m = s.match(/rgba?\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*(?:,\s*([-\d.]+))?\s*\)/);
        if (!m) return null;
        const r = Math.round(Math.max(0, Math.min(255, Number(m[1]))));
        const g = Math.round(Math.max(0, Math.min(255, Number(m[2]))));
        const b = Math.round(Math.max(0, Math.min(255, Number(m[3]))));
        const out: any = { r, g, b };
        if (m[4] !== undefined) out.a = Math.max(0, Math.min(1, Number(m[4])));
        return out;
    }

    if ((NAMED_COLORS as any)[s]) return { ...(NAMED_COLORS as any)[s] };

    return null;
}

// ──────────────────────────────────────────────────────────────────────
// Luminance + contrast
// ──────────────────────────────────────────────────────────────────────

function _channelLinear(c: number): number {
    const srgb = c / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

/** Alpha efetivo de uma cor parseada (ausente = opaco). */
export function alphaOf(color: { a?: number } | null | undefined): number {
    if (!color) return 1;
    return Number.isFinite(color.a as number) ? Math.max(0, Math.min(1, color.a as number)) : 1;
}

/** true se a cor é opaca (alpha ausente ou ≥ 1). */
export function isOpaque(color: ColorInput | null | undefined): boolean {
    const parsed = color == null ? null : parseColor(color);
    if (!parsed) return false;
    return alphaOf(parsed) >= 1;
}

// Aviso único por processo: repetir a cada chamada viraria ruído de log e
// esconderia o sinal. O importante é que NUNCA passe despercebido.
let _warnedTranslucentLuminance = false;

/**
 * Relative luminance (WCAG 2.1 §1.4.3) de uma cor RGB.
 *
 * IGNORA alpha POR DEFINIÇÃO — a fórmula do WCAG é sobre um pixel opaco. Se
 * receber cor com alpha < 1 significa que o chamador esqueceu de compor: o
 * número devolvido é o da TINTA, não o do pixel. Nesse caso avisa alto (o bug
 * A11Y-ALPHA-001 sobreviveu meses justamente por ser silencioso). Componha
 * antes com `compositeOver()` / `compositeStack()`.
 *
 * @returns luminância ∈ [0, 1]
 */
export function relativeLuminance(rgb: { r: number; g: number; b: number; a?: number }): number {
    if (!rgb) return 0;
    if (Number.isFinite(rgb.a as number) && (rgb.a as number) < 1 && !_warnedTranslucentLuminance) {
        _warnedTranslucentLuminance = true;
        console.warn(
            '[a11y/contrast] relativeLuminance() recebeu cor com alpha < 1 ' +
                `(rgba(${rgb.r},${rgb.g},${rgb.b},${rgb.a})). Alpha é IGNORADO pela fórmula WCAG — ` +
                'o resultado é a luminância da tinta, não a do pixel. Componha antes com compositeOver()/compositeStack().',
        );
    }
    const r = _channelLinear(rgb.r);
    const g = _channelLinear(rgb.g);
    const b = _channelLinear(rgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ──────────────────────────────────────────────────────────────────────
// Alpha compositing (source-over) — o pixel que o olho vê
// ──────────────────────────────────────────────────────────────────────

/**
 * Alpha compositing source-over: `top` PINTADO SOBRE `bottom`.
 * Fórmula canônica (Porter-Duff "over", cores não-premultiplicadas):
 *   αo = αt + αb·(1 − αt)
 *   Co = (Ct·αt + Cb·αb·(1 − αt)) / αo
 *
 * Se `bottom` é opaco (o caso normal) isso reduz à interpolação linear
 * `Ct·αt + Cb·(1 − αt)` e o resultado é opaco.
 *
 * @returns cor composta (com `a`) ou null se alguma entrada for inválida.
 */
export function compositeOver(top: ColorInput, bottom: ColorInput): RgbColor | null {
    const t = parseColor(top);
    const b = parseColor(bottom);
    if (!t || !b) return null;
    const at = alphaOf(t);
    const ab = alphaOf(b);
    const ao = at + ab * (1 - at);
    if (ao <= 0) return { r: 0, g: 0, b: 0, a: 0 }; // ambas 100% transparentes
    const mix = (ct: number, cb: number) => Math.round((ct * at + cb * ab * (1 - at)) / ao);
    return { r: mix(t.r, b.r), g: mix(t.g, b.g), b: mix(t.b, b.b), a: ao };
}

/**
 * Compõe uma PILHA de camadas, ordenada do TOPO para o FUNDO.
 * `compositeStack(['rgba(255,255,255,0.1)', 'rgba(0,0,0,0.5)', '#fff'])` = a
 * camada branca 10% sobre a preta 50% sobre o branco opaco.
 *
 * O alpha do resultado é o da pilha inteira: só é opaco se a camada mais ao
 * fundo for opaca. Cabe ao chamador checar (`isOpaque`) — este helper não
 * inventa um fundo.
 *
 * @returns cor composta ou null se a pilha for vazia/inválida.
 */
export function compositeStack(layers: ColorInput[]): RgbColor | null {
    if (!Array.isArray(layers) || layers.length === 0) return null;
    const parsed = layers.map((l) => parseColor(l));
    if (parsed.some((p) => !p)) return null;
    let out = parsed[parsed.length - 1] as RgbColor;
    for (let i = parsed.length - 2; i >= 0; i--) {
        const next = compositeOver(parsed[i] as RgbColor, out);
        if (!next) return null;
        out = next;
    }
    return out;
}

/** Normaliza `opts.over` (cor única ou pilha) numa lista top→fundo. */
function _backdropLayers(over: ContrastOptions['over']): ColorInput[] | null {
    if (over == null) return null;
    const arr = Array.isArray(over) ? over : [over];
    return arr.length === 0 ? null : arr;
}

/**
 * Resolve um par fg/bg até PIXELS OPACOS, aplicando composição source-over.
 *
 * Pilha física assumida (de baixo para cima): `opts.over` → `bg` → `fg`.
 * - `bg` translúcido é composto sobre o backdrop; sem backdrop opaco o par é
 *   NÃO-MENSURÁVEL (reason `translucent-background` / `translucent-backdrop`).
 * - `fg` translúcido é composto sobre o `bg` já resolvido — não precisa de
 *   backdrop extra, o que está atrás da tinta do texto É o fundo dele.
 *
 * Devolve sempre um diagnóstico; nunca um número silenciosamente errado.
 */
export function resolvePair(fg: ColorInput, bg: ColorInput, opts: ContrastOptions = {}): ResolvedPair {
    const fgParsed = parseColor(fg);
    const bgParsed = parseColor(bg);
    if (!fgParsed || !bgParsed) {
        return { ok: false, ratio: null, fg: null, bg: null, composited: false, reason: 'invalid-color' };
    }

    const composited = alphaOf(fgParsed) < 1 || alphaOf(bgParsed) < 1;

    // 1. Fundo efetivo
    let bgOpaque: RgbColor = bgParsed;
    if (alphaOf(bgParsed) < 1) {
        const layers = _backdropLayers(opts.over);
        if (!layers) {
            return {
                ok: false,
                ratio: null,
                fg: null,
                bg: null,
                composited: true,
                reason: 'translucent-background',
            };
        }
        const stack = compositeStack([bgParsed, ...layers]);
        if (!stack) {
            return { ok: false, ratio: null, fg: null, bg: null, composited: true, reason: 'invalid-color' };
        }
        if (alphaOf(stack) < 1) {
            // O backdrop informado também é translúcido — a pilha não fecha num
            // pixel. Não adivinhamos "branco" aqui: quem sabe o que há embaixo é
            // o chamador, e chutar seria reintroduzir o número errado silencioso.
            return { ok: false, ratio: null, fg: null, bg: null, composited: true, reason: 'translucent-backdrop' };
        }
        bgOpaque = stack;
    }

    // 2. Tinta do texto sobre o fundo efetivo
    let fgOpaque: RgbColor = fgParsed;
    if (alphaOf(fgParsed) < 1) {
        const blended = compositeOver(fgParsed, bgOpaque);
        if (!blended) {
            return { ok: false, ratio: null, fg: null, bg: null, composited: true, reason: 'invalid-color' };
        }
        fgOpaque = blended;
    }

    const lf = relativeLuminance({ r: fgOpaque.r, g: fgOpaque.g, b: fgOpaque.b });
    const lb = relativeLuminance({ r: bgOpaque.r, g: bgOpaque.g, b: bgOpaque.b });
    const lighter = Math.max(lf, lb);
    const darker = Math.min(lf, lb);
    return {
        ok: true,
        ratio: (lighter + 0.05) / (darker + 0.05),
        fg: { ...fgOpaque, a: 1 },
        bg: { ...bgOpaque, a: 1 },
        composited,
    };
}

/**
 * Contrast ratio WCAG 2.1 entre foreground e background.
 * Ratio ∈ [1, 21]. Aceita strings CSS ou objetos {r,g,b[,a]}.
 *
 * Cores OPACAS: comportamento idêntico ao histórico (simétrico, ordem dos
 * argumentos irrelevante).
 *
 * Cores com ALPHA: a ordem importa — `fg` é a tinta, `bg` o que está atrás
 * dela. Sem `opts.over` para resolver um `bg` translúcido o retorno é **null**
 * (não-mensurável), nunca um número errado. Use `resolvePair()` para saber o
 * motivo.
 *
 * @returns ratio, ou null se as cores forem inválidas ou o par não-mensurável
 */
export function contrastRatio(fg: ColorInput, bg: ColorInput, opts: ContrastOptions = {}): number | null {
    return resolvePair(fg, bg, opts).ratio;
}

/**
 * Açúcar explícito para o caso composto: mede `fg` sobre `bg` sabendo que
 * atrás do `bg` está `backdrop` (cor única ou pilha top→fundo).
 * Equivale a `contrastRatio(fg, bg, { over: backdrop })`.
 */
export function contrastRatioComposited(
    fg: ColorInput,
    bg: ColorInput,
    backdrop: ColorInput | ColorInput[],
): number | null {
    return resolvePair(fg, bg, { over: backdrop }).ratio;
}

// ──────────────────────────────────────────────────────────────────────
// WCAG compliance checks
// ──────────────────────────────────────────────────────────────────────

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;
const AAA_NORMAL = 7.0;
const AAA_LARGE = 4.5;

/**
 * WCAG AA compliance.
 * @param ratio - texto ≥18pt (24px) ou ≥14pt (18.66px) bold
 */
export function isAACompliant(ratio: number, isLargeText: boolean = false): boolean {
    if (!Number.isFinite(ratio)) return false;
    return ratio >= (isLargeText ? AA_LARGE : AA_NORMAL);
}

/**
 * WCAG AAA compliance.
 */
export function isAAACompliant(ratio: number, isLargeText: boolean = false): boolean {
    if (!Number.isFinite(ratio)) return false;
    return ratio >= (isLargeText ? AAA_LARGE : AAA_NORMAL);
}

/**
 * Classifica um ratio em nível WCAG.
 */
export function wcagLevel(ratio: number, isLargeText: boolean = false): 'AAA' | 'AA' | 'A' | 'fail' {
    if (!Number.isFinite(ratio)) return 'fail';
    if (isAAACompliant(ratio, isLargeText)) return 'AAA';
    if (isAACompliant(ratio, isLargeText)) return 'AA';
    if (ratio >= 3.0) return 'A'; // componentes UI não-textuais (WCAG 2.1 §1.4.11)
    return 'fail';
}

/**
 * Valida um par foreground/background.
 * @param fg - foreground (texto)
 * @param bg - background
 */
export function validatePair(
    fg: string | object,
    bg: string | object,
    opts: { isLargeText?: boolean; isUIComponent?: boolean } & ContrastOptions = {},
): PairResult {
    const resolved = resolvePair(fg, bg, { over: opts.over });
    const ratio = resolved.ratio;
    if (ratio == null) {
        // Não-mensurável NUNCA vira verde: sai como fail COM o motivo, para o
        // relatório distinguir "contraste baixo" de "faltou o fundo".
        return {
            ratio: null,
            level: 'fail',
            aa: false,
            aaa: false,
            passes: false,
            reason: resolved.reason,
            composited: resolved.composited,
        };
    }
    const isLargeText = !!opts.isLargeText;
    const aa = isAACompliant(ratio, isLargeText);
    const aaa = isAAACompliant(ratio, isLargeText);
    const level = wcagLevel(ratio, isLargeText);
    const passes = opts.isUIComponent ? ratio >= 3.0 : aa;
    return { ratio, level, aa, aaa, passes, composited: resolved.composited };
}

// ──────────────────────────────────────────────────────────────────────
// Batch scanners (design system validation)
// ──────────────────────────────────────────────────────────────────────

/**
 * Escaneia múltiplos pares fg/bg e retorna violações.
 */
export function scanPairs(
    pairs: Array<
        {
            id: string;
            fg: string;
            bg: string;
            isLargeText?: boolean;
            isUIComponent?: boolean;
        } & ContrastOptions
    >,
): ScanResult {
    if (!Array.isArray(pairs))
        return {
            violations: [],
            passed: [],
            unmeasurable: [],
            summary: { total: 0, passed: 0, failed: 0, unmeasurable: 0, aaaRate: 0 },
        };
    const violations: ScanEntry[] = [];
    const passed: ScanEntry[] = [];
    const unmeasurable: ScanEntry[] = [];
    let aaaCount = 0;
    for (const p of pairs) {
        if (!p || typeof p !== 'object') continue;
        const result = validatePair(p.fg, p.bg, {
            isLargeText: !!p.isLargeText,
            isUIComponent: !!p.isUIComponent,
            over: p.over,
        });
        const entry: ScanEntry = { id: p.id, fg: p.fg, bg: p.bg, ...result };
        if (result.passes) {
            passed.push(entry);
            if (result.aaa) aaaCount++;
        } else {
            violations.push(entry);
            if (result.ratio == null) unmeasurable.push(entry);
        }
    }
    const total = violations.length + passed.length;
    return {
        violations,
        passed,
        unmeasurable,
        summary: {
            total,
            passed: passed.length,
            failed: violations.length,
            unmeasurable: unmeasurable.length,
            aaaRate: total === 0 ? 0 : aaaCount / total,
        },
    };
}

/**
 * Valida o map de tokens canônico do spec §4.1 (light/dark mode).
 * Cada token textual deve contrastar com cada bg candidato.
 *
 * @param tokenMap - ex: { textPrimary: {light, dark}, bgPrimary: {light, dark}, ... }
 */
export function validateTokenMap(
    tokenMap: object,
    checks: Array<{
        fgToken: string;
        bgToken: string;
        isLargeText?: boolean;
        isUIComponent?: boolean;
        /** Token(s) do backdrop, quando `bgToken` for translúcido. Top→fundo. */
        overToken?: string | string[];
        /** Backdrop literal (cor/pilha), alternativa a `overToken`. */
        over?: ColorInput | ColorInput[];
    }>,
    mode: 'light' | 'dark' = 'light',
): ScanResult {
    if (!tokenMap || typeof tokenMap !== 'object' || !Array.isArray(checks)) {
        return scanPairs([]);
    }
    const forMode = (def: any) => (def && typeof def === 'object' && !Array.isArray(def) ? def[mode] : def);
    const pairs = checks
        .map((c: any) => {
            const fg = forMode((tokenMap as any)[c.fgToken]);
            const bg = forMode((tokenMap as any)[c.bgToken]);
            let over = c.over;
            if (over === undefined && c.overToken !== undefined) {
                const tokens = Array.isArray(c.overToken) ? c.overToken : [c.overToken];
                const resolved = tokens.map((t: string) => forMode((tokenMap as any)[t])).filter(Boolean);
                if (resolved.length) over = resolved;
            }
            return {
                id: `${c.fgToken}-on-${c.bgToken}-${mode}`,
                fg,
                bg,
                isLargeText: !!c.isLargeText,
                isUIComponent: !!c.isUIComponent,
                over,
            };
        })
        .filter((p) => p.fg && p.bg);
    return scanPairs(pairs);
}

// ──────────────────────────────────────────────────────────────────────
// CSS extraction + suggestion helpers
// ──────────────────────────────────────────────────────────────────────

function _rgbToHex(rgb: any): string {
    const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Fundo como PIXEL: compõe `bg` sobre `over` quando translúcido.
 * @returns cor opaca, ou null se inválida / ainda translúcida (sem chute).
 */
function _opaqueBackground(bg: ColorInput, over: ContrastOptions['over']): RgbColor | null {
    const parsed = parseColor(bg);
    if (!parsed) return null;
    if (alphaOf(parsed) >= 1) return parsed;
    const layers = _backdropLayers(over);
    if (!layers) return null;
    const stack = compositeStack([parsed, ...layers]);
    if (!stack || alphaOf(stack) < 1) return null;
    return stack;
}

const _COLOR_VAR_PATTERNS = [
    /color/i,
    /^--text-/,
    /^--bg-/,
    /^--primary/,
    /^--secondary/,
    /^--accent-/,
    /^--success/,
    /^--warning/,
    /^--error/,
    /^--info/,
    /^--neutral-/,
    /^--surface-/,
    /^--chrome-/,
    /^--window-/,
    /^--bottom-/,
    /^--eis-/,
    /^--market-/,
    /^--merge-/,
    /^--overlay-/,
    /^--border-color/,
    /^--scrollbar-/,
    /^--engine-/,
    /^--ribbon-/,
    /^--modal-/,
    /^--card-/,
    /^--panel-/,
    /^--fg-/,
    /^--foreground-/,
];

const _TEXT_VAR_PATTERNS = [
    /^--text-/,
    /^--primary-text/,
    /^--chrome-text/,
    /^--window-text/,
    /^--bottom-text/,
    /^--eis-text/,
    /^--market-text/,
    /^--merge-.*-fg/,
    /^--fg-/,
    /^--foreground-/,
];

function _isColorVar(name: string): boolean {
    return _COLOR_VAR_PATTERNS.some((p) => p.test(name));
}

function _isColorValue(value: any): boolean {
    if (typeof value !== 'string') return false;
    const v = value.trim().toLowerCase();
    return (
        v.startsWith('#') ||
        v.startsWith('rgb') ||
        v.startsWith('hsl') ||
        (NAMED_COLORS as any)[v] !== undefined
    );
}

function _isTextVar(name: string): boolean {
    return _TEXT_VAR_PATTERNS.some((p) => p.test(name));
}

/**
 * Parse CSS text and extract color variable definitions.
 */
export function extractCssVariables(cssText: string): Array<{ name: string; value: string }> {
    if (typeof cssText !== 'string') return [];
    const vars: Array<{ name: string; value: string }> = [];
    const regex = /(--[\w-]+)\s*:\s*([^;]+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(cssText)) !== null) {
        const name = match[1]!;
        const value = match[2]!.trim();
        if (_isColorVar(name) && _isColorValue(value)) {
            vars.push({ name, value });
        }
    }
    return vars;
}

/**
 * Audit a CSS file's text color variables against a background color.
 *
 * @param bgColor - fundo de referência. PODE ser translúcido (vários tokens de
 *   superfície do app são `rgba(...)`) — nesse caso informe `opts.over` com o
 *   que está atrás, senão os pares saem como não-mensuráveis (nunca como verde).
 * @param opts.over - backdrop (cor ou pilha top→fundo). Default: o canvas do
 *   browser, branco — documentado, não adivinhado: é o fundo do `<html>` quando
 *   nenhum ancestral opaco existe.
 */
export function auditCssFile(
    cssText: string,
    bgColor: string = '#FFFFFF',
    opts: ContrastOptions = { over: '#FFFFFF' },
): ScanResult {
    const vars = extractCssVariables(cssText);
    const varMap: Record<string, string> = {};
    for (const v of vars) {
        varMap[v.name] = v.value;
    }

    function resolve(value: any): any {
        if (typeof value !== 'string') return value;
        const m = value.match(/^var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)$/);
        if (m) {
            const varKey = m[1]!;
            const resolved = varMap[varKey] !== undefined ? varMap[varKey] : m[2] ? m[2].trim() : undefined;
            if (resolved !== undefined) return resolve(resolved);
        }
        return value;
    }

    const textVars = vars.filter((v) => _isTextVar(v.name));
    const pairs = textVars.map((v) => ({
        id: v.name,
        fg: resolve(v.value),
        bg: bgColor,
        over: opts?.over,
    }));

    return scanPairs(pairs);
}

/**
 * Suggest a foreground color that meets the target contrast ratio.
 * Lightens toward white on dark backgrounds, darkens toward black on light backgrounds.
 *
 * @returns suggested hex color or null
 */
export function suggestFixColor(
    fg: string | object,
    bg: string | object,
    targetRatio: number = 4.5,
    opts: ContrastOptions = {},
): string | null {
    const fgParsed = parseColor(fg);
    if (!fgParsed) return null;
    // O fundo precisa virar PIXEL antes de servir de alvo: sugerir cor contra um
    // `rgba()` cru devolveria um hex calibrado para a tinta, não para o que se vê.
    const bgRgb = _opaqueBackground(bg, opts.over);
    if (!bgRgb) return null;
    // Tinta translúcida: a busca parte do pixel VISÍVEL. O hex sugerido é a cor
    // final desejada — quem aplicar deve usá-la opaca (ou recalcular o alpha).
    const fgRgb = alphaOf(fgParsed) < 1 ? (compositeOver(fgParsed, bgRgb) as RgbColor) : fgParsed;

    const currentRatio = contrastRatio(fgRgb, bgRgb);
    if (currentRatio != null && currentRatio >= targetRatio) return _rgbToHex(fgRgb);

    const bgLum = relativeLuminance(bgRgb);
    // If bg is dark, lighten fg toward white; if bg is light, darken fg toward black
    const targetRgb = bgLum > 0.5 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };

    let low = 0;
    let high = 1;
    for (let i = 0; i < 24; i++) {
        const mid = (low + high) / 2;
        const blended = {
            r: Math.round(fgRgb.r + (targetRgb.r - fgRgb.r) * mid),
            g: Math.round(fgRgb.g + (targetRgb.g - fgRgb.g) * mid),
            b: Math.round(fgRgb.b + (targetRgb.b - fgRgb.b) * mid),
        };
        const ratio = contrastRatio(blended, bgRgb);
        if (ratio != null && ratio >= targetRatio) {
            high = mid;
        } else {
            low = mid;
        }
    }

    const result = {
        r: Math.round(fgRgb.r + (targetRgb.r - fgRgb.r) * high),
        g: Math.round(fgRgb.g + (targetRgb.g - fgRgb.g) * high),
        b: Math.round(fgRgb.b + (targetRgb.b - fgRgb.b) * high),
    };
    return _rgbToHex(result);
}
