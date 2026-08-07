// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Builtin generic simulation models — registro declarativo
// Item: micro_activity:ECBYTS-ENERGY-SCENARIOS-001#9

import { registerSimModel } from '../modelRegistry.js';
import { BIOMASS_PYROLYSIS_MODEL } from './biomassPyrolysis.js';

let _registered = false;

/** Registra os modelos genéricos builtin (idempotente). */
export function registerBuiltinSimModels(): void {
    if (_registered) return;
    _registered = true;
    registerSimModel(BIOMASS_PYROLYSIS_MODEL);
}

export { BIOMASS_PYROLYSIS_MODEL };
