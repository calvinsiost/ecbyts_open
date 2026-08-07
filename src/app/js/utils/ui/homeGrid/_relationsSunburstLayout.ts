// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SENTINEL Calvin diretiva 2026-06-03 — pure-logic sunburst (3a opção do toggle).
// SENTINEL SPEC_SUNBURST_REDESIGN_001 (Calvin 2026-06-06) — paleta Tableau + severity.
//
// Sunburst para hierarquia descendente (CONTAINS de CONTAINS). 2 níveis máx.
// Pesquisa: .runtime/research/sunburst-relations-2026-06-03.md +
//           WebSearch 2026-06-06 (chartbrew, Domo, Flourish, Obsidian forum, AFFiNE)
//
// Pure-logic: zero DOM, zero Canvas. Recebe árvore → anéis polares.
// Caller (renderer) desenha com ctx.arc().

import { assignDatasetColor } from '../../../core/symbology/datasetColors.js';

console.debug('[mod:load]', 'app/js/utils/ui/homeGrid/_relationsSunburstLayout.ts');

/** Severity canônica (mirror de complianceOverlay SEVERITY_RANK). */
export type SliceSeverity = 'intervention' | 'prevention' | 'reference' | null;

/** Nó da árvore — recursivo (children = nível seguinte). */
export interface SunburstNode {
    readonly id: string;
    readonly name: string;
    readonly family: string;
    /** Severity de compliance (null = sem violação ou não computada). */
    readonly severity?: SliceSeverity;
    /** Filhos diretos (opcional — vazio ou ausente = leaf). */
    readonly children?: ReadonlyArray<SunburstNode>;
}

export interface SunburstConfig {
    readonly width: number;
    readonly height: number;
    /** Profundidade máxima (sem contar root). Default 2. */
    readonly maxDepth?: number;
    /** Largura de cada anel (px). Auto-calculado se ausente. */
    readonly ringWidth?: number;
    /** Margem do viewport (px). Default 16. */
    readonly margin?: number;
    /** Threshold em radianos para incluir label (default 3° = 0.052 rad). */
    readonly labelMinAngle?: number;
}

export interface SunburstSlice {
    readonly node: SunburstNode;
    /** Profundidade do anel (0 = self/center, 1 = filhos diretos, 2 = netos). */
    readonly depth: number;
    /** Ângulo inicial (rad, sentido horário a partir de -π/2 = topo). */
    readonly startAngle: number;
    /** Ângulo final (rad). */
    readonly endAngle: number;
    /** Raio interno do arco (px). */
    readonly innerRadius: number;
    /** Raio externo do arco (px). */
    readonly outerRadius: number;
    /** True se este arco é grande o bastante para label. */
    readonly hasLabel: boolean;
}

export interface SunburstLayout {
    readonly width: number;
    readonly height: number;
    readonly cx: number;
    readonly cy: number;
    readonly slices: ReadonlyArray<SunburstSlice>;
    /** Maior profundidade efetivamente desenhada. */
    readonly effectiveDepth: number;
    /** Total de slices (anel 0 não contado nos children). */
    readonly totalChildSlices: number;
}

// ============================================================================
// API
// ============================================================================

export function computeSunburstLayout(
    root: SunburstNode,
    cfg: SunburstConfig,
): SunburstLayout {
    const W = Math.max(120, cfg.width | 0);
    const H = Math.max(120, cfg.height | 0);
    const MARGIN = cfg.margin ?? 16;
    const MAX_DEPTH = Math.max(1, Math.min(4, cfg.maxDepth ?? 2));
    const LABEL_MIN = cfg.labelMinAngle ?? Math.PI / 60;

    const cx = W / 2;
    const cy = H / 2;
    const maxR = Math.min(W, H) / 2 - MARGIN;
    const ringWidth = cfg.ringWidth ?? Math.max(20, maxR / (MAX_DEPTH + 1));
    const centerR = ringWidth;

    const slices: SunburstSlice[] = [];

    slices.push(
        Object.freeze({
            node: root,
            depth: 0,
            startAngle: 0,
            endAngle: 2 * Math.PI,
            innerRadius: 0,
            outerRadius: centerR,
            hasLabel: true,
        }),
    );

    const children = (root.children || []) as ReadonlyArray<SunburstNode>;
    if (children.length === 0 || MAX_DEPTH < 1) {
        return Object.freeze({
            width: W,
            height: H,
            cx,
            cy,
            slices: Object.freeze(slices),
            effectiveDepth: 0,
            totalChildSlices: 0,
        });
    }

    const STEP_1 = (2 * Math.PI) / children.length;
    const ROTATION_OFFSET = -Math.PI / 2;
    let effectiveDepth = 1;
    let totalChildSlices = children.length;

    for (let i = 0; i < children.length; i++) {
        const child = children[i]!;
        const start = ROTATION_OFFSET + i * STEP_1;
        const end = ROTATION_OFFSET + (i + 1) * STEP_1;
        slices.push(
            Object.freeze({
                node: child,
                depth: 1,
                startAngle: start,
                endAngle: end,
                innerRadius: centerR,
                outerRadius: centerR + ringWidth,
                hasLabel: end - start >= LABEL_MIN,
            }),
        );

        if (MAX_DEPTH >= 2 && child.children && child.children.length > 0) {
            effectiveDepth = 2;
            const grandchildren = child.children as ReadonlyArray<SunburstNode>;
            const parentRange = end - start;
            const STEP_2 = parentRange / grandchildren.length;
            for (let j = 0; j < grandchildren.length; j++) {
                const gc = grandchildren[j]!;
                const gcStart = start + j * STEP_2;
                const gcEnd = start + (j + 1) * STEP_2;
                slices.push(
                    Object.freeze({
                        node: gc,
                        depth: 2,
                        startAngle: gcStart,
                        endAngle: gcEnd,
                        innerRadius: centerR + ringWidth,
                        outerRadius: centerR + 2 * ringWidth,
                        hasLabel: gcEnd - gcStart >= LABEL_MIN,
                    }),
                );
                totalChildSlices++;
            }
        }
    }

    return Object.freeze({
        width: W,
        height: H,
        cx,
        cy,
        slices: Object.freeze(slices),
        effectiveDepth,
        totalChildSlices,
    });
}

export function hitTestSlice(
    layout: SunburstLayout,
    px: number,
    py: number,
): SunburstSlice | null {
    const dx = px - layout.cx;
    const dy = py - layout.cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    for (const s of layout.slices) {
        if (r < s.innerRadius || r > s.outerRadius) continue;
        if (s.endAngle - s.startAngle >= 2 * Math.PI - 1e-9) return s;
        let a = angle;
        while (a < s.startAngle) a += 2 * Math.PI;
        if (a >= s.startAngle && a <= s.endAngle) return s;
    }
    return null;
}

export function sliceMidpoint(
    layout: SunburstLayout,
    slice: SunburstSlice,
): { x: number; y: number; angle: number } {
    const angle = (slice.startAngle + slice.endAngle) / 2;
    const r = (slice.innerRadius + slice.outerRadius) / 2;
    return {
        x: layout.cx + r * Math.cos(angle),
        y: layout.cy + r * Math.sin(angle),
        angle,
    };
}

// ============================================================================
// PALETA + SEVERITY (SPEC_SUNBURST_REDESIGN_001 Calvin 2026-06-06)
// ============================================================================

/**
 * Paleta canônica Tableau-10 estendida (WCAG 3:1, colorblind-safe).
 * Espelha symbology/datasetColors.ts — Stone et al. (Tableau, 2017) +
 * ColorBrewer Set3 extension.
 */
/** Mapping estável family → cor via paleta canônica de datasets. */
export function familyColor(family: string): string {
    if (!family) return '#94a3b8';
    return assignDatasetColor(family);
}

/** Cor de outline por severity (mirror complianceOverlay SEVERITY_COLORS). */
export function severityStrokeColor(sev: SliceSeverity): string | null {
    if (sev === 'intervention') return '#ef4444';
    if (sev === 'prevention') return '#fbbf24';
    if (sev === 'reference') return '#60a5fa';
    return null;
}

/** Severity rank para agregação (pai herda pior severity dos filhos). */
export function severityRank(sev: SliceSeverity): number {
    if (sev === 'intervention') return 4;
    if (sev === 'prevention') return 3;
    if (sev === 'reference') return 2;
    return 0;
}
