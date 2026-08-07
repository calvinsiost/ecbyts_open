// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Audit Trail — pure-logic builder dos 9 blocos A-I espelhando
 * MODELO_ECBT.xlsx (fixture canônico da qualificação USP).
 *
 * SPEC_ECBT_SCORE_AUDIT_TRAIL F1 (claude - novaspec, 2026-06-05).
 *
 * Esta slice produz AuditTrailVM consumível por:
 *   - wire DOM (ecbtAuditTrailPanel.ts) — render dos blocos colapsáveis
 *   - exporter XLSX (ecbtAuditTrailExporter.ts) — byte-equivalente ao fixture
 *   - exporter Markdown (_auditTrailMarkdownPure.ts) — relatório auditável
 *
 * Out of scope desta slice:
 *   - i18n strings (consumer fornece tradução)
 *   - DOM rendering (wire DOM é slice F3 da SPEC)
 *   - XLSX encoding (delegado a SheetJS no exporter)
 *   - Sensitivity analysis top-3 (RF11 Should Have, V2)
 *
 * Tests: tests/ecbt-audit-trail-pure.test.mjs
 */

// ----------------------------------------------------------------
// TYPES — Input
// ----------------------------------------------------------------

export interface ModelAuditInput {
    readonly modelId: string;
    readonly observations: ReadonlyArray<ObservationInput>;
    readonly limits: ReadonlyArray<LimitInput>;
    readonly credentialLevel: CredentialLevel;
    readonly campaignsPlanned: number;
    readonly campaignsExecuted: number;
    readonly mode: 'F' | 'R'; // ECBT mode (F=market, R=cost)
    readonly marketValue: number; // Modo F denominator
    readonly assets: ReadonlyArray<ValuationItem>;
    readonly liabilities: ReadonlyArray<ValuationItem>;
    readonly externalImpactScore?: number; // ODS-style [0,1], default 0
    readonly weights?: EisWeights; // default canonical 3-3-2-2-1-1 (+ Gc/Bi/Se/Tr 2-1-2-1 progressive)
    /** Scores Progressive-4 opcionais (Gc Governança · Bi Biodiversidade · Se Segurança EHS · Tr Transparência Reporte). Default 0. */
    readonly progressiveScores?: ProgressiveScores;
}

export interface ProgressiveScores {
    readonly Gc?: number; // Governança Corporativa
    readonly Bi?: number; // Biodiversidade
    readonly Se?: number; // Segurança EHS
    readonly Tr?: number; // Transparência de Reporte
}

export interface ObservationInput {
    readonly pointId: string;
    readonly timestamp: string; // ISO 8601
    readonly attribute: string;
    readonly reading: number;
    readonly unit: string;
    readonly matrix: 'soil' | 'water' | 'air' | 'biota' | 'sediment';
    readonly author: string;
    readonly credentialLevel: CredentialLevel;
    readonly traced: boolean; // R
    readonly onTime: boolean; // NP
    readonly unitSI: boolean; // SI
    readonly taxonMapped: boolean; // Tx
    readonly nonDetect: boolean; // ND
}

export interface LimitInput {
    readonly attribute: string;
    readonly matrix: ObservationInput['matrix'];
    readonly vr: number; // Valor de Referência
    readonly vp: number; // Valor de Prevenção
    readonly vi: number; // Valor de Intervenção
    readonly unit: string;
}

export interface ValuationItem {
    readonly label: string;
    readonly low: number;
    readonly expected: number;
    readonly high: number;
}

export type CredentialLevel = 'common' | 'professional' | 'pos_graduado' | 'mestre' | 'doutor';

export interface EisWeights {
    // Core-6 (framework 3CTA+)
    readonly T: number;
    readonly A: number;
    readonly Cp: number;
    readonly Ty: number;
    readonly Cs: number;
    readonly Cm: number;
    // Progressive-4 (opcional, diagnostico ESG/EHS)
    readonly Gc?: number; // Governança Corporativa (default 2)
    readonly Bi?: number; // Biodiversidade (default 1)
    readonly Se?: number; // Segurança EHS (default 2)
    readonly Tr?: number; // Transparência de Reporte (default 1)
}

// ----------------------------------------------------------------
// TYPES — Output VM
// ----------------------------------------------------------------

export type AuditTrailBlockId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

export interface AuditTrailVM {
    readonly modelId: string;
    readonly generatedAt: string;
    readonly blocks: ReadonlyArray<AuditTrailBlockVM>;
    readonly dashboardKpis: DashboardKpis;
}

export interface AuditTrailBlockVM {
    readonly id: AuditTrailBlockId;
    readonly titleKey: string;
    readonly coreRefs: ReadonlyArray<string>;
    readonly theoreticalRefs: ReadonlyArray<TheoreticalRef>;
    readonly rows: ReadonlyArray<AuditTrailRowVM>;
    readonly summaryKey: string;
}

export interface AuditTrailRowVM {
    readonly cellId: string;
    readonly labelKey: string;
    /** F16 Calvin 2026-06-07 — label inline humano usado como fallback quando
     *  labelKey não resolve via i18n (rows dinâmicas como observations). */
    readonly label?: string;
    readonly formulaSymbolic: string;
    readonly formulaVerbalKey: string;
    readonly value: number | string;
    readonly unit?: string;
    readonly cellKind: 'input' | 'calc' | 'output';
    readonly derivedFrom: ReadonlyArray<string>;
    readonly contributesTo: ReadonlyArray<string>;
    readonly xlsxA1?: string; // cell A1 no MODELO_ECBT.xlsx
}

export interface DashboardKpis {
    readonly eis: number;
    readonly verdict: 'audit_ready' | 'management_ready' | 'critical';
    readonly severityS: number;
    readonly kappa: number;
    readonly ecbtPct: number;
    readonly ecbtBand: number;
}

export interface TheoreticalRef {
    readonly kind: 'doi' | 'isbn' | 'norma' | 'spec';
    readonly id: string;
    readonly labelKey: string;
}

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

// Pesos canônicos do framework EIS Extended (10 eixos):
//   Core-6 (3CTA+): T=3 A=3 Cp=2 Ty=2 Cs=1 Cm=1 (soma=12)
//   Progressive-4: Gc=2 Bi=1 Se=2 Tr=1 (soma=6)
//   Total: 18
// Ref: src/app/js/core/eis/axisRegistry.ts AXIS_DEFINITIONS
const DEFAULT_WEIGHTS: EisWeights = Object.freeze({
    T: 3, A: 3, Cp: 2, Ty: 2, Cs: 1, Cm: 1,
    Gc: 2, Bi: 1, Se: 2, Tr: 1,
});

const CREDENTIAL_MULTIPLIERS: Readonly<Record<CredentialLevel, number>> = Object.freeze({
    common: 1.0,
    professional: 1.2,
    pos_graduado: 1.4,
    mestre: 1.6,
    doutor: 2.0,
});

const MATRIX_PT: Readonly<Record<string, string>> = Object.freeze({
    soil: 'solo',
    water: 'agua',
    air: 'ar',
    biota: 'biota',
    sediment: 'sedimento',
});

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function avg(arr: ReadonlyArray<number>): number {
    if (arr.length === 0) return 0;
    let s = 0;
    for (const v of arr) s += v;
    return s / arr.length;
}

function clamp(v: number, lo: number, hi: number): number {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

function findLimit(limits: ReadonlyArray<LimitInput>, attr: string, matrix: ObservationInput['matrix']): LimitInput | null {
    for (const l of limits) {
        if (l.attribute === attr && l.matrix === matrix) return l;
    }
    return null;
}

function roundN(n: number, places = 4): number {
    const f = Math.pow(10, places);
    return Math.round(n * f) / f;
}

// ----------------------------------------------------------------
// BLOCK BUILDERS — A-I
// ----------------------------------------------------------------

function buildBlockA(input: ModelAuditInput): AuditTrailBlockVM {
    // F16 Calvin 2026-06-07 — antes labelKey genérico 'block_A.row' repetido +
    // formulaSymbolic com 'undefined' quando obs não tinha shape esperado.
    // Fix: label legível por row (pointId + attribute), fallback '—' p/ campos
    // ausentes, render NÃO usa labelKey (override direto via label inline).
    const rows: AuditTrailRowVM[] = input.observations.map((obs, i) => {
        const pt = obs.pointId || '—';
        const attr = obs.attribute || '—';
        const val = (obs.reading ?? null) !== null ? String(obs.reading) : '—';
        const unit = obs.unit || '';
        const matrix = obs.matrix || '—';
        const ts = obs.timestamp ? obs.timestamp.substring(0, 10) : '';
        return {
            cellId: `A.row[${i}]`,
            // labelKey = key específica por row — quando resolveLabel não encontra
            // a key, ele cai no fallback que retorna a label inline em `value`.
            labelKey: `ecbt.audit_trail.block_A.row.${i}`,
            // Display textual humano (renderer usa labelKey para coluna LABEL
            // se traduzido; caso não, ainda há value para coluna VALOR).
            label: `${pt} · ${attr} (${matrix})${ts ? ' · ' + ts : ''}`,
            formulaSymbolic: `(${pt}, ${attr}, ${val} ${unit})`,
            formulaVerbalKey: 'ecbt.audit_trail.block_A.formula_verbal',
            value: `${val} ${unit}`.trim(),
            cellKind: 'input' as const,
            derivedFrom: [],
            contributesTo: [
                `C.row[${i}].HQ`,
                `D.T`,
                `D.A`,
                `D.Ty`,
                `D.Cs`,
                `D.Cm`,
            ],
            xlsxA1: `A${11 + i}:M${11 + i}`,
        };
    });

    return Object.freeze({
        id: 'A' as const,
        titleKey: 'ecbt.audit_trail.block_A',
        coreRefs: Object.freeze(['core/io', 'core/io/encoder']),
        theoreticalRefs: Object.freeze([
            Object.freeze({ kind: 'spec' as const, id: 'CHEN-1976-ER', labelKey: 'ref.chen_1976' }),
            Object.freeze({ kind: 'norma' as const, id: 'ISO-19156-2023', labelKey: 'ref.iso_19156' }),
        ]),
        rows: Object.freeze(rows),
        summaryKey: 'ecbt.audit_trail.block_A.summary',
    });
}

function buildBlockB(input: ModelAuditInput): AuditTrailBlockVM {
    // F16 — label inline + labelKey específico por row (consistência com Bloco A).
    const rows: AuditTrailRowVM[] = input.limits.map((lim, j) => ({
        cellId: `B.row[${j}]`,
        labelKey: `ecbt.audit_trail.block_B.row.${j}`,
        label: `${lim.attribute} (${MATRIX_PT[lim.matrix] ?? lim.matrix})`,
        formulaSymbolic: `VR=${lim.vr} · VP=${lim.vp} · VI=${lim.vi} ${lim.unit}`,
        formulaVerbalKey: 'ecbt.audit_trail.block_B.formula_verbal',
        value: `${lim.attribute}|${MATRIX_PT[lim.matrix] ?? lim.matrix}`,
        cellKind: 'input' as const,
        derivedFrom: [],
        contributesTo: input.observations
            .map((o, i) => (o.attribute === lim.attribute && o.matrix === lim.matrix ? `C.row[${i}].HQ` : null))
            .filter((x): x is string => x !== null),
        xlsxA1: `A${22 + j}:G${22 + j}`,
    }));

    return Object.freeze({
        id: 'B' as const,
        titleKey: 'ecbt.audit_trail.block_B',
        coreRefs: Object.freeze(['core/validation/profiles']),
        theoreticalRefs: Object.freeze([
            Object.freeze({ kind: 'norma' as const, id: 'CONAMA-420-2009', labelKey: 'ref.conama_420' }),
            Object.freeze({ kind: 'norma' as const, id: 'CETESB-DD-256-2016', labelKey: 'ref.cetesb_256' }),
        ]),
        rows: Object.freeze(rows),
        summaryKey: 'ecbt.audit_trail.block_B.summary',
    });
}

function buildBlockC(input: ModelAuditInput): { vm: AuditTrailBlockVM; hqList: number[] } {
    const hqList: number[] = [];
    const rows: AuditTrailRowVM[] = input.observations.map((obs, i) => {
        const lim = findLimit(input.limits, obs.attribute, obs.matrix);
        const hq = lim && lim.vi > 0 ? obs.reading / lim.vi : 0;
        hqList.push(hq);
        // eslint-disable-next-line
        const classe = !lim ? 'no_limit' : hq > 1 ? 'intervention' : lim.vp > 0 && obs.reading >= lim.vp ? 'prevention' : 'ok';
        return {
            cellId: `C.row[${i}].HQ`,
            labelKey: `ecbt.audit_trail.block_C.row.${i}`,
            label: `HQ · ${obs.pointId || '—'} · ${obs.attribute || '—'}`,
            formulaSymbolic: `HQ = leitura/VI = ${obs.reading}/${lim?.vi ?? '?'} = ${roundN(hq)}`,
            formulaVerbalKey: 'ecbt.audit_trail.block_C.formula_verbal',
            value: roundN(hq),
            cellKind: 'calc' as const,
            derivedFrom: [`A.row[${i}]`, ...(lim ? [`B.row[${input.limits.indexOf(lim)}]`] : [])],
            contributesTo: ['G.R'],
            xlsxA1: `C${29 + i}`,
        };
    });
    // Adicionar linha de classificação
    rows.push(
        ...input.observations.map((obs, i) => {
            const lim = findLimit(input.limits, obs.attribute, obs.matrix);
            const hq = hqList[i] ?? 0; // hqList alinhado a observations; ausência → 0
            const classe = !lim ? 'no_limit' : hq > 1 ? 'intervention' : lim.vp > 0 && obs.reading >= lim.vp ? 'prevention' : 'ok';
            return {
                cellId: `C.row[${i}].Classe`,
                labelKey: `ecbt.audit_trail.block_C.classe.${i}`,
                label: `Classe · ${obs.pointId || '—'} · ${obs.attribute || '—'}`,
                formulaSymbolic: `IF(HQ>1,"Intervencao",IF(leitura>=VP,"Prevencao","OK"))`,
                formulaVerbalKey: 'ecbt.audit_trail.block_C.classe_verbal',
                value: classe,
                cellKind: 'calc' as const,
                derivedFrom: [`C.row[${i}].HQ`, `A.row[${i}]`],
                contributesTo: [],
                xlsxA1: `D${29 + i}`,
            };
        }),
    );

    return {
        vm: Object.freeze({
            id: 'C' as const,
            titleKey: 'ecbt.audit_trail.block_C',
            coreRefs: Object.freeze(['core/validation', 'core/eis/calculatorExposure']),
            theoreticalRefs: Object.freeze([
                Object.freeze({ kind: 'norma' as const, id: 'ASTM-E2081', labelKey: 'ref.astm_e2081' }),
            ]),
            rows: Object.freeze(rows),
            summaryKey: 'ecbt.audit_trail.block_C.summary',
        }),
        hqList,
    };
}

function buildBlockD(input: ModelAuditInput): { vm: AuditTrailBlockVM; axes: Required<EisWeights> } {
    const obs = input.observations;
    const tracedAvg = avg(obs.map((o) => (o.traced ? 1 : 0)));
    const ndAvg = avg(obs.map((o) => (o.nonDetect ? 1 : 0)));
    const onTimeAvg = avg(obs.map((o) => (o.onTime ? 1 : 0)));
    const siAvg = avg(obs.map((o) => (o.unitSI ? 1 : 0)));
    const txAvg = avg(obs.map((o) => (o.taxonMapped ? 1 : 0)));

    const T = roundN(1 + 4 * tracedAvg);
    const A = roundN(1 + 4 * (1 - ndAvg));
    const Cp = roundN(1 + 4 * Math.min(input.campaignsPlanned > 0 ? input.campaignsExecuted / input.campaignsPlanned : 0, 1));
    const Ty = roundN(1 + 4 * onTimeAvg);
    const Cs = roundN(1 + 4 * siAvg);
    const Cm = roundN(1 + 4 * txAvg);

    // Progressive-4: defaults 0 quando ausente
    const prog = input.progressiveScores ?? {};
    const Gc = roundN(clamp(typeof prog.Gc === 'number' ? prog.Gc : 0, 0, 5));
    const Bi = roundN(clamp(typeof prog.Bi === 'number' ? prog.Bi : 0, 0, 5));
    const Se = roundN(clamp(typeof prog.Se === 'number' ? prog.Se : 0, 0, 5));
    const Tr = roundN(clamp(typeof prog.Tr === 'number' ? prog.Tr : 0, 0, 5));

    const axes: Required<EisWeights> = Object.freeze({ T, A, Cp, Ty, Cs, Cm, Gc, Bi, Se, Tr });

    const mkRow = (axis: keyof EisWeights, formula: string, value: number, xlsx: string, tier: 'core' | 'progressive'): AuditTrailRowVM => ({
        cellId: `D.${axis}`,
        labelKey: `ecbt.audit_trail.block_D.axis.${axis}`,
        formulaSymbolic: formula,
        formulaVerbalKey: `ecbt.audit_trail.block_D.verbal.${axis}`,
        value,
        cellKind: 'calc' as const,
        derivedFrom: tier === 'core' ? obs.map((_, i) => `A.row[${i}]`) : [`D.input.progressive.${axis}`],
        contributesTo: [axis === 'T' ? 'E.T_ajustado' : 'F.EIS'],
        xlsxA1: xlsx,
    });

    return {
        vm: Object.freeze({
            id: 'D' as const,
            titleKey: 'ecbt.audit_trail.block_D',
            coreRefs: Object.freeze(['core/eis/eisCalculator', 'core/eis/axisRegistry', 'core/eis/eisCalculator10']),
            theoreticalRefs: Object.freeze([
                Object.freeze({ kind: 'norma' as const, id: 'JCGM-100-2008', labelKey: 'ref.jcgm_2008' }),
                Object.freeze({ kind: 'spec' as const, id: 'IPCC-2006', labelKey: 'ref.ipcc_2006' }),
                Object.freeze({ kind: 'spec' as const, id: 'WHO-2016', labelKey: 'ref.who_2016' }),
                Object.freeze({ kind: 'spec' as const, id: 'EPA-2017', labelKey: 'ref.epa_2017' }),
                Object.freeze({ kind: 'spec' as const, id: 'GRI-ISSB-ESG', labelKey: 'ref.gri_issb' }),
            ]),
            rows: Object.freeze([
                // Core-6 (3CTA+) — xlsxA1 B40-B45 do MODELO_ECBT.xlsx
                mkRow('T', '1 + 4·média(rastreado)', T, 'B40', 'core'),
                mkRow('A', '1 + 4·(1 − média(ND))', A, 'B41', 'core'),
                mkRow('Cp', '1 + 4·MIN(executadas/planejadas, 1)', Cp, 'B42', 'core'),
                mkRow('Ty', '1 + 4·média(no_prazo)', Ty, 'B43', 'core'),
                mkRow('Cs', '1 + 4·média(unidade_SI)', Cs, 'B44', 'core'),
                mkRow('Cm', '1 + 4·média(taxon_mapeado)', Cm, 'B45', 'core'),
                // Progressive-4 (diagnostico ESG/EHS, default 0) — xlsxA1 B46-B49 (extensão pós-canônica)
                mkRow('Gc', 'Score externo Governança Corporativa [0-5]', Gc, 'B46', 'progressive'),
                mkRow('Bi', 'Score externo Biodiversidade [0-5]', Bi, 'B47', 'progressive'),
                mkRow('Se', 'Score externo Segurança EHS [0-5]', Se, 'B48', 'progressive'),
                mkRow('Tr', 'Score externo Transparência Reporte [0-5]', Tr, 'B49', 'progressive'),
            ]),
            summaryKey: 'ecbt.audit_trail.block_D.summary',
        }),
        axes,
    };
}

function buildBlockE(input: ModelAuditInput, T: number): { vm: AuditTrailBlockVM; tAdjusted: number } {
    const mult = CREDENTIAL_MULTIPLIERS[input.credentialLevel] ?? 1.0;
    const tAdjusted = clamp(roundN(T * mult), 0, 5);
    return {
        vm: Object.freeze({
            id: 'E' as const,
            titleKey: 'ecbt.audit_trail.block_E',
            coreRefs: Object.freeze(['core/eis/eisCalculator (EIS_CREDENTIAL_MULTIPLIERS)']),
            theoreticalRefs: Object.freeze([
                Object.freeze({ kind: 'spec' as const, id: 'ECBT-FRAMEWORK-EIS', labelKey: 'ref.ecbt_framework' }),
            ]),
            rows: Object.freeze([
                {
                    cellId: 'E.credentialMult',
                    labelKey: 'ecbt.audit_trail.block_E.mult',
                    formulaSymbolic: `VLOOKUP("${input.credentialLevel}", multipliers) = ${mult}`,
                    formulaVerbalKey: 'ecbt.audit_trail.block_E.mult_verbal',
                    value: mult,
                    cellKind: 'calc' as const,
                    derivedFrom: [],
                    contributesTo: ['E.T_ajustado'],
                    xlsxA1: 'C48',
                },
                {
                    cellId: 'E.T_ajustado',
                    labelKey: 'ecbt.audit_trail.block_E.t_adjusted',
                    formulaSymbolic: `MIN(T·mult, 5) = MIN(${T}·${mult}, 5) = ${tAdjusted}`,
                    formulaVerbalKey: 'ecbt.audit_trail.block_E.t_adjusted_verbal',
                    value: tAdjusted,
                    cellKind: 'calc' as const,
                    derivedFrom: ['D.T', 'E.credentialMult'],
                    contributesTo: ['F.EIS'],
                    xlsxA1: 'B55',
                },
            ]),
            summaryKey: 'ecbt.audit_trail.block_E.summary',
        }),
        tAdjusted,
    };
}

function buildBlockF(
    axes: Required<EisWeights>,
    tAdjusted: number,
    weights: EisWeights,
    mode: 'geometric' | 'veto',
): { vm: AuditTrailBlockVM; eis: number; verdict: DashboardKpis['verdict'] } {
    const adj: Required<EisWeights> = { ...axes, T: tAdjusted };
    let eis: number;
    if (mode === 'veto' && (axes.T <= 2 || axes.A <= 2)) {
        eis = 0;
    } else {
        // Pesos canônicos: Core-6 (3-3-2-2-1-1 = 12) + Progressive-4 (2-1-2-1 = 6) = 18
        const wT = weights.T, wA = weights.A, wCp = weights.Cp, wTy = weights.Ty, wCs = weights.Cs, wCm = weights.Cm;
        const wGc = typeof weights.Gc === 'number' ? weights.Gc : 2;
        const wBi = typeof weights.Bi === 'number' ? weights.Bi : 1;
        const wSe = typeof weights.Se === 'number' ? weights.Se : 2;
        const wTr = typeof weights.Tr === 'number' ? weights.Tr : 1;
        // SUMPRODUCT(pesos, LN(eixos_ajustados))
        // Eixos com valor 0 são pulados (LN(0) = -∞). Implementação: só somar peso quando eixo > 0.
        let sumprod = 0;
        let wSumActive = 0;
        const acc = (w: number, x: number) => {
            if (x > 0 && w > 0) {
                sumprod += w * Math.log(x);
                wSumActive += w;
            }
        };
        acc(wT, adj.T); acc(wA, adj.A); acc(wCp, adj.Cp); acc(wTy, adj.Ty);
        acc(wCs, adj.Cs); acc(wCm, adj.Cm);
        acc(wGc, adj.Gc); acc(wBi, adj.Bi); acc(wSe, adj.Se); acc(wTr, adj.Tr);
        eis = wSumActive > 0 ? Math.exp(sumprod / wSumActive) : 0;
    }
    eis = roundN(eis);
    const verdict: DashboardKpis['verdict'] = eis >= 4.5 ? 'audit_ready' : eis >= 3.5 ? 'management_ready' : 'critical';
    return {
        vm: Object.freeze({
            id: 'F' as const,
            titleKey: 'ecbt.audit_trail.block_F',
            coreRefs: Object.freeze(['core/eis/eisCalculator._calculateGeometric', 'core/eis/eisCalculator._calculateVeto']),
            theoreticalRefs: Object.freeze([
                Object.freeze({ kind: 'spec' as const, id: 'OECD-JRC-2008', labelKey: 'ref.oecd_jrc_2008' }),
                Object.freeze({ kind: 'spec' as const, id: 'MUNDA-NCMC', labelKey: 'ref.munda' }),
            ]),
            rows: Object.freeze([
                {
                    cellId: 'F.EIS',
                    labelKey: 'ecbt.audit_trail.block_F.eis',
                    formulaSymbolic: 'EIS = EXP(Σ pesos·ln(eixos) / Σ pesos)',
                    formulaVerbalKey: 'ecbt.audit_trail.block_F.eis_verbal',
                    value: eis,
                    cellKind: 'output' as const,
                    derivedFrom: ['E.T_ajustado', 'D.A', 'D.Cp', 'D.Ty', 'D.Cs', 'D.Cm', 'D.Gc', 'D.Bi', 'D.Se', 'D.Tr'],
                    contributesTo: ['F.Verdict', 'G.kappa'],
                    xlsxA1: 'B61',
                },
                {
                    cellId: 'F.Verdict',
                    labelKey: 'ecbt.audit_trail.block_F.verdict',
                    formulaSymbolic: 'IF(EIS≥4.5,"🟢",IF(EIS≥3.5,"🟡","🔴"))',
                    formulaVerbalKey: 'ecbt.audit_trail.block_F.verdict_verbal',
                    value: verdict,
                    cellKind: 'output' as const,
                    derivedFrom: ['F.EIS'],
                    contributesTo: [],
                    xlsxA1: 'B62',
                },
            ]),
            summaryKey: 'ecbt.audit_trail.block_F.summary',
        }),
        eis,
        verdict,
    };
}

function buildBlockG(eis: number, hqList: ReadonlyArray<number>, externalImpactScore: number): { vm: AuditTrailBlockVM; severityS: number; kappa: number } {
    const maxHq = hqList.length > 0 ? Math.max(...hqList) : 0;
    const R = clamp(maxHq, 0, 1);
    const I = clamp(externalImpactScore, 0, 1);
    const S = roundN(Math.max(R, I));
    const kappa = roundN(eis / 5);

    return {
        vm: Object.freeze({
            id: 'G' as const,
            titleKey: 'ecbt.audit_trail.block_G',
            coreRefs: Object.freeze(['core/severity', 'core/impact', 'core/validation/gacClassification']),
            theoreticalRefs: Object.freeze([
                Object.freeze({ kind: 'spec' as const, id: 'COX-2008-SEV', labelKey: 'ref.cox_2008' }),
                Object.freeze({ kind: 'spec' as const, id: 'RBCA', labelKey: 'ref.rbca' }),
                Object.freeze({ kind: 'spec' as const, id: 'UN-ODS-2015', labelKey: 'ref.un_ods_2015' }),
            ]),
            rows: Object.freeze([
                {
                    cellId: 'G.R',
                    labelKey: 'ecbt.audit_trail.block_G.r',
                    formulaSymbolic: 'R = MIN(MAX(HQ), 1)',
                    formulaVerbalKey: 'ecbt.audit_trail.block_G.r_verbal',
                    value: roundN(R),
                    cellKind: 'calc' as const,
                    derivedFrom: hqList.map((_, i) => `C.row[${i}].HQ`),
                    contributesTo: ['G.S'],
                    xlsxA1: 'B65',
                },
                {
                    cellId: 'G.I',
                    labelKey: 'ecbt.audit_trail.block_G.i',
                    formulaSymbolic: 'I (impacto externo ODS)',
                    formulaVerbalKey: 'ecbt.audit_trail.block_G.i_verbal',
                    value: roundN(I),
                    cellKind: 'input' as const,
                    derivedFrom: [],
                    contributesTo: ['G.S'],
                    xlsxA1: 'B66',
                },
                {
                    cellId: 'G.S',
                    labelKey: 'ecbt.audit_trail.block_G.s',
                    formulaSymbolic: 'S = MAX(R, I)',
                    formulaVerbalKey: 'ecbt.audit_trail.block_G.s_verbal',
                    value: S,
                    cellKind: 'output' as const,
                    derivedFrom: ['G.R', 'G.I'],
                    contributesTo: [],
                    xlsxA1: 'B67',
                },
                {
                    cellId: 'G.kappa',
                    labelKey: 'ecbt.audit_trail.block_G.kappa',
                    formulaSymbolic: 'κ = EIS / 5',
                    formulaVerbalKey: 'ecbt.audit_trail.block_G.kappa_verbal',
                    value: kappa,
                    cellKind: 'output' as const,
                    derivedFrom: ['F.EIS'],
                    contributesTo: [],
                    xlsxA1: 'B68',
                },
            ]),
            summaryKey: 'ecbt.audit_trail.block_G.summary',
        }),
        severityS: S,
        kappa,
    };
}

function buildBlockH(input: ModelAuditInput): { vm: AuditTrailBlockVM; vNet: number; uncertainty: number; totalCost: number } {
    const sumAssets = input.assets.reduce((s, a) => s + a.expected, 0);
    const sumLiab = input.liabilities.reduce((s, a) => s + a.expected, 0);
    const vNet = sumAssets - sumLiab;
    const allItems = [...input.assets, ...input.liabilities];
    const uncertainty = allItems.reduce((s, it) => s + (it.high - it.low) / 2, 0);
    const totalCost = sumLiab;

    return {
        vm: Object.freeze({
            id: 'H' as const,
            titleKey: 'ecbt.audit_trail.block_H',
            coreRefs: Object.freeze(['core/financial', 'core/billing', 'core/uncertainty']),
            theoreticalRefs: Object.freeze([
                Object.freeze({ kind: 'doi' as const, id: '10.1038/387253a0', labelKey: 'ref.costanza_1997' }),
                Object.freeze({ kind: 'norma' as const, id: 'ASTM-E2137', labelKey: 'ref.astm_e2137' }),
                Object.freeze({ kind: 'norma' as const, id: 'IFRIC-5', labelKey: 'ref.ifric_5' }),
                Object.freeze({ kind: 'norma' as const, id: 'JCGM-100-2008', labelKey: 'ref.jcgm_2008' }),
            ]),
            rows: Object.freeze([
                {
                    cellId: 'H.V_net',
                    labelKey: 'ecbt.audit_trail.block_H.v_net',
                    formulaSymbolic: 'V_net = ΣAtivos − ΣPassivos',
                    formulaVerbalKey: 'ecbt.audit_trail.block_H.v_net_verbal',
                    value: roundN(vNet, 2),
                    cellKind: 'calc' as const,
                    derivedFrom: input.assets.map((_, i) => `H.asset[${i}]`).concat(input.liabilities.map((_, i) => `H.liab[${i}]`)),
                    contributesTo: ['I.ECBT_pct'],
                    xlsxA1: 'B76',
                },
                {
                    cellId: 'H.U',
                    labelKey: 'ecbt.audit_trail.block_H.u',
                    formulaSymbolic: 'U = Σ(High − Low)/2',
                    formulaVerbalKey: 'ecbt.audit_trail.block_H.u_verbal',
                    value: roundN(uncertainty, 2),
                    cellKind: 'calc' as const,
                    derivedFrom: [],
                    contributesTo: ['I.ECBT_band'],
                    xlsxA1: 'B77',
                },
                {
                    cellId: 'H.total_cost',
                    labelKey: 'ecbt.audit_trail.block_H.total_cost',
                    formulaSymbolic: 'Custo total = ΣPassivos',
                    formulaVerbalKey: 'ecbt.audit_trail.block_H.total_cost_verbal',
                    value: roundN(totalCost, 2),
                    cellKind: 'calc' as const,
                    derivedFrom: input.liabilities.map((_, i) => `H.liab[${i}]`),
                    contributesTo: ['I.denominator'],
                    xlsxA1: 'B78',
                },
            ]),
            summaryKey: 'ecbt.audit_trail.block_H.summary',
        }),
        vNet,
        uncertainty,
        totalCost,
    };
}

function buildBlockI(input: ModelAuditInput, vNet: number, uncertainty: number, totalCost: number): { vm: AuditTrailBlockVM; ecbtPct: number; ecbtBand: number } {
    const denominator = input.mode === 'F' ? input.marketValue : totalCost;
    const ecbtPct = denominator > 0 ? roundN((vNet / denominator) * 100, 2) : 0;
    const ecbtBand = denominator > 0 ? roundN((uncertainty / denominator) * 100, 2) : 0;
    const modeRReturn = totalCost > 0 ? roundN((vNet / totalCost) * 100, 2) : 0;

    return {
        vm: Object.freeze({
            id: 'I' as const,
            titleKey: 'ecbt.audit_trail.block_I',
            coreRefs: Object.freeze(['core/ecbtScore']),
            theoreticalRefs: Object.freeze([
                Object.freeze({ kind: 'spec' as const, id: 'TRUCOST-PWC', labelKey: 'ref.trucost_pwc' }),
                Object.freeze({ kind: 'spec' as const, id: 'OECD-CBA-2018', labelKey: 'ref.oecd_cba_2018' }),
                Object.freeze({ kind: 'spec' as const, id: 'NICHOLLS-2012-SROI', labelKey: 'ref.nicholls_2012' }),
            ]),
            rows: Object.freeze([
                {
                    cellId: 'I.denominator',
                    labelKey: 'ecbt.audit_trail.block_I.denominator',
                    formulaSymbolic: `IF(modo="F", marketValue, totalCost) = ${denominator}`,
                    formulaVerbalKey: 'ecbt.audit_trail.block_I.denom_verbal',
                    value: roundN(denominator, 2),
                    cellKind: 'calc' as const,
                    derivedFrom: input.mode === 'F' ? ['I.modeF_marketValue'] : ['H.total_cost'],
                    contributesTo: ['I.ECBT_pct', 'I.ECBT_band'],
                    xlsxA1: 'B82',
                },
                {
                    cellId: 'I.ECBT_pct',
                    labelKey: 'ecbt.audit_trail.block_I.ecbt_pct',
                    formulaSymbolic: 'ECBT% = V_net / denominador × 100%',
                    formulaVerbalKey: 'ecbt.audit_trail.block_I.ecbt_pct_verbal',
                    value: ecbtPct,
                    unit: '%',
                    cellKind: 'output' as const,
                    derivedFrom: ['H.V_net', 'I.denominator'],
                    contributesTo: [],
                    xlsxA1: 'B83',
                },
                {
                    cellId: 'I.ECBT_band',
                    labelKey: 'ecbt.audit_trail.block_I.ecbt_band',
                    formulaSymbolic: 'banda = U / denominador × 100%',
                    formulaVerbalKey: 'ecbt.audit_trail.block_I.ecbt_band_verbal',
                    value: ecbtBand,
                    unit: '%',
                    cellKind: 'output' as const,
                    derivedFrom: ['H.U', 'I.denominator'],
                    contributesTo: [],
                    xlsxA1: 'E83',
                },
                {
                    cellId: 'I.modeR_BCR_minus_1',
                    labelKey: 'ecbt.audit_trail.block_I.mode_r_return',
                    formulaSymbolic: 'Modo R: (V_net / custo) × 100 = BCR − 1',
                    formulaVerbalKey: 'ecbt.audit_trail.block_I.mode_r_verbal',
                    value: modeRReturn,
                    unit: '%',
                    cellKind: 'output' as const,
                    derivedFrom: ['H.V_net', 'H.total_cost'],
                    contributesTo: [],
                    xlsxA1: 'B84',
                },
            ]),
            summaryKey: 'ecbt.audit_trail.block_I.summary',
        }),
        ecbtPct,
        ecbtBand,
    };
}

// ----------------------------------------------------------------
// MAIN BUILDER
// ----------------------------------------------------------------

export interface BuildAuditTrailOptions {
    readonly eisMode?: 'geometric' | 'veto';
    readonly now?: string; // injetável p/ testes determinísticos
}

export function buildAuditTrail(input: ModelAuditInput, opts?: BuildAuditTrailOptions): AuditTrailVM {
    if (!input || typeof input !== 'object') throw new TypeError('buildAuditTrail: input obrigatório');
    if (!Array.isArray(input.observations)) throw new TypeError('buildAuditTrail: observations[] obrigatório');
    if (!Array.isArray(input.limits)) throw new TypeError('buildAuditTrail: limits[] obrigatório');

    const eisMode = opts?.eisMode ?? 'geometric';
    const weights = input.weights ?? DEFAULT_WEIGHTS;
    const externalImpact = typeof input.externalImpactScore === 'number' ? input.externalImpactScore : 0;

    const blockA = buildBlockA(input);
    const blockB = buildBlockB(input);
    const { vm: blockC, hqList } = buildBlockC(input);
    const { vm: blockD, axes } = buildBlockD(input);
    const { vm: blockE, tAdjusted } = buildBlockE(input, axes.T);
    const { vm: blockF, eis, verdict } = buildBlockF(axes, tAdjusted, weights, eisMode);
    const { vm: blockG, severityS, kappa } = buildBlockG(eis, hqList, externalImpact);
    const { vm: blockH, vNet, uncertainty, totalCost } = buildBlockH(input);
    const { vm: blockI, ecbtPct, ecbtBand } = buildBlockI(input, vNet, uncertainty, totalCost);

    return Object.freeze({
        modelId: input.modelId,
        generatedAt: opts?.now ?? new Date().toISOString(),
        blocks: Object.freeze([blockA, blockB, blockC, blockD, blockE, blockF, blockG, blockH, blockI]),
        dashboardKpis: Object.freeze({
            eis,
            verdict,
            severityS,
            kappa,
            ecbtPct,
            ecbtBand,
        }),
    });
}

// Re-export para testes
export { DEFAULT_WEIGHTS, CREDENTIAL_MULTIPLIERS };
