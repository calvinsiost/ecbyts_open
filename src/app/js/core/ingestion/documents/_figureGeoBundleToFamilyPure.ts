// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// FIGURE-GEOM-001 F4 — adapter pure-logic FigureGeoBundle → family specs.
//
// Converte output do orquestrador extractFigureWithGeometry em
// especificações canônicas { family, id, name, data, meta } prontas
// para addElement() de core/elements/manager.
//
// Pure-logic: zero THREE/DOM/IDB. Caller (handler/UI) decide se chama
// addElement em sequência.
//
// Mapeamento canônico:
//   geometry.kind === 'polygon' (pluma) → family.plume
//   geometry.kind === 'polygon' (área) → family.boundary
//   geometry.kind === 'pointSet' (poços) → family.well[]
//   geometry.kind === 'blueprint' (croqui) → family.blueprint
//   geometry.kind === 'isolineSet' (potenciométrico) → não cria element,
//      alimenta core/interpolation/potentiometric via meta
//   geometry.kind === 'point' / 'line' / 'raster' / 'unknown' → skip
//
// SPEC: docs/specs/_archived/SPEC_FIGURE_GEOMETRY_EXTRACTION.md F4

import type { FigureGeometry } from './_figureGeometryExtractorPure.js';
import type { DepthRuler } from './_depthRulerExtractorPure.js';
import type { CoordinateGrid } from './_coordinateGridExtractorPure.js';

// Local FigureGeoBundle copy (evita ciclo de import com index.ts)
interface BundleInput {
    readonly geometry: FigureGeometry;
    readonly depthRuler: DepthRuler;
    readonly coordinateGrid: CoordinateGrid;
    readonly combinedConfidence: number;
}

// ===========================================================================
// Tipos
// ===========================================================================

/** Família canônica do ecbyts que pode ser criada a partir de figura. */
export type FamilyTargetId = 'plume' | 'boundary' | 'well' | 'blueprint';

export interface FamilyElementSpec {
    readonly family: FamilyTargetId;
    readonly id: string; // determinístico baseado em figureIndex
    readonly name: string;
    readonly data: Readonly<Record<string, unknown>>;
    readonly meta: Readonly<Record<string, unknown>>;
}

export interface FigureToFamilyResult {
    readonly specs: ReadonlyArray<FamilyElementSpec>;
    readonly skipped: boolean;
    readonly skipReason: string | null;
    readonly warnings: ReadonlyArray<string>;
}

// ===========================================================================
// Helpers
// ===========================================================================

function safeId(prefix: string, figureIndex: number, suffix: string = ''): string {
    const idx = Number.isInteger(figureIndex) && figureIndex >= 0 ? figureIndex : 0;
    return `${prefix}-fig${idx}${suffix ? `-${suffix}` : ''}`;
}

function bboxCenter(grid: CoordinateGrid): { x: number; y: number } | null {
    if (!grid.bbox) return null;
    return {
        x: (grid.bbox.minX + grid.bbox.maxX) / 2,
        y: (grid.bbox.minY + grid.bbox.maxY) / 2,
    };
}

function isPlumeCaption(caption: string): boolean {
    return /pluma\s+de|isolinhas?\s+de\s+concentra/i.test(caption);
}

function isBoundaryCaption(caption: string): boolean {
    return /\b(área|propriedade|limite|perímetro|bacia\s+hidro|delimita)/i.test(caption);
}

// ===========================================================================
// API pública
// ===========================================================================

/**
 * Converte FigureGeoBundle + caption em FamilyElementSpec[] canônicos.
 *
 * @param bundle output de extractFigureWithGeometry
 * @param caption legenda original (necessária para distinguir polygon=pluma vs polygon=boundary)
 * @param figureIndex índice da figura no documento (para id determinístico)
 * @param options opcionais (skip thresholds)
 */
export function figureBundleToFamilySpecs(
    bundle: BundleInput,
    caption: unknown,
    figureIndex: unknown = 0,
    options: { readonly minConfidence?: number } = {},
): FigureToFamilyResult {
    const empty: FigureToFamilyResult = Object.freeze({
        specs: Object.freeze([] as FamilyElementSpec[]),
        skipped: true,
        skipReason: null,
        warnings: Object.freeze([] as string[]),
    });

    if (!bundle || !bundle.geometry) {
        return Object.freeze({ ...empty, skipReason: 'bundle inválido' });
    }
    const cap = typeof caption === 'string' ? caption : '';
    const idx = Number.isInteger(figureIndex) ? (figureIndex as number) : 0;
    const minConf = typeof options.minConfidence === 'number' ? options.minConfidence : 0.3;

    if (bundle.combinedConfidence < minConf) {
        return Object.freeze({
            ...empty,
            skipReason: `combinedConfidence ${bundle.combinedConfidence.toFixed(2)} < ${minConf}`,
        });
    }

    const warnings: string[] = [];
    const specs: FamilyElementSpec[] = [];
    const provenance = Object.freeze({
        source: 'extract:FIGURE-GEOM-001',
        figureIndex: idx,
        captionExcerpt: cap.slice(0, 100),
        confidence: bundle.combinedConfidence,
    });

    const kind = bundle.geometry.kind;

    // POLYGON → plume OR boundary (decide por caption)
    if (kind === 'polygon') {
        const family: FamilyTargetId = isPlumeCaption(cap)
            ? 'plume'
            : isBoundaryCaption(cap)
                ? 'boundary'
                : 'plume'; // default polygon → plume (conservador)
        if (!isPlumeCaption(cap) && !isBoundaryCaption(cap)) {
            warnings.push(`polygon sem keyword pluma/boundary — default plume (cap: "${cap.slice(0, 40)}")`);
        }
        const center = bboxCenter(bundle.coordinateGrid);
        specs.push(
            Object.freeze({
                family,
                id: safeId(family, idx),
                name: cap.slice(0, 60) || `${family} (fig ${idx})`,
                data: Object.freeze({
                    position: center
                        ? { lat: center.y, lng: center.x }
                        : bundle.geometry.position,
                    extent: bundle.geometry.extent,
                    rotation: bundle.geometry.rotation,
                    bbox: bundle.coordinateGrid.bbox,
                    crs: bundle.coordinateGrid.crs,
                }),
                meta: Object.freeze({
                    provenance,
                    figureKind: kind,
                    autoCreatedFromFigure: true,
                }),
            }),
        );
    }

    // POINTSET → multiple wells (1 element por ponto)
    else if (kind === 'pointSet') {
        const center = bboxCenter(bundle.coordinateGrid);
        if (!center && !bundle.geometry.position.lat) {
            warnings.push('pointSet sem grid 2D nem position — apenas placeholder único');
            specs.push(
                Object.freeze({
                    family: 'well',
                    id: safeId('well', idx),
                    name: `Conjunto de poços (fig ${idx})`,
                    data: Object.freeze({ position: bundle.geometry.position }),
                    meta: Object.freeze({ provenance, figureKind: kind, autoCreatedFromFigure: true }),
                }),
            );
        } else {
            // Sem pixelXY individual, criamos 1 placeholder no centro do bbox.
            // Vision posterior pode adicionar mais elements com positions exatas.
            specs.push(
                Object.freeze({
                    family: 'well',
                    id: safeId('well', idx),
                    name: cap.slice(0, 60) || `Conjunto de poços (fig ${idx})`,
                    data: Object.freeze({
                        position: center
                            ? { lat: center.y, lng: center.x }
                            : bundle.geometry.position,
                        bbox: bundle.coordinateGrid.bbox,
                        crs: bundle.coordinateGrid.crs,
                        isGroupPlaceholder: true,
                    }),
                    meta: Object.freeze({ provenance, figureKind: kind, autoCreatedFromFigure: true }),
                }),
            );
        }
    }

    // BLUEPRINT → family.blueprint (croqui)
    else if (kind === 'blueprint') {
        specs.push(
            Object.freeze({
                family: 'blueprint',
                id: safeId('blueprint', idx),
                name: cap.slice(0, 60) || `Croqui (fig ${idx})`,
                data: Object.freeze({
                    position: bundle.geometry.position,
                    extent: bundle.geometry.extent,
                    rotation: bundle.geometry.rotation,
                    // Blueprint geralmente NÃO tem georef explícita
                    isLocalCoords: bundle.coordinateGrid.system === 'unknown' || bundle.coordinateGrid.system === 'local',
                }),
                meta: Object.freeze({ provenance, figureKind: kind, autoCreatedFromFigure: true }),
            }),
        );
    }

    // ISOLINESET / LINE / POINT / RASTER / UNKNOWN → skip (não cria family element)
    else {
        return Object.freeze({
            ...empty,
            skipReason: `kind '${kind}' não mapeia para family element auto-criável`,
        });
    }

    return Object.freeze({
        specs: Object.freeze(specs),
        skipped: false,
        skipReason: null,
        warnings: Object.freeze(warnings),
    });
}

/** Metadata pública. */
export const FIGURE_GEO_BUNDLE_TO_FAMILY_META = Object.freeze({
    supportedFamilies: Object.freeze(['plume', 'boundary', 'well', 'blueprint']),
    skippedKinds: Object.freeze(['isolineSet', 'line', 'point', 'raster', 'unknown']),
    defaultMinConfidence: 0.3,
    polygonDefaultFamily: 'plume', // fallback quando caption não tem keyword
});
