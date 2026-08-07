// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Fine Impact → EIS Axis L (Legal Standing) integration — pure-logic bridge.
 *
 * FIS-001 Fase 3 (Calvin 2026-06-09 "seguir com as fases restantes até o DoD"):
 * adota D-FIS-2 (c) — eixo L canônico no EIS progressive + penalizador no
 * ECBT Score (já implementado em _ecbtScorePure via Fase 2).
 *
 * Defaults adotados (Calvin não-bloqueante):
 *   D-FIS-1: EBITDA mantido; peso geométrico igual; absoluto teto R$ 10M (FIS-001 original).
 *   D-FIS-2: eixo L progressive + penalizador no ECBT Score (defesa em profundidade).
 *   D-FIS-3: manual primário + scraper IBAMA stub via _ibamaScraperStubPure (Fase 4).
 *   D-FIS-4: 5 anos default, configurável via input.windowYears (já suportado).
 *
 * Princípios:
 * - Eixo L é **progressive** (não muda EIS Core canônico) — back-compat absoluta.
 * - Aplicar L como redutor multiplicativo no EIS final é **opt-in** (default off).
 * - Sem multas → L=5 (sem impacto), back-compat com modelos legados.
 * - L = FIS já está em [0, 5], mesma escala dos demais eixos.
 *
 * Spec: docs/specs/features/SPEC_FINE_IMPACT_SCORE.md §F3 (eixo L)
 * ADR:  docs/adrs/ADR-FINE-IMPACT-SCORE-001.md §D-FIS-2 (c) eixo L + penalizador
 */

import {
    computeFineImpact,
    type FineImpactInput,
    type FineImpactOutput,
} from '../ecbtScore/_fineImpactPure.js';

export interface FineImpactAxisInput {
    /** Multas + capacidade econômica. Se vazio/ausente → L=5 (no-op back-compat). */
    readonly fines?: FineImpactInput['fines'];
    readonly ebitda?: number;
    readonly ebitdaBrl?: number;
    readonly revenue?: number;
    readonly revenueBrl?: number;
    readonly marketValue?: number;
    readonly marketValueBrl?: number;
    readonly currency?: string;
    readonly absoluteRefAmount?: number;
    readonly windowYears?: number;
    readonly sectorWeight?: number;
    readonly nowIso?: string;
}

export interface FineImpactAxisResult {
    /** Score do eixo L em escala [0, 5] — igual ao FIS. */
    readonly L: number;
    /** True se há ao menos 1 multa válida (impacta o score). */
    readonly hasFines: boolean;
    /** Quantidade de multas dentro da janela. */
    readonly finesInWindow: number;
    /** Output completo do FIS quando há multas; null quando vazio. */
    readonly fineImpact: FineImpactOutput | null;
    /** Texto curto para HUD/badge: "🟢 BOM" / "🟡 ALERTA" / "🟠 GRAVE" / "🔴 CRÍTICO". */
    readonly badge: 'BOM' | 'ALERTA' | 'GRAVE' | 'CRITICO';
    /** Cor canônica em hex para radar/badge. */
    readonly color: string;
}

export interface AxisLApplyOptions {
    /** Aplicar L como redutor no EIS final. Default false (back-compat). */
    readonly includeFineImpactInEis?: boolean;
    /** Peso de L quando incluído. Default 2 (axisRegistry canônico). */
    readonly weight?: number;
}

export interface EisAdjustedByLResult {
    /** EIS original (sem L). */
    readonly eisOriginal: number;
    /** EIS ajustado por L se opt-in; senão = eisOriginal. */
    readonly eis: number;
    /** Score do eixo L. */
    readonly L: number;
    /** True se a redução foi aplicada. */
    readonly applied: boolean;
    /** Fator multiplicativo aplicado (L/5). */
    readonly factor: number;
    /** Output completo do FIS quando há multas; null quando vazio. */
    readonly fineImpact: FineImpactOutput | null;
}

// ----------------------------------------------------------------
// CONSTANTS — bandas canônicas alinhadas com fisPanel.ts UI
// ----------------------------------------------------------------

const BAND_BOM_MIN = 4.5;
const BAND_ALERTA_MIN = 3.5;
const BAND_GRAVE_MIN = 1.5;
const FIS_SCALE = 5;
const DEFAULT_WEIGHT = 2;

const COLOR_BOM = '#16a34a';      // verde
const COLOR_ALERTA = '#facc15';   // amarelo
const COLOR_GRAVE = '#f97316';    // laranja
const COLOR_CRITICO = '#dc2626';  // vermelho

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function _resolveBand(L: number): { badge: 'BOM' | 'ALERTA' | 'GRAVE' | 'CRITICO'; color: string } {
    if (L >= BAND_BOM_MIN) return { badge: 'BOM', color: COLOR_BOM };
    if (L >= BAND_ALERTA_MIN) return { badge: 'ALERTA', color: COLOR_ALERTA };
    if (L >= BAND_GRAVE_MIN) return { badge: 'GRAVE', color: COLOR_GRAVE };
    return { badge: 'CRITICO', color: COLOR_CRITICO };
}

function _clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
}

function _hasValidFines(input: FineImpactAxisInput): boolean {
    return Array.isArray(input?.fines) && input.fines.length > 0;
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Computa o eixo L (Legal Standing) a partir das multas e capacidade econômica.
 *
 * **Back-compat absoluta:** ausência de `fines` → L=5 ("BOM", sem multas relevantes).
 * Nenhum modelo legado é afetado por default.
 *
 * @param input Multas + capacidade. Mesmo formato do FineImpactInput.
 * @returns Score L em [0, 5] + breakdown + badge para UI.
 */
export function computeAxisL(input: FineImpactAxisInput): FineImpactAxisResult {
    if (!_hasValidFines(input)) {
        // Sem multas → L=5 (top score), no-op para modelos legados.
        const { badge, color } = _resolveBand(FIS_SCALE);
        return Object.freeze({
            L: FIS_SCALE,
            hasFines: false,
            finesInWindow: 0,
            fineImpact: null,
            badge,
            color,
        }) as FineImpactAxisResult;
    }

    const fineImpact = computeFineImpact({
        fines: input.fines ?? [],
        ebitda: input.ebitda,
        ebitdaBrl: input.ebitdaBrl,
        revenue: input.revenue,
        revenueBrl: input.revenueBrl,
        marketValue: input.marketValue,
        marketValueBrl: input.marketValueBrl,
        currency: input.currency,
        absoluteRefAmount: input.absoluteRefAmount,
        windowYears: input.windowYears,
        sectorWeight: input.sectorWeight,
        nowIso: input.nowIso,
    });

    const L = _clamp(fineImpact.FIS, 0, FIS_SCALE);
    const { badge, color } = _resolveBand(L);

    return Object.freeze({
        L,
        hasFines: true,
        finesInWindow: fineImpact.finesInWindow,
        fineImpact,
        badge,
        color,
    }) as FineImpactAxisResult;
}

/**
 * Aplica o eixo L como redutor multiplicativo no EIS final.
 *
 * **Default off (back-compat):** `includeFineImpactInEis !== true` → retorna EIS intacto.
 * Quando habilitado: `eis_ajustado = eis_original × (L / 5)`. L=5 não reduz, L=0 zera EIS.
 *
 * Decisão Calvin (D-FIS-2 (c)): eixo L progressive + penalizador no ECBT Score.
 * Esta função aplica APENAS no EIS — o penalizador do ECBT já vive em
 * `_ecbtScorePure.computeEcbtScore` (Fase 2, commit 7748b710).
 *
 * @param eis EIS Core já computado (mode geometric/veto).
 * @param input Multas + capacidade.
 * @param options? Opt-in flag + peso.
 * @returns EIS original + EIS ajustado + audit do FIS.
 */
export function applyAxisLToEis(
    eis: number,
    input: FineImpactAxisInput,
    options?: AxisLApplyOptions,
): EisAdjustedByLResult {
    const eisOriginal = _clamp(Number(eis) || 0, 0, FIS_SCALE);
    const axis = computeAxisL(input);
    const enabled = options?.includeFineImpactInEis === true;

    if (!enabled || !axis.hasFines) {
        return Object.freeze({
            eisOriginal,
            eis: eisOriginal,
            L: axis.L,
            applied: false,
            factor: 1,
            fineImpact: axis.fineImpact,
        }) as EisAdjustedByLResult;
    }

    const factor = _clamp(axis.L / FIS_SCALE, 0, 1);
    const eisAdjusted = _clamp(eisOriginal * factor, 0, FIS_SCALE);

    return Object.freeze({
        eisOriginal,
        eis: eisAdjusted,
        L: axis.L,
        applied: true,
        factor,
        fineImpact: axis.fineImpact,
    }) as EisAdjustedByLResult;
}

/**
 * Constrói VM (view-model) imutável para integração em payload do canonicalEngine.
 *
 * Saída é safe para spread em `result.progressiveAxes` sem mexer em campos canônicos.
 *
 * @param input Multas + capacidade.
 * @returns VM com axis score, badge, e payload de auditoria opcional.
 */
export function buildAxisLViewModel(input: FineImpactAxisInput): {
    readonly axis: 'L';
    readonly score: number;
    readonly hasFines: boolean;
    readonly finesInWindow: number;
    readonly badge: 'BOM' | 'ALERTA' | 'GRAVE' | 'CRITICO';
    readonly color: string;
    readonly fineImpact: FineImpactOutput | null;
    readonly weight: number;
} {
    const axis = computeAxisL(input);
    return Object.freeze({
        axis: 'L' as const,
        score: axis.L,
        hasFines: axis.hasFines,
        finesInWindow: axis.finesInWindow,
        badge: axis.badge,
        color: axis.color,
        fineImpact: axis.fineImpact,
        weight: DEFAULT_WEIGHT,
    });
}

/**
 * Resolve a faixa textual do eixo L para HUD/relatórios pt-BR.
 *
 * @param L Score em [0, 5].
 * @returns Descrição curta acessível para Calvin não-técnico.
 */
export function describeAxisLBand(L: number): string {
    const { badge } = _resolveBand(L);
    switch (badge) {
        case 'BOM':
            return 'Conformidade legal sólida — sem multas materiais.';
        case 'ALERTA':
            return 'Multas leves/moderadas detectadas — monitorar reincidência.';
        case 'GRAVE':
            return 'Multas materiais — passivo legal afetando o EIS.';
        case 'CRITICO':
            return 'Multas graves ou reincidentes — impacto significativo no EIS.';
    }
}
