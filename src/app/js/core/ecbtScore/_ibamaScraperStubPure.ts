// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * IBAMA Scraper Stub — Fase 4 FIS-001 (Calvin 2026-06-09 "seguir até DoD").
 *
 * Decisão Calvin D-FIS-3: manual primário + auto-detecção opt-in via CNPJ.
 *
 * Esta versão é **pure-logic** e **non-network** por padrão. Implementa:
 *   - Validação de CNPJ (módulo 11, sem rede)
 *   - Normalização de CNPJ (remove pontuação)
 *   - Mock determinístico de autos de infração (Mulberry32 + hash CNPJ)
 *   - Adapter contract para implementação real futura (Edge Function Supabase
 *     + scraping IBAMA SICAFI ou base CETESB)
 *
 * **Privacidade (Calvin):** CNPJ é dado público (Receita Federal). Nenhum
 * dado pessoal é coletado. Outputs são autos de infração públicos (Decreto
 * 6.514/2008 Art. 152 — publicidade dos autos).
 *
 * **Anti-PII:** mocks usam labels hipotéticos ("Empresa Hipotética A").
 *
 * Adapter contract permite swap futuro do mock por:
 *   - Edge Function Supabase chamando IBAMA SICAFI (precisa Calvin auth)
 *   - Importação CETESB SP via biblioteca de multas conhecidas
 *   - Scraping respeitando robots.txt + rate limit
 *
 * Spec: docs/specs/features/SPEC_FINE_IMPACT_SCORE.md §F4 (scraper)
 * ADR:  docs/adrs/ADR-FINE-IMPACT-SCORE-001.md §D-FIS-3 (a+b mock)
 */

import type { FineRecord, SeverityLevel } from './_fineImpactPure.js';

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export type ScraperVerdict =
    | 'success_mock'             // stub retornou multas hipotéticas
    | 'success_empty'            // sem multas encontradas
    | 'invalid_cnpj'             // CNPJ não passa módulo 11
    | 'disabled_real_mode'       // modo real solicitado mas adapter não wired
    | 'fail_network'             // erro de rede (não acontece em modo stub)
    | 'fail_rate_limit';         // throttle (não acontece em modo stub)

export type ScraperMode = 'stub' | 'real';

export interface ScraperInput {
    /** CNPJ com ou sem máscara (XX.XXX.XXX/XXXX-XX ou só dígitos). */
    readonly cnpj: string;
    /** Modo: 'stub' (default, mock determinístico) ou 'real' (precisa adapter). */
    readonly mode?: ScraperMode;
    /** Adapter para modo real (Edge Function Supabase, etc). Não fornecido em stub. */
    readonly realAdapter?: ScraperRealAdapter;
    /** Seed para determinismo dos mocks (default deriva do hash do CNPJ). */
    readonly seed?: number;
    /** Janela de busca em anos (default 5). */
    readonly windowYears?: number;
    /** Data de hoje (injectable para testes). */
    readonly nowIso?: string;
}

export interface ScraperOutput {
    readonly verdict: ScraperVerdict;
    readonly cnpjNormalized: string;
    readonly fines: ReadonlyArray<FineRecord>;
    readonly mode: ScraperMode;
    readonly fetchedAtIso: string;
    readonly windowYears: number;
    /** Mensagem amigável pt-BR para UI. */
    readonly message: string;
    /** Auditoria: source (mock|adapter) + label hipotético da empresa quando stub. */
    readonly audit: {
        readonly source: 'mock_stub' | 'real_adapter' | 'none';
        readonly hypotheticalLabel?: string;
        readonly seedUsed?: number;
    };
}

/**
 * Adapter contract para implementação real futura.
 *
 * Implementação esperada (não nesta fase):
 *   - Supabase Edge Function `ibama-fine-fetch`
 *   - Input: { cnpj, windowYears }
 *   - Output: ScraperOutput com mode='real'
 */
export interface ScraperRealAdapter {
    fetchByCnpj(args: {
        readonly cnpj: string;
        readonly windowYears: number;
    }): Promise<{
        readonly fines: ReadonlyArray<FineRecord>;
        readonly hypotheticalLabel?: string;
    }>;
}

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const DEFAULT_WINDOW_YEARS = 5;
const HYPOTHETICAL_LABELS: ReadonlyArray<string> = Object.freeze([
    'Empresa Hipotética Alfa Ltda.',
    'Indústria Hipotética Beta S.A.',
    'Mineradora Hipotética Gama',
    'Operadora Hipotética Delta',
    'Companhia Hipotética Épsilon',
]);

const SEVERITY_DISTRIBUTION: ReadonlyArray<{ severity: SeverityLevel; weight: number }> = Object.freeze([
    { severity: 'light', weight: 0.40 },
    { severity: 'moderate', weight: 0.35 },
    { severity: 'severe', weight: 0.20 },
    { severity: 'gravissima', weight: 0.05 },
]);

const PRESET_IDS: Readonly<Record<SeverityLevel, string>> = Object.freeze({
    light: 'ibama-descumprimento-condicionante',
    moderate: 'ibama-monitoramento-insuficiente',
    severe: 'ibama-lancamento-sem-licenca',
    gravissima: 'ibama-dano-ambiental-irreparavel',
});

const DESCRIPTIONS: Readonly<Record<SeverityLevel, string>> = Object.freeze({
    light: 'Atraso na entrega de relatório de monitoramento ambiental',
    moderate: 'Monitoramento de efluentes em desacordo com licença operacional',
    severe: 'Lançamento de efluentes sem licença ambiental em corpo hídrico',
    gravissima: 'Dano ambiental significativo em área protegida — passivo irreparável',
});

// ----------------------------------------------------------------
// HELPERS — CNPJ validation (módulo 11, pure)
// ----------------------------------------------------------------

export function normalizeCnpj(cnpj: string): string {
    if (typeof cnpj !== 'string') return '';
    return cnpj.replace(/[^\d]/g, '');
}

export function isValidCnpj(cnpj: string): boolean {
    const digits = normalizeCnpj(cnpj);
    if (digits.length !== 14) return false;
    // Rejeita sequências triviais
    if (/^(\d)\1+$/.test(digits)) return false;

    const calc = (slice: string, weights: number[]): number => {
        let sum = 0;
        for (let i = 0; i < slice.length; i++) {
            sum += Number(slice[i]) * weights[i]!; // weights alinhado ao slice pelo chamador
        }
        const mod = sum % 11;
        return mod < 2 ? 0 : 11 - mod;
    };

    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const d1 = calc(digits.slice(0, 12), w1);
    if (d1 !== Number(digits[12])) return false;
    const d2 = calc(digits.slice(0, 13), w2);
    if (d2 !== Number(digits[13])) return false;
    return true;
}

// ----------------------------------------------------------------
// HELPERS — deterministic seed from CNPJ hash (FNV-1a 32-bit)
// ----------------------------------------------------------------

function _fnv1aHash(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
}

// ----------------------------------------------------------------
// HELPERS — Mulberry32 PRNG (same family used in core/random/)
// ----------------------------------------------------------------

function _mulberry32(seed: number): () => number {
    let a = (seed >>> 0) || 1;
    return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function _pickWeighted<T>(rnd: () => number, items: ReadonlyArray<{ weight: number } & { [k: string]: any }>, key: string): T {
    const r = rnd();
    let acc = 0;
    for (const item of items) {
        acc += item.weight;
        if (r <= acc) return item[key] as T;
    }
    return items[items.length - 1]![key] as T; // items não-vazio (chamador)
}

function _pickFromArray<T>(rnd: () => number, arr: ReadonlyArray<T>): T {
    return arr[Math.floor(rnd() * arr.length) % arr.length]!; // arr não-vazio (chamador)
}

function _randomDateInWindow(rnd: () => number, nowIso: string, windowYears: number): string {
    const endMs = Date.parse(nowIso);
    const safeEnd = Number.isFinite(endMs) ? endMs : Date.now();
    const startMs = safeEnd - windowYears * 365.25 * 24 * 3600 * 1000;
    const ts = startMs + rnd() * (safeEnd - startMs);
    const d = new Date(ts);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function _amountForSeverity(rnd: () => number, severity: SeverityLevel): number {
    // Faixas Decreto 6.514/2008 (ordens de magnitude realistas)
    const ranges: Record<SeverityLevel, [number, number]> = {
        light: [50_000, 500_000],
        moderate: [500_000, 5_000_000],
        severe: [5_000_000, 50_000_000],
        gravissima: [50_000_000, 500_000_000],
    };
    const [min, max] = ranges[severity];
    return Math.round(min + rnd() * (max - min));
}

function _generateMockFines(seed: number, windowYears: number, nowIso: string): ReadonlyArray<FineRecord> {
    const rnd = _mulberry32(seed);
    // Distribuição: 60% das empresas têm 0-2 multas, 30% têm 3-5, 10% têm 6-10
    const r = rnd();
    let count: number;
    if (r < 0.6) count = Math.floor(rnd() * 3); // 0-2
    else if (r < 0.9) count = 3 + Math.floor(rnd() * 3); // 3-5
    else count = 6 + Math.floor(rnd() * 5); // 6-10

    const fines: FineRecord[] = [];
    for (let i = 0; i < count; i++) {
        const severity = _pickWeighted<SeverityLevel>(rnd, SEVERITY_DISTRIBUTION, 'severity');
        const amount = _amountForSeverity(rnd, severity);
        fines.push(Object.freeze({
            id: `ibama-stub-${seed.toString(36)}-${i}`,
            amount,
            severity,
            dateIso: _randomDateInWindow(rnd, nowIso, windowYears),
            currency: 'BRL',
            presetId: PRESET_IDS[severity],
            description: DESCRIPTIONS[severity],
        }) as FineRecord);
    }
    return Object.freeze(fines);
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Busca autos de infração para um CNPJ — STUB version (Calvin 2026-06-09).
 *
 * Modo 'stub' (default): retorna multas hipotéticas determinísticas via hash do CNPJ.
 * Modo 'real': delega ao `realAdapter` se fornecido; senão retorna `disabled_real_mode`.
 *
 * **Anti-PII:** Labels gerados são hipotéticos. Nenhum dado real é coletado.
 *
 * @param input CNPJ + opções.
 * @returns ScraperOutput frozen com fines + verdict + mensagem.
 */
export function fetchFinesByCnpj(input: ScraperInput): ScraperOutput {
    const cnpjNormalized = normalizeCnpj(input.cnpj);
    const mode: ScraperMode = input.mode ?? 'stub';
    const windowYears = Number.isFinite(input.windowYears) ? Number(input.windowYears) : DEFAULT_WINDOW_YEARS;
    const nowIso = input.nowIso ?? new Date().toISOString();
    const fetchedAtIso = new Date().toISOString();

    if (!isValidCnpj(cnpjNormalized)) {
        return Object.freeze({
            verdict: 'invalid_cnpj',
            cnpjNormalized,
            fines: Object.freeze([]),
            mode,
            fetchedAtIso,
            windowYears,
            message: 'CNPJ inválido — verifique os 14 dígitos (módulo 11).',
            audit: Object.freeze({ source: 'none' as const }),
        }) as ScraperOutput;
    }

    if (mode === 'real') {
        if (!input.realAdapter) {
            return Object.freeze({
                verdict: 'disabled_real_mode',
                cnpjNormalized,
                fines: Object.freeze([]),
                mode,
                fetchedAtIso,
                windowYears,
                message:
                    'Modo real desabilitado — adapter não configurado. ' +
                    'Use modo stub para teste com multas hipotéticas, ou cadastre manualmente.',
                audit: Object.freeze({ source: 'none' as const }),
            }) as ScraperOutput;
        }
        // NOTE: real adapter é assíncrono. Esta função pure-sync retorna o stub.
        // Wire async é responsabilidade do caller (UI handler usa await + adapter).
        // Aqui caímos em stub como fallback gracioso.
    }

    // Modo stub: gerar multas hipotéticas determinísticas
    const seed = Number.isFinite(input.seed)
        ? Number(input.seed)
        : _fnv1aHash(cnpjNormalized);
    const fines = _generateMockFines(seed, windowYears, nowIso);
    const labelRnd = _mulberry32(seed ^ 0xdeadbeef);
    const hypotheticalLabel = _pickFromArray(labelRnd, HYPOTHETICAL_LABELS);

    if (fines.length === 0) {
        return Object.freeze({
            verdict: 'success_empty',
            cnpjNormalized,
            fines: Object.freeze([]),
            mode: 'stub' as const,
            fetchedAtIso,
            windowYears,
            message: `Nenhuma multa encontrada nos últimos ${windowYears} anos para CNPJ ${cnpjNormalized} (modo stub hipotético).`,
            audit: Object.freeze({
                source: 'mock_stub' as const,
                hypotheticalLabel,
                seedUsed: seed,
            }),
        }) as ScraperOutput;
    }

    return Object.freeze({
        verdict: 'success_mock',
        cnpjNormalized,
        fines,
        mode: 'stub' as const,
        fetchedAtIso,
        windowYears,
        message:
            `${fines.length} multa(s) hipotética(s) gerada(s) para CNPJ ${cnpjNormalized} ` +
            `(empresa fictícia "${hypotheticalLabel}"). Valores em BRL.`,
        audit: Object.freeze({
            source: 'mock_stub' as const,
            hypotheticalLabel,
            seedUsed: seed,
        }),
    }) as ScraperOutput;
}

/**
 * Async wrapper que tenta adapter real se mode='real', cai em stub se falhar.
 *
 * @param input CNPJ + opções + adapter opcional.
 * @returns Promise<ScraperOutput>.
 */
export async function fetchFinesByCnpjAsync(input: ScraperInput): Promise<ScraperOutput> {
    const cnpjNormalized = normalizeCnpj(input.cnpj);
    const windowYears = Number.isFinite(input.windowYears) ? Number(input.windowYears) : DEFAULT_WINDOW_YEARS;

    if (!isValidCnpj(cnpjNormalized)) {
        return fetchFinesByCnpj(input);
    }

    if (input.mode === 'real' && input.realAdapter) {
        try {
            const adapterResult = await input.realAdapter.fetchByCnpj({ cnpj: cnpjNormalized, windowYears });
            return Object.freeze({
                verdict: adapterResult.fines.length > 0 ? 'success_mock' : 'success_empty',
                cnpjNormalized,
                fines: Object.freeze([...adapterResult.fines]),
                mode: 'real' as const,
                fetchedAtIso: new Date().toISOString(),
                windowYears,
                message: `${adapterResult.fines.length} multa(s) obtida(s) via adapter real para CNPJ ${cnpjNormalized}.`,
                audit: Object.freeze({
                    source: 'real_adapter' as const,
                    hypotheticalLabel: adapterResult.hypotheticalLabel,
                }),
            }) as ScraperOutput;
        } catch (err: any) {
            console.debug('[ibama-scraper:real-adapter]', err?.message || err);
            return Object.freeze({
                verdict: 'fail_network',
                cnpjNormalized,
                fines: Object.freeze([]),
                mode: 'real' as const,
                fetchedAtIso: new Date().toISOString(),
                windowYears,
                message: 'Falha no adapter real — fallback para cadastro manual recomendado.',
                audit: Object.freeze({ source: 'none' as const }),
            }) as ScraperOutput;
        }
    }

    return fetchFinesByCnpj(input);
}
