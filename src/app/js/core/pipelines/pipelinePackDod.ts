// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PACK DOD - pure Definition of Done evaluator.
   ================================================================ */

export interface PipelinePackDodEvidence {
    userCanImportOrCreate?: boolean;
    hasSummary?: boolean;
    canEditDePara?: boolean;
    score?: number;
    minScore?: number;
    foregroundVisual?: number;
    minForegroundVisual?: number;
    trainingOpensContext?: boolean;
    ecbtRoundTrip?: boolean;
    filesPermissionsReady?: boolean;
    noRandomFallback?: boolean;
    focusedTestsPass?: boolean;
    specLinked?: boolean;
}

export interface PipelinePackDodItem {
    id: string;
    label: string;
    done: boolean;
    evidence: string;
}

export interface PipelinePackDodStatus {
    total: number;
    done: number;
    percent: number;
    blocked: PipelinePackDodItem[];
    items: PipelinePackDodItem[];
}

function _item(id: string, label: string, done: boolean, evidence: string): PipelinePackDodItem {
    return { id, label, done, evidence };
}

export function evaluatePipelinePackDod(evidence: PipelinePackDodEvidence): PipelinePackDodStatus {
    const minScore = Number.isFinite(Number(evidence.minScore)) ? Number(evidence.minScore) : 980;
    const minVisual = Number.isFinite(Number(evidence.minForegroundVisual)) ? Number(evidence.minForegroundVisual) : 95;
    const score = Number(evidence.score);
    const visual = Number(evidence.foregroundVisual);
    const items = [
        _item('create-import', 'Usuario consegue criar/importar um Pipeline Pack sem entender detalhes tecnicos.', Boolean(evidence.userCanImportOrCreate), 'Fluxo de criacao/importacao visivel.'),
        _item('summary', 'Usuario ve o que encontrara neste processo.', Boolean(evidence.hasSummary), 'Sumario lateral ou tela de entrada disponivel.'),
        _item('depara', 'Usuario edita de-para entre parte do processo e modulo equivalente.', Boolean(evidence.canEditDePara), 'Editor de destino/fallback disponivel.'),
        _item('score', `Score local fica acima de ${minScore}/1000.`, Number.isFinite(score) && score >= minScore, `${Number.isFinite(score) ? score : 'sem score'}/1000.`),
        _item('visual', `Fidelidade visual fica acima de ${minVisual}%.`, Number.isFinite(visual) && visual >= minVisual, `${Number.isFinite(visual) ? visual : 'sem medicao'}%.`),
        _item('training', 'Training abre Pipelines no contexto correto.', Boolean(evidence.trainingOpensContext), 'Aula preserva origem e retorno.'),
        _item('ecbt', 'Export/import .ecbt preserva pack, destinos e variantes.', Boolean(evidence.ecbtRoundTrip), 'Round-trip sem perda critica.'),
        _item('files', 'Assets privados usam Files/Supabase com permissao correta.', Boolean(evidence.filesPermissionsReady), 'Manifesto e permissoes revisados.'),
        _item('fallback', 'Nenhum clique abre item aleatorio como plano B silencioso.', Boolean(evidence.noRandomFallback), 'Destino incompleto bloqueia abertura aleatoria.'),
        _item('tests', 'Testes cheap e visuais focados passam.', Boolean(evidence.focusedTestsPass), 'Gates focados verdes.'),
        _item('spec', 'Spec revisada e relacionada.', Boolean(evidence.specLinked), 'Checklist e relacao de spec atualizados.'),
    ];
    const done = items.filter((item) => item.done).length;
    const total = items.length;
    return {
        total,
        done,
        percent: total ? Math.round((done / total) * 1000) / 10 : 0,
        blocked: items.filter((item) => !item.done),
        items,
    };
}
