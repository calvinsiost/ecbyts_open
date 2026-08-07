// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   EMPTY-STATE CTA — decisão pura "zero morto" vs "empty-state pedagógico"
   UI-MINIMALISM-001 F3.5 / WL-7. Calvin 2026-06-15.

   §5.3/§5.4 da spec: um stat "0 Relações / 0 Observações" mostrado como um
   "0" morto é baixo-sinal (dimensão `empty_state_clarity`). A cura NÃO é
   esconder o stat — é, quando a contagem é zero, virar um EMPTY-STATE com
   CTA ("+ Adicionar observação") que ENSINA como sair do zero. Quando há
   contagem > 0, o stat mostra o número normalmente.

   Este módulo é o NÚCLEO PURO dessa decisão (sem DOM, sem IO, sem THREE):
   recebe a contagem + rótulo + (opcional) a ação/rótulo de CTA, e devolve um
   `StatViewModel` frozen que a camada de render (homeGrid/homeInspector)
   traduz para markup. Determinístico — mesma entrada → mesmo view-model.

   Provenance: Nielsen NN/g "Aesthetic and Minimalist Design" (#8) — empty
   states devem orientar, não exibir um vazio sem rumo; NN/g "Empty States".
   ================================================================ */

/** Entrada de um stat do inspetor (contagem + rótulo + CTA opcional). */
export interface StatInput {
    /** Chave estável do stat (ex.: 'relations', 'observations'). */
    readonly key: string;
    /** Rótulo legível (ex.: 'Relações', 'Observações'). */
    readonly label: string;
    /** Contagem atual do stat. */
    readonly count: number;
    /**
     * Ação do CTA quando vazio (ex.: 'add-observation'). Sem isto, o stat
     * vazio cai em "zero morto" — não há como ensinar a sair do zero.
     */
    readonly ctaAction?: string;
    /** Rótulo do CTA quando vazio (ex.: '+ Adicionar observação'). */
    readonly ctaLabel?: string;
}

/** Como o stat deve ser renderizado. */
export type StatMode = 'value' | 'empty_cta' | 'dead_zero';

/** View-model frozen de um stat (a camada de render traduz para markup). */
export interface StatViewModel {
    readonly key: string;
    readonly label: string;
    readonly count: number;
    readonly mode: StatMode;
    /** true quando mode === 'empty_cta' — há CTA pedagógico para mostrar. */
    readonly showCta: boolean;
    /** Ação do CTA (só quando showCta). */
    readonly ctaAction: string | null;
    /** Rótulo do CTA (só quando showCta). */
    readonly ctaLabel: string | null;
}

function _toCount(n: unknown): number {
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function _normalizeString(v: unknown): string {
    return typeof v === 'string' ? v : '';
}

function _normalizeCtaString(v: unknown): string | null {
    const s = typeof v === 'string' && v.trim() ? v.trim() : null;
    return s;
}

function _decideStatMode(count: number, ctaAction: string | null, ctaLabel: string | null): StatMode {
    if (count > 0) return 'value';
    if (ctaAction && ctaLabel) return 'empty_cta';
    return 'dead_zero';
}

/**
 * Decide o modo de um stat (WL-7):
 *   - count > 0            → 'value'      (mostra o número — sinal real).
 *   - count === 0 + CTA    → 'empty_cta'  (empty-state pedagógico, cura WL-7).
 *   - count === 0 sem CTA  → 'dead_zero'  (o anti-pattern — sem como ensinar).
 *
 * Domain-agnostic: serve para Relações, Observações, Campanhas ou qualquer
 * stat contável que tenha uma ação de "adicionar".
 */
export function resolveStatViewModel(input: StatInput): StatViewModel {
    const key = _normalizeString(input?.key);
    const label = _normalizeString(input?.label);
    const count = _toCount(input?.count);
    const ctaAction = _normalizeCtaString(input?.ctaAction);
    const ctaLabel = _normalizeCtaString(input?.ctaLabel);
    const mode = _decideStatMode(count, ctaAction, ctaLabel);
    const showCta = mode === 'empty_cta';
    return Object.freeze({
        key,
        label,
        count,
        mode,
        showCta,
        ctaAction: showCta ? ctaAction : null,
        ctaLabel: showCta ? ctaLabel : null,
    });
}

/** Resolve uma lista de stats de uma vez (ordem preservada). */
export function resolveStatViewModels(inputs: ReadonlyArray<StatInput>): ReadonlyArray<StatViewModel> {
    const list = Array.isArray(inputs) ? inputs : [];
    return Object.freeze(list.map(resolveStatViewModel));
}

/**
 * Auditoria de minimalismo: quantos stats são "zero morto" (anti-pattern WL-7)
 * num conjunto. Útil para gate: se > 0, ainda há empty-states sem orientação.
 * `deadZeros` lista as chaves dos stats que precisam de CTA.
 */
export function countDeadZeros(vms: ReadonlyArray<StatViewModel>): {
    readonly deadZeroCount: number;
    readonly emptyCtaCount: number;
    readonly valueCount: number;
    readonly deadZeros: ReadonlyArray<string>;
    /** true quando NENHUM stat é zero-morto (cura WL-7 completa para a tela). */
    readonly clean: boolean;
} {
    const list = Array.isArray(vms) ? vms : [];
    const deadZeros: string[] = [];
    let emptyCta = 0;
    let value = 0;
    for (const vm of list) {
        if (!vm) continue;
        if (vm.mode === 'dead_zero') deadZeros.push(vm.key);
        else if (vm.mode === 'empty_cta') emptyCta++;
        else if (vm.mode === 'value') value++;
    }
    return Object.freeze({
        deadZeroCount: deadZeros.length,
        emptyCtaCount: emptyCta,
        valueCount: value,
        deadZeros: Object.freeze(deadZeros),
        clean: deadZeros.length === 0,
    });
}
