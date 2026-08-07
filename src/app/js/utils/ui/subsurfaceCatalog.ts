// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_FC06_SUBSURFACE_3D (claude - novaspec, 2026-06-02) —
 * subsurfaceAdapter consumindo RegistryCatalog para subsuperfície 3D.
 *
 * Surfacа capabilities cross-module de `core/voxel` (modelagem 3D),
 * `core/geology` (estratos, litologia, falhas, trajetória wellbore)
 * e `core/wells` (directional MCM/DLS/TVD/MD). Cumpre RF1
 * (descobribilidade de visão 3D unificada) + cita Sawaryn 2005
 * (Compendium MCM SPE) + Bourgoyne (Applied Drilling Engineering).
 *
 * RF2 (importador LAS/CSV survey) + RF3 (TVD/MD/DLS UI) + RF4
 * (cross-section) ficam para sessão dedicada — requerem wire em
 * utils/scene + handlers de import.
 *
 * Refs:
 *   - SPEC `docs/specs/frontier/SPEC_FC06_SUBSURFACE_3D.md`
 *   - Abstração: `docs/specs/frontier/SPEC_REGISTRY_CATALOG.md`
 *   - Registries: core/voxel/manager, core/wells/directional,
 *                 core/geology/{wellTrajectory,surveyImporter,wellLithology}
 *   - Sawaryn & Thorogood — Compendium Directional MCM (SPE)
 *   - Bourgoyne et al. — Applied Drilling Engineering
 */

import { openRegistryCatalog, type RegistryEntry } from './registryCatalog.js';
import { t } from '../i18n/translations.js';

/**
 * Metadado curado por capability. Cobre 3 sub-systems:
 *  - 'voxel': modelagem 3D célula a célula
 *  - 'wells': trajetória direcional (MCM/DLS/TVD/MD)
 *  - 'geology': estratos/litologia/falhas
 */
export const SUBSURFACE_CAPABILITY_META = Object.freeze({
    // ===== core/wells/directional (Sawaryn 2005 SPE MCM canon) =====
    minimumCurvature: Object.freeze({
        group: 'wells',
        description: 'Minimum Curvature Method — arcos circulares + retas (padrão indústria); produz trajetória 3D com TVD/N/E',
        ref: 'Sawaryn & Thorogood 2005, SPE Compendium of Directional Calculations',
    }),
    validateSurvey: Object.freeze({
        group: 'wells',
        description: 'Validação de survey direcional (MD/INC/AZ monotônicos, intervalos sãos)',
        ref: 'Bourgoyne et al. — Applied Drilling Engineering',
    }),
    computeDLS: Object.freeze({
        group: 'wells',
        description: 'Dogleg Severity — taxa de mudança angular (°/30m) ao longo do wellbore',
        ref: 'Sawaryn & Thorogood 2005, SPE',
    }),
    kickoffPoint: Object.freeze({
        group: 'wells',
        description: 'Detecta ponto de kickoff (KOP) onde inclinação ultrapassa threshold (default 3°)',
        ref: 'Bourgoyne et al. — Applied Drilling Engineering',
    }),
    tangentInterpolate: Object.freeze({
        group: 'wells',
        description: 'Interpolação tangencial entre estações de survey (fallback simples)',
        ref: 'Bourgoyne et al. — Applied Drilling Engineering',
    }),

    // ===== core/geology — wellTrajectory (variant MCM dedicado a hidrogeologia) =====
    computeMinimumCurvatureTrajectory: Object.freeze({
        group: 'geology',
        description: 'MCM com saída pronta para Three.js (THREE.Vector3 stations) — variant para hidrogeologia P1-8',
        ref: 'Sawaryn & Thorogood 2005, SPE — NOTA: duplicação OQ#2 codebase-map com core/wells/directional.minimumCurvature',
    }),
    doglegAngle: Object.freeze({
        group: 'geology',
        description: 'Ângulo dogleg β entre duas estações (Pythagoras esférica)',
        ref: 'Sawaryn & Thorogood 2005, SPE',
    }),
    trajectoryToThreePoints: Object.freeze({
        group: 'geology',
        description: 'Adapter trajectory → array de Three.Vector3 para tubo 3D renderizável',
        ref: 'P1-8 Fault Wells Directional',
    }),

    // ===== core/voxel/manager (volumes 3D subsuperfície) =====
    createGeologyVolume: Object.freeze({
        group: 'voxel',
        description: 'Cria volume 3D voxel para modelagem subsuperfície (geologia/contaminação)',
        ref: 'P1-6 Voxel 3D module',
    }),
    setVoxelCell: Object.freeze({
        group: 'voxel',
        description: 'Atribui célula voxel a zona/litologia (índice flat 3D)',
        ref: 'P1-6 Voxel 3D module',
    }),
    rebuildVolumeMeshes: Object.freeze({
        group: 'voxel',
        description: 'Reconstrói meshes Three.js do volume após atualização de células',
        ref: 'P1-6 Voxel 3D module',
    }),
});

/**
 * Adaptador puro: capabilities object → RegistryEntry[].
 */
export function subsurfaceAdapter(
    capabilities: Record<string, unknown> | null | undefined,
): RegistryEntry[] {
    if (!capabilities || typeof capabilities !== 'object') return [];
    const out: RegistryEntry[] = [];
    for (const key of Object.keys(capabilities)) {
        if (typeof key !== 'string' || key.length === 0) continue;
        const meta = (SUBSURFACE_CAPABILITY_META as any)[key] || {
            group: 'misc',
            description: '',
            ref: '',
        };
        const cap = capabilities[key];
        const isFn = typeof cap === 'function';
        out.push({
            id: key,
            label: key,
            group: meta.group,
            meta: {
                description: meta.description || '',
                callable: isFn,
                module:
                    meta.group === 'wells'
                        ? 'core/wells/directional'
                        : meta.group === 'geology'
                            ? 'core/geology'
                            : meta.group === 'voxel'
                                ? 'core/voxel/manager'
                                : 'unknown',
            },
            ref: meta.ref || '',
        });
    }
    return out;
}

/**
 * Abre catálogo subsuperfície. Lazy-load dos 3 modules e coleta
 * capabilities curated. Surfacing real (RF1 visão 3D unificada)
 * fica para sessão dedicada com wire em utils/scene.
 */
export async function openSubsurfaceCatalog(): Promise<void> {
    try {
        const [wells, geol, voxel] = await Promise.all([
            import('/js/core/wells/directional.js' as any).catch(() => ({} as any)),
            import('/js/core/geology/wellTrajectory.js' as any).catch(() => ({} as any)),
            import('/js/core/voxel/manager.js' as any).catch(() => ({} as any)),
        ]) as any[];
        const capabilities: Record<string, unknown> = {};
        // Wells canônicos
        for (const k of ['minimumCurvature', 'validateSurvey', 'computeDLS', 'kickoffPoint', 'tangentInterpolate']) {
            if (typeof wells?.[k] === 'function') capabilities[k] = wells[k];
        }
        // Geology variants
        for (const k of ['computeMinimumCurvatureTrajectory', 'doglegAngle', 'trajectoryToThreePoints']) {
            if (typeof geol?.[k] === 'function') capabilities[k] = geol[k];
        }
        // Voxel manager
        for (const k of ['createGeologyVolume', 'setVoxelCell', 'rebuildVolumeMeshes']) {
            if (typeof voxel?.[k] === 'function') capabilities[k] = voxel[k];
        }
        const entries = subsurfaceAdapter(capabilities);
        const title = (t ? t('subsurfaceCatalog.title') : '')
            || `Catálogo Subsuperfície 3D (${entries.length} capacidades)`;
        openRegistryCatalog({
            entries,
            title,
            csvFilename: 'subsurface-capabilities',
        });
    }
    catch (e: any) {
        console.debug('[subsurfaceCatalog] open failed', e?.message || e);
    }
}
