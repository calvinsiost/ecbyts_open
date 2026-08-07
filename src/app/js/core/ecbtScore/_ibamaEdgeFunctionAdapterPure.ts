// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * IBAMA Edge Function Adapter — pure-logic builder + validator.
 *
 * FIS-001 Fase 4 wire Edge Function (Calvin 2026-06-09 "seguir com demais").
 *
 * Constrói payload tipado para `POST /ibama-fine-fetch` e valida resposta.
 * Side-effects de rede ficam em `ibamaEdgeFunctionRuntime.ts` (runtime adapter).
 *
 * Edge: `supabase/functions/ibama-fine-fetch/index.ts`
 * Spec: docs/specs/features/SPEC_FINE_IMPACT_SCORE.md §F4
 */

import type { FineRecord, SeverityLevel } from './_fineImpactPure.js';
import type { ScraperOutput, ScraperVerdict } from './_ibamaScraperStubPure.js';

const SEVERITIES: ReadonlyArray<SeverityLevel> = Object.freeze([
    'light', 'moderate', 'severe', 'gravissima',
]);

export interface EdgeRequestInput {
    readonly cnpj: string;
    readonly windowYears?: number;
    readonly mode?: 'stub' | 'real';
}

export interface EdgeRequestPayload {
    readonly cnpj: string;
    readonly windowYears: number;
    readonly mode: 'stub' | 'real';
}

export interface EdgeRequestVerdict {
    readonly ok: boolean;
    readonly payload: EdgeRequestPayload | null;
    readonly reason?: 'missing_cnpj' | 'invalid_window' | 'invalid_mode';
}

/**
 * Constrói payload tipado para Edge Function. Não valida CNPJ (delegado ao endpoint).
 *
 * @param input Request input bruto vindo do UI.
 * @returns Verdict frozen com payload ou reason.
 */
export function buildEdgeRequest(input: EdgeRequestInput): EdgeRequestVerdict {
    if (!input || typeof input.cnpj !== 'string' || input.cnpj.trim() === '') {
        return Object.freeze({ ok: false, payload: null, reason: 'missing_cnpj' });
    }
    const windowYears = input.windowYears ?? 5;
    if (!Number.isFinite(windowYears) || windowYears < 1 || windowYears > 20) {
        return Object.freeze({ ok: false, payload: null, reason: 'invalid_window' });
    }
    const mode = input.mode ?? 'stub';
    if (mode !== 'stub' && mode !== 'real') {
        return Object.freeze({ ok: false, payload: null, reason: 'invalid_mode' });
    }
    return Object.freeze({
        ok: true,
        payload: Object.freeze({
            cnpj: input.cnpj.trim(),
            windowYears: Math.floor(windowYears),
            mode,
        }),
    });
}

export interface EdgeResponseVerdict {
    readonly ok: boolean;
    readonly value: ScraperOutput | null;
    readonly reason?: 'not_object' | 'missing_verdict' | 'invalid_verdict' | 'fines_not_array' | 'fine_invalid';
}

const VALID_VERDICTS: ReadonlyArray<ScraperVerdict> = Object.freeze([
    'success_mock', 'success_empty', 'invalid_cnpj', 'disabled_real_mode',
    'fail_network', 'fail_rate_limit',
]);

function _isFineRecord(rec: any): rec is FineRecord {
    if (!rec || typeof rec !== 'object') return false;
    if (typeof rec.id !== 'string') return false;
    const amount = rec.amount ?? rec.amountBrl;
    if (!Number.isFinite(amount) || amount < 0) return false;
    if (!SEVERITIES.includes(rec.severity)) return false;
    if (typeof rec.dateIso !== 'string') return false;
    return true;
}

/**
 * Valida resposta da Edge Function e devolve ScraperOutput frozen.
 *
 * @param raw Body JSON parseado da Edge Function.
 * @returns Verdict frozen com value (ScraperOutput) ou reason.
 */
export function validateEdgeResponse(raw: any): EdgeResponseVerdict {
    if (!raw || typeof raw !== 'object') {
        return Object.freeze({ ok: false, value: null, reason: 'not_object' });
    }
    if (typeof raw.verdict !== 'string') {
        return Object.freeze({ ok: false, value: null, reason: 'missing_verdict' });
    }
    if (!VALID_VERDICTS.includes(raw.verdict as ScraperVerdict)) {
        return Object.freeze({ ok: false, value: null, reason: 'invalid_verdict' });
    }
    if (raw.fines !== undefined && !Array.isArray(raw.fines)) {
        return Object.freeze({ ok: false, value: null, reason: 'fines_not_array' });
    }
    const fines: FineRecord[] = [];
    for (const f of raw.fines || []) {
        if (!_isFineRecord(f)) {
            return Object.freeze({ ok: false, value: null, reason: 'fine_invalid' });
        }
        fines.push(Object.freeze({
            id: String(f.id),
            amount: Number(f.amount ?? f.amountBrl),
            severity: f.severity as SeverityLevel,
            dateIso: String(f.dateIso),
            currency: f.currency ? String(f.currency) : 'BRL',
            presetId: f.presetId ? String(f.presetId) : undefined,
            description: f.description ? String(f.description) : undefined,
        }) as FineRecord);
    }

    const value: ScraperOutput = Object.freeze({
        verdict: raw.verdict as ScraperVerdict,
        cnpjNormalized: String(raw.cnpjNormalized || ''),
        fines: Object.freeze(fines) as ReadonlyArray<FineRecord>,
        mode: raw.mode === 'real' ? 'real' : 'stub',
        fetchedAtIso: String(raw.fetchedAtIso || new Date().toISOString()),
        windowYears: Number.isFinite(raw.windowYears) ? Number(raw.windowYears) : 5,
        message: String(raw.message || ''),
        audit: Object.freeze({
            source: raw.audit?.source === 'real_adapter'
                ? 'real_adapter'
                : raw.audit?.source === 'mock_stub'
                ? 'mock_stub'
                : 'none',
            hypotheticalLabel: raw.audit?.hypotheticalLabel
                ? String(raw.audit.hypotheticalLabel)
                : undefined,
            seedUsed: Number.isFinite(raw.audit?.seedUsed) ? Number(raw.audit.seedUsed) : undefined,
        }),
    }) as ScraperOutput;

    return Object.freeze({ ok: true, value });
}

/**
 * Decide se modo real está enabled neste cliente.
 *
 * Calvin 2026-06-09: modo real é opt-in via localStorage ou flag global.
 * Default OFF para evitar chamadas inadvertidas até autorização explícita (D-FIS-3).
 *
 * @param baseUrl Coleção de fontes consultáveis (localStorage value, window flag).
 * @returns Verdict frozen com mode resolvido + audit trace.
 */
export interface RealModeFlags {
    readonly localStorageValue?: string | null;
    readonly windowFlag?: unknown;
    readonly explicitOverride?: 'stub' | 'real';
}

export interface ResolveModeVerdict {
    readonly mode: 'stub' | 'real';
    readonly source: 'explicit_override' | 'local_storage' | 'window_flag' | 'default';
}

export function resolveRealMode(flags: RealModeFlags): ResolveModeVerdict {
    if (flags.explicitOverride === 'real' || flags.explicitOverride === 'stub') {
        return Object.freeze({ mode: flags.explicitOverride, source: 'explicit_override' });
    }
    if (flags.localStorageValue === 'real') {
        return Object.freeze({ mode: 'real', source: 'local_storage' });
    }
    if (flags.windowFlag === true || flags.windowFlag === 'real') {
        return Object.freeze({ mode: 'real', source: 'window_flag' });
    }
    return Object.freeze({ mode: 'stub', source: 'default' });
}

/**
 * Builds URL para Edge Function. Aceita base URL configurável.
 *
 * @param baseUrl Base URL do projeto Supabase (https://<ref>.functions.supabase.co).
 * @returns URL completa para POST.
 */
export function buildEdgeFunctionUrl(baseUrl: string): string {
    const trimmed = (baseUrl || '').replace(/\/+$/, '');
    return `${trimmed}/ibama-fine-fetch`;
}
