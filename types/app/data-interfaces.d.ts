// Shared data interfaces extracted from wide-context scan of app/js/**/*.js
// Extracts @typedef JSDoc and common object patterns to inform types/app/data-interfaces.d.ts
//
// Sources:
//   - scripts/scan-data-interfaces.mjs (wide-context scan)
//   - app/js/utils/demo/engine.js
//   - app/js/utils/tour/engine.js
//   - app/js/core/elements/families/well/wellCompliance.js
//   - app/js/core/ingestion/documents/types.js

// ------------------------------------------------------------------
// 3D Geometry primitives (appears in 7+ files)
// ------------------------------------------------------------------

export interface Point3D {
    x: number;
    y: number;
    z: number;
}

export interface Point2D {
    x: number;
    y: number;
}

// ------------------------------------------------------------------
// Box / Margin / Viewport (appears in 6x across 3 files)
// ------------------------------------------------------------------

export interface BoxEdges {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export interface ViewportRect extends BoxEdges {}

// ------------------------------------------------------------------
// Demo & Tour state machines
// ------------------------------------------------------------------

export type DemoVertical = 'mining' | 'forestry' | 'contamination' | 'occupational_health';
export type DemoModule = 'neural_net' | 'ai_bot' | 'satellite';
export type RiskLevel = 'low' | 'med' | 'high';

export interface DemoCase {
    id: string;
    title: string;
    vertical: DemoVertical;
    module: DemoModule;
    risk: RiskLevel;
    description?: string;
    steps?: DemoStep[];
    elements?: unknown[];
    camera?: CameraState;
}

export interface DemoStep {
    id: string;
    title?: string;
    description?: string;
    action?: string;
    target?: string;
    waitFor?: string;
    autoAdvance?: boolean;
}

export interface DemoState {
    active: boolean;
    currentCase: DemoCase | null;
    currentStep: number;
    createdElementIds: string[];
    createdTickerIds: string[];
    savedCameraState: CameraState | null;
    isAnimating: boolean;
    maxStepReached: number;
}

export interface CameraState {
    camera: Point3D & { zoom: number };
    target: Point3D;
}

export interface TourState {
    active: boolean;
    currentChapter: string | null;
    currentStepIndex: number;
    isAnimating: boolean;
    waitingForInteraction: boolean;
    currentWaitFor: string | null;
    guidedTourId: string | null;
}

export interface TourChapter {
    id: string;
    titleKey: string;
    descKey: string;
    icon: string;
    color: string;
    steps: TourStep[];
}

export interface TourStep {
    id: string;
    title?: string;
    content?: string;
    target?: string;
    type?: 'info' | 'interactive';
    ribbon?: string;
}

// ------------------------------------------------------------------
// Panel / UI state primitives
// ------------------------------------------------------------------

export interface PanelState {
    visible: boolean;
    width?: number;
    height?: number;
    collapsed?: boolean;
    activeTab?: string;
}

export interface CollapsiblePanelState {
    leftPanel: boolean;
    rightPanel: boolean;
    toolbar: boolean;
    constellation: boolean;
}

// ------------------------------------------------------------------
// Model / Handler context (appears in 2+ handler files)
// ------------------------------------------------------------------

export interface ModelContext {
    documentRef?: Document;
    getModelId: () => string | null;
    localStorageRef?: Storage;
    showToast: (message: string, type?: string, options?: Record<string, unknown>) => void;
    translate: (key: string, fallback?: string) => string;
    updateGlobe?: () => void;
}

// ------------------------------------------------------------------
// Analytics / Geo parameters
// ------------------------------------------------------------------

export interface DRASTICParams {
    D: number; // Depth to water
    R: number; // Recharge
    A: number; // Aquifer media
    S: number; // Soil media
    T: number; // Topography
    I: number; // Impact of vadose zone
    C: number; // Conductivity of aquifer
}

export interface KrigingParams {
    nugget: number;
    range: number;
    sill: number;
}

export interface AxisResult {
    A: number;
    Cm: number;
    Cp: number;
    Cs: number;
    T: number;
    Ty: number;
}

// ------------------------------------------------------------------
// Compliance & Classification (appears in 2 files each)
// ------------------------------------------------------------------

export interface ComplianceIssue {
    code: string;
    message: string;
    severity: 'ok' | 'warning' | 'error';
}

export interface ComplianceResult {
    score: number;
    verdict: 'ok' | 'warning' | 'error';
    issues: ComplianceIssue[];
    regulation?: string;
    zone_type?: string;
    status?: 'compliant' | 'non_compliant' | 'warning';
    overlapAreaM2?: number;
    overlapGeometry?: Record<string, unknown> | null;
}

export interface ClassificationResult {
    assetType: string;
    familyHint: string | null;
    confidence: number;
    method: string;
    reasoning: string;
    heuristics: Record<string, unknown>;
    llmResult: Record<string, unknown> | null;
}

// ------------------------------------------------------------------
// Family / Catalog primitives
// ------------------------------------------------------------------

export interface FamilyGroup {
    id: string;
    labelKey: string;
    icon: string;
    order: number;
    familyIds: string[];
}

export interface GroupMenuNode {
    id: string;
    labelKey: string;
    icon: string;
    order: number;
}

export interface CatalogAction {
    id: string;
    category: string;
    labelKey: string;
    handler: string;
    tags: string[];
    requiresPremium: boolean;
    priority: number;
}

// ------------------------------------------------------------------
// Soil / Geology enums (appears in 3 files)
// ------------------------------------------------------------------

export type SoilType =
    | 'clay'
    | 'clayey_sand'
    | 'fill'
    | 'gravel'
    | 'peat'
    | 'rock'
    | 'sand'
    | 'sandy_clay'
    | 'silt'
    | 'silty_sand'
    | 'topsoil';

// ------------------------------------------------------------------
// Generic analytics schema metadata shape (appears in 490 files)
// ------------------------------------------------------------------

export interface AnalyticsSchemaMeta {
    name: string;
    category: string;
    description: string;
    version: string;
    type: string;
    specRef?: string;
    generatedBy?: string;
    validatedByHuman?: boolean;
    disclaimerAcknowledged?: boolean;
    familyTags?: string[];
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    properties?: Record<string, unknown>;
    required?: string[];
    provenance?: string;
    TODO?: string;
}
