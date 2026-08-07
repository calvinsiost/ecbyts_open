// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   LAUNCH VIDEO HELPERS — SPEC_PRESENTATION_MODE_LAUNCH_VIDEO

   Pure helpers para elevar qualidade do master de lançamento:
   - Anonymization check (§1.2.2 — no nomes reais em voice/caption)
   - tts-safe sanitization (PT-BR sem mojibake §Q1/Q2)
   - Caption procedural positioning (desktop-safe + mobile-safe §Q3)
   - Motion preset classifier §Q4 (focus/proof/compare/cta vs fade)
   - Voice vs caption split §Q1

   Pipeline de export e TTS real ficam em handler.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §Q4 / §1.2.2
// ──────────────────────────────────────────────────────────────────────

export const MOTION_PRESETS = Object.freeze(['focus', 'proof', 'compare', 'cta', 'fade_generic']);

export const CAPTION_POSITIONS = Object.freeze(['hotspot_aware', 'safe_bottom', 'safe_top', 'safe_center']);

export const VIEWPORT_TYPES = Object.freeze(['mobile_vertical', 'desktop_widescreen', 'desktop_fullscreen']);

export const SEMANTIC_INTENTS = Object.freeze(['focus', 'proof', 'compare', 'cta', 'transition']);

// Classes anonimizadas permitidas §1.2.2
export const ANONYMIZATION_CLASSES = Object.freeze([
    'orgao regulador',
    'cliente',
    'laboratorio parceiro',
    'universidade',
    'consultoria',
    'empresa parceira',
]);

// Nomes proibidos em master público (superset do FORBIDDEN_REAL_NAMES)
export const FORBIDDEN_REAL_NAMES_VIDEO = Object.freeze([
    'cetesb',
    'ibama',
    'conama', // órgãos
    'petrobras',
    'vale',
    'braskem',
    'usiminas',
    'csn', // empresas
    'usp',
    'unicamp',
    'ufrj',
    'ufmg', // universidades
    'arcadis',
    'ramboll',
    'aecom',
    'geoklock', // consultorias
    'calvin',
    'stefan',
    'iost', // pessoais
]);

// Motion "genérico PPT" alvo de redução §1.2.1
export const GENERIC_MOTION_KEYWORDS = Object.freeze(['fade', 'fade_in', 'fade_out', 'lower_third', 'ppt']);

// ──────────────────────────────────────────────────────────────────────
// Anonymization check §1.2.2
// ──────────────────────────────────────────────────────────────────────

/**
 * Verifica se texto contém nomes reais proibidos.
 * @param text
 * @returns
 */
export function checkAnonymization(text: string): { safe: boolean; violations: string[] } {
    if (typeof text !== 'string') return { safe: true, violations: [] };
    const lower = text.toLowerCase();
    const violations: string[] = [];
    for (const banned of FORBIDDEN_REAL_NAMES_VIDEO) {
        // word boundary check - evita falsos positivos (ex: "usp" em "uspado")
        const re = new RegExp(`\\b${banned}\\b`, 'i');
        if (re.test(lower)) violations.push(banned);
    }
    return { safe: violations.length === 0, violations };
}

/**
 * Verifica anonymization em todos os campos de um step.
 * @param step
 * @returns
 */
export function checkStepAnonymization(step: any): {
    safe: boolean;
    violationsByField: Record<string, string[]>;
} {
    const fields = ['voice_script', 'caption_text', 'caption_short', 'headline', 'overlay_text', 'cta', 'title'];
    const violationsByField: Record<string, string[]> = {};
    let safe = true;
    if (!step || typeof step !== 'object') return { safe: true, violationsByField };
    for (const f of fields) {
        if (step[f]) {
            const r = checkAnonymization(step[f]);
            if (!r.safe) {
                violationsByField[f] = r.violations;
                safe = false;
            }
        }
    }
    return { safe, violationsByField };
}

// ──────────────────────────────────────────────────────────────────────
// tts-safe sanitization §Q2
// ──────────────────────────────────────────────────────────────────────

/**
 * Sanitiza texto para TTS PT-BR: remove caracteres problemáticos,
 * normaliza espaços, expande abreviações comuns.
 *
 * @param text
 * @returns
 */
export function sanitizeForTTS(text: string): string {
    if (typeof text !== 'string') return '';
    let out = text.normalize('NFC'); // normaliza composição de acentos
    // Expansões técnicas comuns
    const replacements: Array<[RegExp, string]> = [
        [/\bCO2\b/gi, 'CO dois'],
        [/\bH2O\b/gi, 'H dois O'],
        [/\bpH\b/g, 'pê agá'],
        [/\bGHG\b/gi, 'G H G'],
        [/\bEIS\b/g, 'E I S'],
        [/\bCONAMA\s+(\d+)\/(\d+)\b/gi, 'CONAMA $1 barra $2'],
        [/\bVR\/VP\/VI\b/g, 'V R, V P e V I'],
        [/\b(\d+)%/g, '$1 por cento'],
        [/\b(\d+),(\d+)\b/g, '$1 vírgula $2'],
    ];
    for (const [re, rep] of replacements) {
        out = out.replace(re, rep);
    }
    // Remove markdown/HTML básico
    out = out.replace(/[*_`#]+/g, '');
    out = out.replace(/<[^>]+>/g, '');
    // Normaliza espaços
    out = out.replace(/\s+/g, ' ').trim();
    return out;
}

/**
 * Detecta mojibake (caracteres mal-codificados) em texto.
 * @param text
 * @returns
 */
export function hasMojibake(text: string): boolean {
    if (typeof text !== 'string') return false;
    // Padrões típicos de double-encoding UTF-8
    return /Ã[ƒ©¡¢£¤¥ª«]|Â[° ¡¢£]|â€[™œ˜]/u.test(text);
}

// ──────────────────────────────────────────────────────────────────────
// Caption split (§Q1 voice vs caption)
// ──────────────────────────────────────────────────────────────────────

/**
 * Separa texto em voice_script (sanitizado, longo) vs caption_text (curto).
 *
 * @param source - texto fonte único (fallback)
 * @param captionMaxChars
 * @returns
 */
export function splitVoiceAndCaption(
    source: string,
    captionMaxChars: number = 80,
): { voice_script: string; caption_text: string; caption_short: string } {
    if (typeof source !== 'string' || !source.trim()) {
        return { voice_script: '', caption_text: '', caption_short: '' };
    }
    const voice = sanitizeForTTS(source);
    // Caption: primeira sentença ou truncar
    const sentences = source.split(/(?<=[.!?])\s+/);
    const firstSentence = sentences[0] || source;
    const captionText =
        firstSentence.length > captionMaxChars ? firstSentence.slice(0, captionMaxChars - 1) + '…' : firstSentence;
    const captionShort = captionText.length > 40 ? captionText.slice(0, 39) + '…' : captionText;
    return {
        voice_script: voice,
        caption_text: captionText,
        caption_short: captionShort,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Caption positioning §Q3
// ──────────────────────────────────────────────────────────────────────

/**
 * Computa posição procedural de caption baseado em viewport + hotspot.
 *
 * @param viewport - mobile_vertical | desktop_widescreen | desktop_fullscreen
 * @param hotspot - coord 0..1 do foco principal (norm)
 * @returns
 */
export function computeCaptionPosition(
    viewport: string,
    hotspot?: { x: number; y: number },
): { position: string; offsetYPct: number; maxWidthPct: number; fontSizePct: number } {
    if (!VIEWPORT_TYPES.includes(viewport)) viewport = 'desktop_widescreen';

    // Defaults por viewport
    const defaults: Record<string, { offsetYPct: number; maxWidthPct: number; fontSizePct: number }> = {
        mobile_vertical: { offsetYPct: 80, maxWidthPct: 90, fontSizePct: 4 },
        desktop_widescreen: { offsetYPct: 78, maxWidthPct: 70, fontSizePct: 2.5 },
        desktop_fullscreen: { offsetYPct: 72, maxWidthPct: 60, fontSizePct: 2.2 },
    };
    const base = defaults[viewport] as { offsetYPct: number; maxWidthPct: number; fontSizePct: number };

    // Hotspot-aware: se hotspot Y no fundo, sobe caption para o topo
    let position = 'hotspot_aware';
    let offsetYPct = base.offsetYPct;
    if (hotspot && Number.isFinite(hotspot.y)) {
        const hy = Math.max(0, Math.min(1, hotspot.y));
        if (hy > 0.6) {
            // hotspot embaixo → caption em cima
            position = 'safe_top';
            offsetYPct = 15;
        }
    }

    return {
        position,
        offsetYPct,
        maxWidthPct: base.maxWidthPct,
        fontSizePct: base.fontSizePct,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Motion preset classifier §Q4
// ──────────────────────────────────────────────────────────────────────

/**
 * Dado intent semântico do step + metadados, sugere motion preset não-genérico.
 *
 * @param stepMeta
 * @returns preset ∈ MOTION_PRESETS
 */
export function classifyMotionPreset(stepMeta: {
    semantic_intent?: string;
    hasData?: boolean;
    hasComparison?: boolean;
}): string {
    if (!stepMeta || typeof stepMeta !== 'object') return 'fade_generic';
    const intent = stepMeta.semantic_intent;
    if (typeof intent !== 'string' || !SEMANTIC_INTENTS.includes(intent)) return 'fade_generic';
    if (intent === 'focus') return 'focus';
    if (intent === 'proof' && stepMeta.hasData) return 'proof';
    if (intent === 'compare' && stepMeta.hasComparison) return 'compare';
    if (intent === 'cta') return 'cta';
    return 'fade_generic';
}

/**
 * Score qualidade de motion em uma apresentação (target ≥80% não-genérico §Criterios).
 * @param steps
 * @returns
 */
export function scoreMotionQuality(steps: Array<any>): {
    total: number;
    nonGenericCount: number;
    pctNonGeneric: number;
    passes80: boolean;
} {
    if (!Array.isArray(steps) || steps.length === 0) {
        return { total: 0, nonGenericCount: 0, pctNonGeneric: 0, passes80: false };
    }
    let nonGeneric = 0;
    for (const s of steps) {
        const preset = classifyMotionPreset(s);
        if (preset !== 'fade_generic') nonGeneric++;
    }
    const pct = (nonGeneric / steps.length) * 100;
    return {
        total: steps.length,
        nonGenericCount: nonGeneric,
        pctNonGeneric: Math.round(pct),
        passes80: pct >= 80,
    };
}
