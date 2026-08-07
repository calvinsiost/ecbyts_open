// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * FineImpactScore (FIS) — tangibilização de multas e infrações administrativas
 * no ECBT Score.
 *
 * Calvin 2026-06-08: "multas devem penalizar muito, porém diferente de questões
 * de faturamento numa multa que a empresa pode ser enorme e não fazer nem
 * reflexo no seu faturamento".
 *
 * Spec: docs/specs/features/SPEC_FINE_IMPACT_SCORE.md
 * ADR:  docs/adrs/ADR-FINE-IMPACT-SCORE-001.md
 * Pesquisa: .runtime/research/fine-impact-tangibilization-2026-06-08.md
 *
 * 4 dimensões não-compensatórias agregadas por média geométrica:
 *   M (relativo)  = log10(1 + total/EBITDA) / log10(11)
 *   A (absoluto)  = log10(1 + total/R$10M)   ← corrige Petrobras-invisível
 *   S (severidade) = max(severity_value)      ← não-compensatório por gravidade
 *   R (recorrência) = n_5y / 5
 *
 *   P = (M · A · S · R)^(1/4)
 *   FIS = (1 - P) × 5    ∈ [0, 5]
 *
 * Referências bibliográficas: Bloomberg ESG Dec 2025, LSEG ESG Oct 2024,
 * Karpoff/Lott/Wehrly 2005, Liu et al. 2019, Wang et al. 2022, IBAMA IN 19/2023.
 */

export type SeverityLevel = 'light' | 'moderate' | 'severe' | 'gravissima';

export type CapacitySource = 'ebitda' | 'revenue_proxy' | 'market_proxy' | 'default';

/**
 * FineRecord — valores em UNIDADES MONETÁRIAS genéricas. Moeda fica em `currency`
 * (default 'BRL'). Campo legado `amountBrl` é alias backward-compat.
 *
 * Calvin 2026-06-09 "abstrair (BRL por exemplo)": fórmula FIS é razão sem unidade
 * + log absoluto. Funciona em qualquer moeda desde que TODOS os valores do mesmo
 * cálculo estejam na mesma moeda.
 */
export interface FineRecord {
    readonly id: string;
    /** Valor em unidades monetárias. */
    readonly amount?: number;
    /** Alias legado (backward-compat). Use `amount`. */
    readonly amountBrl?: number;
    readonly severity: SeverityLevel;
    readonly dateIso: string;        // 'YYYY-MM-DD' ou ISO completo
    readonly currency?: string;      // 'BRL', 'USD', 'EUR', ... default 'BRL'
    readonly presetId?: string;
    readonly description?: string;
}

export interface FineImpactInput {
    readonly fines: ReadonlyArray<FineRecord>;
    // `| undefined` explícito nos opcionais: callers montam o DTO repassando
    // options opcionais diretamente (exactOptionalPropertyTypes exige a união).
    /** EBITDA em unidades monetárias. */
    readonly ebitda?: number | undefined;
    readonly ebitdaBrl?: number | undefined;     // alias legado
    /** Receita anual em unidades monetárias. */
    readonly revenue?: number | undefined;
    readonly revenueBrl?: number | undefined;    // alias legado
    /** Market cap em unidades monetárias. */
    readonly marketValue?: number | undefined;
    readonly marketValueBrl?: number | undefined; // alias legado
    /** Moeda global do cálculo. Default 'BRL'. */
    readonly currency?: string | undefined;
    /** Magnitude absoluta de referência (default 10M). Configurável para outras moedas. */
    readonly absoluteRefAmount?: number | undefined;
    readonly windowYears?: number | undefined;   // default 5
    readonly sectorWeight?: number | undefined;  // default 1.0; range [1.0, 1.5]
    readonly nowIso?: string | undefined;        // injectável para testes
}

export interface FineAuditRow {
    readonly fineId: string;
    readonly amount: number;
    readonly amountBrl: number;      // alias legado backward-compat
    readonly severity: SeverityLevel;
    readonly severityValue: number;
    readonly inWindow: boolean;
    readonly ratioToCapacity: number;
    readonly contribution: {
        readonly toM: number;
        readonly toA: number;
        readonly toS: number;
        readonly toR: number;
    };
}

export interface FineImpactOutput {
    readonly M: number;
    readonly A: number;
    readonly S: number;
    readonly R: number;
    readonly P: number;
    readonly FIS: number;
    readonly capacity: number;       // genérico
    readonly capacityBrl: number;    // alias legado backward-compat
    readonly currency: string;       // moeda do cálculo
    readonly absoluteRefAmount: number; // referência usada para A
    readonly capacitySource: CapacitySource;
    readonly finesInWindow: number;
    readonly totalFine: number;      // genérico
    readonly totalFineBrl: number;   // alias legado backward-compat
    readonly worstSeverity: SeverityLevel;
    readonly audit: ReadonlyArray<FineAuditRow>;
}

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const DEFAULT_WINDOW_YEARS = 5;
const DEFAULT_SECTOR_WEIGHT = 1.0;
const SECTOR_WEIGHT_MIN = 1.0;
const SECTOR_WEIGHT_MAX = 1.5;
const ABSOLUTE_REF_BRL = 10_000_000;   // R$ 10M base para A (log10(multa/10M))
const MIN_CAPACITY_BRL = 1_000_000;    // R$ 1M floor
const REVENUE_TO_EBITDA_PROXY = 0.15;  // 15% margem operacional típica
const MARKET_TO_EBITDA_PROXY = 0.15;   // 15% lucro/market cap proxy
const RECURRENCE_DENOM = 5;            // 5 multas em 5 anos = teto
const FIS_SCALE = 5;                   // mesma escala do EIS
const RELATIVE_LOG_BASE = Math.log10(11);  // normalizador M

const SEVERITY_VALUE: Readonly<Record<SeverityLevel, number>> = Object.freeze({
    light: 0.2,
    moderate: 0.5,
    severe: 0.8,
    gravissima: 1.0,
});

const SEVERITY_RANK: Readonly<Record<SeverityLevel, number>> = Object.freeze({
    light: 1,
    moderate: 2,
    severe: 3,
    gravissima: 4,
});

const SEVERITY_BY_RANK: Readonly<Record<number, SeverityLevel>> = Object.freeze({
    1: 'light',
    2: 'moderate',
    3: 'severe',
    4: 'gravissima',
});

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function _clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
}

function _safeAmount(n: unknown): number {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return 0;
    return v;
}

function _resolveSeverity(s: unknown): SeverityLevel {
    if (s === 'light' || s === 'moderate' || s === 'severe' || s === 'gravissima') return s;
    return 'moderate';
}

function _severityValue(s: SeverityLevel): number {
    return SEVERITY_VALUE[s];
}

function _resolveCapacity(input: FineImpactInput): { capacity: number; source: CapacitySource } {
    // Calvin 2026-06-09 "abstrair (BRL por exemplo)": campo genérico vence; alias legado backward-compat
    const ebitda = _safeAmount(input.ebitda ?? input.ebitdaBrl);
    if (ebitda > 0) return { capacity: Math.max(ebitda, MIN_CAPACITY_BRL), source: 'ebitda' };
    const revenue = _safeAmount(input.revenue ?? input.revenueBrl);
    if (revenue > 0) {
        return {
            capacity: Math.max(revenue * REVENUE_TO_EBITDA_PROXY, MIN_CAPACITY_BRL),
            source: 'revenue_proxy',
        };
    }
    const market = _safeAmount(input.marketValue ?? input.marketValueBrl);
    if (market > 0) {
        return {
            capacity: Math.max(market * MARKET_TO_EBITDA_PROXY, MIN_CAPACITY_BRL),
            source: 'market_proxy',
        };
    }
    return { capacity: MIN_CAPACITY_BRL, source: 'default' };
}

function _resolveFineAmount(rec: FineRecord): number {
    return _safeAmount((rec as any).amount ?? rec.amountBrl);
}

function _resolveWindow(nowIso: string, windowYears: number): { startMs: number; endMs: number } {
    const endMs = Date.parse(nowIso);
    if (!Number.isFinite(endMs)) {
        // Fallback: agora (deveria ser injectável; aqui defensivo)
        const fallback = Date.now();
        return { startMs: fallback - windowYears * 365.25 * 24 * 3600 * 1000, endMs: fallback };
    }
    const startMs = endMs - windowYears * 365.25 * 24 * 3600 * 1000;
    return { startMs, endMs };
}

function _parseDateMs(dateIso: string): number {
    const ms = Date.parse(dateIso);
    return Number.isFinite(ms) ? ms : NaN;
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

export function computeFineImpact(input: FineImpactInput): FineImpactOutput {
    const fines = Array.isArray(input.fines) ? input.fines : [];
    const windowYears = Math.max(1, Math.min(30, Number(input.windowYears ?? DEFAULT_WINDOW_YEARS)));
    const sectorWeight = _clamp(
        Number(input.sectorWeight ?? DEFAULT_SECTOR_WEIGHT),
        SECTOR_WEIGHT_MIN,
        SECTOR_WEIGHT_MAX,
    );
    const nowIso = typeof input.nowIso === 'string' && input.nowIso.length > 0
        ? input.nowIso
        : new Date(0).toISOString(); // Determinístico se nowIso não fornecido — caller deveria sempre fornecer

    const { capacity, source: capacitySource } = _resolveCapacity(input);
    const currency = typeof input.currency === 'string' && input.currency.length > 0
        ? input.currency
        : 'BRL';
    // Calvin 2026-06-09 "abstrair (BRL por exemplo)" — referência absoluta configurável
    const absoluteRefAmount = _safeAmount(input.absoluteRefAmount) > 0
        ? Number(input.absoluteRefAmount)
        : ABSOLUTE_REF_BRL;
    const { startMs, endMs } = _resolveWindow(nowIso, windowYears);

    // Classifica multas dentro/fora da janela
    const inWindowFines: Array<{ rec: FineRecord; sev: SeverityLevel; amount: number }> = [];
    const audit: FineAuditRow[] = [];

    for (const rec of fines) {
        if (!rec || typeof rec !== 'object') continue;
        const amount = _resolveFineAmount(rec);
        const sev = _resolveSeverity(rec.severity);
        const sevValue = _severityValue(sev);
        const ms = _parseDateMs(rec.dateIso);
        const inWindow = Number.isFinite(ms) && ms >= startMs && ms <= endMs;
        if (inWindow) inWindowFines.push({ rec, sev, amount });
        audit.push(Object.freeze({
            fineId: String(rec.id || ''),
            amount,
            amountBrl: amount, // alias legado
            severity: sev,
            severityValue: sevValue,
            inWindow,
            ratioToCapacity: capacity > 0 ? amount / capacity : 0,
            contribution: Object.freeze({ toM: 0, toA: 0, toS: 0, toR: 0 }), // preenchido após
        }));
    }

    const n = inWindowFines.length;
    const totalAmount = inWindowFines.reduce((s, f) => s + f.amount, 0);

    // Dimensões
    let M = 0;
    let A = 0;
    let S = 0;
    let R = 0;
    let worstSeverity: SeverityLevel = 'light';

    if (n > 0 && totalAmount > 0) {
        // M — relativo (capacidade)
        const ratioM = totalAmount / Math.max(capacity, MIN_CAPACITY_BRL);
        M = Math.min(1, Math.log10(1 + ratioM) / RELATIVE_LOG_BASE);
        // A — absoluto (anti-gigante-invisível)
        A = Math.min(1, Math.log10(1 + totalAmount / absoluteRefAmount));
        // S — pior severidade × sector weight
        let worstRank = 0;
        for (const f of inWindowFines) {
            const rk = SEVERITY_RANK[f.sev];
            if (rk > worstRank) worstRank = rk;
        }
        if (worstRank > 0) worstSeverity = SEVERITY_BY_RANK[worstRank]!; // rank vem de SEVERITY_RANK
        const worstValue = _severityValue(worstSeverity);
        S = Math.min(1, worstValue * sectorWeight);
        // R — recorrência
        R = Math.min(1, n / RECURRENCE_DENOM);
    }

    // P = média geométrica não-compensatória
    // Se qualquer dim = 0, P = 0 (FIS = 5 perfeito) — sem fines = sem penalidade
    let P = 0;
    if (n > 0 && M > 0 && A > 0 && S > 0 && R > 0) {
        P = Math.pow(M * A * S * R, 1 / 4);
    } else if (n > 0) {
        // Edge case: alguma dim zerou mas há multas
        // Tratamento: usa epsilon para evitar P=0 trivial
        const epsilon = 1e-9;
        const Mc = Math.max(M, epsilon);
        const Ac = Math.max(A, epsilon);
        const Sc = Math.max(S, epsilon);
        const Rc = Math.max(R, epsilon);
        P = Math.pow(Mc * Ac * Sc * Rc, 1 / 4);
    }
    P = _clamp(P, 0, 1);
    const FIS = (1 - P) * FIS_SCALE;

    // Atualiza audit com contribuições individuais (proporcional ao share da multa no total)
    const finalAudit: FineAuditRow[] = audit.map((row) => {
        if (!row.inWindow || totalAmount <= 0) return row;
        const share = row.amountBrl / totalAmount;
        return Object.freeze({
            ...row,
            contribution: Object.freeze({
                toM: M * share,
                toA: A * share,
                toS: row.severityValue >= _severityValue(worstSeverity) ? S : 0,
                toR: 1 / n,
            }),
        });
    });

    return Object.freeze({
        M, A, S, R, P, FIS,
        capacity,
        capacityBrl: capacity, // alias legado
        currency,
        absoluteRefAmount,
        capacitySource,
        finesInWindow: n,
        totalFine: totalAmount,
        totalFineBrl: totalAmount, // alias legado
        worstSeverity,
        audit: Object.freeze(finalAudit),
    });
}

/**
 * Helper para integração no ECBT Score: penalizador multiplicativo no S.
 * S_effective = S × (FIS / 5)
 *
 * FIS=5 (sem multas) → fator 1 (sem penalização)
 * FIS=0 (catástrofe) → fator 0 (S anulado)
 */
export function applyFineImpactToSeverity(
    severityBase: number,
    fineImpact: FineImpactOutput,
): number {
    const factor = _clamp(fineImpact.FIS / FIS_SCALE, 0, 1);
    return _clamp(severityBase * factor, 0, severityBase);
}
