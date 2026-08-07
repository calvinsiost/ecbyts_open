// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   GUIDED TOURS — AI & Neural Networks (6 tours, 30 steps)
   Tours 35-40: AI chat, provider config, NL commands,
   create NN, train NN, prediction/what-if
   ================================================================ */

import { registerGuidedTour } from '../categories.js';

declare global {
    interface Window {
        switchRibbonTab?: (tab: string) => void;
        toggleLLMChatPanel?: () => void;
        handleOpenNNManager?: () => void;
        closeModal?: (id: string) => void;
    }
}

// ----------------------------------------------------------------
// Tour 35: Open AI Chat
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'open-ai-chat',
    categoryId: 'ai-neural',
    nameKey: 'guidedTourOpenAIChat',
    descKey: 'guidedTourOpenAIChatDesc',
    icon: 'message-circle',
    difficulty: 'beginner',
    estimatedMinutes: 2,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-ai-ribbon',
            target: '#toggle-chat-panel-btn',
            title: 'gtOpenAIChatRibbon',
            body: 'gtOpenAIChatRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('view'),
            delay: 200,
        },
        {
            id: 'gt-ai-panel',
            target: '#llm-chat-panel, #toggle-chat-panel-btn',
            title: 'gtOpenAIChatPanel',
            body: 'gtOpenAIChatPanelBody',
            position: 'left',
            action: () => {
                const panel = document.getElementById('llm-chat-panel');
                if (!panel || !panel.classList.contains('open')) window.toggleLLMChatPanel?.();
            },
            delay: 300,
        },
        {
            id: 'gt-ai-input',
            target: '#llm-chat-panel, .llm-chat-input',
            title: 'gtOpenAIChatInput',
            body: 'gtOpenAIChatInputBody',
            position: 'left',
        },
        {
            id: 'gt-ai-complete',
            target: '#canvas-container',
            title: 'gtOpenAIChatComplete',
            body: 'gtOpenAIChatCompleteBody',
            position: 'bottom',
            postAction: () => {
                const panel = document.getElementById('llm-chat-panel');
                if (panel && panel.classList.contains('open')) window.toggleLLMChatPanel?.();
            },
        },
    ],
});

// ----------------------------------------------------------------
// Tour 36: Configure AI Provider
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'configure-ai-provider',
    categoryId: 'ai-neural',
    nameKey: 'guidedTourConfigAI',
    descKey: 'guidedTourConfigAIDesc',
    icon: 'settings',
    difficulty: 'intermediate',
    estimatedMinutes: 3,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-aicfg-open',
            target: '#toggle-chat-panel-btn',
            title: 'gtConfigAIOpen',
            body: 'gtConfigAIOpenBody',
            position: 'bottom',
            action: () => {
                window.switchRibbonTab?.('view');
                const panel = document.getElementById('llm-chat-panel');
                if (!panel || !panel.classList.contains('open')) window.toggleLLMChatPanel?.();
            },
            delay: 400,
        },
        {
            id: 'gt-aicfg-providers',
            target: '#llm-chat-panel',
            title: 'gtConfigAIProviders',
            body: 'gtConfigAIProvidersBody',
            position: 'left',
        },
        {
            id: 'gt-aicfg-key',
            target: '#llm-chat-panel',
            title: 'gtConfigAIKey',
            body: 'gtConfigAIKeyBody',
            position: 'left',
        },
        {
            id: 'gt-aicfg-model',
            target: '#llm-chat-panel',
            title: 'gtConfigAIModel',
            body: 'gtConfigAIModelBody',
            position: 'left',
        },
        {
            id: 'gt-aicfg-complete',
            target: '#canvas-container',
            title: 'gtConfigAIComplete',
            body: 'gtConfigAICompleteBody',
            position: 'bottom',
            postAction: () => {
                const panel = document.getElementById('llm-chat-panel');
                if (panel && panel.classList.contains('open')) window.toggleLLMChatPanel?.();
            },
        },
    ],
});

// ----------------------------------------------------------------
// Tour 37: Natural Language Commands
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'natural-language-commands',
    categoryId: 'ai-neural',
    nameKey: 'guidedTourNLCommands',
    descKey: 'guidedTourNLCommandsDesc',
    icon: 'terminal',
    difficulty: 'intermediate',
    estimatedMinutes: 3,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-nlcmd-open',
            target: '#toggle-chat-panel-btn',
            title: 'gtNLCommandsOpen',
            body: 'gtNLCommandsOpenBody',
            position: 'bottom',
            action: () => {
                window.switchRibbonTab?.('view');
                const panel = document.getElementById('llm-chat-panel');
                if (!panel || !panel.classList.contains('open')) window.toggleLLMChatPanel?.();
            },
            delay: 400,
        },
        {
            id: 'gt-nlcmd-examples',
            target: '#llm-chat-panel',
            title: 'gtNLCommandsExamples',
            body: 'gtNLCommandsExamplesBody',
            position: 'left',
        },
        {
            id: 'gt-nlcmd-actions',
            target: '#llm-chat-panel',
            title: 'gtNLCommandsActions',
            body: 'gtNLCommandsActionsBody',
            position: 'left',
        },
        {
            id: 'gt-nlcmd-tools',
            target: '#llm-chat-panel',
            title: 'gtNLCommandsTools',
            body: 'gtNLCommandsToolsBody',
            position: 'left',
        },
        {
            id: 'gt-nlcmd-complete',
            target: '#canvas-container',
            title: 'gtNLCommandsComplete',
            body: 'gtNLCommandsCompleteBody',
            position: 'bottom',
            postAction: () => {
                const panel = document.getElementById('llm-chat-panel');
                if (panel && panel.classList.contains('open')) window.toggleLLMChatPanel?.();
            },
        },
    ],
});

// ----------------------------------------------------------------
// Tour 38: Create Neural Network
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'create-neural-network',
    categoryId: 'ai-neural',
    nameKey: 'guidedTourCreateNN',
    descKey: 'guidedTourCreateNNDesc',
    icon: 'cpu',
    difficulty: 'intermediate',
    estimatedMinutes: 3,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-nn-ribbon',
            target: '[onclick*="handleOpenNNManager"]',
            title: 'gtCreateNNRibbon',
            body: 'gtCreateNNRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('optimize'),
            delay: 200,
        },
        {
            id: 'gt-nn-modal',
            target: '#nn-modal',
            title: 'gtCreateNNModal',
            body: 'gtCreateNNModalBody',
            position: 'left',
            action: () => window.handleOpenNNManager?.(),
            delay: 300,
        },
        {
            id: 'gt-nn-config',
            target: '#nn-modal',
            title: 'gtCreateNNConfig',
            body: 'gtCreateNNConfigBody',
            position: 'left',
        },
        {
            id: 'gt-nn-layers',
            target: '#nn-modal',
            title: 'gtCreateNNLayers',
            body: 'gtCreateNNLayersBody',
            position: 'left',
        },
        {
            id: 'gt-nn-complete',
            target: '#nn-modal',
            title: 'gtCreateNNComplete',
            body: 'gtCreateNNCompleteBody',
            position: 'left',
            postAction: () => window.closeModal?.('nn-modal'),
        },
    ],
});

// ----------------------------------------------------------------
// Tour 39: Train Network
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'train-network',
    categoryId: 'ai-neural',
    nameKey: 'guidedTourTrainNN',
    descKey: 'guidedTourTrainNNDesc',
    icon: 'trending-up',
    difficulty: 'advanced',
    estimatedMinutes: 4,
    prerequisites: { minElements: 3, minObservations: 5, autoScaffold: true },
    steps: [
        {
            id: 'gt-train-open',
            target: '[onclick*="handleOpenNNManager"]',
            title: 'gtTrainNNOpen',
            body: 'gtTrainNNOpenBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('optimize'),
            delay: 200,
        },
        {
            id: 'gt-train-modal',
            target: '#nn-modal',
            title: 'gtTrainNNModal',
            body: 'gtTrainNNModalBody',
            position: 'left',
            action: () => window.handleOpenNNManager?.(),
            delay: 300,
        },
        {
            id: 'gt-train-data',
            target: '#nn-modal',
            title: 'gtTrainNNData',
            body: 'gtTrainNNDataBody',
            position: 'left',
        },
        {
            id: 'gt-train-epochs',
            target: '#nn-modal',
            title: 'gtTrainNNEpochs',
            body: 'gtTrainNNEpochsBody',
            position: 'left',
        },
        {
            id: 'gt-train-progress',
            target: '#nn-modal',
            title: 'gtTrainNNProgress',
            body: 'gtTrainNNProgressBody',
            position: 'left',
        },
        {
            id: 'gt-train-complete',
            target: '#nn-modal',
            title: 'gtTrainNNComplete',
            body: 'gtTrainNNCompleteBody',
            position: 'left',
            postAction: () => window.closeModal?.('nn-modal'),
        },
    ],
});

// ----------------------------------------------------------------
// Tour 40: Run Prediction / What-If
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'run-prediction-whatif',
    categoryId: 'ai-neural',
    nameKey: 'guidedTourPrediction',
    descKey: 'guidedTourPredictionDesc',
    icon: 'zap',
    difficulty: 'advanced',
    estimatedMinutes: 3,
    prerequisites: { minElements: 3, minObservations: 5, autoScaffold: true },
    steps: [
        {
            id: 'gt-pred-open',
            target: '[onclick*="handleOpenNNManager"]',
            title: 'gtPredictionOpen',
            body: 'gtPredictionOpenBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('optimize'),
            delay: 200,
        },
        {
            id: 'gt-pred-modal',
            target: '#nn-modal',
            title: 'gtPredictionModal',
            body: 'gtPredictionModalBody',
            position: 'left',
            action: () => window.handleOpenNNManager?.(),
            delay: 300,
        },
        {
            id: 'gt-pred-input',
            target: '#nn-modal',
            title: 'gtPredictionInput',
            body: 'gtPredictionInputBody',
            position: 'left',
        },
        {
            id: 'gt-pred-whatif',
            target: '#nn-modal',
            title: 'gtPredictionWhatIf',
            body: 'gtPredictionWhatIfBody',
            position: 'left',
        },
        {
            id: 'gt-pred-complete',
            target: '#nn-modal',
            title: 'gtPredictionComplete',
            body: 'gtPredictionCompleteBody',
            position: 'left',
            postAction: () => window.closeModal?.('nn-modal'),
        },
    ],
});
