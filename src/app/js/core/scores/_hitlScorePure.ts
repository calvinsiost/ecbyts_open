// @ts-check
// SCORES-HEALTH-001 RF-11.2: Pure functions for HITL load + TCR@k metrics.
// Funções puras para calcular carga de intervenção humana (HITL) e
// Task Completion Rate com k intervenções máximas (TCR@k).

/** Um evento bruto de sessão (intervenção humana ou conclusão de tarefa). */
interface HitlEvent {
    type: string;
    activityKey?: string;
}

/** Opções de {@link computeHitlLoad}. */
interface HitlLoadOptions {
    /** Máximo de intervenções toleradas por tarefa concluída (TCR@k). */
    k?: number;
}

export function computeHitlLoad(events: readonly HitlEvent[] | null | undefined, options: HitlLoadOptions = {}) {
    const k = options.k ?? 1;
    if (!events || events.length === 0) {
        return { hitlLoad: null, tcrAtK: null, totalInterventions: 0, totalDone: 0, windowDescription: 'empty' };
    }
    const interventions = events.filter((e) => e.type === 'hitl_intervention');
    const doneEvents = events.filter((e) => e.type === 'task_done');
    const totalInterventions = interventions.length;
    const totalDone = doneEvents.length;
    if (totalDone === 0) {
        return { hitlLoad: null, tcrAtK: null, totalInterventions, totalDone: 0, windowDescription: 'no_done_tasks' };
    }
    const hitlLoad = totalInterventions / totalDone;
    const interventionsByKey = new Map();
    for (const iv of interventions) {
        const key = iv.activityKey || '';
        interventionsByKey.set(key, (interventionsByKey.get(key) || 0) + 1);
    }
    let doneWithAtMostK = 0;
    for (const done of doneEvents) {
        const key = done.activityKey || '';
        const ivCount = interventionsByKey.get(key) || 0;
        if (ivCount <= k) { doneWithAtMostK++; }
    }
    const tcrAtK = doneWithAtMostK / totalDone;
    return { hitlLoad, tcrAtK, totalInterventions, totalDone, windowDescription: totalDone + '_done_' + totalInterventions + '_intv' };
}

/** Resultado de {@link computeHitlLoad}. */
interface HitlLoadResult {
    hitlLoad: number | null;
    tcrAtK: number | null;
    totalInterventions: number;
    totalDone: number;
    windowDescription: string;
}

export function formatHitlScore(result: HitlLoadResult): string {
    if (result.hitlLoad === null) { return 'ABSENT'; }
    const hitlPct = (result.hitlLoad * 100).toFixed(1);
    const tcrPct = result.tcrAtK !== null ? (result.tcrAtK * 100).toFixed(1) : 'N/A';
    return 'HITL ' + hitlPct + '% | TCR@k ' + tcrPct + '% (' + result.totalDone + ' done, ' + result.totalInterventions + ' intv)';
}