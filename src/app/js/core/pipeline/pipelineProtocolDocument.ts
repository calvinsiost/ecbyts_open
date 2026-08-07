// @ts-check
// PIPELINE-UNIFIED-PROTOCOL RF-1: Schema PipelineProtocolDocument.
// Contrato unico acima de GAC/DD38, beneficiamento mineral e futuros pipelines.
// Referencias: BPMN 2.0.2, DMN 1.6, W3C PROV, OpenLineage facets.

export type ElementKind = 'activity' | 'decision' | 'data' | 'start' | 'end';
export type ConnectorKind = 'sequence' | 'data' | 'message' | 'association';
export type ConnectorDirection = 'unidirectional' | 'bidirectional';
export type FailureBehavior = 'block' | 'warn' | 'skip';
export type FindingSeverity = 'error' | 'warning' | 'info';
export type Compatibility = 'full' | 'partial' | 'breaking';

export interface ProtocolPhase {
  id: string;
  label: string;
  order: number;
  description?: string;
}

export interface ProtocolStakeholder {
  id: string;
  label: string;
  role: string;
  lane?: string;
}

export interface ProtocolDataNature {
  id: string;
  label: string;
  category: string;
  description?: string;
}

export interface ProtocolElement {
  id: string;
  kind: ElementKind;
  label: string;
  phaseRef?: string;
  stakeholderRef?: string;
  dataNatureRefs?: string[];
  description?: string;
}

export interface ProtocolConnector {
  id: string;
  kind: ConnectorKind;
  source: string;
  target: string;
  direction: ConnectorDirection;
  required: boolean;
  conditionRef?: string;
  dataRefs?: string[];
  evidenceRefs?: string[];
  failureBehavior: FailureBehavior;
  points?: Array<{ x: number; y: number }>;
}

export interface ProtocolDecisionBranch {
  id: string;
  label: string;
  criteria: string;
  targetRef: string;
}

export interface ProtocolDecisionGate {
  id: string;
  question: string;
  criteria: string[];
  branches: ProtocolDecisionBranch[];
  inputs: string[];
  fallbackBranch: string;
  notApplicableBranch?: string;
  approvalRule?: string;
}

export interface ProtocolProvenanceFacet {
  createdBy: string;
  updatedBy?: string;
  sourceDocument?: string;
  sourcePage?: number;
  evidenceRefs?: string[];
  standardRefs?: string[];
  version: string;
  changeReason?: string;
}

export interface ProtocolFacet {
  name: string;
  version: string;
  payload: Record<string, unknown>;
}

export interface ProtocolValidationFinding {
  severity: FindingSeverity;
  userMessage: string;
  technicalCode: string;
  ownerItemId: string;
  suggestedFix?: string;
  blocksPublish: boolean;
}

export interface ProtocolVersionLedger {
  protocolVersion: string;
  packVersion: string;
  sourceVersion?: string;
  migrationId?: string;
  changeSet?: string;
  compatibility: Compatibility;
}

export interface ProcessDomainProfile {
  domainId: string;
  vocabulary: Record<string, string>;
  requiredPhases: string[];
  stakeholderRoles: string[];
  dataNatureCatalog: string[];
  decisionTypes: string[];
  validationRules: string[];
  templates?: Record<string, unknown>;
}

export interface PipelineProtocolDocument {
  version: string;
  domainProfile: ProcessDomainProfile;
  phases: ProtocolPhase[];
  stakeholders: ProtocolStakeholder[];
  dataNatures: ProtocolDataNature[];
  elements: ProtocolElement[];
  connectors: ProtocolConnector[];
  decisions: ProtocolDecisionGate[];
  facets: ProtocolFacet[];
  versionLedger: ProtocolVersionLedger;
}

const ELEMENT_KINDS = new Set(['activity', 'decision', 'data', 'start', 'end']);
const CONNECTOR_KINDS = new Set(['sequence', 'data', 'message', 'association']);

function finding(
  severity: FindingSeverity,
  userMessage: string,
  technicalCode: string,
  ownerItemId: string,
  blocksPublish: boolean,
  suggestedFix?: string
): ProtocolValidationFinding {
  return {
    severity,
    userMessage,
    technicalCode,
    ownerItemId,
    blocksPublish,
    ...(suggestedFix ? { suggestedFix } : {}),
  };
}

type MaybeRecord = Record<string, unknown>;

function isRecord(v: unknown): v is MaybeRecord {
  return typeof v === 'object' && v !== null;
}

export function validateProtocolDocument(doc: unknown): ProtocolValidationFinding[] {
  const findings: ProtocolValidationFinding[] = [];
  if (!isRecord(doc)) {
    findings.push(finding('error', 'Documento de protocolo ausente ou invalido', 'DOC_MISSING', '', true));
    return findings;
  }

  const sections = ['phases', 'stakeholders', 'dataNatures', 'elements', 'connectors', 'decisions', 'facets'] as const;
  for (const s of sections) {
    if (!Array.isArray(doc[s])) {
      findings.push(finding('error', 'Secao obrigatoria ausente: ' + s, 'SECTION_MISSING', s, true, 'Adicionar array "' + s + '" ao documento'));
    }
  }
  if (!isRecord(doc.versionLedger)) {
    findings.push(finding('error', 'Version ledger ausente', 'LEDGER_MISSING', 'versionLedger', true));
  }
  if (!isRecord(doc.domainProfile)) {
    findings.push(finding('error', 'Perfil de dominio ausente', 'PROFILE_MISSING', 'domainProfile', true));
  }
  if (findings.length > 0) { return findings; }

  const elements = doc.elements as ProtocolElement[];
  const phases = doc.phases as ProtocolPhase[];
  const stakeholders = doc.stakeholders as ProtocolStakeholder[];
  const dataNatures = doc.dataNatures as ProtocolDataNature[];
  const decisions = doc.decisions as ProtocolDecisionGate[];
  const connectors = doc.connectors as ProtocolConnector[];
  const facets = doc.facets as ProtocolFacet[];
  const domainProfile = doc.domainProfile as ProcessDomainProfile;
  const versionLedger = doc.versionLedger as ProtocolVersionLedger;

  const elementIds = new Set(elements.map((e) => e.id));
  const phaseIds = new Set(phases.map((p) => p.id));
  const stakeholderIds = new Set(stakeholders.map((s) => s.id));
  const dataNatureIds = new Set(dataNatures.map((d) => d.id));
  const decisionIds = new Set(decisions.map((d) => d.id));

  for (const el of elements) {
    if (!el.id) {
      findings.push(finding('error', 'Elemento sem id', 'ELEMENT_NO_ID', el.label || '?', true));
      continue;
    }
    if (!ELEMENT_KINDS.has(el.kind)) {
      findings.push(finding('error', 'Elemento "' + el.id + '" com tipo invalido: ' + el.kind, 'ELEMENT_BAD_KIND', el.id, true, 'Usar: activity, decision, data, start, end'));
    }
    if (!el.label) {
      findings.push(finding('warning', 'Elemento "' + el.id + '" sem rotulo', 'ELEMENT_NO_LABEL', el.id, false));
    }
    if (el.kind === 'activity') {
      const profile = domainProfile;
      if (profile.requiredPhases.length > 0 && el.phaseRef && !phaseIds.has(el.phaseRef)) {
        findings.push(finding('error', 'Atividade "' + el.id + '" referencia fase inexistente: ' + el.phaseRef, 'ELEMENT_BAD_PHASE', el.id, true, 'Vincular a uma fase valida'));
      }
      if (profile.requiredPhases.length > 0 && !el.phaseRef) {
        findings.push(finding('error', 'Atividade "' + el.id + '" sem fase (perfil exige)', 'ELEMENT_MISSING_PHASE', el.id, true, 'Atribuir fase'));
      }
      if (profile.stakeholderRoles.length > 0 && !el.stakeholderRef) {
        findings.push(finding('error', 'Atividade "' + el.id + '" sem parte interessada (perfil exige)', 'ELEMENT_MISSING_STAKEHOLDER', el.id, true, 'Atribuir parte interessada'));
      }
      if (el.stakeholderRef && !stakeholderIds.has(el.stakeholderRef)) {
        findings.push(finding('error', 'Atividade "' + el.id + '" referencia parte inexistente: ' + el.stakeholderRef, 'ELEMENT_BAD_STAKEHOLDER', el.id, true));
      }
      if (profile.dataNatureCatalog.length > 0 && (!el.dataNatureRefs || el.dataNatureRefs.length === 0)) {
        findings.push(finding('warning', 'Atividade "' + el.id + '" sem natureza de dados (perfil exige)', 'ELEMENT_MISSING_DATANATURE', el.id, false, 'Vincular natureza de dados'));
      }
    }
    if (el.kind === 'data') {
      const hasOrigin = el.description || (el.dataNatureRefs && el.dataNatureRefs.length > 0);
      if (!hasOrigin) {
        findings.push(finding('warning', 'Dado "' + el.id + '" sem origem, evidencia ou justificativa', 'DATA_NO_ORIGIN', el.id, false, 'Adicionar descricao ou natureza'));
      }
    }
    if (el.dataNatureRefs) {
      for (const dn of el.dataNatureRefs) {
        if (!dataNatureIds.has(dn)) {
          findings.push(finding('error', 'Elemento "' + el.id + '" referencia natureza inexistente: ' + dn, 'ELEMENT_BAD_DATANATURE', el.id, true));
        }
      }
    }
  }

  for (const c of connectors) {
    if (!c.id) {
      findings.push(finding('error', 'Conector sem id', 'CONNECTOR_NO_ID', c.source + '->' + c.target, true));
      continue;
    }
    if (!CONNECTOR_KINDS.has(c.kind)) {
      findings.push(finding('error', 'Conector "' + c.id + '" com tipo invalido: ' + c.kind, 'CONNECTOR_BAD_KIND', c.id, true));
    }
    if (!c.source || !elementIds.has(c.source)) {
      findings.push(finding('error', 'Conector "' + c.id + '" sem origem valida', 'CONNECTOR_NO_SOURCE', c.id, true, 'Definir origem'));
    }
    if (!c.target || !elementIds.has(c.target)) {
      findings.push(finding('error', 'Conector "' + c.id + '" sem destino valido', 'CONNECTOR_NO_TARGET', c.id, true, 'Definir destino'));
    }
    if (c.required && (!c.dataRefs || c.dataRefs.length === 0) && (!c.evidenceRefs || c.evidenceRefs.length === 0)) {
      findings.push(finding('error', 'Conector obrigatorio "' + c.id + '" sem dado transportado ou justificativa', 'CONNECTOR_REQUIRED_NO_DATA', c.id, true, 'Declarar dado ou justificativa'));
    }
    if (c.conditionRef && !decisionIds.has(c.conditionRef)) {
      findings.push(finding('error', 'Conector "' + c.id + '" referencia decisao inexistente: ' + c.conditionRef, 'CONNECTOR_BAD_CONDITION', c.id, true));
    }
  }

  for (const d of decisions) {
    if (!d.id) {
      findings.push(finding('error', 'Gate de decisao sem id', 'DECISION_NO_ID', d.question || '?', true));
      continue;
    }
    if (d.branches.length > 1) {
      for (const b of d.branches) {
        if (!b.criteria) {
          findings.push(finding('error', 'Gate "' + d.id + '" ramo "' + b.id + '" sem criterio', 'DECISION_BRANCH_NO_CRITERIA', d.id, true, 'Definir criterio por rota'));
        }
      }
      if (!d.fallbackBranch) {
        findings.push(finding('error', 'Gate "' + d.id + '" com multiplas saidas sem fallback explicito', 'DECISION_NO_FALLBACK', d.id, true, 'Definir ramo de fallback'));
      }
    }
    if (!d.fallbackBranch && d.branches.length > 0) {
      const branchIds = new Set(d.branches.map((b) => b.id));
      if (!branchIds.has(d.fallbackBranch)) {
        findings.push(finding('warning', 'Gate "' + d.id + '" fallback referencia ramo inexistente', 'DECISION_BAD_FALLBACK', d.id, false));
      }
    }
    for (const b of d.branches) {
      if (b.targetRef && !elementIds.has(b.targetRef)) {
        findings.push(finding('error', 'Gate "' + d.id + '" ramo "' + b.id + '" referencia elemento inexistente: ' + b.targetRef, 'DECISION_BAD_TARGET', d.id, true));
      }
    }
  }

  for (const f of facets) {
    if (!f.name || !f.version) {
      findings.push(finding('warning', 'Facet sem nome ou versao', 'FACET_INCOMPLETE', f.name || '?', false));
    }
  }

  if (versionLedger) {
    const vl = versionLedger;
    if (!vl.protocolVersion || !vl.packVersion) {
      findings.push(finding('error', 'Version ledger sem versao de protocolo ou pack', 'LEDGER_INCOMPLETE', 'versionLedger', true));
    }
  }

  return findings;
}
