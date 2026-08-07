// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   RANDOM-COV-001 F1 (RF-3) — Mapa parameterId → CAS (pure-logic).

   O gerador random produz observações de contaminantes com `parameterId`
   (benzene, toluene, ...) mas SEM número CAS. O motor de risco CETESB
   (core/risk/cetesb) busca a toxicologia POR CAS — logo, sem CAS, o risco
   não roda sobre dados sintéticos.

   Este módulo resolve o CAS canônico de cada parameterId de contaminante que
   o gerador usa. Parâmetros AGREGADOS / de classe (TPH, BTEX somatório, VOC) e
   parâmetros de qualidade de água (BOD/COD/TSS) NÃO têm CAS único → retornam null.

   ADR A4 (single source of truth): os valores de CAS aqui DEVEM coincidir com
   `core/chemistry/casDataset.ts` (SUBSTANCE_DATASET). O teste
   `tests/random-cas-map-pure.test.mjs` cruza cada CAS contra o dataset canônico
   para impedir drift. Pure: sem DOM, sem rede, determinístico.
   ================================================================ */

/**
 * Mapa canônico parameterId → CAS para os contaminantes de SUBSTÂNCIA ÚNICA que
 * o gerador random emite. CAS validados contra core/chemistry/casDataset.ts.
 */
export const CONTAMINANT_CAS: Readonly<Record<string, string>> = Object.freeze({
    benzene: '71-43-2',
    toluene: '108-88-3',
    ethylbenzene: '100-41-4',
    xylenes: '1330-20-7',
    naphthalene: '91-20-3',
});

/**
 * Parâmetros AGREGADOS / de classe / de qualidade de água que NÃO possuem um CAS
 * único. Listados explicitamente para que o resolver distinga "sem CAS por
 * natureza" de "parameterId desconhecido".
 */
export const NON_CAS_PARAMETERS: ReadonlySet<string> = Object.freeze(
    new Set(['tph', 'btex', 'voc', 'bod', 'cod', 'tss']),
) as ReadonlySet<string>;

/**
 * Resolve o CAS de um parameterId de contaminante.
 * @returns CAS string para substância única; `null` para agregado/qualidade-água
 *          OU parameterId desconhecido (caller decide se loga desconhecido).
 */
export function casForParameterId(parameterId: unknown): string | null {
    if (typeof parameterId !== 'string') return null;
    const key = parameterId.trim().toLowerCase();
    if (key in CONTAMINANT_CAS) return CONTAMINANT_CAS[key]!;
    return null;
}

/**
 * True quando o parameterId é um agregado/classe/qualidade-água conhecido (sem CAS
 * por natureza) — distingue de parameterId simplesmente desconhecido.
 */
export function isAggregateParameter(parameterId: unknown): boolean {
    if (typeof parameterId !== 'string') return false;
    return NON_CAS_PARAMETERS.has(parameterId.trim().toLowerCase());
}

/**
 * Classifica um parameterId em 3 estados, útil para anexar metadados às
 * observações geradas sem ambiguidade.
 */
export function classifyParameter(
    parameterId: unknown,
): 'single_substance' | 'aggregate' | 'unknown' {
    if (casForParameterId(parameterId) !== null) return 'single_substance';
    if (isAggregateParameter(parameterId)) return 'aggregate';
    return 'unknown';
}
