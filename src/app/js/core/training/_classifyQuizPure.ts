// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CLASSIFY QUIZ (pure) — LMS-INTERACTIVE-ASSESS-001 F1 / RF-3
   ================================================================
   Calvin 2026-06-14: classificar a faixa regulatória (VR/VP/VI) de um poço REAL
   do modelo. O adapter de runtime (lmsManager) classifica o poço via
   computeElementCompliance (severity) e passa {wellName,parameterLabel,value,
   correctBand} para este gerador PURO, que monta a pergunta de escolha única e
   corrige. Limiares CONAMA 420 / CETESB.

   PURE: sem IO/DOM/THREE. Testável isoladamente.
   ================================================================ */

export type ComplianceBand = 'below_vr' | 'vr_vp' | 'vp_vi' | 'above_vi';

/** Rótulos das faixas (ordem canônica do enunciado). */
export const BAND_LABELS: Readonly<Record<ComplianceBand, string>> = Object.freeze({
    below_vr: 'Abaixo do VR — concentração natural de fundo (sem ação)',
    vr_vp: 'Entre VR e VP — acima do natural (atenção)',
    vp_vi: 'Entre VP e VI — monitoramento/avaliação exigidos',
    above_vi: 'Acima do VI — risco identificado, remediação exigida',
});

const BAND_ORDER: readonly ComplianceBand[] = Object.freeze([
    'below_vr',
    'vr_vp',
    'vp_vi',
    'above_vi',
]);

/**
 * Mapeia o pior severity de compliance (computeElementCompliance) para a faixa:
 * null → below_vr · reference → vr_vp · prevention → vp_vi · intervention → above_vi.
 */
export function bandFromSeverity(severity: unknown): ComplianceBand {
    switch (severity) {
        case 'intervention':
            return 'above_vi';
        case 'prevention':
            return 'vp_vi';
        case 'reference':
            return 'vr_vp';
        default:
            return 'below_vr';
    }
}

export interface ClassifyQuestion {
    readonly ok: boolean;
    readonly reason?: string;
    readonly questionText: string;
    readonly options: ReadonlyArray<{ readonly id: ComplianceBand; readonly label: string }>;
    readonly correctId: ComplianceBand;
    readonly multiSelect: false;
}

export interface ClassifyInput {
    readonly wellName: string;
    readonly parameterLabel?: string;
    readonly value?: number;
    readonly unit?: string;
    readonly correctBand: ComplianceBand;
}

/** Monta a pergunta de classificação (escolha única entre as 4 faixas). */
export function buildClassifyQuestion(input: ClassifyInput): ClassifyQuestion {
    if (!input || typeof input.wellName !== 'string' || !BAND_ORDER.includes(input.correctBand)) {
        return Object.freeze({
            ok: false,
            reason: 'Entrada inválida para a classificação.',
            questionText: '',
            options: Object.freeze([]),
            correctId: 'below_vr',
            multiSelect: false as const,
        });
    }
    const measure =
        input.parameterLabel && Number.isFinite(Number(input.value))
            ? ` (pior resultado: ${input.parameterLabel} = ${input.value}${input.unit ? ' ' + input.unit : ''})`
            : '';
    return Object.freeze({
        ok: true,
        questionText:
            `Observe o poço destacado ${input.wellName}${measure}. Em qual faixa ` +
            `regulatória ele se enquadra, considerando o pior resultado das suas medições?`,
        options: Object.freeze(BAND_ORDER.map((id) => Object.freeze({ id, label: BAND_LABELS[id] }))),
        correctId: input.correctBand,
        multiSelect: false as const,
    });
}

export interface ClassifyGrade {
    readonly passed: boolean;
    readonly score: 0 | 100;
    readonly correctId: ComplianceBand;
    readonly correctLabel: string;
}

/** Corrige a classificação (escolha única, exata). */
export function gradeClassify(answer: unknown, correctBand: ComplianceBand): ClassifyGrade {
    const passed = answer === correctBand;
    return Object.freeze({
        passed,
        score: passed ? 100 : 0,
        correctId: correctBand,
        correctLabel: BAND_LABELS[correctBand],
    });
}
