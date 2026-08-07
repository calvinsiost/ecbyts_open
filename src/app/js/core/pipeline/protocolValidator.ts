import type {
    PipelineProtocolDocument,
    PipelineProtocolConnector,
    PipelineProtocolGate,
    PipelineProtocolActivity,
    PipelineProtocolDataEntity,
    PipelineProtocolElement,
} from '../pipelines/pipelineProtocol.js';

export type ProtocolValidationSeverity = 'error' | 'warning';

export interface ProtocolValidationFinding {
    ruleId: string;
    severity: ProtocolValidationSeverity;
    message: string;
    ownerItemId: string;
    blocksPublish: boolean;
    suggestedFix: string;
}

export type ProtocolValidationRuleId =
    | 'R1-connector-integrity'
    | 'R2-gate-criteria'
    | 'R3-activity-required-fields'
    | 'R4-data-traceability'
    | 'R5-visual-semantic-source'
    | 'R6-score-completeness'
    | 'R7-export-metadata';

const SCORE_DIMENSIONS = [
    'visualFidelity',
    'structuralCoverage',
    'semanticCompleteness',
    'traceability',
    'permission',
    'performance',
] as const;

function _nonEmpty(value: unknown): string {
    return String(value ?? '').trim();
}

function _finding(
    ruleId: ProtocolValidationRuleId,
    severity: ProtocolValidationSeverity,
    message: string,
    ownerItemId: string,
    suggestedFix: string,
): ProtocolValidationFinding {
    return { ruleId, severity, message, ownerItemId, blocksPublish: severity === 'error', suggestedFix };
}

function _checkConnectorIntegrity(doc: PipelineProtocolDocument): ProtocolValidationFinding[] {
    const findings: ProtocolValidationFinding[] = [];
    const elementIds = new Set(doc.elements.map((e: PipelineProtocolElement) => e.id));

    for (const c of doc.connectors) {
        const connector = c as PipelineProtocolConnector;
        if (!connector.sourceId || !elementIds.has(connector.sourceId)) {
            findings.push(_finding(
                'R1-connector-integrity', 'error',
                `Conector "${connector.id}" sem origem valida.`,
                connector.id,
                'Apontar o conector para uma atividade existente no processo.',
            ));
        }
        if (!connector.targetId || !elementIds.has(connector.targetId)) {
            findings.push(_finding(
                'R1-connector-integrity', 'error',
                `Conector "${connector.id}" sem destino valido.`,
                connector.id,
                'Apontar o conector para uma atividade existente no processo.',
            ));
        }
        if (!connector.kind) {
            findings.push(_finding(
                'R1-connector-integrity', 'error',
                `Conector "${connector.id}" sem tipo definido.`,
                connector.id,
                'Definir o tipo do conector (control-flow, data-association, reference).',
            ));
        }
        if (connector.required
            && (!connector.dataRefs || connector.dataRefs.length === 0)
            && (!connector.evidenceRefs || connector.evidenceRefs.length === 0)
            && !_nonEmpty(connector.semanticJustification)) {
            findings.push(_finding(
                'R1-connector-integrity', 'error',
                `Conector obrigatorio "${connector.id}" sem dado, evidencia ou justificativa.`,
                connector.id,
                'Informar dado transportado, evidencia ou justificativa para o conector obrigatorio.',
            ));
        }
    }
    return findings;
}

function _checkGateCriteria(doc: PipelineProtocolDocument): ProtocolValidationFinding[] {
    const findings: ProtocolValidationFinding[] = [];

    for (const g of doc.gates) {
        const gate = g as PipelineProtocolGate;
        if (!gate.conditionalRoutes || gate.conditionalRoutes.length === 0) continue;
        for (const route of gate.conditionalRoutes) {
            const hasCriteria = _nonEmpty(route.conditionRef)
                || _nonEmpty(route.label)
                || (route.dataRefs && route.dataRefs.length > 0)
                || (route.evidenceRefs && route.evidenceRefs.length > 0);
            if (!hasCriteria) {
                findings.push(_finding(
                    'R2-gate-criteria', 'error',
                    `Gate "${gate.nodeId}" tem rota "${route.connectorId}" sem criterio por rota.`,
                    gate.nodeId,
                    'Preencher conditionRef, label, evidencia ou justificativa da rota condicional.',
                ));
            }
        }
    }
    return findings;
}

function _checkActivityRequiredFields(doc: PipelineProtocolDocument): ProtocolValidationFinding[] {
    const findings: ProtocolValidationFinding[] = [];
    const profileRequires = doc.domainProfileId !== 'generic';

    for (const a of doc.activities) {
        const activity = a as PipelineProtocolActivity;
        if (!activity.phaseId) {
            findings.push(_finding(
                'R3-activity-required-fields',
                profileRequires ? 'error' : 'warning',
                `Atividade "${activity.id}" sem fase vinculada.`,
                activity.id,
                'Atribuir a atividade a uma fase/etapa do processo.',
            ));
        }
        if (!activity.stakeholderId && !activity.responsiblePartyId) {
            findings.push(_finding(
                'R3-activity-required-fields',
                profileRequires ? 'error' : 'warning',
                `Atividade "${activity.id}" sem parte interessada ou responsavel.`,
                activity.id,
                'Vincular a atividade a uma parte interessada ou definir responsavel.',
            ));
        }
        if (!activity.dataNatureId) {
            findings.push(_finding(
                'R3-activity-required-fields',
                profileRequires ? 'error' : 'warning',
                `Atividade "${activity.id}" sem natureza de dados.`,
                activity.id,
                'Definir a natureza dos dados produzidos ou consumidos pela atividade.',
            ));
        }
    }
    return findings;
}

function _checkDataTraceability(doc: PipelineProtocolDocument): ProtocolValidationFinding[] {
    const findings: ProtocolValidationFinding[] = [];

    for (const d of doc.data) {
        const data = d as PipelineProtocolDataEntity;
        const hasOrigin = _nonEmpty(data.originRef);
        const hasEvidence = data.evidenceRefs && data.evidenceRefs.length > 0;
        const hasJustification = _nonEmpty(data.dataNatureId);
        if (!hasOrigin && !hasEvidence && !hasJustification) {
            findings.push(_finding(
                'R4-data-traceability', 'warning',
                `Dado "${data.id}" sem origem, evidencia ou justificativa.`,
                data.id,
                'Vincular documento de origem, evidencia ou justificativa para o dado.',
            ));
        }
    }
    return findings;
}

function _checkVisualSemanticSource(doc: PipelineProtocolDocument): ProtocolValidationFinding[] {
    const findings: ProtocolValidationFinding[] = [];

    for (const el of doc.elements) {
        const element = el as PipelineProtocolElement;
        const facets = element.facets || {};
        for (const key of Object.keys(facets)) {
            const facet = facets[key];
            if (!facet || typeof facet !== 'object') continue;
            const f = facet as Record<string, unknown>;
            const hasLayoutId = _nonEmpty(f.layoutId);
            const hasSemanticId = _nonEmpty(f.semanticId);
            const editableState = _nonEmpty(f.editableState);
            if (hasLayoutId && !hasSemanticId && editableState === 'full') {
                findings.push(_finding(
                    'R5-visual-semantic-source', 'error',
                    `Elemento "${element.id}" tem referencia visual sem fonte semantica e declara editabilidade completa.`,
                    element.id,
                    'Vincular fonte semantica (semanticId) ou reduzir editabilidade para parcial.',
                ));
            }
        }
    }
    return findings;
}

function _checkScoreCompleteness(doc: PipelineProtocolDocument): ProtocolValidationFinding[] {
    const findings: ProtocolValidationFinding[] = [];
    const facets = doc.facets || {};
    const protocolFacet = facets['ecbyts_protocol'] as Record<string, unknown> | undefined;
    const scoreFacet = (protocolFacet?.score ?? facets['ecbyts_score']) as Record<string, unknown> | undefined;

    if (!scoreFacet) {
        findings.push(_finding(
            'R6-score-completeness', 'warning',
            'Protocolo sem faceta de score; nao e possivel verificar dimensoes minimas.',
            doc.packId || 'pipeline-protocol',
            'Adicionar faceta de score com as 6 dimensoes: fidelidade visual, cobertura estrutural, completude semantica, rastreabilidade, permissao e performance.',
        ));
        return findings;
    }

    for (const dim of SCORE_DIMENSIONS) {
        if (scoreFacet[dim] === undefined || scoreFacet[dim] === null) {
            findings.push(_finding(
                'R6-score-completeness', 'warning',
                `Score do protocolo sem dimensao "${dim}".`,
                doc.packId || 'pipeline-protocol',
                `Adicionar a dimensao "${dim}" ao calculo de score do protocolo.`,
            ));
        }
    }
    return findings;
}

function _checkExportMetadata(doc: PipelineProtocolDocument): ProtocolValidationFinding[] {
    const findings: ProtocolValidationFinding[] = [];
    const ledger = doc.versionLedger;

    if (!ledger) {
        findings.push(_finding(
            'R7-export-metadata', 'error',
            'Protocolo sem ledger de versao; exportacao .ecbt incompleta.',
            doc.packId || 'pipeline-protocol',
            'Adicionar versionLedger com versao do protocolo e do pack.',
        ));
        return findings;
    }

    if (!_nonEmpty(ledger.protocolVersion)) {
        findings.push(_finding(
            'R7-export-metadata', 'error',
            'Ledger sem versao do protocolo.',
            doc.packId || 'pipeline-protocol',
            'Registrar a versao do protocolo no ledger.',
        ));
    }
    if (!_nonEmpty(ledger.packVersion)) {
        findings.push(_finding(
            'R7-export-metadata', 'error',
            'Ledger sem versao do pack.',
            doc.packId || 'pipeline-protocol',
            'Registrar a versao do pack no ledger.',
        ));
    }
    if (!_nonEmpty(doc.domainProfileId)) {
        findings.push(_finding(
            'R7-export-metadata', 'error',
            'Exportacao .ecbt sem perfil de dominio.',
            doc.packId || 'pipeline-protocol',
            'Definir o perfil de dominio antes de exportar.',
        ));
    }
    if (!_nonEmpty(ledger.originRef)) {
        findings.push(_finding(
            'R7-export-metadata', 'warning',
            'Ledger sem origem rastreavel; historico de exportacao incompleto.',
            doc.packId || 'pipeline-protocol',
            'Registrar a origem do pack no ledger para preservar historico.',
        ));
    }
    if (!ledger.changeSet || ledger.changeSet.length === 0) {
        findings.push(_finding(
            'R7-export-metadata', 'warning',
            'Ledger sem changeSet; historico de mudancas vazio.',
            doc.packId || 'pipeline-protocol',
            'Registrar mudancas relevantes no changeSet do ledger.',
        ));
    }
    return findings;
}

export function validateProtocol(doc: PipelineProtocolDocument): ProtocolValidationFinding[] {
    return [
        ..._checkConnectorIntegrity(doc),
        ..._checkGateCriteria(doc),
        ..._checkActivityRequiredFields(doc),
        ..._checkDataTraceability(doc),
        ..._checkVisualSemanticSource(doc),
        ..._checkScoreCompleteness(doc),
        ..._checkExportMetadata(doc),
    ];
}
