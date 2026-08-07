// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RELATIONS TOOLTIP — VM do tooltip de hover do grafo (info do elemento)
   RELATIONS-UX-001 F8. Calvin 2026-06-14: "ao colocar o mouse sobre os
   elementos dar informações a respeito desse elemento".

   O tooltip do tier graph mostrava só "nome · família". Este módulo monta um
   ViewModel RICO: título (nome), família legível, descrição, severidade (com
   rótulo), contadores (filhos) e dica de interação. Trata os 3 casos especiais:
   nó real, agregador "+N" e raiz virtual (Modelo completo).

   Pure: sem DOM. Determinístico. O caller (showTooltip) monta o HTML com as
   classes .relations-tooltip-* já existentes (reuso do tooltip do sunburst).
   ================================================================ */

export type TooltipSeverity = 'intervention' | 'prevention' | 'reference' | null | undefined;

export interface TooltipNode {
    readonly id: string;
    readonly name: string;
    readonly family?: string;
    readonly severity?: TooltipSeverity;
    readonly depth: number;
}

/** Campos do ELEMENTO real (opcional — enriquece o tooltip). */
export interface TooltipElement {
    readonly description?: string;
    readonly family?: string;
}

export interface TooltipOptions {
    /** Nº de filhos diretos no grafo (edges saindo do nó). */
    readonly childCount?: number;
    /** Total de elementos no modelo (para a raiz virtual). */
    readonly modelTotal?: number;
}

export interface TooltipRow {
    readonly label: string;
    readonly value: string;
}

export interface TooltipVM {
    readonly title: string;
    /** Família legível (capitalizada, sem underscores) — vazio se ausente. */
    readonly familyLabel: string;
    readonly description: string;
    readonly severity: Exclude<TooltipSeverity, undefined>;
    /** Chave i18n do rótulo de severidade (vazio se sem severidade). */
    readonly severityKey: string;
    readonly rows: ReadonlyArray<TooltipRow>;
    /** Chave i18n da dica de interação. */
    readonly hintKey: string;
    readonly kind: 'node' | 'aggregate' | 'root';
}

export const ROOT_ID = '__model_root__';
const AGGREGATE_RE = /__more$/;

const SEVERITY_KEY: Readonly<Record<string, string>> = Object.freeze({
    intervention: 'relationsPanel.sevIntervention',
    prevention: 'relationsPanel.sevPrevention',
    reference: 'relationsPanel.sevReference',
});

/** "site_project" → "Site project" (legível). */
export function humanizeFamily(family: unknown): string {
    if (typeof family !== 'string' || !family.trim()) return '';
    const s = family.trim().replace(/[_-]+/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Monta o ViewModel do tooltip de um nó do grafo. `element` (opcional) é o
 * elemento real para enriquecer (descrição). `opts` traz contadores derivados.
 */
export function buildNodeTooltipVM(
    node: TooltipNode,
    element?: TooltipElement | null,
    opts: TooltipOptions = {},
): TooltipVM {
    const id = String(node?.id ?? '');
    const isAggregate = AGGREGATE_RE.test(id);
    const isRoot = id === ROOT_ID || node?.depth === 0;
    const childCount = _nonNeg(opts.childCount);
    const rows: TooltipRow[] = [];

    if (isAggregate) {
        const hidden = _parseAggregateCount(node?.name);
        return Object.freeze({
            title: hidden > 0 ? `+${hidden}` : String(node?.name ?? ''),
            familyLabel: '',
            description: '',
            severity: null,
            severityKey: '',
            rows: Object.freeze([{ label: 'relationsPanel.ttHidden', value: String(hidden) }]),
            hintKey: 'relationsPanel.ttHintExpand',
            kind: 'aggregate',
        });
    }

    if (isRoot) {
        const total = _nonNeg(opts.modelTotal);
        if (total > 0) rows.push({ label: 'relationsPanel.ttElements', value: String(total) });
        return Object.freeze({
            title: String(node?.name ?? 'Modelo'),
            familyLabel: '',
            description: '',
            severity: null,
            severityKey: '',
            rows: Object.freeze(rows),
            hintKey: 'relationsPanel.ttHintRoot',
            kind: 'root',
        });
    }

    const sev = _normSeverity(node?.severity);
    if (childCount > 0) rows.push({ label: 'relationsPanel.ttChildren', value: String(childCount) });

    return Object.freeze({
        title: String(node?.name ?? id),
        familyLabel: humanizeFamily(element?.family || node?.family),
        description: typeof element?.description === 'string' ? element.description.trim() : '',
        severity: sev,
        severityKey: sev ? SEVERITY_KEY[sev] ?? '' : '',
        rows: Object.freeze(rows),
        hintKey: 'relationsPanel.ttHintNode',
        kind: 'node',
    });
}

function _normSeverity(s: TooltipSeverity): Exclude<TooltipSeverity, undefined> {
    return s === 'intervention' || s === 'prevention' || s === 'reference' ? s : null;
}
function _nonNeg(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}
function _parseAggregateCount(name: unknown): number {
    const m = typeof name === 'string' ? name.match(/\+(\d+)/) : null;
    return m ? parseInt(m[1]!, 10) : 0;
}
