// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CONSULTING SERVICE — Proposal generation for Diretoria consulting
   Gera propostas de consultoria humana com estimativa de HH e valor

   Rate: R$ 500/HH | Availability: 4 HH/week | Minimum: 4 HH/contract
   estimatedHH usa heuristica de placeholder baseada em specificationId.length.
   ================================================================ */

/** Rate charged per consultant hour in BRL. */
const RATE_PER_HOUR = 500;

/** Minimum engagement in consultant hours. */
const MINIMUM_HH = 4;

/** Weekly hours available for consulting. */
const AVAILABLE_HOURS_PER_WEEK = 4;

export interface ConsultingAvailability {
    availableHours: number;
    ratePerHour: number;
    currency: string;
    nextSlot: string;
}

export interface BuildConsultingProposalParams {
    specificationId: string;
    userId: string;
}

export interface ConsultingProposal {
    status: 'proposal_ready';
    estimatedHH: number;
    totalValue: number;
    currency: string;
    ratePerHour: number;
    minimumHH: number;
}

/**
 * Return current consulting slot availability.
 *
 * @returns {ConsultingAvailability}
 */
export function getConsultingAvailability(): ConsultingAvailability {
    return {
        availableHours: AVAILABLE_HOURS_PER_WEEK,
        ratePerHour: RATE_PER_HOUR,
        currency: 'BRL',
        nextSlot: 'schedule via contact',
    };
}

/**
 * Build a consulting proposal for a given specification.
 * estimatedHH is a placeholder heuristic - real scoping is done by the consultant.
 *
 * @param {BuildConsultingProposalParams} params
 * @returns {ConsultingProposal}
 */
export function buildConsultingProposal({ specificationId, userId: _userId }: BuildConsultingProposalParams): ConsultingProposal {
    const estimatedHH = Math.max(MINIMUM_HH, Math.ceil(specificationId.length / 10));
    const totalValue = estimatedHH * RATE_PER_HOUR;
    return {
        status: 'proposal_ready',
        estimatedHH,
        totalValue,
        currency: 'BRL',
        ratePerHour: RATE_PER_HOUR,
        minimumHH: MINIMUM_HH,
    };
}