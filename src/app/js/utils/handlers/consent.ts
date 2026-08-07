// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * Consent handlers — exposes the legal-consent modal reopen as a
 * window.* handler so the footer / privacy menu can re-trigger it
 * (LGPD: right to review and revoke consent at any time).
 *
 * Portugues: permite reabrir o aviso de Termos/Privacidade/Cookies
 * a qualquer momento (direito de revisao/revogacao — LGPD Art. 18).
 */
import { openConsentModal } from '../ui/privacyNotice.js';
/**
 * Reabre o modal unificado de consentimento.
 * @returns {void}
 */
function handleOpenConsentModal() {
    openConsentModal();
}
export const consentHandlers = {
    handleOpenConsentModal,
};
