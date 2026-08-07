// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.2.0
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   PURPOSE MODULE — Public exports
   Modulo de Proposito — Exportacoes publicas

   Agrega e re-exporta a API publica do modulo de proposito:
   - snapshotEngine: captura, consulta e delta de snapshots EIS
   - actionImpact: micro-feedback instantaneo (Camada 1)
   ================================================================ */
// Snapshot Engine - captura, IDB, consulta, delta, pruning
export { initSnapshotEngine, captureSnapshot, getSnapshots, computeDelta, computeSimplifiedEIS, checkDailySnapshot, getSessionStartEis, getCurrentEIS, getSessionDelta, getSessionDeltaFinal, invalidateCache, invalidateScopedCaches, setBootPreparing, 
// Scoped EIS - por CNPJ, area, model ID
computeScopedEIS, getAllScopeEIS, captureScopedSnapshot, getScopedSnapshots, } from './snapshotEngine.js';
// Action Impact - lookup table + micro-feedback
export { ACTION_EIS_IMPACT, EIS_AXIS_NAMES, purposeMicroFeedback } from './actionImpact.js';
//# sourceMappingURL=index.js.map