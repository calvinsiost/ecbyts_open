// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: conversationLogger - processAgentCommand interceptor
// Status: STUB - full logging pending ecbytsbots integration

/* ================================================================
   CONVERSATION LOGGER - Interceptor for tracking agent calls
   ================================================================

   Registers each processAgentCommand invocation for the ecbytsbots
   telemetry dashboard (localhost:3001).

   Future integration with ecbytsbots/scripts/agent-conversation-logger.js
   through ECBYTS_PROJECT_ROOT or the REST API.

   ================================================================ */

/**
 * Wraps processAgentCommand with telemetry logging.
 * Stub: passthrough without logging until ecbytsbots integration is complete.
 */
export function interceptProcessAgentCommand<T>(processAgentCommandFn: T): T {
    // Stub: return the original function without modification.
    // Future implementation: add logging before/after the call.
    if (typeof processAgentCommandFn !== 'function') {
        return processAgentCommandFn;
    }
    return processAgentCommandFn;
}
