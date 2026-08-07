// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_FC10_DICTIONARY_PARAM_COUNT (claude - novaspec, 2026-06-02) —
 * paramAdapter consumindo RegistryCatalog para o dicionário de
 * parâmetros + unidades + substâncias químicas (CAS).
 *
 * Surfacа o dicionário REAL (não a afirmação do plano):
 *   - PARAMETERS (config/parameters.ts) — 73 entradas
 *   - UNITS (core/units/catalog.ts) — 63 unidades
 *   - SUBSTANCE_DATASET (core/chemistry/casDataset.ts) — 52 CAS
 *   - TOTAL: 188 (plano afirma 426 — delta documentado, Calvin decisão)
 *
 * Refs:
 *   - SPEC `docs/specs/frontier/SPEC_FC10_DICTIONARY_PARAM_COUNT.md`
 *   - Abstração: `docs/specs/frontier/SPEC_REGISTRY_CATALOG.md`
 *   - Script auditoria: `scripts/count-dictionary-params.mjs`
 *   - Plano §4.7: "426 parâmetros" (130 água + 121 solo + 61 ar + 55 biota + 48 saúde + 11 governança)
 */

import { openRegistryCatalog, type RegistryEntry } from './registryCatalog.js';
import { t } from '../i18n/translations.js';

export interface ParameterEntry {
    readonly id: string;
    readonly name: string;
    readonly category?: string;
    readonly defaultUnitId?: string;
    readonly type?: string;
}

export interface UnitEntry {
    readonly id: string;
    readonly label?: string;
    readonly dimension?: string;
}

export interface SubstanceEntry {
    readonly casNumber?: string;
    readonly cas?: string;
    readonly name?: string;
    readonly nameKey?: string;
    readonly category?: string;
}

/**
 * Adaptador para PARAMETERS. Group = category (chemical/physical/
 * contaminant/safety/hydrogeology/etc).
 */
export function parametersAdapter(
    params: ReadonlyArray<ParameterEntry> | null | undefined,
): RegistryEntry[] {
    if (!Array.isArray(params)) return [];
    const out: RegistryEntry[] = [];
    for (const p of params) {
        if (!p || typeof p.id !== 'string' || p.id.length === 0) continue;
        out.push({
            id: 'param:' + p.id,
            label: p.name || p.id,
            group: typeof p.category === 'string' && p.category ? p.category : 'misc',
            meta: {
                description: '',
                kind: 'parameter',
                defaultUnitId: p.defaultUnitId || '',
                type: p.type || '',
                module: 'config/parameters',
            },
            ref: 'CONFIG.PARAMETERS',
        });
    }
    return out;
}

/**
 * Adaptador para UNITS (catalog flat: Record<unitId, {label?, dimension?, ...}>).
 * Cada entry vira RegistryEntry com group derivado de meta.dimension.
 */
export function unitsAdapter(
    units: Record<string, any> | null | undefined,
): RegistryEntry[] {
    if (!units || typeof units !== 'object') return [];
    const out: RegistryEntry[] = [];
    for (const unitId of Object.keys(units)) {
        const u = units[unitId];
        if (!u || typeof u !== 'object') continue;
        const dimension = (typeof u.dimension === 'string' && u.dimension)
            || (typeof u.category === 'string' && u.category)
            || 'unit';
        out.push({
            id: 'unit:' + unitId,
            label: (u as any).label || (u as any).name || unitId,
            group: 'unit:' + dimension,
            meta: {
                description: `Unidade ${unitId}`,
                kind: 'unit',
                dimension,
                module: 'core/units/catalog',
            },
            ref: 'UNITS catalog',
        });
    }
    return out;
}

/**
 * Adaptador para SUBSTANCE_DATASET (CAS chemicals).
 */
export function substancesAdapter(
    substances: ReadonlyArray<SubstanceEntry> | null | undefined,
): RegistryEntry[] {
    if (!Array.isArray(substances)) return [];
    const out: RegistryEntry[] = [];
    for (const s of substances) {
        const cas = (s && (s.casNumber || s.cas)) || null;
        if (!cas || typeof cas !== 'string') continue;
        out.push({
            id: 'cas:' + cas,
            label: (s as any).name || cas,
            group: 'substance:' + ((s as any).category || 'misc'),
            meta: {
                description: `CAS ${cas}`,
                kind: 'substance',
                cas,
                module: 'core/chemistry/casDataset',
            },
            ref: 'CAS Registry',
        });
    }
    return out;
}

/**
 * Adapter unificado: combina PARAMETERS + UNITS + SUBSTANCES.
 */
export function paramDictionaryAdapter(opts: {
    parameters?: ReadonlyArray<ParameterEntry> | null;
    units?: Record<string, Record<string, any>> | null;
    substances?: ReadonlyArray<SubstanceEntry> | null;
} | null | undefined): RegistryEntry[] {
    if (!opts || typeof opts !== 'object') return [];
    const out: RegistryEntry[] = [];
    if (opts.parameters) out.push(...parametersAdapter(opts.parameters));
    if (opts.units) out.push(...unitsAdapter(opts.units));
    if (opts.substances) out.push(...substancesAdapter(opts.substances));
    return out;
}

/**
 * Abre catálogo unificado do dicionário.
 */
export async function openParamCatalog(): Promise<void> {
    try {
        // LOADING-PERF GAP-2: SAO é lazy. Antes, initSAO rodava no boot e empurrava
        // os parâmetros das matrizes (pm25 etc.) em CONFIG.PARAMETERS. Como agora é
        // lazy, garantimos o merge ANTES de listar o catálogo, senão o dicionário
        // apareceria sem os parâmetros SAO. Idempotente.
        await import('/js/core/sao/index.js' as any)
            .then((m: any) => m.ensureSAO?.())
            .catch((e: any) => console.debug('[paramCatalog] ensureSAO best-effort:', e?.message || e));
        const [paramsMod, unitsMod, substancesMod] = await Promise.all([
            import('/js/config/parameters.js' as any).catch(() => ({} as any)),
            import('/js/core/units/catalog.js' as any).catch(() => ({} as any)),
            import('/js/core/chemistry/casDataset.js' as any).catch(() => ({} as any)),
        ]) as any[];

        const entries = paramDictionaryAdapter({
            parameters: paramsMod?.PARAMETERS || [],
            units: unitsMod?.UNITS || {},
            substances: substancesMod?.SUBSTANCE_DATASET || [],
        });
        const title = (t ? t('paramCatalog.title') : '')
            || `Dicionário ECBT — Parâmetros + Unidades + Substâncias (${entries.length} entradas)`;
        openRegistryCatalog({
            entries,
            title,
            csvFilename: 'ecbt-dictionary',
        });
    }
    catch (e: any) {
        console.debug('[paramCatalog] open failed', e?.message || e);
    }
}
