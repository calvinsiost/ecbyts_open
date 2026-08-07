// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Classificação GAC (Gerenciamento de Áreas Contaminadas) — Decreto Estadual SP
// 59.263/2013 + CETESB DD 038/2017/C. Função pura: a partir de fatos da investigação
// (potencial, indícios, excedências de VI, fase livre, perigo, resíduo perigoso, risco)
// determina a classe da área (AP/AS/ACI/ACRi/...). Alimenta o MCA, os relatórios
// CETESB e o mapa de uso/ocupação do solo (Cap 4/5/11 da Avaliação Preliminar).
//
// Critério ACI = art. 28 do Decreto 59.263/2013 (concentração > VI, ou produto em fase
// livre, ou perigo, ou resíduo perigoso em desacordo).

export type GacClass =
    | 'AP'
    | 'AS'
    | 'ACI'
    | 'ACRi'
    | 'ACRe'
    | 'ACRu'
    | 'ACcritica'
    | 'AME'
    | 'AR';

export type GacClassInfo = { code: GacClass; label: string; description: string; phase: string };

/** Catálogo das classes GAC (Decreto SP 59.263/2013). Congelado. */
export const GAC_CLASSES: Readonly<Record<GacClass, GacClassInfo>> = Object.freeze({
    AP: { code: 'AP', label: 'Área com Potencial de Contaminação', description: 'Atividade com potencial de contaminação; sem investigação confirmatória.', phase: 'identificação' },
    AS: { code: 'AS', label: 'Área Suspeita de Contaminação', description: 'Avaliação Preliminar identificou indícios/suspeita de contaminação.', phase: 'avaliação preliminar' },
    ACI: { code: 'ACI', label: 'Área Contaminada sob Investigação', description: 'Concentração acima do VI, produto em fase livre, perigo ou resíduo perigoso (art. 28).', phase: 'investigação confirmatória' },
    ACRi: { code: 'ACRi', label: 'Área Contaminada com Risco confirmado', description: 'Avaliação de Risco confirmou risco à saúde/bens a proteger.', phase: 'investigação detalhada / risco' },
    ACRe: { code: 'ACRe', label: 'Área Contaminada em processo de Remediação', description: 'Em execução de intervenção/remediação.', phase: 'remediação' },
    ACRu: { code: 'ACRu', label: 'Área Contaminada em processo de Reutilização', description: 'Reutilização sob controle/restrição.', phase: 'reutilização' },
    ACcritica: { code: 'ACcritica', label: 'Área Contaminada Crítica', description: 'Risco que exige intervenção emergencial imediata.', phase: 'emergencial' },
    AME: { code: 'AME', label: 'Área em Monitoramento para Encerramento', description: 'Metas atingidas; monitoramento para encerramento.', phase: 'monitoramento' },
    AR: { code: 'AR', label: 'Área Reabilitada', description: 'Reabilitada para o uso declarado.', phase: 'encerrado' },
});

export type GacFacts = {
    /** Atividade com potencial de contaminação identificada. */
    hasContaminationPotential?: boolean;
    /** Avaliação Preliminar levantou indícios/suspeita. */
    preliminaryIndicios?: boolean;
    /** Concentração acima do Valor de Intervenção (VI). */
    exceedsIntervention?: boolean;
    /** Produto/substância em fase livre. */
    freeProduct?: boolean;
    /** Perigo (art. 19 §3º). */
    danger?: boolean;
    /** Resíduo perigoso disposto em desacordo. */
    hazardousWaste?: boolean;
    /** Avaliação de Risco confirmou risco. */
    riskConfirmed?: boolean;
    /** Em processo de remediação. */
    inRemediation?: boolean;
    /** Em monitoramento para encerramento. */
    inMonitoringForClosure?: boolean;
    /** Reabilitada. */
    rehabilitated?: boolean;
    /** Risco crítico / emergencial. */
    critical?: boolean;
};

export type GacClassification = { code: GacClass | null; label: string; rationale: string };

/** True se algum dos quatro gatilhos do art. 28 (ACI) está presente. */
export function meetsArt28(f: GacFacts): boolean {
    return !!(f && (f.exceedsIntervention || f.freeProduct || f.danger || f.hazardousWaste));
}

/**
 * Classifica a área segundo a fase mais avançada atingida pelos fatos (Decreto 59.263).
 * Ordem de precedência (mais avançada → menos): AR > AME > ACRu > ACRe > ACcritica >
 * ACRi > ACI > AS > AP. Retorna { code, label, rationale } ou code:null se nada se aplica.
 */
export function classifyGacStatus(facts: GacFacts): GacClassification {
    const f = facts || {};
    const out = (code: GacClass, rationale: string): GacClassification => ({ code, label: GAC_CLASSES[code].label, rationale });

    if (f.rehabilitated) return out('AR', 'Área reabilitada para o uso declarado.');
    if (f.inMonitoringForClosure) return out('AME', 'Em monitoramento para encerramento.');
    if (f.inRemediation) return out('ACRe', 'Em processo de remediação.');
    if (f.critical) return out('ACcritica', 'Risco crítico — intervenção emergencial.');
    if (f.riskConfirmed) return out('ACRi', 'Avaliação de Risco confirmou risco.');
    if (meetsArt28(f)) {
        const triggers: string[] = [];
        if (f.exceedsIntervention) triggers.push('concentração > VI');
        if (f.freeProduct) triggers.push('produto em fase livre');
        if (f.danger) triggers.push('perigo (art. 19 §3º)');
        if (f.hazardousWaste) triggers.push('resíduo perigoso em desacordo');
        return out('ACI', `Art. 28 do Decreto 59.263/2013: ${triggers.join('; ')}.`);
    }
    if (f.preliminaryIndicios) return out('AS', 'Avaliação Preliminar identificou indícios de contaminação.');
    if (f.hasContaminationPotential) return out('AP', 'Atividade com potencial de contaminação identificada.');
    return { code: null, label: 'Não classificada', rationale: 'Fatos insuficientes para classificação GAC.' };
}

/** Deriva fatos GAC a partir de uma lista de excedências (formato de _aiReportDataGroundingPure). */
export function gacFactsFromExceedances(exceedances: any[]): GacFacts {
    const ex = Array.isArray(exceedances) ? exceedances : [];
    const exceeds = ex.some((e) => e && e.status === 'exceeds');
    return { exceedsIntervention: exceeds, hasContaminationPotential: ex.length > 0 };
}

/** Rótulo legível de uma classe GAC. */
export function gacStatusLabel(code: GacClass | null): string {
    if (code && code in GAC_CLASSES) return GAC_CLASSES[code as GacClass].label;
    return 'Não classificada';
}
