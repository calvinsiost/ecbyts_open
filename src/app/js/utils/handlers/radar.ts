// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   RADAR HANDLERS — window.* functions for Model Radar
   Dynamic import para nao quebrar handler chain se modulo falhar
   ================================================================ */
/**
 * @param {Function} _fn
 */
export function setRadarUpdateAllUI(_fn: any) {
    // Compatibility hook: radar actions lazy-open dedicated modals.
}
export const radarHandlers = {
    /**
     * Abre o modal do Radar.
     * Dynamic import para carregamento tardio.
     */
    handleOpenRadarModal() {
        import('../ui/radarModal.js' as string)
            .then(({ openRadarModal }) => openRadarModal())
            .catch((e) => console.error('[Radar] Erro ao abrir modal:', e));
    },
    /**
     * Fecha o modal do Radar.
     */
    handleCloseRadarModal() {
        import('../ui/radarModal.js' as string)
            .then(({ closeRadarModal }) => closeRadarModal())
            .catch((_e) => console.debug('[utils/handlers/radar:silent-catch]', _e?.message || _e));
    },
    /**
     * Abre o gerenciador de profiles do Radar (DataStudio Radar Profiles).
     * @param {{projectId?: string}} [opts]
     */
    handleOpenRadarProfileManager(opts?: any) {
        const projectId = opts?.projectId || (typeof window !== 'undefined' && window.__currentProjectId) || null;
        import('../ui/radar/profileManagerModal.js')
            .then(({ openProfileManagerModal }) => openProfileManagerModal({ projectId }))
            .catch((e) => console.error('[Radar] Erro ao abrir Profile Manager:', e));
    },
    /**
     * Fecha o gerenciador de profiles do Radar.
     */
    handleCloseRadarProfileManager() {
        import('../ui/radar/profileManagerModal.js')
            .then(({ closeProfileManagerModal }) => closeProfileManagerModal())
            .catch((_e) => console.debug('[utils/handlers/radar:silent-catch]', _e?.message || _e));
    },
    /**
     * Abre o wizard de criação de slice (DataStudio Radar Profiles).
     * Invocado via toolbar dropdown (index.html) + datastudio actions sem args
     * — projectId vem do contexto global. Modal lida com opts ausentes.
     * @param {{projectId?: string, profileId?: string}} [opts]
     */
    handleOpenRadarSliceWizard(opts?: any) {
        const projectId = opts?.projectId || (typeof window !== 'undefined' && window.__currentProjectId) || null;
        import('../ui/radar/sliceCreatorWizard.js')
            .then(({ openSliceCreatorWizard }) => openSliceCreatorWizard({ projectId, ...(opts || {}) }))
            .catch((e) => console.error('[Radar] Erro ao abrir Slice Wizard:', e));
    },
    /**
     * Abre a carteira de tokens do Radar. grantId vem de opts; sem ele o modal
     * mostra toast "grantId ausente" (nao crasha).
     * @param {{grantId?: string}} [opts]
     */
    handleOpenRadarTokenWallet(opts?: any) {
        const grantId = opts?.grantId || (typeof window !== 'undefined' && window.__currentRadarGrantId) || '';
        import('../ui/radar/tokenWalletModal.js')
            .then(({ openTokenWalletModal }) => openTokenWalletModal({ grantId }))
            .catch((e) => console.error('[Radar] Erro ao abrir Token Wallet:', e));
    },
    /**
     * Abre o visualizador de audit log do Radar (LGPD compliance).
     * @param {{sliceId?: string, projectId?: string}} [opts]
     */
    handleOpenRadarAuditLog(opts?: any) {
        const projectId = opts?.projectId || (typeof window !== 'undefined' && window.__currentProjectId) || null;
        import('../ui/radar/radarAuditLogViewer.js')
            .then(({ openAuditLogViewer }) => openAuditLogViewer({ projectId, ...(opts || {}) }))
            .catch((e) => console.error('[Radar] Erro ao abrir Audit Log:', e));
    },
};
