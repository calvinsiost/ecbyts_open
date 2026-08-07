/**
 * Module stubs for common JS utility dependencies used in the checkJs allowlist.
 * These declarations let `noResolve: true` checkJs succeed without pulling in
 * the full transitive import graph.
 *
 * Add a stub here when a new allowlisted JS file imports a JS dependency that
 * has no .ts or .d.ts source. Keep signatures minimal but sufficient for the
 * checked files to type-check cleanly.
 */

// ------------------------------------------------------------------
// Logger utility — app/js/utils/helpers/logger.js
// ------------------------------------------------------------------

declare module '*/utils/helpers/logger.js' {
    export interface Logger {
        debug(...args: unknown[]): void;
        info(...args: unknown[]): void;
        warn(...args: unknown[]): void;
        error(...args: unknown[]): void;
    }
    export function createLogger(moduleName: string, deps?: unknown): Logger;
    export function modLoad(modulePath: string): void;
    export function modEnd(modulePath: string): void;
}

// ------------------------------------------------------------------
// IDB store utility — app/js/utils/storage/idbStore.js
// ------------------------------------------------------------------

declare module '*/utils/storage/idbStore.js' {
    export function idbSet(key: string, value: unknown): Promise<void>;
    export function idbGet(key: string): Promise<unknown>;
    export function idbDelete(key: string): Promise<void>;
    export function idbClear(): Promise<void>;
    export function idbGetWithLegacy(key: string, parseLegacy?: (s: string) => unknown): Promise<unknown>;
    export function modelScope(modelId: string): {
        set(suffix: string, value: unknown): Promise<void>;
        get(suffix: string): Promise<unknown>;
        delete(suffix: string): Promise<void>;
    };
}

// ------------------------------------------------------------------
// Toast notifications — app/js/utils/ui/toast.js
// ------------------------------------------------------------------

declare module '*/utils/ui/toast.js' {
    export function showToast(
        message: string,
        type?: 'success' | 'error' | 'warning' | 'info',
        duration?: number,
        options?: Record<string, unknown>
    ): void;
    export function showSuccess(message: string): void;
    export function showError(message: string): void;
    export function showWarning(message: string): void;
    export function showInfo(message: string): void;
    export function clearAllToasts(): void;
    export function getActiveToastCount(): number;
}

// ------------------------------------------------------------------
// HTML helpers — app/js/utils/helpers/html.js
// ------------------------------------------------------------------

declare module '*/utils/helpers/html.js' {
    export function escapeHtml(text: unknown): string;
    export function escapeAttr(text: unknown): string;
    export function escapeJsString(text: unknown): string;
    export function stripHtml(text: unknown): string;
    export function formatUncertainty(uncertainty: unknown, uncertaintyType?: unknown, coverageFactor?: unknown): string;
}

// ------------------------------------------------------------------
// Analytics generated registry data — app/js/core/analytics/_registryData.js
// ------------------------------------------------------------------

declare module '*/core/analytics/_registryData.js' {
    export interface AnalyticsRegistryDataEntry {
        name: string;
        description: string;
        familyTags: string[];
        specRef: string;
        sourcePath: string;
    }
    export const ANALYTICS_REGISTRY: AnalyticsRegistryDataEntry[];
}

// ------------------------------------------------------------------
// i18n translations — app/js/utils/i18n/translations.js
// ------------------------------------------------------------------

declare module '*/utils/i18n/translations.js' {
    export function t(key: string, params?: Record<string, unknown> | string): string;
    export function tp(key: string, count: number, params?: Record<string, unknown>): string;
    export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
    export function formatDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string;
    export function setLanguage(lang: string): void;
    export function getCurrentLanguage(): string;
}

// ------------------------------------------------------------------
// Icon system — app/js/utils/ui/icons.js
// ------------------------------------------------------------------

declare module '*/utils/ui/icons.js' {
    export function getIcon(name: string, opts?: Record<string, unknown>): string;
    export function getFamilyIcon(familyId: string): string;
    export function hydrateIcons(root?: HTMLElement): void;
    export function initIconObserver(): void;
    export const ICONS: Record<string, string>;
}

// ------------------------------------------------------------------
// Storage monitor — app/js/utils/storage/storageMonitor.js
// ------------------------------------------------------------------

declare module '*/utils/storage/storageMonitor.js' {
    export function setEphemeral(flag: boolean): void;
    export function isEphemeral(): boolean;
    export function clearModelData(): Promise<void>;
    export function clearScopedModelData(modelId: string): Promise<void>;
    export function clearWorkspace(): void;
    export function safeSetItem(key: string, value: unknown): void;
    export function checkQuotaThreshold(): Promise<void>;
    export function getStorageUsage(): Promise<Record<string, unknown>>;
    export function getStorageBreakdown(): Promise<Record<string, unknown>>;
}

// ------------------------------------------------------------------
// CDN loader — app/js/utils/helpers/cdnLoader.js
// ------------------------------------------------------------------

declare module '*/utils/helpers/cdnLoader.js' {
    export function importCDN(url: string, options?: Record<string, unknown>): Promise<unknown>;
    export function loadScriptCDN(url: string, options?: Record<string, unknown>): Promise<HTMLScriptElement>;
}

// ------------------------------------------------------------------
// Async dialogs — app/js/utils/ui/asyncDialogs.js
// ------------------------------------------------------------------

declare module '*/utils/ui/asyncDialogs.js' {
    export function asyncConfirm(message: string, options?: Record<string, unknown>): Promise<boolean>;
    export function asyncPrompt(message: string, defaultValue?: string, options?: Record<string, unknown>): Promise<string | null>;
}

// ------------------------------------------------------------------
// Modal utilities — app/js/utils/ui/modals.js
// ------------------------------------------------------------------

declare module '*/utils/ui/modals.js' {
    export function openModal(modalId: string): void;
    export function closeModal(modalId?: string): void;
    export function buildModalShell(opts?: Record<string, unknown>): HTMLElement;
    export function closeOnOverlayClick(event: MouseEvent): void;
    export function openExportModal(): Promise<void>;
    export function toggleBlockchainOptions(): Promise<void>;
    export function onKeySelectChange(): Promise<void>;
    export function createNewKey(): Promise<void>;
    export function handleCopyKey(): Promise<void>;
    export function handleCopyURL(): Promise<void>;
    export function handleDownload(): Promise<void>;
    export function onExportFormatChange(): void;
    export function setImportMode(mode?: string): void;
    export function openImportModal(): void;
    export function executeImport(onSuccess?: () => void): Promise<void>;
    export function handleFileInputChange(event: Event): void;
    export function handleKeyInputChange(event: Event): void;
    export function openFamilyManager(): void;
    export function updateFamilyManagerList(): void;
    export function handleFamilyToggle(familyId: string): void;
    export function handleFamilyDelete(familyId: string): Promise<void>;
    export function handleAddCustomFamily(): void;
}

// ------------------------------------------------------------------
// Scene 3D setup — app/js/utils/scene/setup.js
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Uncertainty correlation — app/js/core/uncertainty/correlation.js
// Exposed subset used by core/monteCarlo/convergence.js (REC-004 helpers).
// ------------------------------------------------------------------

declare module '*/core/uncertainty/correlation.js' {
    export interface MCStandardErrorStats {
        mean: number;
        sd: number;
        se: number;
        n: number;
    }
    export const MC_DEFAULTS: Readonly<{
        N_ITERATIONS: number;
        SE_WARN_THRESHOLD: number;
    }>;
    export const CORRELATION_METHODS: Readonly<{ PEARSON: string; SPEARMAN: string }>;
    export function computeMCStandardError(samples: number[]): MCStandardErrorStats;
    export function mcConvergenceWarning(
        stats: { mean: number; se: number } | MCStandardErrorStats,
        threshold?: number
    ): boolean;
    export function pearsonCorrelation(x: number[], y: number[]): number;
    export function spearmanCorrelation(x: number[], y: number[]): number;
    export function rankTransform(values: number[]): number[];
    export function choleskyDecomposition(matrix: number[][]): number[][];
    export function nearestPositiveDefinite(matrix: number[][]): number[][];
    export function estimateCorrelationFromData(
        matrix: number[][],
        variableNames?: string[]
    ): Readonly<{
        pearson: number[][];
        spearman: number[][];
        n: number;
        variableNames: string[];
    }>;
    export function validateCorrelationMatrix(M: number[][]): Readonly<{
        valid: boolean;
        isPositiveDefinite: boolean;
        minEigenvalue: number;
        errors: string[];
    }>;
    export function patchNearestPD(M: number[][]): number[][];
    export function imanConoverRankCorrelation(samples: number[][], targetCorrelation: number[][]): number[][];
}

// ------------------------------------------------------------------
// Pipeline permissions — app/js/core/ecbt/transformLibraries/pipelinePermissions.js
// ------------------------------------------------------------------

declare module '*pipelinePermissions.js' {
    export const PIPELINE_ACTIONS: ReadonlyArray<string>;
    export const PIPELINE_ROLES: ReadonlyArray<string>;
    export const ROLE_PERMISSIONS: Readonly<Record<string, ReadonlySet<string>>>;
    export const PUBLIC_ACCESS_TIERS: ReadonlyArray<string>;
    export const PIPELINE_PERMISSIONS_META: Readonly<Record<string, unknown>>;
    export function isValidAction(action: unknown): boolean;
    export function isValidRole(role: unknown): boolean;
    export function createAcl(spec?: unknown): Record<string, unknown>;
    export function roleAllows(role: string, action: string): boolean;
    export function resolveRole(acl: unknown, actor: { userId?: string }): string | null;
    export function checkPermission(acl: unknown, actor: unknown, action: string): { allowed: boolean; reason: string; role: string | null };
    export function shareWith(acl: unknown, userId: string, role: string): unknown;
    export function revokeAccess(acl: unknown, userId: string): unknown;
    export function getAllowedActions(acl: unknown, actor: unknown): string[];
    export function summarizeAcl(acl: unknown): Record<string, unknown>;
    export const pipelinePermissionsMeta: Readonly<Record<string, unknown>>;
}

declare module '*/utils/scene/setup.js' {
    export function addRenderHook(fn: () => void): void;
    export function addResizeHook(fn: () => void): void;
    export function setModelExtent(extent: unknown): void;
    export function initScene(container: HTMLElement): void;
    export function getScene(): unknown;
    export function getCamera(): unknown;
    export function getRenderer(): unknown;
    export function getControls(): unknown;
    export function getElementsGroup(): unknown;
    export function getEditHandlesGroup(): unknown;
    export function getInterpolationGroup(): unknown;
    export function getVoxelGroup(): unknown;
    export function getIssuesGroup(): unknown;
    export function getPhotoMarkersGroup(): unknown;
    export function applyQualityTier(tierName: string): void;
    export function getCurrentQualityTier(): string;
    export function setOutlineSelection(meshes: unknown[]): void;
    export function clearOutlineSelection(): void;
    export function initPostProcessing(): Promise<void>;
    export function setBloomEnabled(enabled: boolean): void;
    export function setBloomIntensity(intensity: number): void;
    export function setBacklightEnabled(enabled: boolean): void;
    export function setBacklightIntensity(intensity: number): void;
    export function handleResize(container: HTMLElement): void;
    export function scheduleResizeSync(container: HTMLElement, delayMs?: number, transitionTarget?: unknown): void;
    export function requestRender(): void;
    export function wakeRenderLoop(): void;
    export function animate(): void;
}

// ----------------------------------------------------------------
// Auto-generated by scripts/ts-module-stub-generator.mjs
// ----------------------------------------------------------------

// app/js/core/ecbt/transformLibraries/types.js
declare module '*/core/ecbt/transformLibraries/types.js' {
    export const TransformTypes: unknown;
    export const TransformOutcomes: unknown;
    export const TransformErrorCodes: unknown;
    export const ecbtTransformTypesMeta: unknown;
}

// app/js/core/uncertainty/distributionFit.js
declare module '*/core/uncertainty/distributionFit.js' {
    export function fitNormal(...args: unknown[]): unknown;
    export function fitLognormal(...args: unknown[]): unknown;
    export function fitExponential(...args: unknown[]): unknown;
    export function testDistributionFit(...args: unknown[]): unknown;
    export function selectBestDistribution(...args: unknown[]): unknown;
}

// app/js/core/eis/eisRadarConfig.js
declare module '*/core/eis/eisRadarConfig.js' {
    export function getAxesForMode(...args: unknown[]): unknown;
    export const CORE_AXES: unknown;
    export const EXTENDED_AXES: unknown;
    export const ALL_AXES: unknown;
    export const AXIS_LABELS: unknown;
    export const RADAR_VIEW_MODES: unknown;
}

// app/js/core/ingestion/documents/wellIdCanon.js
declare module '*/core/ingestion/documents/wellIdCanon.js' {
    export function canonicalizeWellId(...args: unknown[]): unknown;
    export function matchExistingWell(...args: unknown[]): unknown;
    export function extractWellIds(...args: unknown[]): unknown;
}

// app/js/core/notifications/notificationSchema.js
declare module '*/core/notifications/notificationSchema.js' {
    export function createNotification(...args: unknown[]): unknown;
    export function markAsRead(...args: unknown[]): unknown;
    export const NOTIFICATION_TYPES: unknown;
    export const NOTIFICATION_PRIORITY: unknown;
}

// app/js/core/actions/actionCatalog.js
declare module '*/core/actions/actionCatalog.js' {
    export function createCatalogAction(...args: unknown[]): unknown;
    export function searchCatalog(...args: unknown[]): unknown;
    export function filterByCategory(...args: unknown[]): unknown;
    export function sortByPriority(...args: unknown[]): unknown;
    export const ACTION_CATEGORIES: unknown;
}

// app/js/core/eis/axisRegistry.js
declare module '*/core/eis/axisRegistry.js' {
    export function getAxisById(...args: unknown[]): unknown;
    export function listCoreAxes(...args: unknown[]): unknown;
    export function listProgressiveAxes(...args: unknown[]): unknown;
    export function getTotalWeight(...args: unknown[]): unknown;
    export const AXIS_DEFINITIONS: unknown;
}

// app/js/core/uncertainty/matrix.js
declare module '*/core/uncertainty/matrix.js' {
    export function normalizeMatrix(...args: unknown[]): unknown;
    export function getMatrixPolicy(...args: unknown[]): unknown;
    export function chooseNDMethod(...args: unknown[]): unknown;
}

// app/js/core/geoml/kernels.js
declare module '*/core/geoml/kernels.js' {
    export function euclideanDistance(...args: unknown[]): unknown;
    export function matern32(...args: unknown[]): unknown;
    export function rbf(...args: unknown[]): unknown;
    export function exponential(...args: unknown[]): unknown;
    export function buildCovarianceMatrix(...args: unknown[]): unknown;
    export function makeKernel(...args: unknown[]): unknown;
    export const KERNELS: unknown;
}

// app/js/core/geoml/matrix.js
declare module '*/core/geoml/matrix.js' {
    export function cholesky(...args: unknown[]): unknown;
    export function solveLower(...args: unknown[]): unknown;
    export function solveUpper(...args: unknown[]): unknown;
    export function matVec(...args: unknown[]): unknown;
    export function dot(...args: unknown[]): unknown;
    export function logDiag(...args: unknown[]): unknown;
    export function addJitter(...args: unknown[]): unknown;
}

// app/js/core/nonDetect/_math.js
declare module '*/core/nonDetect/_math.js' {
    export function _normQuantile(...args: unknown[]): unknown;
    export function _interpolatePercentile(...args: unknown[]): unknown;
    export function _samplePercentile(...args: unknown[]): unknown;
}

// app/js/core/uncertainty/policyResolver.js
declare module '*/core/uncertainty/policyResolver.js' {
    export function resolveUncertaintyPolicy(...args: unknown[]): unknown;
}

// app/js/core/filter/aggregationEngine.js
declare module '*/core/filter/aggregationEngine.js' {
    export function matchParameterToGroups(...args: unknown[]): unknown;
    export function buildElementGroupIndex(...args: unknown[]): unknown;
    export function aggregate(...args: unknown[]): unknown;
    export function computeElementRadarData(...args: unknown[]): unknown;
    export const CANONICAL_GROUPS: unknown;
    export const MAX_RADAR_AXES: unknown;
}

// app/js/core/uncertainty/q2q.js
declare module '*/core/uncertainty/q2q.js' {
    export function convertQualitativeUncertainty(...args: unknown[]): unknown;
    export function convertWithMatrixContext(...args: unknown[]): unknown;
    export function batchConvert(...args: unknown[]): unknown;
    export function listLabels(...args: unknown[]): unknown;
    export function getMappingVersion(...args: unknown[]): unknown;
    export function applyOverride(...args: unknown[]): unknown;
    export const Q2Q_MAP_V1: unknown;
}

// app/js/core/pid/symbols/isaSymbols.js
declare module '*/core/pid/symbols/isaSymbols.js' {
    export function getSymbol(...args: unknown[]): unknown;
    export function getSymbolsByCategory(...args: unknown[]): unknown;
    export function renderSymbol(...args: unknown[]): unknown;
    export const ISA_SYMBOLS: unknown;
}

// app/js/core/filter/radarConfig.js
declare module '*/core/filter/radarConfig.js' {
    export function getCanonicalGroupsOrdered(...args: unknown[]): unknown;
    export function findGroupForParameter(...args: unknown[]): unknown;
    export function isValidCustomGroup(...args: unknown[]): unknown;
    export function mergeGroups(...args: unknown[]): unknown;
    export const CANONICAL_RADAR_GROUPS: unknown;
    export const MAX_RADAR_AXES: unknown;
}

// app/js/core/filter/aggregations.js
declare module '*/core/filter/aggregations.js' {
    export function sanitizeNumbers(...args: unknown[]): unknown;
    export function mean(...args: unknown[]): unknown;
    export function median(...args: unknown[]): unknown;
    export function max(...args: unknown[]): unknown;
    export function min(...args: unknown[]): unknown;
    export function percentile(...args: unknown[]): unknown;
    export function p95(...args: unknown[]): unknown;
    export function stdev(...args: unknown[]): unknown;
    export function aggregate(...args: unknown[]): unknown;
    export const AGGREGATION_FUNCTIONS: unknown;
}

// app/js/core/catalog/accessGroupSchema.js
declare module '*/core/catalog/accessGroupSchema.js' {
    export function createAccessGroup(...args: unknown[]): unknown;
    export function createGroupMembership(...args: unknown[]): unknown;
    export const ACCESS_LEVELS: unknown;
    export const GROUP_TYPES: unknown;
}

// app/js/core/presentation/storyboardState.js
declare module '*/core/presentation/storyboardState.js' {
    export function createStoryboard(...args: unknown[]): unknown;
    export function addSlide(...args: unknown[]): unknown;
    export function removeSlide(...args: unknown[]): unknown;
    export function updateSlide(...args: unknown[]): unknown;
    export function reorderSlide(...args: unknown[]): unknown;
    export function getTotalDuration(...args: unknown[]): unknown;
    export function getSlideAt(...args: unknown[]): unknown;
    export function validateStoryboard(...args: unknown[]): unknown;
    export function summarizeStoryboard(...args: unknown[]): unknown;
    export const __TRANSITIONS__: unknown;
}

// app/js/core/workflows/registry.js
declare module '*/core/workflows/registry.js' {
    export function registerWorkflow(...args: unknown[]): unknown;
    export function getWorkflow(...args: unknown[]): unknown;
    export function getAllWorkflows(...args: unknown[]): unknown;
    export function getWorkflowsByRegulation(...args: unknown[]): unknown;
    export function checkPrerequisites(...args: unknown[]): unknown;
}

// app/js/core/recognition/indices.js
declare module '*/core/recognition/indices.js' {
    export function excessGreen(...args: unknown[]): unknown;
    export function shadowIndex(...args: unknown[]): unknown;
    export function isShadow(...args: unknown[]): unknown;
    export function otsuThreshold(...args: unknown[]): unknown;
    export function toGrayscale(...args: unknown[]): unknown;
    export function computeEdgeMap(...args: unknown[]): unknown;
    export function blobEdgeDensity(...args: unknown[]): unknown;
}

// app/js/core/analytics/optimization/uncertaintyProxy.js
declare module '*/core/analytics/optimization/uncertaintyProxy.js' {
    export function uncertaintyAtPoint(...args: unknown[]): unknown;
    export function meanUncertainty(...args: unknown[]): unknown;
    export function uncertaintyReduction(...args: unknown[]): unknown;
    export function computeMaxDist(...args: unknown[]): unknown;
}

// ----------------------------------------------------------------
// Auto-generated by scripts/ts-module-stub-generator.mjs
// ----------------------------------------------------------------

// app/js/core/sequencer/temporalFilter.js
declare module '*/core/sequencer/temporalFilter.js' {
    export function sortCampaignsByDate(...args: unknown[]): unknown;
    export function campaignIndexToNormalized(...args: unknown[]): unknown;
    export function normalizedToCampaignIndex(...args: unknown[]): unknown;
    export function getActiveCampaignIds(...args: unknown[]): unknown;
    export function filterElementsByTime(...args: unknown[]): unknown;
    export function setElementTemporalVisibility(...args: unknown[]): unknown;
    export function interpolatePosition(...args: unknown[]): unknown;
}

// app/js/core/simulation/solvers/common.js
declare module '*/core/simulation/solvers/common.js' {
    export function sampleVoxelField(...args: unknown[]): unknown;
    export function getVoxelIndex(...args: unknown[]): unknown;
    export function minMax(...args: unknown[]): unknown;
}

// app/js/core/actions/coreCatalog.js
declare module '*/core/actions/coreCatalog.js' {
    export const CORE_CATALOG_ACTIONS: unknown;
}

// app/js/core/io/migrations/v1-to-v2.js
declare module '*/core/io/migrations/v1-to-v2.js' {
    export function migrateV1ToV2(...args: unknown[]): unknown;
}

// app/js/core/harness/journeyModel.js
declare module '*/core/harness/journeyModel.js' {
    export function createJourney(...args: unknown[]): unknown;
    export function validateJourney(...args: unknown[]): unknown;
    export function topoSortSteps(...args: unknown[]): unknown;
    export function stepGraph(...args: unknown[]): unknown;
}

// app/js/core/geoml/gpRegression.js
declare module '*/core/geoml/gpRegression.js' {
    export function fitGP(...args: unknown[]): unknown;
    export function predictGP(...args: unknown[]): unknown;
    export function predictGPWithStd(...args: unknown[]): unknown;
}

// app/js/core/interpolation/contours.js
declare module '*/core/interpolation/contours.js' {
    export function generateContourLevels(...args: unknown[]): unknown;
    export function buildContoursFromGrid(...args: unknown[]): unknown;
}

// app/js/core/metering/tierLimits.js
declare module '*/core/metering/tierLimits.js' {
    export function getTierLimit(...args: unknown[]): unknown;
    export const TIER_LIMITS: unknown;
}

// ----------------------------------------------------------------
// Auto-generated by scripts/ts-module-stub-generator.mjs
// ----------------------------------------------------------------

// app/js/core/elements/families/_base/FamilyModule.js
declare module '*/core/elements/families/_base/FamilyModule.js' {
    export const SVG_NS: unknown;
    export class FamilyModule {}
}

// app/js/core/ecbt/transformLibraries/keyEncoding.js
declare module '*/core/ecbt/transformLibraries/keyEncoding.js' {
    export function toBase64Url(...args: unknown[]): unknown;
    export function fromBase64Url(...args: unknown[]): unknown;
    export function encodePipelineToSegment(...args: unknown[]): unknown;
    export function decodePipelineFromSegment(...args: unknown[]): unknown;
    export function roundTripPipeline(...args: unknown[]): unknown;
    export function isTLPSegment(...args: unknown[]): unknown;
    export const TLP_SEGMENT_META: unknown;
    export const keyEncodingMeta: unknown;
}

// app/js/core/ecbt/transformLibraries/engine.js
declare module '*/core/ecbt/transformLibraries/engine.js' {
    export function applyTransform(...args: unknown[]): unknown;
    export function composeTransforms(...args: unknown[]): unknown;
    export const ecbtTransformEngineMeta: unknown;
}

// app/js/core/ecbt/transformLibraries/registry.js
declare module '*/core/ecbt/transformLibraries/registry.js' {
    export function registerLibrary(...args: unknown[]): unknown;
    export function getLibrary(...args: unknown[]): unknown;
    export function listLibraries(...args: unknown[]): unknown;
    export function listLibraryTags(...args: unknown[]): unknown;
    export function freezeRegistry(...args: unknown[]): unknown;
    export function clearRegistry(...args: unknown[]): unknown;
    export function isRegistryFrozen(...args: unknown[]): unknown;
    export function registrySize(...args: unknown[]): unknown;
    export const ecbtTransformRegistryMeta: unknown;
}

// app/js/core/taxonomy/schema.js
declare module '*/core/taxonomy/schema.js' {
    export function validateFieldValue(...args: unknown[]): unknown;
    export function getDefaultValue(...args: unknown[]): unknown;
    export function validateTaxonomyDefinition(...args: unknown[]): unknown;
    export const FIELD_TYPES: unknown;
}

// app/js/core/projectTabs/tabFsm.js
declare module '*/core/projectTabs/tabFsm.js' {
    export function canTransition(...args: unknown[]): unknown;
    export function nextStates(...args: unknown[]): unknown;
    export function isValidState(...args: unknown[]): unknown;
    export function transition(...args: unknown[]): unknown;
    export function describeFsm(...args: unknown[]): unknown;
    export const TAB_STATE: unknown;
    export class ProjectTabFsmError {}
}

// app/js/core/presentation/captionLayout.js
declare module '*/core/presentation/captionLayout.js' {
    export function getViewportProfile(...args: unknown[]): unknown;
    export function computeCaptionBox(...args: unknown[]): unknown;
    export function validateCaptionSafety(...args: unknown[]): unknown;
    export function estimateLineCount(...args: unknown[]): unknown;
    export function checkCaptionFit(...args: unknown[]): unknown;
    export const VIEWPORT_PROFILES: unknown;
}

// app/js/core/analytics/eventBus.js
declare module '*/core/analytics/eventBus.js' {
    export const Events: unknown;
}

// ----------------------------------------------------------------
// Auto-generated by scripts/ts-module-stub-generator.mjs
// ----------------------------------------------------------------

// app/js/core/environment/environmentDetector.js
declare module '*/core/environment/environmentDetector.js' {
    export function detectEnvironment(...args: unknown[]): unknown;
    export function detectEnvironmentFromWindow(...args: unknown[]): unknown;
    export function isProduction(...args: unknown[]): unknown;
    export function isNonProduction(...args: unknown[]): unknown;
    export const ENVIRONMENTS: unknown;
}

// app/js/core/financial/projectValuation.js
declare module '*/core/financial/projectValuation.js' {
    export function crf(...args: unknown[]): unknown;
    export function computeProjectValuation(...args: unknown[]): unknown;
    export function computeProjectValuationVariable(...args: unknown[]): unknown;
    export function aggregateProjectValuations(...args: unknown[]): unknown;
    export function isValidCategory(...args: unknown[]): unknown;
    export function normalizeEnvironmentalProject(...args: unknown[]): unknown;
    export function filterEnvironmentalProjects(...args: unknown[]): unknown;
    export function aggregateEnvironmentalProjects(...args: unknown[]): unknown;
    export const PROJECT_CATEGORIES: unknown;
    export const DEFAULT_PROJECT_CATEGORY: unknown;
}

// app/js/core/workflows/orchestrator.js
declare module '*/core/workflows/orchestrator.js' {
    export function runValidation(...args: unknown[]): unknown;
    export function runInterpolation(...args: unknown[]): unknown;
    export function runDelineation(...args: unknown[]): unknown;
    export function runSAOAssessment(...args: unknown[]): unknown;
    export function runEIS(...args: unknown[]): unknown;
    export function runVoxelGeneration(...args: unknown[]): unknown;
}

// app/js/core/hud/hudContextMenuState.js
declare module '*/core/hud/hudContextMenuState.js' {
    export function createInitialState(...args: unknown[]): unknown;
    export function toggleHud(...args: unknown[]): unknown;
    export function setHudVisibility(...args: unknown[]): unknown;
    export function enterScreenshotMode(...args: unknown[]): unknown;
    export function exitScreenshotMode(...args: unknown[]): unknown;
    export function serializeState(...args: unknown[]): unknown;
    export function deserializeState(...args: unknown[]): unknown;
    export function countVisible(...args: unknown[]): unknown;
    export const HUD_CATEGORIES: unknown;
    export const HUD_IDS: unknown;
}

// app/js/core/presentation/narrationSanitizer.js
declare module '*/core/presentation/narrationSanitizer.js' {
    export function normalize(...args: unknown[]): unknown;
    export function detectMojibake(...args: unknown[]): unknown;
    export function isMojibakeFree(...args: unknown[]): unknown;
    export function repairMojibake(...args: unknown[]): unknown;
    export function stripMarkdown(...args: unknown[]): unknown;
    export function tameSymbols(...args: unknown[]): unknown;
    export function splitIntoSegments(...args: unknown[]): unknown;
    export function sanitizeNarration(...args: unknown[]): unknown;
    export function toTtsSafeText(...args: unknown[]): unknown;
    export const SANITIZER_CODES: unknown;
}

// app/js/core/presentation/shotPlanner.js
declare module '*/core/presentation/shotPlanner.js' {
    export function buildShotPlan(...args: unknown[]): unknown;
    export function auditMotionSequence(...args: unknown[]): unknown;
    export function listPresets(...args: unknown[]): unknown;
    export const MOTION_PRESETS: unknown;
    export const DEFAULT_PRESET: unknown;
}

// app/js/core/presentation/compositionPolicy.js
declare module '*/core/presentation/compositionPolicy.js' {
    export function planComposition(...args: unknown[]): unknown;
    export function computeFrameClip(...args: unknown[]): unknown;
    export function auditCompositionSequence(...args: unknown[]): unknown;
}

// app/js/core/presentation/storyProfiles.js
declare module '*/core/presentation/storyProfiles.js' {
    export function listProfiles(...args: unknown[]): unknown;
    export function getProfile(...args: unknown[]): unknown;
    export function getDefaultProfile(...args: unknown[]): unknown;
    export function applyProfile(...args: unknown[]): unknown;
    export function validateStepAgainstProfile(...args: unknown[]): unknown;
    export function listProfileIds(...args: unknown[]): unknown;
    export const STORY_INTENTS: unknown;
    export const CLAIM_LEVELS: unknown;
    export const VIEWPORTS: unknown;
    export const AUDIO_PROVIDERS: unknown;
}

// app/js/core/issues/bcfSchema.js
declare module '*/core/issues/bcfSchema.js' {
    export function createIssue(...args: unknown[]): unknown;
    export function addComment(...args: unknown[]): unknown;
    export function transitionStatus(...args: unknown[]): unknown;
    export function assignBountyTier(...args: unknown[]): unknown;
    export function computeIssueScore(...args: unknown[]): unknown;
    export function filterIssues(...args: unknown[]): unknown;
    export function summarizeIssueBacklog(...args: unknown[]): unknown;
    export const ISSUE_TYPES: unknown;
    export const ISSUE_STATUS: unknown;
    export const ISSUE_PRIORITY: unknown;
    export const BOUNTY_TIERS: unknown;
}

// app/js/core/taxonomy/manager.js
declare module '*/core/taxonomy/manager.js' {
    export function initTaxonomies(...args: unknown[]): unknown;
    export function registerTaxonomy(...args: unknown[]): unknown;
    export function unregisterTaxonomy(...args: unknown[]): unknown;
    export function activateTaxonomy(...args: unknown[]): unknown;
    export function deactivateTaxonomy(...args: unknown[]): unknown;
    export function purgeTaxonomyData(...args: unknown[]): unknown;
    export function getActiveTaxonomies(...args: unknown[]): unknown;
    export function getTaxonomiesForFamily(...args: unknown[]): unknown;
    export function getTaxonomyById(...args: unknown[]): unknown;
    export function getAllRegistered(...args: unknown[]): unknown;
    export function isTaxonomyActive(...args: unknown[]): unknown;
    export function exportTaxonomyBindings(...args: unknown[]): unknown;
    export function importTaxonomyBindings(...args: unknown[]): unknown;
}

// app/js/core/constellation/edgeMetrics.js
declare module '*/core/constellation/edgeMetrics.js' {
    export function computeAdjacencyMap(...args: unknown[]): unknown;
    export function computeNodeDegree(...args: unknown[]): unknown;
    export function filterEdges(...args: unknown[]): unknown;
    export function computeConnectedComponents(...args: unknown[]): unknown;
    export function computeShortestPath(...args: unknown[]): unknown;
    export function computeBetweennessCentrality(...args: unknown[]): unknown;
    export function summarizeGraph(...args: unknown[]): unknown;
    export const EDGE_METRICS_META: unknown;
    export const edgeMetricsMeta: unknown;
}
