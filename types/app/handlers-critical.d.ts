// Critical handler type augmentations for Window
// Domains: demo, tour, auth, ui-core
// These overload the generic HandlerAction from action-registry-handlers.d.ts
// with specific signatures for the most frequently used handlers.

import type { DemoVertical, DemoModule, DemoCase } from './data-interfaces';

// ------------------------------------------------------------------
// Demo handlers (app/js/utils/handlers/demo.js)
// ------------------------------------------------------------------

declare global {
    interface Window {
        handleOpenDemo?: () => Promise<void> | void;
        handleCloseDemo?: () => void;
        handleSelectVertical?: (vertical: DemoVertical) => void;
        handleSelectModule?: (module: DemoModule) => void;
        handleSelectCase?: (caseId: string) => void;
        handleStartDemo?: () => void;
        handleStartDemoCase?: () => void;
        handleDemoNext?: () => void;
        handleDemoPrev?: () => void;
        handleExitDemo?: () => void;
        handleDemoRandomCase?: () => void;
    }
}

// ------------------------------------------------------------------
// Tour handlers (app/js/utils/handlers/tour.js)
// ------------------------------------------------------------------

declare global {
    interface Window {
        handleOpenTour?: () => void;
        handleCloseTour?: () => void;
        handleStartTour?: () => void;
        handleStartTourChapter?: (chapterId: string) => void;
        handleTourNext?: () => void;
        handleTourPrev?: () => void;
        handleExitTour?: () => void;
        handleSkipTour?: () => void;
        handleResetTour?: () => void;
        handleOpenGuidedTours?: () => void;
        handleCloseGuidedTours?: () => void;
        handleStartGuidedTour?: (tourId: string) => void;
        handleSelectTourCategory?: (categoryId: string) => void;
        handleGuidedTourBack?: () => void;
        handleSearchGuidedTours?: (query: string) => void;
        handleResetGuidedTours?: () => void;
        handleShowContextualTours?: (event: MouseEvent) => void;
        handleStartWelcomeTour?: () => void;
        getShouldShowWelcomeTour?: () => boolean;
        getTourState?: () => Record<string, unknown>;
    }
}

// ------------------------------------------------------------------
// Auth handlers (app/js/utils/handlers/auth.js)
// ------------------------------------------------------------------

declare global {
    interface Window {
        handleLoginEmail?: (email: string, password: string) => Promise<void>;
        handleRegisterEmail?: (email: string, password: string, userType?: string) => Promise<void>;
        handleLoginGoogle?: () => Promise<void>;
        handleLoginGitHub?: () => Promise<void>;
        handleLoginMicrosoft?: () => Promise<void>;
        handleForgotPassword?: (email: string) => Promise<void>;
        handleLogout?: () => Promise<void>;
        handleToggleAuthMenu?: () => void;
        handleOpenAuthModal?: (options?: Record<string, unknown>) => void;
        handleCloseAuthModal?: () => void;
        handleOpenPersonalEnvironment?: () => void;
        handleOpenAccessModal?: () => void;
        handleClaimOwnership?: () => void;
        handleAddAccessRule?: () => void;
        handleRemoveAccessRule?: (index: number) => void;
        handleUpdateAccessRule?: (index: number, field: string, value: unknown) => void;
        handleObserverModeChange?: (mode: string) => void;
        updateAuthUI?: () => void;
        handleShowRegistrationTypes?: () => void;
        handleHideRegistrationTypes?: () => void;
        handleSelectUserType?: (userType: string) => void;
        isAuthThrottled?: () => boolean;
        throttleNeedsCaptcha?: () => boolean;
    }
}

// ------------------------------------------------------------------
// UI-core handlers (app/js/utils/handlers/index.js)
// ------------------------------------------------------------------

declare global {
    interface Window {
        // Panels
        toggleLeftPanel?: () => void;
        toggleRightPanel?: () => void;
        toggleToolbar?: () => void;
        toggleAnalyticsFullscreen?: () => void;

        // Modals
        closeModal?: (modalId?: string) => void;
        closeOnOverlayClick?: (event: MouseEvent) => void;
        openExportModal?: () => void;
        openImportModal?: () => void;
        copyExportKey?: () => void;
        copyShareURL?: () => void;

        // View
        setIsometricView?: () => void;
        setTopView?: () => void;
        setFrontView?: () => void;
        zoomIn?: () => void;
        zoomOut?: () => void;
        resetView?: () => void;
        fitAllElements?: () => void;
        toggleViewMode?: () => void;
        getViewMode?: () => string;
        setViewMode?: (mode: string) => void;
        switchGroup?: (groupId: string) => void;
        getCurrentGroup?: () => string | null;
        switchRibbonTab?: (tabId: string) => void;

        // Focus / UI modes
        handleToggleFocusMode?: () => void;
        exitFocusMode?: () => void;
        handleCaptureSnapshot?: () => void;

        // Command palette
        toggleCommandPalette?: () => void;
        openCommandPalette?: () => void;

        // Language
        setLanguage?: (lang: string) => void;
        handleSetLanguage?: (lang: string) => void;
        toggleLanguageDropdown?: () => void;

        // Theme
        handleSetTheme?: (theme: 'light' | 'dark' | 'system') => void;

        // Toast / Errors
        showToast?: (message: string, type?: string, options?: Record<string, unknown>) => void;
        handleAppError?: (error: Error | string, context?: string) => void;

        // Force update
        handleForceUpdate?: () => Promise<void>;

        // Product wizard
        handleOpenProductWizard?: (opts?: Record<string, unknown>) => Promise<void>;
        handleEditProductWizard?: (productId: string, opts?: Record<string, unknown>) => Promise<void>;
        handleCloseProductWizard?: () => Promise<void>;

        // API keys
        handleOpenApiKeys?: () => void;
        handleCloseApiKeys?: () => void;
        closeApiKeyModal?: () => void;

        // Regulatory
        handleOpenRegulatoryStandards?: () => void;
        handleRegMatrixChange?: (matrix: string) => void;
        handleRegLandUseChange?: (use: string) => void;
        handleRegAddThreshold?: () => void;
        handleRegRemoveCustom?: (id: string) => void;
        handleRegulatoryExport?: () => void;
        handleRegulatoryImport?: () => void;
        handleRegulatoryRestore?: () => void;
        handleRegGlobalView?: () => void;

        // Presentation / Steps
        handleOpenPresentationModal?: () => void;
        handleClosePresentationModal?: () => void;
        handleOpenStepModal?: () => void;
        handleCloseStepModal?: () => void;

        // Report builder
        handleOpenReportBuilder?: () => Promise<void>;

        // Uncertainty hub
        handleOpenUncertaintyHub?: () => Promise<void>;
        handleCloseUncertaintyHub?: () => Promise<void>;
        handleOpenUncertaintyHubFromGv?: () => void;

        // Geo HUD
        handleToggleGeoHud?: () => void;
        handleShowGeoHud?: () => void;
        handleHideGeoHud?: () => void;

        // Scene HUD
        handleShowSceneHud?: () => void;
        handleHideSceneHud?: () => void;
        handleToggleSceneHudMinimize?: () => void;

        // Filter radar
        handleToggleFilterRadarHud?: () => void;
        handleCloseFilterRadarHud?: () => void;

        // Magnifier
        handleToggleMagnifier?: () => void;
        handleMagnifierMenu?: () => void;

        // Side view
        handleToggleSideView?: () => void;

        // Coord display
        toggleCursorProjector?: () => void;
        toggleCoordDisplayMinimize?: () => void;
        expandCoordDisplay?: () => void;
        minimizeCoordDisplay?: () => void;

        // EIS terrain probe
        handleToggleEisTerrainProbe?: () => void;
        handleEisTerrainProbeContextMenu?: (event: MouseEvent) => void;

        // Labels / Inspector
        handleToggleLabels?: () => void;
        handleToggleInspector?: () => void;

        // Symbology / Viz
        handleOpenSymbologyEditor?: () => void;
        handleOpenLabelSettings?: () => void;
        handleToggleVizSettings?: () => void;

        // Filter / Constants
        handleOpenFilterPanel?: () => void;
        handleOpenConstantsModal?: () => void;

        // Automation
        handleOpenAutomationPanel?: () => void;

        // Calculator / Data entry
        handleOpenCalculator?: () => void;
        handleOpenDataEntryMatrix?: () => void;

        // Sensors / Files / Photos
        handleOpenSensorsCenter?: () => void;
        handleOpenFiles?: () => void;
        handleOpenPhotoLog?: () => void;

        // History
        handleOpenHistory?: () => void;
        handleClearHistory?: () => void;

        // Storage
        getStorageUsage?: () => Promise<Record<string, unknown>>;
        getStorageBreakdown?: () => Promise<Record<string, unknown>>;
        clearModelData?: () => Promise<void>;
        clearWorkspace?: () => Promise<void>;
        isEphemeral?: () => boolean;

        // About / Docs / Bug
        showAboutDialog?: () => void;
        handleOpenDocs?: () => void;
        handleOpenApiDocs?: () => void;
        handleReportBug?: () => void;
        handleOpenWhatsNew?: () => Promise<void>;
        handleOpenErrorAdmin?: () => Promise<void>;

        // Network (NN)
        handleListNetworks?: () => unknown[];
        handleGetNetworkInfo?: (id: string) => Record<string, unknown> | null;
        handleResetNetwork?: (id: string) => void;
        handleRemoveNetwork?: (id: string) => void;

        // Family
        openFamilyManager?: () => void;
        handleFamilyToggle?: (familyId: string) => void;
        handleFamilyDelete?: (familyId: string) => void;
        addCustomFamily?: (name: string) => void;
        handleFamilySelectToggleAll?: () => void;
        handleFamilySelectConfirm?: () => void;

        // Analytics
        updateAnalyticsData?: () => void;
        handleOpenAnalytics?: () => void;
        handleOpenHypothesisTest?: () => void;
        handleOpenMACCurve?: () => void;
        handleOpenBackgroundAnalysis?: () => void;
        handleOpenEisDashboard?: () => void;
        handleOpenCostAnalysis?: () => void;

        // Canvas / 3D
        getCameraState?: () => Record<string, unknown>;
        setCameraState?: (state: Record<string, unknown>) => void;
        setGlobeDetailLevel?: (level: number) => void;

        // Sequencer
        handleOpenSequencer?: () => Promise<void>;

        // Bounty / Community
        handleOpenBountyBoard?: () => void;
        handleOpenCommunityHub?: () => void;

        // Mark handlers ready (E2E tests)
        handlersReady?: boolean;
    }
}

export {};
