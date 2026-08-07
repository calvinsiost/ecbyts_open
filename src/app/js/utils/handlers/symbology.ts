// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   ECBT — Symbology Handlers
   utils/handlers/symbology.ts

   Handlers window.* para o sistema de perfis de simbologia.
   Registrados em handlers/index.js.
   Licença: AGPL-3.0-only
   ================================================================ */
import { cycleProfile, setSymbologyRequestUIRefresh } from '../../core/symbology/manager.js';
import { openSymbologyEditor } from '../ui/symbologyModal.js';
// ----------------------------------------------------------------
// EXPORTAÇÕES PÚBLICAS
// ----------------------------------------------------------------
export const symbologyHandlers = {
    handleSymbologyClick,
    handleOpenSymbologyEditor,
};
/**
 * Injeta o callback de atualização de UI no manager de simbologia.
 * @param {Function} requestUIRefresh
 */
export function setSymbologyHandlerDeps(requestUIRefresh: () => void) {
    setSymbologyRequestUIRefresh(requestUIRefresh);
}
// ----------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------
/**
 * Clique no botão principal - cicla para o próximo perfil.
 */
function handleSymbologyClick() {
    const profile = cycleProfile();
    _updateBtn(profile);
}
/**
 * Abre o editor de perfis de simbologia.
 */
function handleOpenSymbologyEditor() {
    openSymbologyEditor();
}
// ----------------------------------------------------------------
// AUXILIARES
// ----------------------------------------------------------------
/**
 * Atualiza o texto exibido no botão de ciclo.
 * @param {any} profile
 */
function _updateBtn(profile: any) {
    const label = document.getElementById('symbology-btn-label');
    if (!label) return;
    if (!profile) {
        label.innerHTML = '&#9670; Sym';
        label.title = 'Sem perfil ativo';
        return;
    }
    const name = profile.name.length > 8 ? profile.name.slice(0, 7) + '…' : profile.name;
    label.textContent = '◆ ' + name;
    label.title = profile.name;
}
// Escuta evento de mudança de perfil para manter botão sincronizado
// (ciclo pode ser disparado de outras fontes além do botão)
window.addEventListener('symbologyChanged', (e: Event) => {
    const detail = (e as CustomEvent).detail;
    _updateBtn(detail.profile);
});
//# sourceMappingURL=symbology.js.map
//# sourceMappingURL=symbology.js.map
//# sourceMappingURL=symbology.js.map
