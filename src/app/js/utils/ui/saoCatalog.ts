// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_FC07_SAO_ESH_MATRICES (claude - novaspec, 2026-06-02) —
 * saoAdapter consumindo RegistryCatalog para `core/sao`.
 *
 * Surfacа matrizes ESH (Environment, Safety & Health) — 9 compartimentos
 * ambientais (ar, água, solo, biota, humana, geotécnico, SR, climatologia,
 * resiliência) + capacidades risco/controle (risk heatmap 5×5,
 * hierarchy of controls effectiveness).
 *
 * Surfaca **2 níveis** no catálogo:
 *   1. MATRIZES (9) — cada compartimento ESH com nome/cor/ícone +
 *      contagem de subcategorias
 *   2. CAPABILITIES (computeRiskScore, classifyRiskBand, etc.) —
 *      ferramentas de avaliação de risco ocupacional
 *
 * RF1 (painel matriz 5×5) e RF3 (vínculo elemento/observação) ficam
 * para sessão dedicada de painel (requer wire UI + core/elements
 * + core/health integration). Catálogo cumpre descobribilidade.
 *
 * Refs:
 *   - SPEC `docs/specs/frontier/SPEC_FC07_SAO_ESH_MATRICES.md`
 *   - Abstração: `docs/specs/frontier/SPEC_REGISTRY_CATALOG.md`
 *   - Registries: core/sao/{matrices,riskHeatmapBuilder,hierarchyOfControls}
 *   - RAM 5×5 industry standard (probability × severity)
 *   - Hierarchy of Controls (NIOSH / ISO 45001)
 */

import { openRegistryCatalog, type RegistryEntry } from './registryCatalog.js';
import { t } from '../i18n/translations.js';

/**
 * Subset shape de SaoMatrix consumido pelo adapter.
 */
export interface SaoMatrixEntry {
    readonly id: string;
    readonly nameKey: string;
    readonly icon?: string;
    readonly color?: string;
    readonly subcategories?: ReadonlyArray<{ id: string; nameKey: string }>;
}

/**
 * Adaptador puro: SAO_MATRICES Record → RegistryEntry[].
 * Cada matriz vira uma entry. Subcategorias contadas em meta.
 *
 * Mapeamento:
 *   - id: matrix.id (ar/agua/solo/biota/humana/...)
 *   - label: matrix.id (i18n nameKey deixado em meta para caller resolver)
 *   - group: 'matrix' (matrizes ESH)
 *   - meta: {nameKey, icon, color, subcategoryCount, subcategoryIds}
 *   - ref: 'ESH (Environment, Safety & Health) — Pilar ocupacional ECBT'
 */
export function saoMatrixAdapter(
    matrices: Record<string, SaoMatrixEntry> | null | undefined,
): RegistryEntry[] {
    if (!matrices || typeof matrices !== 'object') return [];
    const out: RegistryEntry[] = [];
    for (const id of Object.keys(matrices)) {
        const m = matrices[id];
        if (!m || typeof m !== 'object' || typeof m.id !== 'string') continue;
        const subs = Array.isArray(m.subcategories) ? m.subcategories : [];
        out.push({
            id: m.id,
            label: m.id,
            group: 'matrix',
            meta: {
                nameKey: typeof m.nameKey === 'string' ? m.nameKey : '',
                icon: typeof m.icon === 'string' ? m.icon : '',
                color: typeof m.color === 'string' ? m.color : '',
                subcategoryCount: subs.length,
                subcategoryIds: subs.map((s) => s.id).slice(),
            },
            ref: 'ESH — Pilar ocupacional ECBT (tese unificação ambiental+ocupacional)',
        });
    }
    return out;
}

/**
 * Metadado curado por capability de risco/controle. Não vive nos
 * registries (são funções pure-logic) — adapter enriquece.
 */
export const SAO_CAPABILITY_META = Object.freeze({
    computeRiskScore: Object.freeze({
        group: 'risk',
        description: 'Risk score = severity × likelihood (RAM 5×5 industry standard)',
        ref: 'Risk Assessment Matrix — NIOSH / ISO 45001',
    }),
    classifyRiskBand: Object.freeze({
        group: 'risk',
        description: 'Classifica risk score em low/medium/high/extreme (faixas RAM)',
        ref: 'RAM 5×5 — Risk Assessment Matrix industry standard',
    }),
    buildRiskMatrix: Object.freeze({
        group: 'risk',
        description: 'Constrói matriz 5×5 com contagem e total de risk score por célula',
        ref: 'RAM 5×5',
    }),
    findHotCells: Object.freeze({
        group: 'risk',
        description: 'Localiza células de risco alto/extremo na matriz (priorização ações)',
        ref: 'RAM 5×5',
    }),
    summarizeHeatmap: Object.freeze({
        group: 'risk',
        description: 'Sumário agregado do heatmap (count by band, top hotspots, % cobertura)',
        ref: 'RAM 5×5',
    }),
    evaluateControlSet: Object.freeze({
        group: 'control',
        description: 'Avalia conjunto de controles ESH segundo Hierarchy of Controls (Elimination → Substitution → Engineering → Admin → PPE)',
        ref: 'NIOSH Hierarchy of Controls / ISO 45001',
    }),
    recommendUpgrades: Object.freeze({
        group: 'control',
        description: 'Recomenda upgrades de controle (sobe na hierarquia) para reduzir risco residual',
        ref: 'NIOSH Hierarchy of Controls',
    }),
    costBenefitOfControl: Object.freeze({
        group: 'control',
        description: 'Análise custo-benefício por controle (ROI redução de risco vs custo implementação)',
        ref: 'NIOSH / ISO 45001',
    }),
});

/**
 * Adaptador para capacidades risco/controle.
 */
export function saoCapabilityAdapter(
    capabilities: Record<string, unknown> | null | undefined,
): RegistryEntry[] {
    if (!capabilities || typeof capabilities !== 'object') return [];
    const out: RegistryEntry[] = [];
    for (const key of Object.keys(capabilities)) {
        if (typeof key !== 'string' || key.length === 0) continue;
        const meta = (SAO_CAPABILITY_META as any)[key] || {
            group: 'misc',
            description: '',
            ref: '',
        };
        const cap = capabilities[key];
        out.push({
            id: key,
            label: key,
            group: meta.group,
            meta: {
                description: meta.description || '',
                callable: typeof cap === 'function',
                module: meta.group === 'control' ? 'core/sao/hierarchyOfControls' : 'core/sao/riskHeatmapBuilder',
            },
            ref: meta.ref || '',
        });
    }
    return out;
}

/**
 * Adapter unificado: combina matrizes + capabilities num único índice.
 */
export function saoAdapter(opts: {
    matrices?: Record<string, SaoMatrixEntry> | null | undefined;
    capabilities?: Record<string, unknown> | null | undefined;
} | null | undefined): RegistryEntry[] {
    if (!opts || typeof opts !== 'object') return [];
    const out: RegistryEntry[] = [];
    if (opts.matrices) out.push(...saoMatrixAdapter(opts.matrices));
    if (opts.capabilities) out.push(...saoCapabilityAdapter(opts.capabilities));
    return out;
}

/**
 * Abre catálogo SAO/ESH na UI. Lazy-load do registry.
 */
export async function openSaoCatalog(): Promise<void> {
    try {
        const [matricesMod, heatmapMod, controlsMod] = await Promise.all([
            import('/js/core/sao/matrices.js' as any).catch(() => ({} as any)),
            import('/js/core/sao/riskHeatmapBuilder.js' as any).catch(() => ({} as any)),
            import('/js/core/sao/hierarchyOfControls.js' as any).catch(() => ({} as any)),
        ]) as any[];

        const matrices: Record<string, SaoMatrixEntry> = matricesMod?.SAO_MATRICES || {};
        const capabilities: Record<string, unknown> = {};
        for (const k of ['computeRiskScore', 'classifyRiskBand', 'buildRiskMatrix', 'findHotCells', 'summarizeHeatmap']) {
            if (typeof heatmapMod?.[k] === 'function') capabilities[k] = heatmapMod[k];
        }
        for (const k of ['evaluateControlSet', 'recommendUpgrades', 'costBenefitOfControl']) {
            if (typeof controlsMod?.[k] === 'function') capabilities[k] = controlsMod[k];
        }
        const entries = saoAdapter({ matrices, capabilities });
        const title = (t ? t('saoCatalog.title') : '')
            || `Catálogo SAO — Matrizes ESH + Risco/Controle (${entries.length} entradas)`;
        openRegistryCatalog({
            entries,
            title,
            csvFilename: 'sao-esh-catalog',
        });
    }
    catch (e: any) {
        console.debug('[saoCatalog] open failed', e?.message || e);
    }
}
