// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S4 (gridStats lógica pura) — view-model PURO do
 * painel de stats da home: veredito EIS (cor + rótulo), direção do delta e
 * ação sugerida. claude (refactor) 2026-06-18.
 *
 * EN: Pure view-model for the home "stats panel" — EIS verdict (color +
 *     label), trend delta (direction + arrow) and the suggested action. No
 *     DOM, no i18n side-effects, no globals. The renderers in
 *     homeEisDashboard.ts / homeSuggested.ts consume these and map them to DOM.
 *     The logic MIRRORS the legacy behaviour exactly:
 *       - EIS verdict thresholds match `homeEisDashboardHelpers.resolveEisVerdict`
 *         on the canonical 0-5 scale (>=4.5 high, >=3.5 medium, else low). A
 *         0-100 scale is also accepted (normalised /20) so callers that hold the
 *         percentage form (V3 hero / compliance KPI) get the same verdict — e.g.
 *         EIS 78.5/100 → 3.925/5 → medium/green band.
 *       - The delta direction matches `buildPurposeViewModel` (deltaEis>0 → up,
 *         <0 → down, 0 → neutral) including the same arrow entities and CSS
 *         class names.
 *       - The suggested action matches `computeHomeSuggestion` (highest-priority
 *         gap, or the export fallback when there are no gaps).
 *
 * PT (leigo): monta, sem tela nem tradução, a "ficha" do painel de estatísticas
 *     da tela inicial: que cor/rótulo o EIS recebe (verde = bom, amarelo =
 *     intermediário, vermelho = crítico), se a nota subiu ou desceu (setinha) e
 *     qual a próxima ação recomendada. Quem desenha na tela é o homeGrid; aqui
 *     só calculamos os valores. Os mesmos números que o código antigo calculava
 *     embutido — só que agora isolados e testáveis.
 *
 * Pure: entradas → saída congelada, determinística. Cheap tests:
 * tests/ui/homeGrid/grid-stats.test.mjs.
 */

/** Faixa de cor do veredito EIS (espelha as classes CSS low/medium/high). */
export type EisColor = 'low' | 'medium' | 'high';

/** Direção do delta da nota EIS entre snapshots. */
export type DeltaDirection = 'up' | 'down' | 'neutral';

/** Rótulos i18n já resolvidos (ou padrões em inglês quando ausentes). */
export interface EisVerdictLabels {
    /** Rótulo da faixa alta (>=4.5). */
    readonly audit?: string;
    /** Rótulo da faixa média (>=3.5). */
    readonly management?: string;
    /** Rótulo da faixa baixa (< 3.5). */
    readonly critical?: string;
}

/** Veredito EIS: cor da faixa + rótulo legível. */
export interface EisVerdict {
    readonly eisColor: EisColor;
    readonly eisLabel: string;
    /** Nota normalizada para a escala 0-5 (a usada nos thresholds). */
    readonly score: number;
}

/** Modelo de delta: valor, direção, seta (entidade HTML), sinal e classe CSS. */
export interface DeltaModel {
    readonly value: number;
    readonly direction: DeltaDirection;
    /** Entidade HTML da seta (&#9650; cima / &#9660; baixo / = neutro). */
    readonly arrow: string;
    /** Sinal a prefixar ('+' quando positivo, '' caso contrário). */
    readonly sign: string;
    /** Classe CSS do delta (espelha buildPurposeViewModel). */
    readonly deltaClass: string;
}

/** Uma ação sugerida (mensagem + nome do handler a executar). */
export interface SuggestedAction {
    readonly msg: string;
    readonly handler: string;
}

/** View-model completo do painel de stats (forma literal pedida pela DoD). */
export interface GridStatsViewModel {
    readonly eisLabel: string;
    readonly eisColor: EisColor;
    readonly delta: DeltaModel;
    readonly suggestedAction: SuggestedAction | null;
}

/** Entrada de completude (gaps + score) — mesmo formato de computeCompleteness(). */
export interface CompletenessCheck {
    readonly gaps?: ReadonlyArray<{ readonly msg: string; readonly handler: string }>;
}

/** Entradas cruas para montar o view-model do painel. */
export interface GridStatsModel {
    /** Nota EIS (0-5 canônico ou 0-100 percentual — normalizada automaticamente). */
    readonly eisScore: number;
    /** Variação da nota EIS entre o snapshot atual e o anterior. */
    readonly deltaEis: number;
    /** Check de completude (gaps). null/ausente quando não há dados. */
    readonly completeness?: CompletenessCheck | null;
    /** Rótulos i18n do veredito (resolvidos a montante). */
    readonly labels?: EisVerdictLabels;
    /** Mensagem de fallback de exportação (quando não há gaps). */
    readonly exportMsg?: string;
}

/** Número finito, senão 0 (fail-safe contra NaN/sujeira). */
function safeNumber(n: unknown): number {
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
}

/**
 * Normaliza a nota EIS para a escala 0-5 usada nos thresholds. Aceita tanto a
 * forma canônica 0-5 quanto a percentual 0-100 (esta é dividida por 20). A
 * heurística: qualquer valor > 5 é tratado como percentual. Clampa em [0, 5].
 */
export function normalizeEisScore(score: unknown): number {
    let s = safeNumber(score);
    if (s < 0) s = 0;
    if (s > 5) s = s / 20; // 0-100 → 0-5 (ex.: 78.5 → 3.925)
    return Math.max(0, Math.min(5, s));
}

/**
 * Veredito EIS (cor + rótulo) pela nota. Mesmos thresholds do legado
 * `resolveEisVerdict` na escala 0-5: >=4.5 alto/verde, >=3.5 médio/amarelo,
 * senão baixo/vermelho. Aceita escala 0-100 via normalização.
 */
export function resolveEisVerdict(score: unknown, labels: EisVerdictLabels = {}): EisVerdict {
    const normalized = normalizeEisScore(score);
    if (normalized >= 4.5) {
        return Object.freeze({ eisColor: 'high', eisLabel: labels.audit || 'Audit Ready', score: normalized });
    }
    if (normalized >= 3.5) {
        return Object.freeze({
            eisColor: 'medium',
            eisLabel: labels.management || 'Management Ready',
            score: normalized,
        });
    }
    return Object.freeze({ eisColor: 'low', eisLabel: labels.critical || 'Critical Data', score: normalized });
}

/**
 * Modelo do delta da nota EIS. Mesma regra de `buildPurposeViewModel`:
 * positivo → seta pra cima (&#9650;) + sinal '+'; negativo → seta pra baixo
 * (&#9660;); zero → neutro ('='). Inclui as classes CSS canônicas.
 */
export function resolveDelta(deltaEis: unknown): DeltaModel {
    const value = safeNumber(deltaEis);
    if (value > 0) {
        return Object.freeze({
            value,
            direction: 'up',
            arrow: '&#9650;',
            sign: '+',
            deltaClass: 'purpose-status-delta-positive',
        });
    }
    if (value < 0) {
        return Object.freeze({
            value,
            direction: 'down',
            arrow: '&#9660;',
            sign: '',
            deltaClass: 'purpose-status-delta-negative',
        });
    }
    return Object.freeze({
        value: 0,
        direction: 'neutral',
        arrow: '=',
        sign: '',
        deltaClass: 'purpose-status-delta-neutral',
    });
}

/**
 * Ação sugerida de maior prioridade (primeiro gap), ou o fallback de exportação
 * quando não há gaps. Espelha `computeHomeSuggestion` do homeSuggested.
 *
 * @param check Resultado de computeCompleteness() (ou null/ausente).
 * @param exportMsg Mensagem de fallback de exportação (já traduzida).
 * @returns A ação sugerida, ou null quando não há check.
 */
export function resolveSuggestedAction(
    check: CompletenessCheck | null | undefined,
    exportMsg: string = 'Export your model for sharing',
): SuggestedAction | null {
    if (!check) return null;
    const gaps = Array.isArray(check.gaps) ? check.gaps : [];
    if (gaps.length > 0) {
        const top = gaps[0];
        return Object.freeze({ msg: String(top?.msg ?? ''), handler: String(top?.handler ?? '') });
    }
    return Object.freeze({ msg: exportMsg, handler: 'openExportModal' });
}

/**
 * Monta o view-model congelado do painel de stats na forma literal pedida pela
 * DoD: `{ eisLabel, eisColor, delta, suggestedAction }`. Pure: sem DOM/i18n/
 * relógio. Os renderers mapeiam para DOM.
 */
export function buildGridStatsViewModel(model: GridStatsModel): GridStatsViewModel {
    const verdict = resolveEisVerdict(model?.eisScore, model?.labels || {});
    const delta = resolveDelta(model?.deltaEis);
    const suggestedAction = resolveSuggestedAction(model?.completeness ?? null, model?.exportMsg);

    return Object.freeze({
        eisLabel: verdict.eisLabel,
        eisColor: verdict.eisColor,
        delta,
        suggestedAction,
    });
}
