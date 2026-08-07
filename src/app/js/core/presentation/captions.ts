// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// F7 Captions (Legendas multi-idioma) - geração via LLM + display overlay.
// Spec: docs/specs/features/SPEC_PRESENTATION_MODE.md §F15 (extensão pós-F6)
//
// step.captions = { 'pt-BR': 'texto original', 'en-US': 'traduzido', 'es-LA': '...' }
// Player UI mostra legenda do idioma ativo (fallback: annotation / audio.text).

import { mutateActive, getActivePresentation } from './manager.js';

const SUPPORTED_LANGS = [
    'pt-BR',
    'en-US',
    'es-LA',
    'fr-FR',
    'de-DE',
    'it-IT',
    'zh-CN',
    'ja-JP',
    'ko-KR',
    'ar-SA',
    'ru-RU',
    'hi-IN',
];

export function getSupportedLangs() {
    return [...SUPPORTED_LANGS];
}

/**
 * Get caption for step in target lang.
 * Falls back to: audio.text > annotation > label > ''.
 * @param {any} step
 * @param {string} lang
 */
export function getCaption(step: any, lang: any) {
    if (!step) return '';
    if (step.captions && step.captions[lang]) return String(step.captions[lang]);
    // Fallback chain
    return String(step.audio?.text || step.annotation || step.label || '');
}

/**
 * Set caption for step in target lang (manual override).
 * @param {string} stepId
 * @param {string} lang
 * @param {string} text
 */
export function setCaption(stepId: any, lang: any, text: any) {
    const active = getActivePresentation();
    if (!active) return false;
    let found = false;
    mutateActive((/** @type {any} */ p: any) => {
        const step = p.steps.find((/** @type {any} */ s: any) => s.id === stepId);
        if (step) {
            step.captions = step.captions || {};
            step.captions[lang] = String(text || '').slice(0, 2000);
            found = true;
        }
    });
    return found;
}

/**
 * Generate caption via LLM translation.
 * Uses core/llm/client.js sendMessage.
 *
 * @param {object} step - has audio.text OR annotation OR label
 * @param {string} targetLang - e.g. 'en-US'
 * @returns {Promise<string>} translated text
 */
export async function generateCaption(step: any, targetLang: any) {
    const stepAny = /** @type {any} */ (step);
    if (!step || !SUPPORTED_LANGS.includes(targetLang)) {
        throw new Error(`Invalid step or lang: ${targetLang}`);
    }
    const source = stepAny.audio?.text || stepAny.annotation || stepAny.label || '';
    if (!source) return '';

    // Skip if source is already in target lang (heuristic: same lang code)
    const sourceLang = stepAny.audio?.lang || 'pt-BR';
    if (sourceLang === targetLang && stepAny.captions?.[targetLang] == null) {
        // Cache source as caption for that lang
        if (stepAny.id) setCaption(stepAny.id, targetLang, source);
        return source;
    }

    // Call LLM
    const { sendMessage, hasApiKey } = await import('../llm/client.js');
    if (!hasApiKey()) {
        throw new Error('LLM API key not configured');
    }

    const system = `You are a translator. Translate the given text from ${sourceLang} to ${targetLang}. Output ONLY the translated text, no explanations, no quotes, no prefixes.`;
    const user = source;

    try {
        const result = await sendMessage(system, user, /** @type {any} */ ({ temperature: 0.2, maxTokens: 500 }));
        const translated = String(/** @type {any} */ (result)?.text || result || '').trim();
        if (!translated) throw new Error('Empty translation result');
        if (stepAny.id) setCaption(stepAny.id, targetLang, translated);
        return translated;
    } catch (e) {
        console.warn('[captions] LLM translation failed', /** @type {any} */ (e as any)?.message);
        throw e;
    }
}

/**
 * Generate captions for all steps in all specified langs.
 * Rate-limited: sequential to avoid provider throttling.
 *
 * @param {string[]} targetLangs
 * @param {Function} [onProgress] - (done, total, lang, stepIdx)
 * @returns {Promise<{ ok: number, fail: number }>}
 */
export async function generateAllCaptions(targetLangs: any, onProgress: any) {
    const active = /** @type {any} */ (getActivePresentation());
    if (!active) return { ok: 0, fail: 0 };
    const total = active.steps.length * targetLangs.length;
    let done = 0;
    let ok = 0;
    let fail = 0;

    for (const lang of targetLangs) {
        for (let i = 0; i < active.steps.length; i++) {
            const step = active.steps[i];
            if (step.captions?.[lang]) {
                done++;
                ok++;
                if (onProgress) onProgress(done, total, lang, i);
                continue;
            }
            try {
                await generateCaption(step, lang);
                ok++;
            } catch {
                fail++;
            }
            done++;
            if (onProgress) onProgress(done, total, lang, i);
        }
    }
    return { ok, fail };
}

/**
 * Clear all captions from a step.
 * @param {string} stepId
 */
export function clearCaptions(stepId: any) {
    const active = getActivePresentation();
    if (!active) return false;
    let found = false;
    mutateActive((/** @type {any} */ p: any) => {
        const step = p.steps.find((/** @type {any} */ s: any) => s.id === stepId);
        if (step) {
            step.captions = {};
            found = true;
        }
    });
    return found;
}

/**
 * Count how many steps have caption in the given lang.
 * @param {string} lang
 */
export function countCaptions(lang: any) {
    const active = /** @type {any} */ (getActivePresentation());
    if (!active) return 0;
    return active.steps.filter((/** @type {any} */ s: any) => s.captions?.[lang]).length;
}
