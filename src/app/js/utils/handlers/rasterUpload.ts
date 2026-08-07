// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   RASTER UPLOAD HANDLERS — Window handlers for raster georeferencing
   ================================================================

   Handlers para upload de imagem raster, georeferenciamento via
   pontos de controle (GCPs) e extracao de contornos/isolinhas.
   ================================================================ */

import {
    openRasterUploadModal,
    closeRasterUploadModal,
    addControlPoint,
    removeControlPoint,
    georeference,
    extractContoursFromRaster,
    exportContoursGeoJSON,
} from '../ui/rasterUploadModal.js';

/** Open the raster upload modal. */
function handleUploadRaster(): void {
    openRasterUploadModal();
}

/** Close the raster upload modal. */
function handleCloseRasterUpload(): void {
    closeRasterUploadModal();
}

/** Add a ground control point row. */
function handleRasterAddGCP(): void {
    addControlPoint();
}

/** Remove a ground control point by index. */
function handleRasterRemoveGCP(idx: number): void {
    removeControlPoint(idx);
}

/** Run affine georeferencing on current control points. */
function handleGeoreferenceRaster(): void {
    georeference();
}

/** Extract contours from the georeferenced raster. */
function handleExtractContours(): void {
    extractContoursFromRaster();
}

/** Export georeferenced contours as GeoJSON download. */
function handleExportContoursGeoJSON(): void {
    exportContoursGeoJSON();
}

export const rasterUploadHandlers = {
    handleUploadRaster,
    handleCloseRasterUpload,
    handleRasterAddGCP,
    handleRasterRemoveGCP,
    handleGeoreferenceRaster,
    handleExtractContours,
    handleExportContoursGeoJSON,
};
