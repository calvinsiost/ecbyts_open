// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * index.js - core/projectTabs public API
 *
 * Pure-logic facade. Sem side-effects de import (nenhum listener de browser).
 * Callers compõem registry + adapter para montar o subsystem de abas.
 */


export {
    TAB_STATE,
    ProjectTabFsmError,
    canTransition,
    nextStates,
    isValidState,
    transition,
    describeFsm,
} from './tabFsm.js';

export { ProjectTabRegistryError, createTabRegistry } from './tabRegistry.js';

export { BroadcastAdapterError, createBroadcastAdapter } from './broadcastAdapter.js';
