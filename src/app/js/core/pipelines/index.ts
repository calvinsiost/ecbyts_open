// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/**
 * PIPELINES MODULE - Barrel de re-exports e inicialização.
 * Importar deste arquivo em vez dos módulos individuais.
 *
 * Inicialização: chama loadFromStorage() ao importar.
 */
// Schema
export { NODE_TYPES, BPMN_ELEMENT_MAP, ALLOWED_PATHS, BPMN_TEMPLATE, createPipelineId, createRunId, parseBpmnXml, serializeToBpmn, validatePipeline, } from './schema.js';
// Registry
export { loadFromStorage, savePipeline, getPipeline, getAllPipelines, deletePipeline, saveRunLog, getRunLogs, } from './registry.js';
// Executor
export { registerPipelineAction, getRegisteredActions, abortRun, createRun, runPipeline, executeNode, } from './executor.js';
// Pipeline → chave ECBT (kind portável) + diagrama nativo ECBT
export { registerPipelineArtifactKind, validatePipelineArtifact, pipelineToArtifact, pipelineFromArtifact, PIPELINE_ARTIFACT_KIND, } from './pipelineArtifact.js';
export {
    PIPELINE_PACK_ARTIFACT_KIND,
    PIPELINE_PACK_STORAGE_KEY,
    applyPipelinePackImport,
    pipelinePackFromArtifact,
    pipelinePackToArtifact,
    registerPipelinePackArtifactKind,
    validatePipelinePackArtifact,
} from './pipelinePackArtifact.js';
export { layoutPipeline } from './_diagramLayoutPure.js';
export { buildPipelineDiagramSvg } from './_diagramSvgPure.js';
export {
    PIPELINE_PACK_ALLOWED_FILE_EXTENSIONS,
    PIPELINE_PACK_SCHEMA_VERSION,
    PIPELINE_PACK_SCORE_MODEL,
    extractPipelinePackDeParaRows,
    migrateLegacyPipelinePreset,
    normalizePipelinePack,
    removePipelinePackModuleTarget,
    applyPipelinePackVariant,
    savePipelinePackVariant,
    summarizePipelinePack,
    upsertPipelinePackModuleTarget,
    validatePipelinePack,
} from './pipelinePack.js';
export {
    PIPELINE_DOMAIN_PROFILES,
    PIPELINE_GAC_DD38_DOMAIN_PROFILE,
    PIPELINE_GENERIC_DOMAIN_PROFILE,
    PIPELINE_MINE_BENEFICIATION_DOMAIN_PROFILE,
    findPipelineDomainProfile,
    getPipelineDomainProfiles,
    inferPipelineDomainProfile,
    listPipelineDomainGateTemplates,
    normalizePipelineDomainText,
    suggestPipelineDomainModules,
    summarizePipelineDomainProfile,
} from './pipelineDomainProfile.js';
export {
    extractPipelineConditionalGates,
    summarizePipelineConditionalGates,
} from './pipelineConditionalGate.js';
export {
    PIPELINE_PROTOCOL_FACET_PREFIX,
    PIPELINE_PROTOCOL_ID,
    PIPELINE_PROTOCOL_SCHEMA_VERSION,
    buildPipelineProtocol,
    validatePipelineProtocol,
} from './pipelineProtocol.js';
export {
    PIPELINE_PID_DIAGRAM_BRIDGE_SOURCE,
    PIPELINE_PID_DIAGRAM_BRIDGE_VERSION,
    PIPELINE_PID_TAG_IDENTITY_PROPERTY_SET,
    inferPipelineDigitalTwinLinksFromPidDiagram,
    inferPipelineProjectDataFromPidDiagram,
    summarizePipelinePidDigitalTwinBridge,
    summarizePipelinePidProjectDataBridge,
} from './pipelinePidDiagramBridge.js';
export {
    buildPipelinePackWorkbenchViewModel,
    renderPipelinePackWorkbenchReportMarkdown,
    renderPipelinePackWorkbenchHtml,
} from './pipelinePackWorkbench.js';
export {
    buildPipelinePackAssetManifest,
    PIPELINE_PACK_ASSET_DEFAULT_ALLOWED_EXTENSIONS,
    PIPELINE_PACK_ASSET_DEFAULT_BUCKET,
    PIPELINE_PACK_ASSET_TEMPORARY_URL_FIELDS,
} from './pipelinePackAssets.js';
export { evaluatePipelinePackDod } from './pipelinePackDod.js';
export {
    escapePipelinePackInspectorText,
    inspectPipelinePackConnector,
    inspectPipelinePackConnectors,
    inspectPipelinePackNode,
    inspectPipelinePackNodes,
    suggestPipelinePackEquivalentModules,
} from './pipelinePackInspector.js';
export {
    buildPipelinePackLibraryViewModel,
    normalizePipelinePackLibraryItems,
} from './pipelinePackLibrary.js';
export {
    evaluatePipelinePackMarketplaceReadiness,
    preparePipelinePackForMarketplace,
    sanitizePipelinePackForMarketplace,
    summarizePipelinePackMarketplacePermissions,
} from './pipelinePackMarketplace.js';
export {
    PIPELINE_PACK_PRESENTATION_DEFAULT_TARGET_ELEMENT_ID,
    PIPELINE_PACK_PRESENTATION_ENTER_FULLSCREEN_TEXT,
    PIPELINE_PACK_PRESENTATION_EXIT_FULLSCREEN_TEXT,
    PIPELINE_PACK_PRESENTATION_FULLSCREEN_HINT_TEXT,
    PIPELINE_PACK_PRESENTATION_HIDDEN_CONTROL_IDS,
    PIPELINE_PACK_PRESENTATION_MODE,
    buildPipelinePackPresentationViewModel,
    buildPipelinePackPresentationVisibleActions,
    createPipelinePackPresentationState,
    reducePipelinePackPresentationState,
} from './pipelinePackPresentation.js';
export { summarizePipelinePackQuality } from './pipelinePackQuality.js';
export { buildPipelineTrainingOpenPlan } from './pipelinePackTrainingBridge.js';
export {
    buildPipelinePackUserMessage,
    pipelinePackCopyHasTechnicalJargon,
} from './pipelinePackUserCopy.js';
export {
    PIPELINE_PACK_VISUAL_AUDIT_DEFAULT_WORST_BLOCKS,
    PIPELINE_PACK_VISUAL_AUDIT_FOREGROUND_TARGET,
    getPipelinePackVisualAuditSeverityLegend,
    summarizePipelinePackVisualAudit,
} from './pipelinePackVisualAudit.js';
export {
    GAC_DD38_PIPELINE_ID,
    GAC_DD38_TEMPLATE_ID,
    GAC_DD38_SELECTED_NODE_ID,
    GAC_DD38_PIPELINE_NAME,
    buildGacDd38PipelineEntry,
    buildGacDd38PipelineModel,
    buildGacDd38PipelinePack,
    isGacDd38PipelineTarget,
} from './gacDd38PipelinePreset.js';
export {
    MINE_BENEFICIATION_PIPELINE_ID,
    MINE_BENEFICIATION_TEMPLATE_ID,
    MINE_BENEFICIATION_SELECTED_NODE_ID,
    MINE_BENEFICIATION_PIPELINE_NAME,
    buildMineBeneficiationPipelineEntry,
    buildMineBeneficiationPipelineModel,
    buildMineBeneficiationPipelinePack,
    isMineBeneficiationPipelineTarget,
} from './mineBeneficiationPipelinePreset.js';
// Inicialização automática ao importar o módulo
import { loadFromStorage } from './registry.js';
import { registerPipelineArtifactKind } from './pipelineArtifact.js';
import { registerPipelinePackArtifactKind } from './pipelinePackArtifact.js';
loadFromStorage();
registerPipelineArtifactKind(); // registra o kind 'pipeline' no registry portável
registerPipelinePackArtifactKind(); // registra o kind 'pipeline-pack' no registry portatil
//# sourceMappingURL=index.js.map
