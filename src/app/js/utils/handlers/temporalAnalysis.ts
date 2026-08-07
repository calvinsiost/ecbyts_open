// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

// Handler: Temporal Analysis - D2
// Registra as funções do painel de análise temporal no window.*

import {
    openTemporalAnalysis,
    closeTemporalAnalysis,
    runTemporalAnalysis,
    clearTemporalAnalysis,
    onTemporalElementChange,
    onTemporalParamChange,
    switchTemporalTab,
    runMatrixAnalysis,
    onTemporalMatrixCellClick,
} from '../ui/temporalAnalysisPanel.js';

export const temporalAnalysisHandlers = {
    handleOpenTemporalAnalysis: openTemporalAnalysis,
    handleCloseTemporalAnalysis: closeTemporalAnalysis,
    handleRunTemporalAnalysis: runTemporalAnalysis,
    handleClearTemporalAnalysis: clearTemporalAnalysis,
    handleTemporalElementChange: onTemporalElementChange,
    handleTemporalParamChange: onTemporalParamChange,
    handleTemporalSwitchTab: switchTemporalTab,
    handleRunTemporalMatrix: runMatrixAnalysis,
    handleTemporalMatrixCellClick: onTemporalMatrixCellClick,
};
