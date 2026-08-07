// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM Tier A — llmChat.ts #4 monolito.
// Pure-logic extraction from src/app/js/utils/handlers/llmChat.ts voice/STT subdomain
// (2409L, fanin=4, score 1490 per MONOLITH_IMPACT_ANALYSIS_2026_05_27).
//
// Read from canonical .ts source (TS-MIGRATION-001 phase 2 2026-05-27).
//
// Hand-authored R1-safe.
//
// Spec NOT:
// - NÃO ler DOM (caller monta dropdowns/inputs)
// - NÃO ler localStorage (caller injeta valores via parameters)
// - NÃO ler navigator.mediaDevices (caller checa capabilities)
// - NÃO emoji
//
// Extracted helpers:
//   - VOICE_STORAGE_KEYS_LIST       (frozen storage key catalog)
//   - STT_SOURCES                   (frozen 'auto'|'local'|'native'|'external')
//   - EXTERNAL_STT_DEFAULT_MODELS_MAP (frozen provider → model)
//   - LOCALE_TO_STT_LANGUAGE_MAP    (frozen pt-BR/en-US/es-LA → whisper code)
//   - normalizeSttSource(value)     (validation + fallback to 'auto')
//   - normalizeExternalProvider(value, allowed) (validation + fallback)
//   - errorToMessage(error)         (any error-like → string normalization)
//   - resolveSttLanguage(locale)    (locale → whisper language string|undefined)
//   - resolveTtsLanguage(locale)    (locale → web speech API tag)
//   - resolveExternalModelHint(providerId, model, fallback) (caller composes label)

export type SttSource = 'auto' | 'local' | 'native' | 'external';
export type SupportedLocale = 'pt-BR' | 'en-US' | 'es-LA';

/** Frozen list of storage keys used by voice settings. */
export const VOICE_STORAGE_KEYS_LIST: Readonly<{
    AUTO_READ: string;
    AUTO_SEND: string;
    PREFER_NATIVE_STT: string;
    MAX_RECORD_MS: string;
    CONVERSE_WHEN_MINIMIZED: string;
    STT_SOURCE: string;
    EXTERNAL_PROVIDER: string;
    EXTERNAL_MODEL: string;
}> = Object.freeze({
    AUTO_READ: 'ecbyts_voice_auto_read',
    AUTO_SEND: 'ecbyts_voice_auto_send',
    PREFER_NATIVE_STT: 'ecbyts_voice_prefer_native_stt',
    MAX_RECORD_MS: 'ecbyts_voice_max_record_ms',
    CONVERSE_WHEN_MINIMIZED: 'ecbyts_voice_converse_when_minimized',
    STT_SOURCE: 'ecbyts_voice_stt_source',
    EXTERNAL_PROVIDER: 'ecbyts_voice_external_provider',
    EXTERNAL_MODEL: 'ecbyts_voice_external_model',
});

/** Frozen enum of allowed STT source values. */
export const STT_SOURCES: ReadonlyArray<SttSource> = Object.freeze(['auto', 'local', 'native', 'external'] as const);

/**
 * Frozen default external STT model per provider id.
 * Caller supplies LLMProvider.OPENAI / .GROQ / .GOOGLE constants as keys.
 * String-keyed for portability — LLMProvider enum is not imported here to keep pure.
 */
export const EXTERNAL_STT_DEFAULT_MODELS_MAP: Readonly<Record<string, string>> = Object.freeze({
    openai: 'whisper-1',
    groq: 'whisper-large-v3-turbo',
    google: 'gemini-2.5-flash',
});

/** Locale → Whisper language code (lowercase English name). */
export const LOCALE_TO_STT_LANGUAGE_MAP: Readonly<Record<SupportedLocale, string>> = Object.freeze({
    'pt-BR': 'portuguese',
    'en-US': 'english',
    'es-LA': 'spanish',
});

/**
 * Normalize an arbitrary error-like value to a string.
 *   Error instance → error.message
 *   object with .message → String(message)
 *   else → String(error)
 *
 * Matches caller _errorMessage semantic at llmChat.ts:121.
 */
export function errorToMessage(error: unknown): string {
    if (error == null) return '';
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && 'message' in (error as Record<string, unknown>)) {
        return String((error as { message: unknown }).message);
    }
    return String(error);
}

/**
 * Normalize an STT source string; falls back to 'auto' on unknown.
 * Used by handleVoiceSttSourceChange to gate localStorage writes.
 */
export function normalizeSttSource(value: unknown): SttSource {
    return (STT_SOURCES as ReadonlyArray<string>).includes(value as string) ? (value as SttSource) : 'auto';
}

/**
 * Normalize an external provider id against an allowed list; falls back to first.
 * Caller passes the LLMProvider list (e.g., [OPENAI, GROQ, GOOGLE]) as `allowed`.
 */
export function normalizeExternalProvider(
    value: unknown,
    allowed: ReadonlyArray<string>,
): string {
    if (!Array.isArray(allowed) || allowed.length === 0) return '';
    return allowed.includes(value as string) ? (value as string) : allowed[0]!;
}

/**
 * Resolve Whisper language string from locale.
 * Unknown locale → undefined (Whisper auto-detect fallback).
 */
export function resolveSttLanguage(locale: string | null | undefined): string | undefined {
    if (typeof locale !== 'string') return undefined;
    return LOCALE_TO_STT_LANGUAGE_MAP[locale as SupportedLocale];
}

/**
 * Resolve TTS language tag from locale.
 * Falsy locale → 'en-US' canonical fallback.
 */
export function resolveTtsLanguage(locale: string | null | undefined): string {
    return typeof locale === 'string' && locale ? locale : 'en-US';
}

/**
 * Compute the external STT model hint string parts.
 * Returns the segments so caller can assemble final i18n-wrapped label.
 *   { fallbackModel, selectedSuffix }
 *   fallbackModel: defaults to EXTERNAL_STT_DEFAULT_MODELS_MAP[providerId] or ''
 *   selectedSuffix: ' · Selected: <model>' when model differs from fallback, else ''
 *
 * Caller composes: `Default: ${fallbackModel}${selectedSuffix}` with t() wrapping.
 */
export function resolveExternalModelHint(
    providerId: string,
    model: string | null | undefined,
    selectedLabel: string = 'Selected',
): { fallbackModel: string; selectedSuffix: string } {
    const fallbackModel = EXTERNAL_STT_DEFAULT_MODELS_MAP[providerId] || '';
    const selectedSuffix =
        typeof model === 'string' && model && model !== fallbackModel ? ` · ${selectedLabel}: ${model}` : '';
    return { fallbackModel, selectedSuffix };
}
