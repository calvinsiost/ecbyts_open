// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// CETESB Risk — Hazard Index segregado por SISTEMA-ALVO (target-organ HI).
// Pure-logic, sem THREE/DOM/IDB. ADR-A2 (Object.freeze) + ADR-A4 (fallback gracioso).
//
// ─────────────────────────────────────────────────────────────────────────
// MOTIVAÇÃO (lacuna canônica fechada por este módulo)
// ─────────────────────────────────────────────────────────────────────────
// `_riskCmaPure.computeRiskAndCma` soma TODOS os HQ de UMA substância em um
// único Hazard Index (HI_total = Σ HQ_via). Isso é correto POR substância.
//
// Porém, quando o sítio tem MÚLTIPLAS SQIs, a USEPA RAGS Part A (1989) §8.2.2
// e a RAGS Part D são explícitas: HQs só devem ser SOMADOS quando os compostos
// atuam sobre o MESMO sistema-alvo (endpoint toxicológico). Somar HQs de um
// nefrotóxico com um neurotóxico SUPERESTIMA o perigo. O driver de conclusão
// CETESB DD 038/2017 (art. 28 — reabilitação) é o MAIOR HI órgão-específico,
// não o somatório global indiscriminado.
//
//   HI_orgão  = Σ HQ_i           (apenas i com mesmo sistema-alvo)
//   HI_driver = max_orgão HI_orgão   ← conclusão (mais restritiva mas honesta)
//
// O ecbyts já tem um agregador GENÉRICO (`core/analytics/riskCharacterization
// .aggregateHazardIndex`), mas ele (a) não está ligado ao catálogo FatTox da
// CETESB e (b) joga todo órgão desconhecido no balde 'systemic', voltando ao
// somatório indiscriminado. A base `FatToxEntry` da CETESB nem possui campo de
// sistema-alvo. Este módulo fecha a lacuna: carrega o sistema-alvo CANÔNICO por
// CAS (efeito crítico USEPA IRIS) das 20 SQIs do ADR-A5 e produz o HI por órgão
// + o HI-driver, ligado diretamente ao motor CETESB.
//
// REFERÊNCIAS:
//   - US-EPA. RAGS (Risk Assessment Guidance for Superfund) Vol. I — Part A,
//     EPA/540/1-89/002, 1989, §8.2.2 (segregação de HI por target organ).
//   - US-EPA. RAGS Part D, EPA 540-R-97-033, 2001 (tabelas por endpoint).
//   - US-EPA IRIS (Integrated Risk Information System) — efeito crítico por SQI.
//   - CETESB. Manual do Usuário — Planilhas para Avaliação de Risco, v4.00, 2026, §7.
//   - CETESB. Decisão de Diretoria 038/2017/C (conclusão IC por CMA/risco).
//   - ASTM E2081-00 — Standard Guide for Risk-Based Corrective Action.
//
// SPEC: docs/specs/features/SPEC_CETESB_RISK_ASSESSMENT.md (CETESB-RISK-001) RF-1.3
// ADR: src/app/js/core/risk/cetesb/ADR.md (A2 freeze, A4 fallback gracioso)
// Tests: tests/cetesb-risk-hazard-index-by-target.test.mjs

/**
 * Sistemas-alvo (endpoint toxicológico) reconhecidos pela USEPA RAGS Part D.
 * Conjunto fechado — qualquer SQI sem mapeamento cai em 'systemic' (conservador,
 * mas sinalizado via warning para não esconder a incerteza — ver ADR-A4).
 */
export type TargetOrgan =
    | 'hematological' // sistema hematopoiético / sangue
    | 'hepatic' // fígado
    | 'renal' // rim
    | 'neurological' // sistema nervoso
    | 'respiratory' // sistema respiratório
    | 'cardiovascular' // sistema cardiovascular
    | 'developmental' // desenvolvimento / reprodutivo
    | 'immunological' // sistema imune
    | 'dermal' // pele
    | 'endocrine' // endócrino
    | 'gastrointestinal' // trato gastrointestinal
    | 'systemic'; // efeito sistêmico / não especificado

/**
 * Sistema-alvo CANÔNICO (efeito crítico USEPA IRIS) por CAS para as 20 SQIs
 * canônicas do ADR-A5. Object.freeze (ADR-A2).
 *
 * Procedência (efeito crítico não-carcinogênico USEPA IRIS):
 *   71-43-2  Benzeno         → hematological (decréscimo linfócitos, IRIS)
 *   108-88-3 Tolueno         → neurological  (efeitos neurológicos, IRIS)
 *   100-41-4 Etilbenzeno     → hepatic       (toxicidade hepato/renal, IRIS)
 *   1330-20-7 Xilenos        → neurological  (efeitos no SNC, IRIS)
 *   79-01-6  TCE             → immunological (timo/imuno + dev, IRIS 2011)
 *   127-18-4 PCE             → neurological  (neurotoxicidade, IRIS 2012)
 *   75-09-2  Diclorometano   → hepatic       (efeitos hepáticos, IRIS)
 *   75-01-4  Cloreto vinila  → hepatic       (fígado, IRIS)
 *   91-20-3  Naftaleno       → respiratory   (lesão epitélio nasal/resp, IRIS)
 *   50-32-8  Benzo(a)pireno  → developmental (efeitos no desenvolvimento, IRIS 2017)
 *   7440-43-9 Cádmio         → renal         (proteinúria renal, IRIS)
 *   7440-50-8 Cobre          → gastrointestinal (irritação GI, HEAST)
 *   7439-92-1 Chumbo         → neurological  (neurodesenvolvimento, USEPA AALM)
 *   7439-97-6 Mercúrio elem. → neurological  (tremor/SNC, IRIS)
 *   7440-02-0 Níquel         → systemic      (peso corporal/órgãos, IRIS)
 *   7440-66-6 Zinco          → hematological (anemia/redução Cu-SOD, IRIS)
 *   7440-47-3 Cromo VI       → gastrointestinal (mucosa GI oral, IRIS)
 *   7440-38-2 Arsênio        → dermal        (hiperpigmentação/keratose, IRIS)
 *   8001-58-9 Creosoto       → systemic      (mistura — sem RfD; default)
 *   8002-05-9 Petróleo TPH   → hepatic       (frações alifáticas, TPHCWG)
 */
export const TARGET_ORGAN_BY_CAS: Readonly<Record<string, TargetOrgan>> = Object.freeze({
    '71-43-2': 'hematological',
    '108-88-3': 'neurological',
    '100-41-4': 'hepatic',
    '1330-20-7': 'neurological',
    '79-01-6': 'immunological',
    '127-18-4': 'neurological',
    '75-09-2': 'hepatic',
    '75-01-4': 'hepatic',
    '91-20-3': 'respiratory',
    '50-32-8': 'developmental',
    '7440-43-9': 'renal',
    '7440-50-8': 'gastrointestinal',
    '7439-92-1': 'neurological',
    '7439-97-6': 'neurological',
    '7440-02-0': 'systemic',
    '7440-66-6': 'hematological',
    '7440-47-3': 'gastrointestinal',
    '7440-38-2': 'dermal',
    '8001-58-9': 'systemic',
    '8002-05-9': 'hepatic',
});

/** Retorna o sistema-alvo canônico de um CAS, ou undefined se não mapeado. */
export function getTargetOrgan(cas: string): TargetOrgan | undefined {
    if (typeof cas !== 'string') return undefined;
    return TARGET_ORGAN_BY_CAS[cas.trim()];
}

/** Contribuição de uma SQI (já com seu HQ por-substância computado). */
export interface SqiHazardContribution {
    /** CAS da SQI (usado para inferir o sistema-alvo se `targetOrgan` ausente). */
    readonly cas: string;
    /** Hazard Quotient (ou Hazard Index por-substância) já calculado para a SQI. */
    readonly HQ: number;
    /** Override explícito do sistema-alvo (precede o mapa canônico). Opcional. */
    readonly targetOrgan?: TargetOrgan;
}

export interface HazardIndexByTargetResult {
    /** HI segregado por sistema-alvo: Σ HQ das SQIs com mesmo alvo. */
    readonly byTargetOrgan: Readonly<Record<string, number>>;
    /**
     * HI-driver = max_orgão HI_orgão. É o valor de conclusão CETESB/RAGS:
     * o maior perigo órgão-específico, NÃO o somatório global indiscriminado.
     */
    readonly maxTargetHI: number;
    /** Sistema-alvo que governa o HI-driver. */
    readonly drivingOrgan: string;
    /**
     * HI total INDISCRIMINADO (Σ todos os HQ) — fornecido só para comparação /
     * triagem screening-level (RAGS permite como 1ª aproximação conservadora).
     * NÃO é o driver de conclusão.
     */
    readonly totalHI_screening: number;
    /** Excede o HI alvo (default 1.0 RAGS) no sistema-alvo mais crítico? */
    readonly exceedsTarget: boolean;
    /** Classificação qualitativa baseada no maxTargetHI. */
    readonly hazardLevel: 'safe' | 'concern' | 'high';
    /** Warnings (ex.: SQI sem mapeamento de órgão → caiu em 'systemic'). */
    readonly warnings: ReadonlyArray<string>;
    /** Procedência regulatória/científica carimbada (RNF-5). */
    readonly source: string;
}

const SOURCE_STAMP =
    'US-EPA RAGS Part A 1989 §8.2.2 + RAGS Part D 2001 (target-organ HI) / Manual CETESB §7 / DD 038/2017' as const;

const HI_TARGET_DEFAULT = 1.0; // RAGS Vol. I §8.2 — limiar HI seguro.
const HI_CONCERN = 10.0; // RAGS Vol. I — patamar de preocupação.

/**
 * Agrega os HQ por-substância em Hazard Index segregado por SISTEMA-ALVO e
 * deriva o HI-driver (max órgão), conforme USEPA RAGS Part A §8.2.2.
 *
 * Determinístico (RNF-1): mesma entrada → mesma saída. Sem Date.now, sem I/O.
 * Fallback gracioso (ADR-A4): entrada vazia/inválida → resultado neutro (HI 0,
 * 'safe'), nunca lança. SQI sem sistema-alvo mapeado → cai em 'systemic' com
 * warning explícito (a incerteza é sinalizada, não escondida).
 *
 * @param contributions HQ por-substância já calculado (ex.: de `computeRiskAndCma`).
 * @param targetHI limiar de aceitação do HI (default 1.0 RAGS).
 */
export function aggregateHazardIndexByTarget(
    contributions: ReadonlyArray<SqiHazardContribution>,
    targetHI: number = HI_TARGET_DEFAULT,
): HazardIndexByTargetResult {
    const warnings: string[] = [];
    const effectiveTarget = Number.isFinite(targetHI) && targetHI > 0 ? targetHI : HI_TARGET_DEFAULT;

    if (!Array.isArray(contributions) || contributions.length === 0) {
        return Object.freeze({
            byTargetOrgan: Object.freeze({}),
            maxTargetHI: 0,
            drivingOrgan: 'none',
            totalHI_screening: 0,
            exceedsTarget: false,
            hazardLevel: 'safe',
            warnings: Object.freeze(warnings),
            source: SOURCE_STAMP,
        });
    }

    const byTargetOrgan: Record<string, number> = {};
    let totalHI_screening = 0;

    for (const c of contributions) {
        // Sanitização: HQ deve ser finito e ≥0 (RNF-4). NaN/Infinity/negativo são ignorados com warning.
        const hq = c && Number.isFinite(c.HQ) ? (c.HQ as number) : NaN;
        if (!Number.isFinite(hq) || hq < 0) {
            warnings.push(`SQI ${c && c.cas ? c.cas : '?'}: HQ inválido (${c ? c.HQ : 'null'}) — ignorado`);
            continue;
        }

        // Resolve sistema-alvo: override explícito > mapa canônico > 'systemic' (+warning).
        let organ: TargetOrgan;
        if (c.targetOrgan) {
            organ = c.targetOrgan;
        } else {
            const mapped = getTargetOrgan(c.cas);
            if (mapped) {
                organ = mapped;
            } else {
                organ = 'systemic';
                warnings.push(
                    `SQI ${c.cas}: sem sistema-alvo na base CETESB v4.00 — agregado em 'systemic' (conservador, RAGS §8.2.2)`,
                );
            }
        }

        byTargetOrgan[organ] = (byTargetOrgan[organ] ?? 0) + hq;
        totalHI_screening += hq;
    }

    // HI-driver = max órgão (RAGS Part A §8.2.2). Empate → ordem alfabética estável (determinismo RNF-1).
    let maxTargetHI = 0;
    let drivingOrgan = 'none';
    const organs = Object.keys(byTargetOrgan).sort();
    for (const organ of organs) {
        const hi = byTargetOrgan[organ] ?? 0;
        if (hi > maxTargetHI) {
            maxTargetHI = hi;
            drivingOrgan = organ;
        }
    }

    const exceedsTarget = maxTargetHI > effectiveTarget;
    let hazardLevel: 'safe' | 'concern' | 'high';
    if (maxTargetHI <= effectiveTarget) hazardLevel = 'safe';
    else if (maxTargetHI <= HI_CONCERN) hazardLevel = 'concern';
    else hazardLevel = 'high';

    return Object.freeze({
        byTargetOrgan: Object.freeze({ ...byTargetOrgan }),
        maxTargetHI,
        drivingOrgan,
        totalHI_screening,
        exceedsTarget,
        hazardLevel,
        warnings: Object.freeze(warnings),
        source: SOURCE_STAMP,
    });
}

/** Source string para auditoria (RNF-5). */
export const HAZARD_INDEX_BY_TARGET_SOURCE = SOURCE_STAMP;
