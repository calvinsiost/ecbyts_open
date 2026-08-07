// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/utils/handlers/homeHeader.js
// Handlers for Home Redesign V2 contextual header buttons (SPEC_HOME_REDESIGN_3COL)

export function handleHomeHeaderGenerate(): void {
    if (typeof (window as any).handleGenerateRandomModel === 'function') {
        (window as any).handleGenerateRandomModel();
    } else if (typeof (window as any).newProject === 'function') {
        (window as any).newProject();
    }
}

export function handleHomeHeaderImport(): void {
    // IMPORT-UX-001 RF-1: prefere o modal rico (ingestion wizard) sobre o pobre.
    if (typeof (window as any).handleOpenIngestionModal === 'function') {
        (window as any).handleOpenIngestionModal();
    } else if (typeof (window as any).openImportModal === 'function') {
        (window as any).openImportModal();
    }
}

export function handleHomeHeaderExport(): void {
    if (typeof (window as any).openExportModal === 'function') {
        (window as any).openExportModal();
    }
}

export function handleHomeHeaderShare(): void {
    if (typeof (window as any).shareURL === 'function') {
        (window as any).shareURL();
    }
}

export const homeHeaderHandlers = {
    handleHomeHeaderGenerate,
    handleHomeHeaderImport,
    handleHomeHeaderExport,
    handleHomeHeaderShare,
};
