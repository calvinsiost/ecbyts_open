// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ORDERING EXERCISE (pure) — LMS-INTERACTIVE-ASSESS-001 F5 / RF-11+RF-12
   ================================================================
   Calvin 2026-06-14: tipos `emergency` (resposta cronometrada) e `checklist`
   (procedimento de campo) são, ambos, problemas de ORDENAÇÃO — pôr uma
   sequência de passos na ordem correta. Este motor PURO serve os dois: dado a
   ordem canônica + a ordem do aluno, corrige por CONCORDÂNCIA de pares (Kendall
   tau, crédito parcial) e aplica VETO quando um passo CRÍTICO fica fora de lugar
   (ex.: notificar antes de conter o vazamento). Não-compensatório (padrão EIS).

   Cronômetro (KQ4 — TBD Calvin): `timeLimitS` é OPCIONAL e declarativo. Este
   motor NÃO reprova por tempo; expõe um sinal `withinTime` para a UI usar quando
   Calvin decidir. Default: sem limite.

   PURE: sem IO/DOM/THREE. Testável isoladamente.
   ================================================================ */

export type OrderingCategory = 'emergency' | 'checklist';

export interface OrderingStep {
    readonly id: string;
    readonly label: string;
    /** passo cuja POSIÇÃO é crítica — fora de ordem grave gera veto. */
    readonly critical?: boolean;
    readonly rationale?: string;
}

export interface OrderingExercise {
    readonly id: string;
    readonly category: OrderingCategory;
    readonly title: string;
    readonly scenario: string;
    /** passos na ORDEM CANÔNICA correta. */
    readonly steps: readonly OrderingStep[];
    /** KQ4 — limite de tempo opcional (s). NÃO reprova; só sinaliza. */
    readonly timeLimitS?: number;
}

/** Passos embaralhados de forma DETERMINÍSTICA (para apresentação estável). */
export function shuffledSteps(exercise: OrderingExercise): readonly OrderingStep[] {
    const steps = (exercise?.steps || []).slice();
    // Embaralhamento determinístico: ordena por hash estável do id (sem RNG).
    return Object.freeze(
        steps.sort((a, b) => {
            const ha = _hash(a.id);
            const hb = _hash(b.id);
            return ha !== hb ? ha - hb : a.id < b.id ? -1 : 1;
        }),
    );
}

function _hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export interface OrderingGrade {
    readonly passed: boolean;
    readonly score: number; // 0–100
    readonly band: 'A' | 'B' | 'C' | 'D' | 'F';
    /** pares na ordem relativa correta / total de pares. */
    readonly concordant: number;
    readonly totalPairs: number;
    /** passos críticos colocados fora de ordem (gera veto). */
    readonly criticalViolations: readonly string[];
    /** sinal de tempo (só se timeLimitS definido e elapsedS passado). */
    readonly withinTime?: boolean;
    readonly correctOrder: readonly string[];
    readonly summary: string;
}

function _bandOf(score: number, veto: boolean): OrderingGrade['band'] {
    if (veto) return 'F';
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
}

/**
 * Corrige a ordenação do aluno contra a canônica.
 * @param studentOrder ids na ordem escolhida pelo aluno.
 * @param exercise exercício (ordem canônica + passos críticos).
 * @param opts.elapsedS tempo gasto (s) — só usado se exercise.timeLimitS definido.
 */
export function gradeOrdering(
    studentOrder: readonly string[],
    exercise: OrderingExercise,
    opts: { elapsedS?: number } = {},
): OrderingGrade {
    const canonical = (exercise?.steps || []).map((s) => s.id);
    const rank = new Map<string, number>();
    canonical.forEach((id, i) => rank.set(id, i));
    const criticalIds = new Set(
        (exercise?.steps || []).filter((s) => s.critical === true).map((s) => s.id),
    );

    // ordem do aluno: só ids conhecidos, sem duplicatas, preservando a 1ª ocorrência.
    const seen = new Set<string>();
    const order: string[] = [];
    for (const id of studentOrder || []) {
        if (rank.has(id) && !seen.has(id)) {
            seen.add(id);
            order.push(id);
        }
    }

    const n = order.length;
    const totalPairs = (n * (n - 1)) / 2;
    let concordant = 0;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if ((rank.get(order[i]!) ?? 0) < (rank.get(order[j]!) ?? 0)) concordant++;
        }
    }
    const score = totalPairs === 0 ? (n === canonical.length ? 100 : 0) : Math.round((concordant / totalPairs) * 100);

    // veto: passo crítico precedido (na ordem do aluno) por um passo que
    // canonicamente DEVERIA vir depois dele.
    const criticalViolations: string[] = [];
    for (let i = 0; i < n; i++) {
        const id = order[i]!;
        if (!criticalIds.has(id)) continue;
        for (let k = 0; k < i; k++) {
            if ((rank.get(order[k]!) ?? 0) > (rank.get(id) ?? 0)) {
                criticalViolations.push(id);
                break;
            }
        }
    }
    const incomplete = n !== canonical.length;
    const veto = criticalViolations.length > 0;
    const band = _bandOf(score, veto);
    const passed = !veto && !incomplete && score >= 60;

    const withinTime =
        Number.isFinite(exercise?.timeLimitS) && Number.isFinite(opts.elapsedS)
            ? (opts.elapsedS as number) <= (exercise.timeLimitS as number)
            : undefined;

    const summary = veto
        ? 'Passo crítico fora de ordem — reveja a sequência de prioridade.'
        : incomplete
          ? 'Ordene todos os passos para concluir.'
          : passed
            ? 'Sequência adequada.'
            : 'Sequência parcialmente correta — ajuste a ordem.';

    return Object.freeze({
        passed,
        score,
        band,
        concordant,
        totalPairs,
        criticalViolations: Object.freeze(criticalViolations),
        ...(withinTime === undefined ? {} : { withinTime }),
        correctOrder: Object.freeze(canonical),
        summary,
    });
}
