// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   REMEDIATION-DECISION (pure) — LMS-INTERACTIVE-ASSESS-001 F4 / RF-10
   ================================================================
   Calvin 2026-06-14: "dada a caracterização, escolher a técnica e justificá-la
   contra eficácia/custo/prazo". Dado um PERFIL do sítio (fase do contaminante,
   matriz, razão de excedência ao VI, receptor), o aluno escolhe a técnica de
   remediação. A adequação NÃO é hardcoded por opção isolada — é DERIVADA do
   cruzamento perfil↔aplicabilidade da técnica (regra determinística), reusando
   o conhecimento de domínio (não os solvers — ver NOT da spec).

   Provenance: fases NAPL/dissolvido/vadosa e técnicas (P&T, SVE, MNA, escavação,
   bombeamento de fase livre) seguem a prática consolidada (USEPA/CETESB).

   PURE: sem IO/DOM/THREE. Testável isoladamente.
   ================================================================ */

/** Fase/condição dominante do problema — define quais técnicas se aplicam. */
export type ContaminantPhase =
    | 'dissolved' // pluma dissolvida em água subterrânea
    | 'lnapl' // fase livre leve (produto sobrenadante)
    | 'vadose_volatile' // contaminação volátil na zona não saturada
    | 'soil_shallow'; // solo superficial (fonte localizada/rasa)

export interface SiteProfile {
    readonly contaminant: string; // ex.: 'BTEX'
    readonly phase: ContaminantPhase;
    readonly matrix: 'groundwater' | 'soil' | 'soil_gas';
    /** razão concentração/VI (>1 = acima do Valor de Intervenção). */
    readonly exceedanceRatio: number;
    readonly receptorRisk: 'low' | 'high';
}

export interface RemediationTechnique {
    readonly id: string;
    readonly label: string;
    /** fases para as quais a técnica é ADEQUADA. */
    readonly suitableFor: readonly ContaminantPhase[];
    readonly costCents: number;
    readonly durationDays: number;
    /** eficácia esperada 0–100 para a(s) fase(s) adequada(s). */
    readonly efficacy: number;
    /** justificativa exibida (feedback pedagógico). */
    readonly rationale: string;
}

export interface TechniqueEvaluation {
    readonly id: string;
    readonly suitable: boolean;
    /** índice de mérito (eficácia ajustada por custo/prazo) — só p/ adequadas. */
    readonly merit: number;
}

const COST_REF_CENTS = 5_000_000; // referência de normalização (~R$ 50k)
const DURATION_REF_DAYS = 180;

/** Avalia uma técnica contra o perfil: adequada? mérito (eficácia/custo/prazo)? */
export function evaluateTechnique(
    profile: SiteProfile,
    tech: RemediationTechnique,
): TechniqueEvaluation {
    const suitable = Array.isArray(tech.suitableFor) && tech.suitableFor.includes(profile.phase);
    if (!suitable) return Object.freeze({ id: tech.id, suitable: false, merit: 0 });
    const eff = Math.min(100, Math.max(0, tech.efficacy || 0));
    const costPenalty = Math.min(40, (Math.max(0, tech.costCents || 0) / COST_REF_CENTS) * 20);
    const timePenalty = Math.min(20, (Math.max(0, tech.durationDays || 0) / DURATION_REF_DAYS) * 10);
    const merit = Math.max(0, Math.round(eff - costPenalty - timePenalty));
    return Object.freeze({ id: tech.id, suitable: true, merit });
}

/** Escolhe a melhor técnica ADEQUADA (maior mérito; desempate por id). */
export function selectBestTechnique(
    profile: SiteProfile,
    techniques: readonly RemediationTechnique[],
): RemediationTechnique | null {
    const ranked = (techniques || [])
        .map((t) => ({ t, ev: evaluateTechnique(profile, t) }))
        .filter((x) => x.ev.suitable)
        .sort((a, b) => (b.ev.merit !== a.ev.merit ? b.ev.merit - a.ev.merit : a.t.id < b.t.id ? -1 : 1));
    return ranked.length ? ranked[0]!.t : null;
}

export interface RemediationDecisionQuestion {
    readonly ok: boolean;
    readonly reason?: string;
    readonly questionText: string;
    readonly profileSummary: string;
    readonly options: ReadonlyArray<{ readonly id: string; readonly label: string }>;
    /** ids de TODAS as técnicas adequadas (passa). */
    readonly suitableIds: readonly string[];
    /** id da melhor (nota cheia). */
    readonly bestId: string;
    readonly multiSelect: false;
}

const PHASE_LABEL: Readonly<Record<ContaminantPhase, string>> = Object.freeze({
    dissolved: 'pluma dissolvida na água subterrânea',
    lnapl: 'fase livre (produto sobrenadante)',
    vadose_volatile: 'contaminação volátil na zona não saturada',
    soil_shallow: 'fonte rasa em solo',
});

/** Monta a pergunta de decisão de remediação (escolha única). */
export function buildRemediationDecision(
    profile: SiteProfile,
    techniques: readonly RemediationTechnique[],
): RemediationDecisionQuestion {
    const valid = (techniques || []).filter((t) => t && typeof t.id === 'string');
    const best = selectBestTechnique(profile, valid);
    const suitableIds = valid.filter((t) => evaluateTechnique(profile, t).suitable).map((t) => t.id);
    if (!profile || !best || valid.length < 2) {
        return Object.freeze({
            ok: false,
            reason: 'Perfil incompleto ou técnicas insuficientes para a decisão.',
            questionText: '',
            profileSummary: '',
            options: Object.freeze([]),
            suitableIds: Object.freeze([]),
            bestId: '',
            multiSelect: false as const,
        });
    }
    const profileSummary =
        `${profile.contaminant} — ${PHASE_LABEL[profile.phase]}; ` +
        `excedência ≈ ${profile.exceedanceRatio}× o VI; ` +
        `risco ao receptor: ${profile.receptorRisk === 'high' ? 'alto' : 'baixo'}.`;
    return Object.freeze({
        ok: true,
        questionText:
            'Considerando a caracterização do sítio, qual técnica de remediação é a mais ' +
            'adequada — equilibrando eficácia, custo e prazo?',
        profileSummary,
        options: Object.freeze(valid.map((t) => Object.freeze({ id: t.id, label: t.label }))),
        suitableIds: Object.freeze(suitableIds),
        bestId: best.id,
        multiSelect: false as const,
    });
}

export interface RemediationDecisionGrade {
    readonly passed: boolean;
    readonly score: 0 | 70 | 100;
    readonly bestId: string;
    readonly bestLabel: string;
    readonly chosenSuitable: boolean;
    readonly hint?: string;
}

/**
 * Corrige a decisão. 100 se escolheu a melhor; 70 se escolheu uma técnica
 * ADEQUADA (mas não a melhor); 0 se escolheu técnica inadequada à fase.
 */
export function gradeRemediationDecision(
    answerId: unknown,
    profile: SiteProfile,
    techniques: readonly RemediationTechnique[],
): RemediationDecisionGrade {
    const best = selectBestTechnique(profile, techniques);
    const chosen = (techniques || []).find((t) => t && t.id === answerId) || null;
    const bestId = best ? best.id : '';
    const bestLabel = best ? best.label : '';
    const chosenSuitable = !!chosen && evaluateTechnique(profile, chosen).suitable;

    if (chosen && best && chosen.id === best.id) {
        return Object.freeze({ passed: true, score: 100, bestId, bestLabel, chosenSuitable: true });
    }
    if (chosenSuitable) {
        return Object.freeze({
            passed: true,
            score: 70,
            bestId,
            bestLabel,
            chosenSuitable: true,
            hint: `Técnica adequada, mas há opção melhor em eficácia/custo/prazo: ${bestLabel}.`,
        });
    }
    return Object.freeze({
        passed: false,
        score: 0,
        bestId,
        bestLabel,
        chosenSuitable: false,
        hint: `Técnica inadequada para ${PHASE_LABEL[profile?.phase] || 'esta fase'}. A melhor opção seria ${bestLabel}.`,
    });
}
