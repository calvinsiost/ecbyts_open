// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Handler: mascote EC - expõe estado do mascote SVG via window.*
// FEAT-MASCOT-SVG-001 / P1-22

import { setMascotState, getMascotState, resetMascot, MASCOT_STATES, initMascot } from '../ui/mascotManager.js';

export const mascotHandlers = {
    /** @param {string} state - Um dos valores de MASCOT_STATES */
    handleSetMascotState: (state: string) => setMascotState(state),
    /** Reseta o mascote para IDLE */
    handleResetMascot: () => resetMascot(),
    /** @returns {string} Estado atual */
    handleGetMascotState: (): string => getMascotState(),
    /** @param {HTMLElement} container */
    handleInitMascot: (container: HTMLElement) => initMascot(container),
};

export { MASCOT_STATES };
