// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ORDER-INVESTIGATION (pure) — LMS-INTERACTIVE-ASSESS-001 F4 / RF-9
   ================================================================
   Calvin 2026-06-14: "o aluno escolhe QUAL investigação rodar e recebe o dado;
   ensina ESTRATÉGIA de investigação". Dado um conjunto de LACUNAS de
   conhecimento (gaps) com prioridade e um catálogo de investigações (cada uma
   preenche uma lacuna a um custo/valor-de-informação), o gerador PURO monta a
   pergunta e computa qual é a melhor investigação a fazer AGORA: a que ataca a
   lacuna de maior prioridade ainda aberta, desempatando por maior valor de
   informação e, então, menor custo.

   A "resposta certa" NÃO é hardcoded por opção — é DERIVADA das prioridades das
   lacunas e dos atributos das investigações (regra determinística, auditável).

   PURE: sem IO/DOM/THREE. Testável isoladamente.
   ================================================================ */

export interface KnowledgeGap {
    readonly id: string;
    readonly label: string;
    /** 1 = prioridade máxima (atacar primeiro); números maiores = menor prioridade. */
    readonly priority: number;
    /** lacuna já preenchida em passos anteriores (não deve ser re-investigada). */
    readonly filled?: boolean;
}

export interface InvestigationOption {
    readonly id: string;
    readonly label: string;
    /** id da lacuna que esta investigação preenche. */
    readonly fillsGapId: string;
    readonly costCents: number;
    /** valor de informação 0–100 (quão decisivo é o dado obtido). */
    readonly infoValue: number;
    /** resultado/dado exibido ao escolher (feedback pedagógico). */
    readonly result: string;
}

export interface OrderInvestigationQuestion {
    readonly ok: boolean;
    readonly reason?: string;
    readonly questionText: string;
    readonly options: ReadonlyArray<{ readonly id: string; readonly label: string }>;
    /** id da melhor investigação a fazer agora (derivado das prioridades). */
    readonly correctId: string;
    readonly multiSelect: false;
}

/**
 * Seleciona a melhor investigação dado o estado das lacunas. Regra:
 * 1) considerar só investigações cuja lacuna ainda está ABERTA;
 * 2) preferir a lacuna de menor `priority` (mais urgente);
 * 3) desempatar por maior `infoValue`; depois por menor `costCents`; depois id.
 * Retorna null se não há investigação aplicável.
 */
export function selectBestInvestigation(
    gaps: readonly KnowledgeGap[],
    options: readonly InvestigationOption[],
): InvestigationOption | null {
    const priorityByGap = new Map<string, number>();
    const openGap = new Set<string>();
    for (const g of gaps || []) {
        if (!g || typeof g.id !== 'string') continue;
        priorityByGap.set(g.id, Number.isFinite(g.priority) ? g.priority : 999);
        if (g.filled !== true) openGap.add(g.id);
    }
    const applicable = (options || []).filter(
        (o) => o && typeof o.id === 'string' && openGap.has(o.fillsGapId),
    );
    if (applicable.length === 0) return null;

    return applicable.slice().sort((a, b) => {
        const pa = priorityByGap.get(a.fillsGapId) ?? 999;
        const pb = priorityByGap.get(b.fillsGapId) ?? 999;
        if (pa !== pb) return pa - pb; // menor priority = mais urgente
        const va = Number.isFinite(a.infoValue) ? a.infoValue : 0;
        const vb = Number.isFinite(b.infoValue) ? b.infoValue : 0;
        if (va !== vb) return vb - va; // maior valor de informação
        const ca = Math.max(0, a.costCents || 0);
        const cb = Math.max(0, b.costCents || 0);
        if (ca !== cb) return ca - cb; // menor custo
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })[0]!;
}

/** Monta a pergunta de estratégia de investigação (escolha única). */
export function buildOrderInvestigationQuestion(
    scenario: string,
    gaps: readonly KnowledgeGap[],
    options: readonly InvestigationOption[],
): OrderInvestigationQuestion {
    const best = selectBestInvestigation(gaps, options);
    const valid = (options || []).filter((o) => o && typeof o.id === 'string' && o.id.length > 0);
    if (!best || valid.length < 2) {
        return Object.freeze({
            ok: false,
            reason: 'Sem lacunas abertas ou investigações insuficientes para a pergunta.',
            questionText: '',
            options: Object.freeze([]),
            correctId: '',
            multiSelect: false as const,
        });
    }
    return Object.freeze({
        ok: true,
        questionText:
            (typeof scenario === 'string' && scenario ? scenario + ' ' : '') +
            'Qual é a investigação mais adequada para fazer AGORA, considerando o que ' +
            'ainda é desconhecido e a prioridade de cada lacuna?',
        options: Object.freeze(valid.map((o) => Object.freeze({ id: o.id, label: o.label }))),
        correctId: best.id,
        multiSelect: false as const,
    });
}

export interface OrderInvestigationGrade {
    readonly passed: boolean;
    readonly score: 0 | 60 | 100;
    readonly correctId: string;
    readonly correctLabel: string;
    /** dica quando a escolha foi subótima (lacuna de menor prioridade). */
    readonly hint?: string;
}

/**
 * Corrige a escolha. 100 se escolheu a melhor; 60 se escolheu uma investigação
 * APLICÁVEL (preenche uma lacuna aberta) mas não a prioritária; 0 caso contrário.
 */
export function gradeOrderInvestigation(
    answerId: unknown,
    gaps: readonly KnowledgeGap[],
    options: readonly InvestigationOption[],
): OrderInvestigationGrade {
    const best = selectBestInvestigation(gaps, options);
    const correctId = best ? best.id : '';
    const correctLabel = best ? best.label : '';
    const chosen = (options || []).find((o) => o && o.id === answerId) || null;

    if (chosen && best && chosen.id === best.id) {
        return Object.freeze({ passed: true, score: 100, correctId, correctLabel });
    }

    const openGap = new Set(
        (gaps || []).filter((g) => g && g.filled !== true).map((g) => g.id),
    );
    if (chosen && openGap.has(chosen.fillsGapId)) {
        return Object.freeze({
            passed: false,
            score: 60,
            correctId,
            correctLabel,
            hint: 'Investigação válida, mas não a de maior prioridade. Ataque primeiro a lacuna mais crítica.',
        });
    }
    return Object.freeze({
        passed: false,
        score: 0,
        correctId,
        correctLabel,
        hint: 'Essa investigação não preenche uma lacuna aberta — revise o que ainda é desconhecido.',
    });
}
