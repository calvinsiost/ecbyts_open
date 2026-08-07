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
// Handler: EcoTools - C1
// Registra as funções do modal de EcoTools no window.*
import { openEcoToolsModal, closeEcoToolsModal, renderEcoToolsList, previewEcoTool, closeEcoToolPreview, deleteEcoTool, openEditEcoTool, saveEditEcoTool, cancelEditEcoTool, openEcoToolInTab, } from '../ui/ecoToolsModal.js';
import { saveEcoToolRecord, getEcoToolRecords } from '../../core/llm/toolBuilder.js';
export const ecoToolsHandlers = {
    handleOpenEcoTools: openEcoToolsModal,
    closeEcoToolsModal: closeEcoToolsModal,
    handleRenderEcoToolsList: renderEcoToolsList,
    handlePreviewEcoTool: previewEcoTool,
    handleCloseEcoToolPreview: closeEcoToolPreview,
    handleDeleteEcoTool: deleteEcoTool,
    renderEcoToolsList: renderEcoToolsList,
    handleEditEcoTool: openEditEcoTool,
    handleSaveEcoTool: saveEditEcoTool,
    handleCancelEcoToolEdit: cancelEditEcoTool,
    handleOpenEcoToolInTab: openEcoToolInTab,
    // API pública - acessível via Automation API como window.*
    saveEcoToolRecord,
    getEcoToolRecords,
};
//# sourceMappingURL=ecoTools.js.map
