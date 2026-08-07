// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   GOVERNANCE CORE MODULE — Public Exports
   Modulo de governanca de dados ambientais (ESG "G" pillar)
   Phase 1: G0-G3 (Audit Trail, Observation Lock, Compliance Dashboard)
   Phase 2: G4 (Regulatory Calendar — obrigacoes e prazos)
   Phase 3: G6 (Decision Log — decisoes tecnicas com rationale)
   ================================================================ */
// G1 - Audit Trail (append-only action log)
export { logAction, getAuditLog, getAuditStats, getAllEntries } from './auditTrail.js';
// G2 - Observation Lock (corrigible observations)
export {
    lockObservation,
    isLocked,
    getLockRecord,
    requestCorrection,
    getCorrectionHistory,
    getLockedObservationIds,
} from './observationLock.js';
// G3 - Compliance Dashboard (regulatory compliance overview)
export {
    getComplianceStatus,
    getComplianceByFamily,
    getComplianceByParameter,
    getTrafficLight,
} from './complianceDashboard.js';
// G4 - Regulatory Calendar (obligations with deadlines)
export {
    computeUrgency,
    addObligation,
    completeObligation,
    cancelObligation,
    removeObligation,
    updateObligation,
    getObligations,
    getActiveWithUrgency,
    getCalendarSummary,
    clearAllObligations,
} from './regulatoryCalendar.js';
// G6 - Decision Log (technical/regulatory decisions with rationale)
export {
    DECISION_CATEGORIES,
    logDecision,
    getDecisions,
    getDecisionById,
    getDecisionsByContext,
    getDecisionStats,
    getAllDecisions,
} from './decisionLog.js';
// G5 - ESG Export (GRI/ISSB vocabulary + DOCX template)
export {
    PDPLU_TO_GRI_MAP,
    FAMILY_TO_GRI,
    getGriMapping,
    getFamilyGriCategory,
    generateEsgCsv,
    buildIssbDocxTemplate,
    sectionsToPlainText,
    sectionsToHtml,
} from './esgExport.js';
// G7 - RBAC Guards (client-side permission layer)
export {
    ROLES,
    PERMISSIONS,
    can,
    requirePermission,
    isReadOnlyRole,
    canWriteAudit,
    resolveEffectiveRole,
    guardButton,
} from './rbacGuards.js';
// G8 - Stakeholder Share (read-only share links for regulators)
export { createShare, validateShare, revokeShare, listSharesForModel, buildShareUrl } from './stakeholderShare.js';
// G9 - Provenance Graph (data lineage visualization)
export {
    NODE_TYPES,
    EDGE_RELATIONS,
    buildGraph,
    traceLineage,
    getAncestors,
    renderGraphSvg,
} from './provenanceGraph.js';
// G10 - Retention Policy (data retention per type)
export {
    DATA_TYPES,
    DEFAULT_POLICIES,
    getPolicy,
    getAllPolicies,
    setPolicy,
    resetPolicy,
    evaluateRetention,
    runRetentionCleanup,
} from './retentionPolicy.js';
// G11 - CVM 193/2023 ESG Disclosure Engine (Brazilian mandatory reporting 2026)
export {
    CVM193_PILLARS,
    CVM193_DIMENSIONS,
    MATERIALITY_LEVELS,
    createDisclosureItem,
    assessMateriality,
    computeEsgScore,
    identifyGaps,
    buildDisclosureReport,
} from './cvm193Engine.js';
// G12 - DAMA DMBOK Data Quality Engine (6 dimensions: completeness, accuracy, consistency, timeliness, uniqueness, validity)
export {
    DAMA_DIMENSIONS,
    DEFAULT_THRESHOLDS,
    scoreDimension,
    assessDataQuality,
    compareQualitySnapshots,
} from './damaQualityEngine.js';
// REC-003 Camada 2 - Regulatory Gate — REMOVIDO (ATTEST-001#remover-gates-regulatorios-mortos)
// O gate canônico vivo é core/attestation/_credentialGatePure.ts (REGULATED_ACTS
// com match 'all'|'any' por ato). Este módulo era um gate rival morto.
// Ver: docs/specs/features/SPEC_ATTESTATION_MODEL.md
