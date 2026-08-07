// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   WORKFLOWS MODULE — Entry point
   Exporta engine, registry e registra workflows built-in.
   ================================================================ */
// Engine (state machine)
export {
    createWorkflow,
    advanceWorkflow,
    goBackWorkflow,
    setStepResult,
    failWorkflow,
    getWorkflowStep,
    getWorkflowProgress,
    isWorkflowComplete,
    getCurrentStep,
    isExecutionStep,
    validateCurrentStep,
} from './engine.js';
// Registry
export {
    registerWorkflow,
    getWorkflow,
    getAllWorkflows,
    getWorkflowsByRegulation,
    checkPrerequisites,
} from './registry.js';
// Orchestrator
export {
    runValidation,
    runInterpolation,
    runDelineation,
    runSAOAssessment,
    runEIS,
    runVoxelGeneration,
} from './orchestrator.js';
// ================================================================
// REGISTER BUILT-IN WORKFLOWS
// ================================================================
import { registerWorkflow } from './registry.js';
import { PLUME_DELINEATION_CONAMA420 } from './definitions/plumeDelineation.js';
import { EMERGENCY_RESPONSE_SAO } from './definitions/emergencyResponse.js';
import { RISK_ASSESSMENT_CETESB } from './definitions/riskAssessment.js';
registerWorkflow(PLUME_DELINEATION_CONAMA420);
registerWorkflow(EMERGENCY_RESPONSE_SAO);
registerWorkflow(RISK_ASSESSMENT_CETESB);
