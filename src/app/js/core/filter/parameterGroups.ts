// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * FEAT-FILTER-RADAR-001 - Parameter groups for HUD 3D filter
 * 7 grupos canônicos alinhados com CONAMA 420/2009 e CETESB DD-256/2016.
 * Academic ref: CONAMA Resolução 420/2009 Anexo II, CETESB DD-256/2016.
 * @module core/filter/parameterGroups
 */

/**
 * 7 canonical parameter group identifiers.
 * SVOCs = Semi-Volatile Organic Compounds
 * VOCs  = Volatile Organic Compounds
 */
export const PARAMETER_GROUPS = {
    METALS: 'metals',
    SVOCS: 'svocs',
    VOCS: 'vocs',
    PESTICIDES: 'pesticides',
    INORGANICS: 'inorganics',
    PHYSICAL: 'physical',
    OTHER: 'other',
} as const;

export type ParameterGroup = (typeof PARAMETER_GROUPS)[keyof typeof PARAMETER_GROUPS];

/**
 * Mapa parâmetro (lowercase, sem acentos tolerados) → grupo.
 * Bilíngue PT/EN para compatibilidade com datasets CETESB e EPA.
 */
export const PARAMETER_TO_GROUP: Record<string, ParameterGroup> = {
    // Metals / Metais
    chumbo: PARAMETER_GROUPS.METALS,
    lead: PARAMETER_GROUPS.METALS,
    arsenio: PARAMETER_GROUPS.METALS,
    arsenico: PARAMETER_GROUPS.METALS,
    arsenic: PARAMETER_GROUPS.METALS,
    mercurio: PARAMETER_GROUPS.METALS,
    mercury: PARAMETER_GROUPS.METALS,
    cadmio: PARAMETER_GROUPS.METALS,
    cadmium: PARAMETER_GROUPS.METALS,
    cromo: PARAMETER_GROUPS.METALS,
    chromium: PARAMETER_GROUPS.METALS,
    zinco: PARAMETER_GROUPS.METALS,
    zinc: PARAMETER_GROUPS.METALS,
    niquel: PARAMETER_GROUPS.METALS,
    nickel: PARAMETER_GROUPS.METALS,
    cobre: PARAMETER_GROUPS.METALS,
    copper: PARAMETER_GROUPS.METALS,

    // SVOCs - Semi-Volatile Organic Compounds
    benzeno: PARAMETER_GROUPS.SVOCS,
    benzene: PARAMETER_GROUPS.SVOCS,
    tolueno: PARAMETER_GROUPS.SVOCS,
    toluene: PARAMETER_GROUPS.SVOCS,
    naftaleno: PARAMETER_GROUPS.SVOCS,
    naphthalene: PARAMETER_GROUPS.SVOCS,
    fenantreno: PARAMETER_GROUPS.SVOCS,
    phenanthrene: PARAMETER_GROUPS.SVOCS,
    antraceno: PARAMETER_GROUPS.SVOCS,
    anthracene: PARAMETER_GROUPS.SVOCS,
    pireno: PARAMETER_GROUPS.SVOCS,
    pyrene: PARAMETER_GROUPS.SVOCS,

    // VOCs - Volatile Organic Compounds
    tricloroetileno: PARAMETER_GROUPS.VOCS,
    trichloroethylene: PARAMETER_GROUPS.VOCS,
    tetracloroetileno: PARAMETER_GROUPS.VOCS,
    tetrachloroethylene: PARAMETER_GROUPS.VOCS,
    cloroformio: PARAMETER_GROUPS.VOCS,
    chloroform: PARAMETER_GROUPS.VOCS,
    diclorometano: PARAMETER_GROUPS.VOCS,
    dichloromethane: PARAMETER_GROUPS.VOCS,
    cloreto_vinila: PARAMETER_GROUPS.VOCS,
    vinyl_chloride: PARAMETER_GROUPS.VOCS,

    // Pesticides / Pesticidas
    ddt: PARAMETER_GROUPS.PESTICIDES,
    aldrin: PARAMETER_GROUPS.PESTICIDES,
    endrin: PARAMETER_GROUPS.PESTICIDES,
    lindano: PARAMETER_GROUPS.PESTICIDES,
    lindane: PARAMETER_GROUPS.PESTICIDES,
    glifosato: PARAMETER_GROUPS.PESTICIDES,
    glyphosate: PARAMETER_GROUPS.PESTICIDES,

    // Inorganics / Inorgânicos
    nitrato: PARAMETER_GROUPS.INORGANICS,
    nitrate: PARAMETER_GROUPS.INORGANICS,
    fosfato: PARAMETER_GROUPS.INORGANICS,
    phosphate: PARAMETER_GROUPS.INORGANICS,
    sulfato: PARAMETER_GROUPS.INORGANICS,
    sulfate: PARAMETER_GROUPS.INORGANICS,
    amonia: PARAMETER_GROUPS.INORGANICS,
    ammonia: PARAMETER_GROUPS.INORGANICS,
    cloreto: PARAMETER_GROUPS.INORGANICS,
    chloride: PARAMETER_GROUPS.INORGANICS,

    // Physical / Parâmetros Físicos
    ph: PARAMETER_GROUPS.PHYSICAL,
    temperatura: PARAMETER_GROUPS.PHYSICAL,
    temperature: PARAMETER_GROUPS.PHYSICAL,
    condutividade: PARAMETER_GROUPS.PHYSICAL,
    conductivity: PARAMETER_GROUPS.PHYSICAL,
    turbidez: PARAMETER_GROUPS.PHYSICAL,
    turbidity: PARAMETER_GROUPS.PHYSICAL,
    oxigenio_dissolvido: PARAMETER_GROUPS.PHYSICAL,
    dissolved_oxygen: PARAMETER_GROUPS.PHYSICAL,
    eh: PARAMETER_GROUPS.PHYSICAL,
    redox: PARAMETER_GROUPS.PHYSICAL,
};

/**
 * Classifica um parâmetro no seu grupo canônico.
 * Busca case-insensitive no mapa PARAMETER_TO_GROUP.
 * @param {string} parameter - nome do parâmetro (PT ou EN)
 * @returns {string} valor de PARAMETER_GROUPS
 */
export function classifyParameter(parameter: string): ParameterGroup {
    if (!parameter || typeof parameter !== 'string') return PARAMETER_GROUPS.OTHER;
    const key = parameter.toLowerCase().trim();
    return PARAMETER_TO_GROUP[key] ?? PARAMETER_GROUPS.OTHER;
}

/**
 * Agrupa array de observações por grupo de parâmetro.
 * Observações sem parâmetro reconhecido vão para 'other'.
 * @param {ReadonlyArray<{parameter?: string}> | null | undefined} observations
 * @returns {Map<string, Array<{parameter?: string}>>} chave = PARAMETER_GROUPS value
 */
export function groupObsByParameterGroup(
    observations: ReadonlyArray<{ parameter?: string }> | null | undefined,
): Map<string, Array<{ parameter?: string }>> {
    const map = new Map<string, Array<{ parameter?: string }>>();
    for (const obs of observations ?? []) {
        const group = classifyParameter(obs?.parameter ?? '');
        if (!map.has(group)) map.set(group, []);
        const arr = map.get(group);
        if (arr) arr.push(obs);
    }
    return map;
}