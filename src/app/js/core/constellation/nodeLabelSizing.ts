// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost

/**
 * Constellation Node Label Sizing — ARCH-MONOLITH-ATOMIZATION-001
 *
 * Pure-logic slice extraída de utils/scene/constellation.ts (monolito).
 * Decisões de tamanho/visibilidade de RÓTULO de nó na constelação:
 *
 *   - labelScale: multiplicador de fonte amortecido por zoom (sub-linear no
 *     zoom in para que o texto na tela não infle 1:1 com o viewport).
 *   - baseFontForTier / maxCharsForTier: catálogo canônico de fonte-base e
 *     orçamento de caracteres por TIER do nó (center / L1-normal / deep-L2 / L3).
 *   - shouldHideTooSmall: LOD de legibilidade — esconde rótulo (em vez de
 *     inflar) quando, no zoom-out, ele ficaria abaixo do mínimo legível.
 *   - resolveNodeLabel: combina tudo num view-model único de decisão.
 *
 * Best practice graph-viz "detail on demand": no zoom-out o rótulo ilegível é
 * ocultado (o indicador de zoom encoraja aproximar para reler), nunca inflado
 * (inflar causaria overlap). Em zoom >= 1 o comportamento default é preservado.
 *
 * NÃO depende de browser. Não toca em DOM / Canvas / Three.js / Supabase.
 * O monolito chama estas funções puras; o desenho (ctx.*) permanece no monolito.
 */

/** Damp canônico do zoom para escala de rótulo (0 = px de tela constante, 1 = geométrico puro). */
export const LABEL_ZOOM_DAMP = 0.55;

/** Mínimo de px de tela abaixo do qual o rótulo é considerado ilegível. */
export const MIN_LABEL_PX = 4;

/** Tier de rótulo de um nó da constelação. */
export type NodeLabelTier = 'center' | 'normal' | 'deep' | 'l3';

/** Fonte-base (px lógico, antes do labelScale) por tier. */
export const BASE_FONT_BY_TIER = Object.freeze({
    center: 11,
    normal: 9,
    deep: 7,
    l3: 5,
} as const);

/** Orçamento de caracteres (truncamento) por tier. */
export const MAX_CHARS_BY_TIER = Object.freeze({
    center: 18,
    normal: 18,
    deep: 12,
    l3: 8,
} as const);

/** Entrada para resolver a decisão de rótulo de um nó. */
export interface ResolveNodeLabelInput {
    /** Nível do nó: 0=center/root, 1=satélite (normal), 2=L2 (deep), 3=L3. */
    readonly level?: number;
    /** Se o nó é o centro da constelação (sobrepõe o nível para tier 'center'). */
    readonly isCenter?: boolean;
    /** Escala de viewport atual (1 = sem zoom). */
    readonly viewScale?: number;
    /** Nó sob hover (sempre mostra rótulo, ignora LOD de tamanho). */
    readonly isHovered?: boolean;
    /** Preferência do usuário de ocultar todos os rótulos. */
    readonly userHideLabels?: boolean;
    /** Flag de LOD do nó (false = LOD pediu para ocultar). */
    readonly lodShowLabel?: boolean;
    /** Nó pediu supressão de rótulo (a menos que hover). */
    readonly suppressLabel?: boolean;
    /** Texto do nome do nó (vazio/ausente => sem rótulo). */
    readonly name?: string | null;
    /** Altura do canvas (px CSS) — gating de espaço para deep/L3. */
    readonly canvasH?: number;
    /** Override do damp (default LABEL_ZOOM_DAMP). */
    readonly damp?: number;
    /** Override do mínimo legível (default MIN_LABEL_PX). */
    readonly minLabelPx?: number;
}

/** View-model de decisão de rótulo (frozen). */
export interface NodeLabelDecision {
    readonly tier: NodeLabelTier;
    /** Fonte-base (px lógico, antes do labelScale). */
    readonly baseFont: number;
    /** Fonte final na tela = baseFont * labelScale. */
    readonly fontSize: number;
    /** Multiplicador amortecido de escala de rótulo. */
    readonly labelScale: number;
    /** Orçamento de caracteres para truncamento. */
    readonly maxChars: number;
    /** true se o rótulo deve ser desenhado. */
    readonly show: boolean;
    /** true se oculto por ficar pequeno demais no zoom-out. */
    readonly hiddenTooSmall: boolean;
}

/** Identidade do módulo. */
export const NODE_LABEL_SIZING_META = Object.freeze({
    spec: 'ARCH-MONOLITH-ATOMIZATION-001',
    source: 'src/app/js/utils/scene/constellation.ts',
    extractedAt: '2026-06-18',
} as const);

/**
 * Multiplicador de escala de rótulo amortecido por zoom.
 * Em zoom <= 1 retorna 1 (mantém o comportamento geométrico do default).
 * Em zoom > 1 cresce sub-linearmente: pow(zoom, damp) / zoom.
 */
export function labelScale(viewScale: number, damp: number = LABEL_ZOOM_DAMP): number {
    if (!Number.isFinite(viewScale) || viewScale <= 1) return 1;
    return Math.pow(viewScale, damp) / viewScale;
}

/** Resolve o tier do nó a partir de level + isCenter. */
export function resolveNodeLabelTier(level: number = 0, isCenter: boolean = false): NodeLabelTier {
    if (isCenter) return 'center';
    const lvl = Number.isFinite(level) ? level : 0;
    if (lvl === 3) return 'l3';
    if (lvl >= 2) return 'deep';
    return 'normal';
}

/** Fonte-base (px lógico) por tier. */
export function baseFontForTier(tier: NodeLabelTier): number {
    return BASE_FONT_BY_TIER[tier] ?? BASE_FONT_BY_TIER.normal;
}

/** Orçamento de caracteres por tier. */
export function maxCharsForTier(tier: NodeLabelTier): number {
    return MAX_CHARS_BY_TIER[tier] ?? MAX_CHARS_BY_TIER.normal;
}

/**
 * LOD de legibilidade: true se o rótulo ficaria pequeno demais no zoom-out.
 * Só atua em zoom < 1 e quando NÃO há hover (hover sempre mostra).
 */
export function shouldHideTooSmall(
    viewScale: number,
    baseFont: number,
    isHovered: boolean = false,
    minLabelPx: number = MIN_LABEL_PX,
): boolean {
    if (isHovered) return false;
    if (!Number.isFinite(viewScale) || viewScale >= 1) return false;
    return baseFont * viewScale < minLabelPx;
}

/**
 * Resolve a decisão completa de rótulo de um nó (tier, fonte, truncamento,
 * visibilidade). Espelha exatamente a lógica inline do monolito (drawNode).
 */
export function resolveNodeLabel(input: ResolveNodeLabelInput = {}): Readonly<NodeLabelDecision> {
    const {
        level = 0,
        isCenter = false,
        viewScale = 1,
        isHovered = false,
        userHideLabels = false,
        lodShowLabel = true,
        suppressLabel = false,
        name = '',
        canvasH = Infinity,
        damp = LABEL_ZOOM_DAMP,
        minLabelPx = MIN_LABEL_PX,
    } = input;

    const tier = resolveNodeLabelTier(level, isCenter);
    const baseFont = baseFontForTier(tier);
    const ls = labelScale(viewScale, damp);
    const maxChars = maxCharsForTier(tier);
    const hiddenTooSmall = shouldHideTooSmall(viewScale, baseFont, isHovered, minLabelPx);

    const isDeep = tier === 'deep' || tier === 'l3';
    const isL3 = tier === 'l3';
    const ch = Number.isFinite(canvasH) ? canvasH : Infinity;

    const show =
        !userHideLabels &&
        !!name &&
        lodShowLabel !== false &&
        (!suppressLabel || isHovered) &&
        !hiddenTooSmall &&
        !(isL3 && ch < 120) &&
        !(isDeep && ch < 100);

    return Object.freeze({
        tier,
        baseFont,
        fontSize: baseFont * ls,
        labelScale: ls,
        maxChars,
        show,
        hiddenTooSmall,
    });
}

/** Module identity export. */
export const nodeLabelSizingMeta = Object.freeze({
    spec: 'ARCH-MONOLITH-ATOMIZATION-001',
    source: 'src/app/js/utils/scene/constellation.ts',
    extractedAt: '2026-06-18',
    exports: [
        'LABEL_ZOOM_DAMP',
        'MIN_LABEL_PX',
        'BASE_FONT_BY_TIER',
        'MAX_CHARS_BY_TIER',
        'NODE_LABEL_SIZING_META',
        'labelScale',
        'resolveNodeLabelTier',
        'baseFontForTier',
        'maxCharsForTier',
        'shouldHideTooSmall',
        'resolveNodeLabel',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
} as const);
