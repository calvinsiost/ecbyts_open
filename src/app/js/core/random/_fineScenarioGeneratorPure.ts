// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Fine Scenario Generator — gera cenários hipotéticos de multas e capacidade
 * econômica para testar o FIS-001 (FineImpactScore).
 *
 * Calvin 2026-06-09: "para testar crie random, sem nomes de empresas reais
 * (acredito que inclusive já estão criadas) com dados hipoteticos, para o
 * fluxo completo + abstrair (BRL por exemplo)".
 *
 * Convenções (anti-PII, anti-conflito legal):
 *   - **Sem nomes reais** de empresas. Apenas labels genéricos por tier.
 *   - **Sem CNPJs/IDs reais**. IDs sintéticos `SCEN-<tier>-<n>`.
 *   - **Moeda abstrata**: parametrizada via `currency` (default BRL).
 *   - **Determinismo**: PRNG seedeado via opção `seed` (default 0).
 *
 * 4 tiers canônicos:
 *   - 'gigante': EBITDA ~200 bi, multas absolutas grandes (~R$10-100M)
 *   - 'media':   EBITDA ~300 mi, multas médias (~R$1-10M)
 *   - 'pme':     EBITDA ~7 mi,   multas pequenas (~R$100k-5M)
 *   - 'catastrofe': qualquer porte + multas gravíssimas reincidentes
 *
 * Pure-logic: zero side-effects, frozen output, deterministic.
 */

import type { FineRecord, SeverityLevel } from '../ecbtScore/_fineImpactPure.js';

export type ScenarioTier = 'gigante' | 'media' | 'pme' | 'catastrofe';

export interface FineScenarioInput {
    readonly tier: ScenarioTier;
    /** Moeda do cenário. Default 'BRL'. */
    readonly currency?: string;
    /** Seed determinístico do PRNG. Default 0. */
    readonly seed?: number;
    /** Quantidade de multas. Default por tier (3-7). */
    readonly fineCount?: number;
    /** Janela em anos para gerar datas (default 4 — dentro da janela FIS=5). */
    readonly historyYears?: number;
    /** Data de referência (multas até essa data). Default hoje. */
    readonly nowIso?: string;
}

export interface FineScenarioOutput {
    readonly tier: ScenarioTier;
    readonly currency: string;
    readonly companyLabel: string;
    readonly description: string;
    readonly ebitda: number;
    readonly revenue: number;
    readonly fines: ReadonlyArray<FineRecord>;
    readonly seed: number;
    readonly fineCount: number;
    readonly expectedFisBand: { readonly low: number; readonly high: number };
}

// ----------------------------------------------------------------
// PRNG determinístico (Mulberry32) — mesmo padrão de core/random/
// ----------------------------------------------------------------

function _mulberry32(seed: number): () => number {
    let a = (seed >>> 0) || 1;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function _randInt(rng: () => number, min: number, max: number): number {
    return Math.floor(rng() * (max - min + 1)) + min;
}

function _randChoice<T>(rng: () => number, arr: ReadonlyArray<T>): T {
    return arr[Math.floor(rng() * arr.length)] as T;
}

// ----------------------------------------------------------------
// TIER PROFILES (valores hipotéticos, sem nomes reais)
// ----------------------------------------------------------------

interface TierProfile {
    readonly companyLabel: string;
    readonly description: string;
    readonly ebitdaMin: number;
    readonly ebitdaMax: number;
    readonly revenueMultiplier: number; // Revenue ≈ EBITDA × N
    readonly fineMin: number;
    readonly fineMax: number;
    readonly severityWeights: Readonly<Record<SeverityLevel, number>>;
    readonly defaultFineCount: number;
    readonly expectedFisBand: { readonly low: number; readonly high: number };
}

const TIER_PROFILES: Readonly<Record<ScenarioTier, TierProfile>> = Object.freeze({
    gigante: Object.freeze({
        companyLabel: 'Operadora Hipotética Gigante',
        description: 'Empresa hipotética de grande porte (perfil energia/mineração)',
        ebitdaMin: 150_000_000_000,
        ebitdaMax: 250_000_000_000,
        revenueMultiplier: 2.5,
        fineMin: 5_000_000,
        fineMax: 100_000_000,
        severityWeights: Object.freeze({ light: 0.3, moderate: 0.4, severe: 0.25, gravissima: 0.05 }),
        defaultFineCount: 4,
        expectedFisBand: { low: 4.0, high: 4.95 },
    }),
    media: Object.freeze({
        companyLabel: 'Indústria Hipotética Média',
        description: 'Empresa hipotética de médio porte (perfil indústria nacional)',
        ebitdaMin: 100_000_000,
        ebitdaMax: 500_000_000,
        revenueMultiplier: 4,
        fineMin: 500_000,
        fineMax: 10_000_000,
        severityWeights: Object.freeze({ light: 0.3, moderate: 0.4, severe: 0.25, gravissima: 0.05 }),
        defaultFineCount: 3,
        expectedFisBand: { low: 3.0, high: 4.5 },
    }),
    pme: Object.freeze({
        companyLabel: 'PME Hipotética',
        description: 'Pequena/média empresa hipotética (perfil prestadora regional)',
        ebitdaMin: 3_000_000,
        ebitdaMax: 15_000_000,
        revenueMultiplier: 6,
        fineMin: 100_000,
        fineMax: 5_000_000,
        severityWeights: Object.freeze({ light: 0.4, moderate: 0.4, severe: 0.2, gravissima: 0.0 }),
        defaultFineCount: 2,
        expectedFisBand: { low: 1.5, high: 4.0 },
    }),
    catastrofe: Object.freeze({
        companyLabel: 'Operadora Hipotética em Crise Ambiental',
        description: 'Empresa hipotética com histórico de incidentes graves e reincidência',
        ebitdaMin: 50_000_000_000,
        ebitdaMax: 200_000_000_000,
        revenueMultiplier: 2.5,
        fineMin: 100_000_000,
        fineMax: 50_000_000_000,
        severityWeights: Object.freeze({ light: 0.0, moderate: 0.1, severe: 0.4, gravissima: 0.5 }),
        defaultFineCount: 6,
        expectedFisBand: { low: 0.0, high: 1.5 },
    }),
});

const PRESET_IDS: ReadonlyArray<string> = Object.freeze([
    'CONAMA-420-2009',
    'CETESB-DD-256-2016',
    'IBAMA-IN-19-2023',
    'CONAMA-357-2005',
    'NBR-15495',
    'Lei-12651-2012',
]);

const DESCRIPTIONS: ReadonlyArray<string> = Object.freeze([
    'Lançamento irregular em corpo hídrico',
    'Vazamento em tanque de armazenamento',
    'Documentação ambiental atrasada',
    'Operação sem licença ambiental válida',
    'Resíduo destinado fora do plano',
    'Emissão atmosférica acima do limite',
    'Reincidência em monitoramento ausente',
    'Disposição irregular de efluente',
]);

function _pickSeverity(rng: () => number, weights: Readonly<Record<SeverityLevel, number>>): SeverityLevel {
    const r = rng();
    let acc = 0;
    const order: SeverityLevel[] = ['gravissima', 'severe', 'moderate', 'light'];
    for (const k of order) {
        acc += weights[k];
        if (r <= acc) return k;
    }
    return 'moderate';
}

function _generateDateIso(rng: () => number, nowIso: string, historyYears: number): string {
    const endMs = Date.parse(nowIso) || Date.now();
    const daysBack = Math.floor(rng() * historyYears * 365);
    const ms = endMs - daysBack * 24 * 3600 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

interface NormalizedScenarioInput {
    readonly tier: ScenarioTier;
    readonly currency: string;
    readonly seed: number;
    readonly fineCount: number;
    readonly historyYears: number;
    readonly nowIso: string;
}

function _normalizeTier(input: FineScenarioInput): ScenarioTier {
    const allowed: ScenarioTier[] = ['gigante', 'media', 'pme', 'catastrofe'];
    return allowed.includes(input?.tier) ? input.tier : 'media';
}

function _normalizeCurrency(input: FineScenarioInput): string {
    return typeof input?.currency === 'string' && input.currency.length > 0 ? input.currency : 'BRL';
}

function _normalizeSeed(input: FineScenarioInput): number {
    return Number.isFinite(input?.seed) ? Number(input.seed) : 0;
}

function _clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
    if (!Number.isFinite(value) || value === undefined || value <= 0) return fallback;
    return Math.min(max, Math.max(min, Number(value)));
}

function _normalizeScenarioInput(input: FineScenarioInput): NormalizedScenarioInput {
    const tier = _normalizeTier(input);
    const profile = TIER_PROFILES[tier];
    return {
        tier,
        currency: _normalizeCurrency(input),
        seed: _normalizeSeed(input),
        fineCount: _clampInt(input?.fineCount, profile.defaultFineCount, 1, 20),
        historyYears: _clampInt(input?.historyYears, 4, 1, 10),
        nowIso: typeof input?.nowIso === 'string' && input.nowIso.length > 0
            ? input.nowIso
            : new Date().toISOString(),
    };
}

function _buildFines(
    rng: () => number,
    profile: TierProfile,
    opts: { tier: ScenarioTier; currency: string; fineCount: number; nowIso: string; historyYears: number },
): FineRecord[] {
    const fines: FineRecord[] = [];
    for (let i = 0; i < opts.fineCount; i++) {
        const amount = _randInt(rng, profile.fineMin, profile.fineMax);
        const severity = _pickSeverity(rng, profile.severityWeights);
        const dateIso = _generateDateIso(rng, opts.nowIso, opts.historyYears);
        const presetId = _randChoice(rng, PRESET_IDS);
        const description = _randChoice(rng, DESCRIPTIONS);
        fines.push(Object.freeze({
            id: `SCEN-${opts.tier}-${i + 1}`,
            amount,
            amountBrl: amount, // alias legado backward-compat
            severity,
            dateIso,
            currency: opts.currency,
            presetId,
            description,
        }));
    }
    return fines;
}

/**
 * Gera cenário hipotético de multas + capacidade econômica.
 * Sem nomes reais de empresas, valores aleatórios em range plausível por tier.
 *
 * @example
 *   generateFineScenario({ tier: 'gigante', currency: 'BRL', seed: 42 })
 *   → { ebitda: 187_500_000_000, fines: [4 multas hipotéticas], ... }
 */
export function generateFineScenario(input: FineScenarioInput): FineScenarioOutput {
    const opts = _normalizeScenarioInput(input);
    const profile = TIER_PROFILES[opts.tier];
    const rng = _mulberry32(opts.seed);

    const ebitda = _randInt(rng, profile.ebitdaMin, profile.ebitdaMax);
    const revenue = Math.round(ebitda * profile.revenueMultiplier);
    const fines = _buildFines(rng, profile, opts);

    return Object.freeze({
        tier: opts.tier,
        currency: opts.currency,
        companyLabel: profile.companyLabel,
        description: profile.description,
        ebitda,
        revenue,
        fines: Object.freeze(fines),
        seed: opts.seed,
        fineCount: opts.fineCount,
        expectedFisBand: profile.expectedFisBand,
    });
}

/**
 * Lista os 4 tiers canônicos com descrição amigável.
 * Útil para UI/menu de seleção.
 */
export function listScenarioTiers(): ReadonlyArray<{ tier: ScenarioTier; label: string; description: string }> {
    return Object.freeze(
        (Object.keys(TIER_PROFILES) as ScenarioTier[]).map((t) =>
            Object.freeze({
                tier: t,
                label: TIER_PROFILES[t].companyLabel,
                description: TIER_PROFILES[t].description,
            }),
        ),
    );
}
