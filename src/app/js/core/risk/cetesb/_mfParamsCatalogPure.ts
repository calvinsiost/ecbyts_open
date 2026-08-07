// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// CETESB-RISK-001 UI-C — Catálogo metadata UI dos 27 parâmetros do Meio Físico.
//
// Pure-logic separado de `mfDefaults.ts` (que tem os VALORES numéricos por cenário).
// Este módulo fornece o metadata necessário para renderizar o EDITOR:
//   - label PT
//   - unidade física
//   - grupo (4 seções: construção / atenuação / solo / fonte)
//   - faixa válida (min/max) + step do input
//   - descrição curta para tooltip
//
// Nenhum import de DOM/THREE/IDB — caller (UI) usa para construir form.
//
// PRIOR ART:
//   - src/app/js/core/risk/cetesb/mfDefaults.ts (MF_DEFAULTS por cenário,
//     interface MfParams com 27 campos, applyMfOverrides)
//
// SPEC: docs/specs/features/SPEC_CETESB_RISK_ASSESSMENT.md UI-C

import type { MfParams } from './mfDefaults.js';

// ===========================================================================
// Tipos
// ===========================================================================

export type MfParamGroup =
    | 'construction' // edificações (Ab, Lb, Lcrk, eta, thetaAcrk, thetaWcrk, Xcrk, Zcrk)
    | 'attenuation' // atenuação + emissão (alpha, ER, Pa, tau, Uar, deltaAr, Kand)
    | 'soil' // solo + zona não saturada (hv, Kv, Ls, Lss, dss, thetaAs, thetaT, thetaWs, rhoS)
    | 'source'; // fonte geometria (A, Sd, Sw)

export interface MfParamDef {
    readonly key: keyof MfParams;
    readonly label: string;
    readonly unit: string;
    readonly group: MfParamGroup;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly description: string;
}

export interface ValidateMfPatchResult {
    readonly ok: boolean;
    readonly accepted: number;
    readonly rejected: number;
    readonly warnings: ReadonlyArray<string>;
    readonly patch: Partial<MfParams>;
}

// ===========================================================================
// Catálogo — 27 parâmetros ordenados por grupo
// ===========================================================================

export const MF_PARAM_DEFS: ReadonlyArray<MfParamDef> = Object.freeze([
    // --- Construção (edificações) ---
    Object.freeze({
        key: 'Ab' as const,
        label: 'Ab — Área das fundações',
        unit: 'cm²',
        group: 'construction' as const,
        min: 1_000,
        max: 1e7,
        step: 1_000,
        description: 'Área total da projeção das fundações sobre o terreno.',
    }),
    Object.freeze({
        key: 'Lb' as const,
        label: 'Lb — Pé direito',
        unit: 'cm',
        group: 'construction' as const,
        min: 100,
        max: 1_000,
        step: 10,
        description: 'Altura interna da edificação (pé direito).',
    }),
    Object.freeze({
        key: 'Lcrk' as const,
        label: 'Lcrk — Espessura das fundações',
        unit: 'cm',
        group: 'construction' as const,
        min: 1,
        max: 100,
        step: 1,
        description: 'Espessura das paredes/fundações através das quais o vapor migra.',
    }),
    Object.freeze({
        key: 'eta' as const,
        label: 'η — Fração de rachaduras',
        unit: 'cm²/cm²',
        group: 'construction' as const,
        min: 1e-5,
        max: 1.0,
        step: 0.001,
        description: 'Fração da área das fundações ocupada por fendas/rachaduras (ASTM 2001).',
    }),
    Object.freeze({
        key: 'thetaAcrk' as const,
        label: 'θacrk — Umidade ar nas fundações',
        unit: 'cm³/cm³',
        group: 'construction' as const,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        description: 'Conteúdo volumétrico de ar nas fundações.',
    }),
    Object.freeze({
        key: 'thetaWcrk' as const,
        label: 'θwcrk — Umidade água nas fundações',
        unit: 'cm³/cm³',
        group: 'construction' as const,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        description: 'Conteúdo volumétrico de água nas fundações.',
    }),
    Object.freeze({
        key: 'Xcrk' as const,
        label: 'Xcrk — Perímetro das fundações',
        unit: 'cm',
        group: 'construction' as const,
        min: 100,
        max: 1e5,
        step: 10,
        description: 'Perímetro total das fundações em contato com o solo.',
    }),
    Object.freeze({
        key: 'Zcrk' as const,
        label: 'Zcrk — Profundidade da base',
        unit: 'cm',
        group: 'construction' as const,
        min: 0,
        max: 500,
        step: 1,
        description: 'Profundidade da base das fundações abaixo da superfície.',
    }),

    // --- Atenuação + Emissão ---
    Object.freeze({
        key: 'alpha' as const,
        label: 'α — Fator de atenuação',
        unit: 'adim',
        group: 'attenuation' as const,
        min: 1e-6,
        max: 1.0,
        step: 0.001,
        description: 'Fator de atenuação vapor (USEPA 2015).',
    }),
    Object.freeze({
        key: 'ER' as const,
        label: 'ER — Troca de ar',
        unit: '1/s',
        group: 'attenuation' as const,
        min: 1e-6,
        max: 1.0,
        step: 1e-5,
        description: 'Razão de troca de ar em espaços fechados.',
    }),
    Object.freeze({
        key: 'Pa' as const,
        label: 'Pa — Emissão de partículas',
        unit: 'g/cm²·s',
        group: 'attenuation' as const,
        min: 1e-18,
        max: 1e-8,
        step: 1e-15,
        description: 'Taxa de emissão de partículas do solo.',
    }),
    Object.freeze({
        key: 'tau' as const,
        label: 'τ — Tempo médio de fluxo',
        unit: 's',
        group: 'attenuation' as const,
        min: 1e6,
        max: 1e11,
        step: 1e6,
        description: 'Tempo médio do fluxo de vapor a partir da fonte.',
    }),
    Object.freeze({
        key: 'Uar' as const,
        label: 'Uar — Velocidade do ar',
        unit: 'cm/s',
        group: 'attenuation' as const,
        min: 1,
        max: 1_000,
        step: 1,
        description: 'Velocidade do ar na zona de respiração (ambiente aberto).',
    }),
    Object.freeze({
        key: 'deltaAr' as const,
        label: 'δar — Altura zona de mistura',
        unit: 'cm',
        group: 'attenuation' as const,
        min: 10,
        max: 10_000,
        step: 10,
        description: 'Altura da zona de mistura em ambiente aberto.',
    }),
    Object.freeze({
        key: 'Kand' as const,
        label: 'Kand — Fator de Andelman',
        unit: 'adim',
        group: 'attenuation' as const,
        min: 0,
        max: 10,
        step: 0.01,
        description: 'Fator de volatilização de Andelman (USEPA 1991b).',
    }),

    // --- Solo + Zona Não Saturada ---
    Object.freeze({
        key: 'hv' as const,
        label: 'hv — Espessura da ZNS',
        unit: 'cm',
        group: 'soil' as const,
        min: 10,
        max: 10_000,
        step: 10,
        description: 'Espessura da zona não saturada (vadose).',
    }),
    Object.freeze({
        key: 'Kv' as const,
        label: 'Kv — Permeabilidade ao vapor',
        unit: 'cm²',
        group: 'soil' as const,
        min: 1e-12,
        max: 1e-3,
        step: 1e-10,
        description: 'Permeabilidade do solo ao vapor.',
    }),
    Object.freeze({
        key: 'Ls' as const,
        label: 'Ls — Espessura solo superficial',
        unit: 'cm',
        group: 'soil' as const,
        min: 1,
        max: 1_000,
        step: 1,
        description: 'Espessura do solo superficial impactado.',
    }),
    Object.freeze({
        key: 'Lss' as const,
        label: 'Lss — Topo da fonte subsuperficial',
        unit: 'cm',
        group: 'soil' as const,
        min: 0,
        max: 10_000,
        step: 1,
        description: 'Profundidade do topo da fonte no solo subsuperficial.',
    }),
    Object.freeze({
        key: 'dss' as const,
        label: 'dss — Espessura solo subsuperficial',
        unit: 'cm',
        group: 'soil' as const,
        min: 1,
        max: 10_000,
        step: 1,
        description: 'Espessura do solo subsuperficial impactado.',
    }),
    Object.freeze({
        key: 'thetaAs' as const,
        label: 'θas — Umidade ar na ZNS',
        unit: 'cm³/cm³',
        group: 'soil' as const,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        description: 'Conteúdo volumétrico de ar na zona não saturada.',
    }),
    Object.freeze({
        key: 'thetaT' as const,
        label: 'θT — Porosidade total',
        unit: 'cm³/cm³',
        group: 'soil' as const,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        description: 'Porosidade total do solo.',
    }),
    Object.freeze({
        key: 'thetaWs' as const,
        label: 'θws — Umidade água na ZNS',
        unit: 'cm³/cm³',
        group: 'soil' as const,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        description: 'Conteúdo volumétrico de água na zona não saturada.',
    }),
    Object.freeze({
        key: 'rhoS' as const,
        label: 'ρs — Densidade do solo',
        unit: 'g/cm³',
        group: 'soil' as const,
        min: 0.5,
        max: 3.0,
        step: 0.01,
        description: 'Densidade aparente do solo (g/cm³).',
    }),

    // --- Fonte (geometria) ---
    Object.freeze({
        key: 'A' as const,
        label: 'A — Área da fonte',
        unit: 'cm²',
        group: 'source' as const,
        min: 100,
        max: 1e9,
        step: 100,
        description: 'Área total da fonte de contaminação no plano horizontal.',
    }),
    Object.freeze({
        key: 'Sd' as const,
        label: 'Sd — Espessura na água sub.',
        unit: 'cm',
        group: 'source' as const,
        min: 1,
        max: 10_000,
        step: 1,
        description: 'Espessura da fonte na água subterrânea.',
    }),
    Object.freeze({
        key: 'Sw' as const,
        label: 'Sw — Largura na água sub.',
        unit: 'cm',
        group: 'source' as const,
        min: 1,
        max: 100_000,
        step: 1,
        description: 'Largura da fonte transversal ao fluxo.',
    }),
]) as ReadonlyArray<MfParamDef>;

// Sanidade estrutural: garante 27 entradas e chaves únicas
const KEY_INDEX = (() => {
    const map = new Map<keyof MfParams, MfParamDef>();
    for (const def of MF_PARAM_DEFS) {
        map.set(def.key, def);
    }
    return map;
})();

// ===========================================================================
// Funções de seleção
// ===========================================================================

/** Retorna todos os defs do grupo, na ordem do catálogo. */
export function getParamsForGroup(group: MfParamGroup): ReadonlyArray<MfParamDef> {
    return Object.freeze(MF_PARAM_DEFS.filter((d) => d.group === group));
}

/** Retorna o def de um param específico (undefined se não existe). */
export function getParamDef(key: keyof MfParams): MfParamDef | undefined {
    return KEY_INDEX.get(key);
}

/** Lista os 4 grupos canônicos na ordem de exibição. */
export const MF_GROUP_ORDER: ReadonlyArray<MfParamGroup> = Object.freeze([
    'construction',
    'attenuation',
    'soil',
    'source',
]) as ReadonlyArray<MfParamGroup>;

/** Label legível do grupo (para tab/section header). */
export function groupLabel(group: MfParamGroup): string {
    if (group === 'construction') return 'Construção (edificações)';
    if (group === 'attenuation') return 'Atenuação + Emissão';
    if (group === 'soil') return 'Solo + Zona Não Saturada';
    if (group === 'source') return 'Fonte (geometria)';
    return group;
}

// ===========================================================================
// Validação de patch
// ===========================================================================

/**
 * Valida um patch parcial de MfParams contra o catálogo.
 * - Aceita números finitos dentro de [min, max] do def.
 * - Rejeita NaN, Infinity, valores fora da faixa, ou chaves desconhecidas.
 * - Nunca throws.
 */
export function validateMfPatch(patch: unknown): ValidateMfPatchResult {
    const empty = Object.freeze({
        ok: false,
        accepted: 0,
        rejected: 0,
        warnings: Object.freeze<string[]>([]),
        patch: Object.freeze({} as Partial<MfParams>),
    });

    if (patch === null || typeof patch !== 'object') {
        return Object.freeze({ ...empty, warnings: Object.freeze(['patch deve ser objeto']) });
    }

    const accepted: Partial<MfParams> = {};
    const warnings: string[] = [];
    let acceptedCount = 0;
    let rejectedCount = 0;

    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
        const def = KEY_INDEX.get(k as keyof MfParams);
        if (!def) {
            rejectedCount++;
            warnings.push(`chave desconhecida: "${k}"`);
            continue;
        }
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            rejectedCount++;
            warnings.push(`${k}: valor não-numérico ou NaN/Infinity`);
            continue;
        }
        if (v < def.min || v > def.max) {
            rejectedCount++;
            warnings.push(`${k}: ${v} fora da faixa [${def.min}, ${def.max}]`);
            continue;
        }
        (accepted as Record<keyof MfParams, number>)[def.key] = v;
        acceptedCount++;
    }

    return Object.freeze({
        ok: acceptedCount > 0,
        accepted: acceptedCount,
        rejected: rejectedCount,
        warnings: Object.freeze(warnings),
        patch: Object.freeze(accepted),
    });
}

/** Metadata pública para auditoria. */
export const MF_PARAMS_CATALOG_META = Object.freeze({
    totalParams: MF_PARAM_DEFS.length,
    groupCount: MF_GROUP_ORDER.length,
    paramsPerGroup: Object.freeze({
        construction: MF_PARAM_DEFS.filter((d) => d.group === 'construction').length,
        attenuation: MF_PARAM_DEFS.filter((d) => d.group === 'attenuation').length,
        soil: MF_PARAM_DEFS.filter((d) => d.group === 'soil').length,
        source: MF_PARAM_DEFS.filter((d) => d.group === 'source').length,
    }),
    source: 'CETESB DD 103/2007/C/E v4.00 — Anexo B (mar/2026)',
});
