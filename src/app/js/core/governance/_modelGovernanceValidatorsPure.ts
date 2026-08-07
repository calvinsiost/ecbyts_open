// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   MODEL GOVERNANCE VALIDATORS PURE (Module C extraction)
   ================================================================

   3 primitivos de validação extraídos de core/governance/modelGovernance.ts
   (G7 — Technical Officer DD38, Data Steward, AI Governance).

   Pure-logic; sem state. Reusáveis por outros validators governance que
   precisem dos mesmos primitivos (email RFC-light, registro profissional
   brasileiro, string não-vazia bounded).
   ================================================================ */

/**
 * Email validação RFC-light (não RFC 5322 completo — apenas estrutural).
 * - String trimmed entre 5 e 320 chars (limite RFC 5321 SMTP local+domain).
 * - Pattern: <local>@<domain>.<tld> com whitespace+@ excluídos em cada parte.
 *
 * NÃO valida MX/TLD existência; só formato. Defensivo contra null/non-string.
 */
export function isValidEmail(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (trimmed.length < 5 || trimmed.length > 320) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Brazilian professional registration number (CREA, CRBio, CRQ, OAB,
 * CRP, CRM, CRC, etc). Formato varia por conselho; aceita alfanumérico
 * com hyphens/slashes/dots/spaces, 5-30 chars trimmed.
 *
 * Exemplos válidos: 'CREA-SP 12345', 'OAB/RJ 67890', 'CRQ.IV.1234'.
 */
export function isValidRegistrationNumber(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (trimmed.length < 5 || trimmed.length > 30) return false;
    return /^[A-Za-z0-9\-/.\s]+$/.test(trimmed);
}

/**
 * String não-vazia bounded (após trim). Defaults: minLen=2, maxLen=200.
 * Bounds inclusivos: length===minLen passa; length===maxLen passa.
 */
export function isNonEmptyString(value: unknown, minLen: number = 2, maxLen: number = 200): boolean {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    return trimmed.length >= minLen && trimmed.length <= maxLen;
}
