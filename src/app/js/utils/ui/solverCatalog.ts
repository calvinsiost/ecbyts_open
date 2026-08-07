// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_FC03_SOLVER_CATALOG (claude - novaspec, 2026-06-02) —
 * solverAdapter consumindo RegistryCatalog para `core/simulation`.
 *
 * Catálogo navegável dos solvers numéricos REGISTRADOS no executor
 * (Gaussian Plume, SCS-CN, USLE/RUSLE, Theis-Thiem, Green-Ampt,
 * Manning — 6 atualmente). Solvers pure-logic adicionais em
 * `core/simulation/solvers/` (30 arquivos) NÃO estão no registry
 * executor — seriam FC futuro (catálogo científico expandido).
 *
 * Adaptador FINO (~30 LOC): mapeia SimulationModel → RegistryEntry.
 *
 * Refs:
 *   - SPEC `docs/specs/frontier/SPEC_FC03_SOLVER_CATALOG.md`
 *   - Abstração: `docs/specs/frontier/SPEC_REGISTRY_CATALOG.md`
 *   - Registry: `core/simulation/registry.ts` (MODELS + getAllSimulationModels)
 *   - Tests numéricos: `tests/simulation-numerical.test.mjs` (41 testes)
 */

import { openRegistryCatalog, type RegistryEntry } from './registryCatalog.js';
import { t } from '../i18n/translations.js';

/**
 * Shape do model registrado no executor de simulação. Subset do que
 * `core/simulation/registry.ts` expõe (campos consumidos pelo catálogo).
 */
export interface SimulationModelEntry {
    readonly id: string;
    readonly name: string;
    readonly version?: string;
    readonly domain: string;
    readonly fidelityLevel?: number;
    readonly description?: string;
    readonly license?: { spdx?: string; name?: string; badge?: string };
    readonly source?: { type?: string; entry?: string; fn?: string };
    readonly inputs?: ReadonlyArray<{ id: string; label?: string; type?: string }>;
    readonly outputs?: ReadonlyArray<{ id: string; type?: string; unit?: string }>;
}

/**
 * Adaptador puro: SimulationModelEntry[] → RegistryEntry[].
 * Conforme contrato `RegistryAdapter<SimulationModelEntry[]>`.
 *
 * Mapeamento:
 *   - id: model.id (slug do registry — único por design)
 *   - label: model.name (humanizado)
 *   - group: model.domain (atmospheric/watershed/sediment/hydraulic/...)
 *   - meta: {description, version, fidelityLevel, license, source,
 *           inputCount, outputCount} para preview
 *   - ref: license.spdx (procedência citável; SPDX = identifier canônico)
 *          ou source.entry (path do solver implementação)
 */
export function solverAdapter(
    registry: ReadonlyArray<SimulationModelEntry>,
): RegistryEntry[] {
    if (!Array.isArray(registry)) return [];
    const out: RegistryEntry[] = [];
    for (const model of registry) {
        if (!model || typeof model.id !== 'string' || model.id.length === 0) {
            continue;
        }
        const inputs = Array.isArray(model.inputs) ? model.inputs : [];
        const outputs = Array.isArray(model.outputs) ? model.outputs : [];
        const ref = (model.license?.spdx && typeof model.license.spdx === 'string')
            ? model.license.spdx
            : (model.source?.entry && typeof model.source.entry === 'string'
                ? model.source.entry
                : '');
        out.push({
            id: model.id,
            label: typeof model.name === 'string' ? model.name : model.id,
            group: typeof model.domain === 'string' && model.domain.length > 0
                ? model.domain
                : 'misc',
            meta: {
                description: typeof model.description === 'string' ? model.description : '',
                version: typeof model.version === 'string' ? model.version : '',
                fidelityLevel: typeof model.fidelityLevel === 'number' ? model.fidelityLevel : 0,
                license: model.license?.name || '',
                source: model.source?.entry || '',
                inputCount: inputs.length,
                outputCount: outputs.length,
            },
            ref,
        });
    }
    return out;
}

/**
 * Abre catálogo de solvers na UI. Lazy-load do registry.
 *
 * RF4 ("Rodar solver" do catálogo) fica como Should — pode ser
 * acoplado em sessão futura via opts.onOpen passando para o
 * executor de simulação. Atualmente catálogo é descobribilidade pura.
 */
export async function openSolverCatalog(): Promise<void> {
    try {
        const mod = (await import('/js/core/simulation/registry.js' as any)) as any;
        const listFn = mod?.getAllSimulationModels;
        const registry: ReadonlyArray<SimulationModelEntry> = typeof listFn === 'function'
            ? listFn()
            : [];
        const entries = solverAdapter(registry);
        const title = (t ? t('solverCatalog.title') : '')
            || `Catálogo de solvers numéricos (${entries.length})`;
        openRegistryCatalog({
            entries,
            title,
            csvFilename: 'solver-models',
        });
    }
    catch (e: any) {
        console.debug('[solverCatalog] open failed', e?.message || e);
    }
}
