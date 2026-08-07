// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   TAXONOMY BRIDGE — MOD-LIB-MIG-001 consumers wire (taxonomy)
   Calvin 2026-06-11 "seguir".

   Converte field_meta declarations dos library modules (registry S4)
   em TaxonomyDefinitions e registra via registerTaxonomy — o caminho
   READY do M2 contract. Resultado: os campos NR-15/CONAMA/ABNT dos
   manifests aparecem no taxonomyPicker como taxonomias ativáveis,
   adicionando campos auxiliares aos elementos das famílias mapeadas.

   Mapeamento FieldDef:
   - kind 'number' + range 'a-b'  → type 'number' + min/max
   - allowed 'x|y|z'              → type 'enum' + options
   - kind 'string'                → type 'string'
   - unit/regulation              → formatHint (exibido na UI)

   Famílias-alvo por módulo: mapa estático auditável (fallback
   ['generic']). Declarativo fim-a-fim — zero código executável.
   ================================================================ */

import { getRegisteredFieldMetaByModule } from './registry.js';
import { registerTaxonomy } from '../taxonomy/manager.js';

/**
 * Famílias-alvo por module_id. Auditável e estático de propósito —
 * módulos novos sem entrada caem em ['generic'].
 */
const MODULE_FAMILIES: Record<string, ReadonlyArray<string>> = {
    'builtin.field-meta.ohs': ['individual', 'sample'],
    'builtin.field-meta.hydromet': ['tank'],
    'builtin.field-meta.geology': ['stratum', 'fault', 'well'],
    'builtin.field-meta.hydrogeology': ['well'],
    'builtin.field-meta.air-quality': ['emission_source', 'atmosphere', 'sensor'],
    'builtin.field-meta.water-quality': ['river', 'lake', 'spring'],
    'builtin.field-meta.soil': ['sample', 'boundary', 'area'],
    'builtin.field-meta.waste': ['waste_stream'],
    'builtin.field-meta.noise': ['sensor', 'emission_source'],
    'builtin.field-meta.ghg': ['emission_source'],
    // Wave 4
    'builtin.field-meta.dam-safety': ['dam'],
    'builtin.field-meta.mining': ['pit'],
    'builtin.field-meta.sensors': ['sensor'],
    'builtin.field-meta.remediation': ['plume', 'area'],
    'builtin.field-meta.licensing': ['boundary'],
    'builtin.field-meta.photolog': ['generic'],
    // Wave 5
    'builtin.field-meta.wells': ['well'],
    'builtin.field-meta.campaigns': ['generic'],
    'builtin.field-meta.biotic': ['habitat'],
    'builtin.field-meta.erosion': ['area'],
    'builtin.field-meta.effluents': ['effluent_point'],
    'builtin.field-meta.tanks-storage': ['tank'],
    'builtin.field-meta.transport': ['vehicle', 'route_flow'],
    'builtin.field-meta.health-clinical': ['individual'],
    'builtin.field-meta.weather': ['atmosphere', 'sensor'],
    'builtin.field-meta.infrastructure': ['building', 'infra_linear'],
    'builtin.field-meta.stratigraphy': ['stratum', 'well'],
    'builtin.field-meta.community': ['intangible'],
};

interface BridgeFieldDef {
    id: string;
    type: 'string' | 'number' | 'enum';
    options?: ReadonlyArray<{ value: string }>;
    min?: number;
    max?: number;
    formatHint?: string;
}

/**
 * Map one field_meta item declarado → FieldDef da taxonomy.
 * Pure + defensivo: item sem id válido retorna null (skip).
 */
export function mapFieldMetaToFieldDef(item: Record<string, unknown>): BridgeFieldDef | null {
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) return null;
    const allowed = typeof item.allowed === 'string' ? item.allowed : '';
    const kind = typeof item.kind === 'string' ? item.kind : 'string';
    const hintParts: string[] = [];
    if (typeof item.unit === 'string') hintParts.push(item.unit);
    if (typeof item.regulation === 'string') hintParts.push(item.regulation);
    const out: BridgeFieldDef = {
        id,
        type: allowed ? 'enum' : kind === 'number' ? 'number' : 'string',
    };
    if (allowed) {
        out.options = Object.freeze(
            allowed.split('|').map((v) => ({ value: v.trim() })).filter((o) => o.value.length > 0),
        );
    }
    if (out.type === 'number' && typeof item.range === 'string') {
        const m = item.range.match(/^(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)$/);
        if (m && m[1] !== undefined && m[2] !== undefined) {
            out.min = Number(m[1]);
            out.max = Number(m[2]);
        }
    }
    if (hintParts.length > 0) out.formatHint = hintParts.join(' · ');
    return out;
}

/**
 * Build the TaxonomyDefinition for one library module.
 * Exported para teste unitário do shape.
 */
export function buildTaxonomyFromModule(mod: {
    module_id: string;
    module_name: string;
    items: ReadonlyArray<Record<string, unknown>>;
}): Record<string, unknown> | null {
    const fields = mod.items
        .map((it) => mapFieldMetaToFieldDef(it))
        .filter((f): f is BridgeFieldDef => f !== null);
    if (fields.length === 0) return null;
    return {
        id: mod.module_id,
        name: mod.module_name,
        families: MODULE_FAMILIES[mod.module_id] || ['generic'],
        fieldSections: [{ id: 'library-fields', fields }],
    };
}

export interface TaxonomySyncResult {
    registered: number;
    skipped: number;
    perModule: ReadonlyArray<{ module_id: string; registered: boolean }>;
}

/**
 * Sync all library field_meta modules into the taxonomy registry.
 * Idempotent — registerTaxonomy substitui por id. Chamado em main.ts
 * logo após seedBuiltinLibraryModules().
 */
export function syncLibraryFieldMetaToTaxonomies(): TaxonomySyncResult {
    const modules = getRegisteredFieldMetaByModule();
    const perModule: { module_id: string; registered: boolean }[] = [];
    let registered = 0;
    let skipped = 0;
    for (const mod of modules) {
        const def = buildTaxonomyFromModule(mod);
        let ok = false;
        if (def) {
            try {
                ok = registerTaxonomy(def, mod.module_id) === true;
            } catch (e: any) {
                console.debug('[taxonomyBridge]', mod.module_id, e?.message || e);
            }
        }
        perModule.push({ module_id: mod.module_id, registered: ok });
        if (ok) registered++;
        else skipped++;
    }
    return Object.freeze({ registered, skipped, perModule: Object.freeze(perModule) });
}
