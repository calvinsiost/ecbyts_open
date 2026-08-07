// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: core/operations/index
// Description: Re-exports for the operations bounded context (Tickets, Reservations, EPIs).
//
// NOTE: each manager exports a test-only helper named `_clearAll`. Using `export *`
// for all three would create a TS2308 ambiguity that already makes `_clearAll`
// unreachable via this barrel at runtime (per ES module semantics). To keep the
// public surface byte-identical with the previous behaviour we re-export every
// named binding explicitly EXCEPT `_clearAll` - callers needing the test reset
// must import it directly from the owning manager module.

export {
    TICKET_TYPES,
    TICKET_PRIORITIES,
    TICKET_STATES,
    VALID_TRANSITIONS,
    createTicket,
    transitionTicket,
    getTicket,
    listTickets,
    resolveTicket,
    closeTicket,
    cancelTicket,
    addTicketComment,
    getTicketHistory,
} from './ticketManager.js';

export {
    RESOURCE_TYPES,
    RESERVATION_STATES,
    createResource,
    createReservation,
    cancelReservation,
    getConflicts,
    listResourceReservations,
    suggestNextAvailable,
} from './reservationManager.js';

export {
    EPI_CATEGORIES,
    SERIAL_TRACKED_CATEGORIES,
    EPI_STATES,
    RETURN_CONDITIONS,
    createEpiItem,
    loanEpi,
    returnEpi,
    listAvailable,
    listLoaned,
    getEpiItem,
    checkCertExpiry,
    reportDamage,
} from './epiManager.js';
