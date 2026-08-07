// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: SpatialBlueprint - Handler & Wizard UI
// ADR: ADR-021
// ================================================================
// spatial.js - Handlers para import de blueprint CAD/GIS
// Modal wizard de 3 passos: Upload -> Config -> Resultados
// ================================================================
import { showToast as _showToastImpl } from '../ui/toast.js';
const showToast = _showToastImpl;
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { createLogger } from '../helpers/logger.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('Spatial');
let requestUIRefresh: any = null;
/**
 * Injeta a funcao de refresh de UI.
 * @param {() => void} fn
 */
export function setUpdateAllUI(fn: any) {
    requestUIRefresh = fn;
}
function requestSpatialUIRefresh(reason = 'spatial.changed') {
    if (typeof requestUIRefresh !== 'function')
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        requestUIRefresh(domain, reason);
    }
}
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let _wizardState: any = null;
/**
 * CRS comuns para projetos ambientais brasileiros.
 */
const COMMON_CRS = [
    { code: 'LOCAL', name: 'Local (CAD — coordenadas em metros)' },
    { code: 'EPSG:31983', name: 'SIRGAS 2000 / UTM 23S (SP, MG, RJ, PR)' },
    { code: 'EPSG:31982', name: 'SIRGAS 2000 / UTM 22S (RS, SC, MS)' },
    { code: 'EPSG:31984', name: 'SIRGAS 2000 / UTM 24S (BA, ES, SE)' },
    { code: 'EPSG:31981', name: 'SIRGAS 2000 / UTM 21S (MT, MS, GO)' },
    { code: 'EPSG:31985', name: 'SIRGAS 2000 / UTM 25S (AL, PE, PB)' },
    { code: 'EPSG:4674', name: 'SIRGAS 2000 (Geográfico, graus)' },
    { code: 'EPSG:4326', name: 'WGS 84 (GPS, Google Earth)' },
    { code: 'EPSG:29183', name: 'SAD69 / UTM 23S (legado)' },
];
/**
 * Categorias de site.
 */
const CATEGORIES = [
    { id: 'industrial', labelKey: 'industrial' },
    { id: 'urban', labelKey: 'urban' },
    { id: 'forest', labelKey: 'forest' },
    { id: 'agricultural', labelKey: 'agricultural' },
    { id: 'mixed', labelKey: 'mixed' },
];
// ----------------------------------------------------------------
// MODAL OPEN / CLOSE
// ----------------------------------------------------------------
/**
 * Abre o modal de import DXF. Reseta wizard state.
 */
export function handleOpenSpatialModal() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('spatial')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    _wizardState = null;
    const modal = document.getElementById('spatial-modal');
    if (modal) {
        modal.classList.add('active');
        renderUploadStep();
    }
}
/**
 * Fecha o modal de import DXF.
 */
export function handleCloseSpatialModal() {
    const modal = document.getElementById('spatial-modal');
    if (modal) modal.classList.remove('active');
    _wizardState = null;
}
// ----------------------------------------------------------------
// STEP 1: UPLOAD
// ----------------------------------------------------------------
/**
 * Renderiza o passo de upload do DXF.
 */
function renderUploadStep() {
    const container = document.getElementById('spatial-content');
    if (!container) return;
    container.innerHTML = `
        <div style="padding:20px;text-align:center;">
            <div style="border:2px dashed var(--neutral-300);border-radius:12px;padding:40px 20px;margin-bottom:16px;cursor:pointer;"
                 id="spatial-dropzone"
                 data-cc-action="cc-fb47b33e">
                <div style="font-size:36px;color:var(--neutral-400);margin-bottom:12px;">&#128506;</div>
                <p style="color:var(--neutral-600);font-size:13px;margin:0;">
                    ${t('spatial.uploadPrompt') || 'Upload a DXF file (.dxf) from AutoCAD, QGIS, or similar software'}
                </p>
                <p style="color:var(--neutral-400);font-size:11px;margin-top:8px;">
                    .dxf (LINE, LWPOLYLINE, POLYLINE)
                </p>
            </div>
            <input type="file" id="spatial-file-input" accept=".dxf" style="display:none"
                   data-cc-change="cc-4cdfc31d">
        </div>
    `;
    // Drag and drop
    const dropzone = document.getElementById('spatial-dropzone');
    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--primary-500)';
        });
        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = 'var(--neutral-300)';
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--neutral-300)';
            const file = e.dataTransfer?.files?.[0];
            if (file && file.name.toLowerCase().endsWith('.dxf')) {
                processUploadedFile(file);
            } else {
                showToast(t('spatial.invalidFile') || 'Please upload a .dxf file', 'warning');
            }
        });
    }
}
/**
 * Handler de file input - le e parseia o DXF.
 * @param {HTMLInputElement} input
 */
export async function handleSpatialFileUpload(input: any) {
    const file = input?.files?.[0];
    if (!file) return;
    await processUploadedFile(file);
}
/**
 * Entrada direta para arquivo espacial (reaproveitada pelo modal de importacao central).
 * @param {File} file
 */
export async function handleSpatialDirectFile(file: any) {
    if (!(file instanceof File)) return;
    await processUploadedFile(file);
}
/**
 * Processa arquivo DXF uploadado.
 * @param {File} file
 */
async function processUploadedFile(file: any) {
    const container = document.getElementById('spatial-content');
    if (!container) return;
    container.innerHTML = `<p style="color:(var as any)(--neutral-500);font-size:12px;padding:20px;text-align:center;">${t('spatial.parsingDXF') || 'Parsing DXF entities...'}</p>`;
    try {
        const { parseDXF } = await import('../../core/spatial/dxfParser.js' as string);
        const text = await file.text();
        const parsed = parseDXF(text);
        // Auto-detecta coords locais: se extensao < 100.000m, provavelmente CAD local
        const ext = parsed.metadata.extents;
        const isLocal =
            ext &&
            Math.abs(ext.max.x) < 100000 &&
            Math.abs(ext.max.y) < 100000 &&
            Math.abs(ext.min.x) < 100000 &&
            Math.abs(ext.min.y) < 100000;
        _wizardState = {
            file,
            parsed,
            sourceCRS: isLocal ? 'LOCAL' : 'EPSG:31983',
            category: 'industrial',
            simplifyTolerance: 0.5,
            referenceZones: [],
        };
        renderConfigStep();
    } catch (err: any) {
        log.error('DXF/GIS parse failed', err?.message || String(err));
        container.innerHTML = `
            <div style="padding:20px;text-align:center;">
                <p style="color:var(--red-500);font-size:13px;">${escapeHtml(err?.message || String(err))}</p>
                <button class="btn btn-secondary" data-cc-action="cc-51ebe1f9" style="margin-top:12px;">
                    ${t('retry') || 'Retry'}
                </button>
            </div>
        `;
    }
}
// ----------------------------------------------------------------
// STEP 2: CONFIGURATION
// ----------------------------------------------------------------
/**
 * Renderiza o passo de configuracao (CRS, categoria, tolerancia).
 */
function renderConfigStep() {
    const container = document.getElementById('spatial-content');
    if (!container || !_wizardState) return;
    const { parsed } = _wizardState;
    const layerNames = [...parsed.layers.keys()];
    const crsOptions = COMMON_CRS.map((c: any) =>
            `<option value="${c.code}" ${c.code === _wizardState.sourceCRS ? 'selected' : ''}>${c.code} — ${c.name}</option>`,
    ).join('');
    const categoryOptions = CATEGORIES.map((c: any) =>
            `<option value="${c.id}" ${c.id === _wizardState.category ? 'selected' : ''}>${c.id.charAt(0).toUpperCase() + c.id.slice(1)}</option>`,
    ).join('');
    const layerList = layerNames
        .map((name: any) => {
            const count = parsed.layers.get(name).length;
            return `<li style="font-size:12px;color:var(--neutral-600);padding:2px 0;">
            <strong>${escapeHtml(name)}</strong> — ${count} ${count === 1 ? 'entity' : 'entities'}
        </li>`;
        })
        .join('');
    container.innerHTML = `
        <div style="padding:16px;">
            <!-- File summary -->
            <div style="background:var(--neutral-100);border-radius:8px;padding:12px;margin-bottom:16px;">
                <p style="font-size:12px;color:var(--neutral-600);margin:0;">
                    <strong>${escapeHtml(_wizardState.file.name)}</strong>
                    — ${parsed.entities.length} entities, ${layerNames.length} layers
                    ${parsed.metadata.units !== 'unknown' ? ` (${parsed.metadata.units})` : ''}
                </p>
                <ul style="margin:8px 0 0 16px;padding:0;list-style:disc;">${layerList}</ul>
            </div>

            <!-- CRS -->
            <div style="margin-bottom:12px;">
                <label style="font-size:11px;font-weight:600;color:var(--neutral-500);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">
                    ${t('spatial.selectCRS') || 'Coordinate Reference System'}
                </label>
                <select data-field-meta="true" data-field-meta-key="auto:spatial-crs" id="spatial-crs" style="width:100%;padding:6px 8px;border:1px solid var(--neutral-300);border-radius:6px;font-size:12px;background:var(--neutral-50);"
                        data-cc-change="cc-9621ffdb">
                    ${crsOptions}
                </select>
                <p style="font-size:10px;color:var(--neutral-400);margin-top:2px;">
                    ${t('spatial.crsHelp') || 'The CRS of the original DXF file'}
                </p>
            </div>

            <!-- Category -->
            <div style="margin-bottom:12px;">
                <label style="font-size:11px;font-weight:600;color:var(--neutral-500);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">
                    ${t('spatial.category') || 'Site Category'}
                </label>
                <select data-field-meta="true" data-field-meta-key="auto:spatial-category" id="spatial-category" style="width:100%;padding:6px 8px;border:1px solid var(--neutral-300);border-radius:6px;font-size:12px;background:var(--neutral-50);"
                        data-cc-change="cc-b621a74b">
                    ${categoryOptions}
                </select>
            </div>

            <!-- Simplification tolerance -->
            <div style="margin-bottom:16px;">
                <label style="font-size:11px;font-weight:600;color:var(--neutral-500);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">
                    ${t('spatial.tolerance') || 'Simplification Tolerance'} (m)
                </label>
                <input data-field-meta="true" data-field-meta-key="auto:spatial-tolerance" type="range" id="spatial-tolerance" min="0" max="5" step="0.1" value="${_wizardState.simplifyTolerance}"
                       style="width:100%;"
                       data-cc-input="cc-7802e96b">
                <span id="spatial-tolerance-val" style="font-size:11px;color:var(--neutral-500);">${_wizardState.simplifyTolerance}m</span>
            </div>

            <!-- Actions -->
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="btn btn-secondary" data-cc-action="cc-51ebe1f9" style="font-size:12px;">
                    ${t('back') || 'Back'}
                </button>
                <button class="btn btn-primary" data-cc-action="cc-949e1179" style="font-size:12px;">
                    ${t('spatial.process') || 'Process Blueprint'}
                </button>
            </div>
        </div>
    `;
}
/**
 * Handler de mudanca de CRS.
 * @param {string} crs
 */
export function handleSpatialCRSChange(crs: any) {
    if (_wizardState) _wizardState.sourceCRS = crs;
}
/**
 * Handler de mudanca de categoria.
 * @param {string} category
 */
export function handleSpatialCategoryChange(category: any) {
    if (_wizardState) _wizardState.category = category;
}
// ----------------------------------------------------------------
// PROCESSING
// ----------------------------------------------------------------
/**
 * Executa o pipeline de processamento DXF completo.
 */
export async function handleSpatialProcess() {
    if (!_wizardState) return;
    const container = document.getElementById('spatial-content');
    if (!container) return;
    // Le tolerancia do slider
    const toleranceInput = document.getElementById('spatial-tolerance');
    if (toleranceInput) _wizardState.simplifyTolerance = parseFloat((toleranceInput as any).value);
    // Mostra progresso
    container.innerHTML = `
        <div style="padding:40px 20px;text-align:center;">
            <p id="spatial-progress-text" style="color:var(--neutral-500);font-size:12px;margin-bottom:8px;">
                ${t('spatial.loadingLibs') || 'Loading geometry libraries...'}
            </p>
            <div style="width:100%;max-width:300px;height:4px;background:var(--neutral-200);border-radius:2px;margin:0 auto;">
                <div id="spatial-progress-bar" style="width:0%;height:100%;background:var(--primary-500);border-radius:2px;transition:width 0.3s;"></div>
            </div>
        </div>
    `;
    const stageLabels = {
        parsing: t('spatial.parsingDXF') || 'Parsing DXF...',
        polygonizing: t('spatial.polygonizing') || 'Stitching lines into polygons...',
        projecting: t('spatial.projecting') || 'Projecting to metric CRS...',
        simplifying: t('spatial.simplifying') || 'Simplifying topology...',
        reprojecting: t('spatial.reprojecting') || 'Reprojecting to WGS84...',
        compliance: t('spatial.checking') || 'Checking compliance...',
    };
    const stageWeights = {
        parsing: 10,
        polygonizing: 30,
        projecting: 15,
        simplifying: 15,
        reprojecting: 10,
        compliance: 20,
    };
    let totalProgress = 0;
    try {
        const { processDXF } = await import('../../core/spatial/processor.js' as string);
        const result = await processDXF(_wizardState.file, {
            sourceCRS: _wizardState.sourceCRS,
            category: _wizardState.category,
            simplifyTolerance: _wizardState.simplifyTolerance,
            referenceZones: _wizardState.referenceZones,
            onProgress: (stage: any, percent: any) => {
                const text = document.getElementById('spatial-progress-text');
                const bar = document.getElementById('spatial-progress-bar');
                if (text) text.textContent = (stageLabels as Record<string,any>)[stage] || stage;
                const weight = (stageWeights as Record<string,any>)[stage] || 10;
                totalProgress = Math.min(totalProgress + ((weight * percent) / 100) * 0.01, 100);
                if (bar) bar.style.width = `${Math.min((totalProgress * 100) / 100, 100)}%`;
            },
        });
        _wizardState.result = result;
        renderResultsStep();
    } catch (err: any) {
        log.error('Spatial processing failed', err?.message || String(err));
        container.innerHTML = `
            <div style="padding:20px;text-align:center;">
                <p style="color:var(--red-500);font-size:13px;margin-bottom:8px;">${escapeHtml(err?.message || String(err))}</p>
                <button class="btn btn-secondary" data-cc-action="cc-51ebe1f9" style="font-size:12px;margin-top:8px;">
                    ${t('retry') || 'Retry'}
                </button>
            </div>
        `;
    }
}
// ----------------------------------------------------------------
// STEP 3: RESULTS
// ----------------------------------------------------------------
/**
 * Renderiza os resultados do processamento.
 */
function renderResultsStep() {
    const container = document.getElementById('spatial-content');
    if (!container || !_wizardState?.result) return;
    const { result } = _wizardState;
    // Formata area
    const areaFormatted =
        result.area_m2 >= 10000
            ? `${(result.area_m2 / 10000).toFixed(2)} ha (${result.area_m2.toLocaleString()} m\u00B2)`
            : `${result.area_m2.toLocaleString()} m\u00B2`;
    // Layers
    const layerRows = result.layers
        .map((l: any) => `
        <tr>
            <td style="font-size:11px;padding:4px 8px;">${escapeHtml(l.name)}</td>
            <td style="font-size:11px;padding:4px 8px;text-align:right;">${l.entityCount}</td>
            <td style="font-size:11px;padding:4px 8px;text-align:right;">${l.polygonCount}</td>
            <td style="font-size:11px;padding:4px 8px;text-align:right;">${l.area_m2.toLocaleString()} m\u00B2</td>
        </tr>
    `,
        )
        .join('');
    // Compliance
    let complianceHTML = '';
    if (result.compliance.length > 0) {
        const complianceRows = result.compliance
            .map((c: any) => {
                const statusColor =
                    c.status === 'compliant'
                        ? 'var(--green-500)'
                        : c.status === 'non_compliant'
                          ? 'var(--red-500)'
                          : 'var(--yellow-500)';
                const statusLabel =
                    c.status === 'compliant'
                        ? t('spatial.compliant') || 'Compliant'
                        : t('spatial.nonCompliant') || 'Non-compliant';
                return `
                <tr>
                    <td style="font-size:11px;padding:4px 8px;">${escapeHtml(c.regulation)}</td>
                    <td style="font-size:11px;padding:4px 8px;">${escapeHtml(c.zone_type)}</td>
                    <td style="font-size:11px;padding:4px 8px;color:${statusColor};font-weight:600;">${statusLabel}</td>
                    <td style="font-size:11px;padding:4px 8px;text-align:right;">${c.overlapAreaM2.toFixed(1)} m\u00B2</td>
                </tr>
            `;
            })
            .join('');
        complianceHTML = `
            <div style="margin-top:12px;">
                <h4 style="font-size:11px;font-weight:600;color:var(--neutral-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">
                    ${t('spatial.compliance') || 'Compliance'}
                </h4>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="border-bottom:1px solid var(--neutral-200);">
                            <th style="font-size:10px;padding:4px 8px;text-align:left;color:var(--neutral-400);">Regulation</th>
                            <th style="font-size:10px;padding:4px 8px;text-align:left;color:var(--neutral-400);">Zone</th>
                            <th style="font-size:10px;padding:4px 8px;text-align:left;color:var(--neutral-400);">Status</th>
                            <th style="font-size:10px;padding:4px 8px;text-align:right;color:var(--neutral-400);">Overlap</th>
                        </tr>
                    </thead>
                    <tbody>${complianceRows}</tbody>
                </table>
            </div>
        `;
    }
    // Metadata
    const meta = result.metadata;
    container.innerHTML = `
        <div style="padding:16px;">
            <!-- Summary card -->
            <div style="background:var(--neutral-100);border-radius:8px;padding:12px;margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <span style="font-size:13px;font-weight:600;color:var(--neutral-700);">
                        ${escapeHtml(_wizardState.file.name)}
                    </span>
                    <span style="font-size:11px;color:var(--neutral-500);">
                        ${meta.processing_time_ms}ms
                    </span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div>
                        <span style="font-size:10px;color:(var as any)(--neutral-400);text-transform:uppercase;">${t('spatial.totalArea') || 'Total Area'}</span>
                        <p style="font-size:14px;font-weight:700;color:var(--primary-600);margin:2px 0;">${areaFormatted}</p>
                    </div>
                    <div>
                        <span style="font-size:10px;color:var(--neutral-400);text-transform:uppercase;">Polygons</span>
                        <p style="font-size:14px;font-weight:700;color:var(--neutral-700);margin:2px 0;">
                            ${meta.polygon_count} (${meta.healed_count} healed)
                        </p>
                    </div>
                </div>
            </div>

            <!-- Layers table -->
            <div>
                <h4 style="font-size:11px;font-weight:600;color:var(--neutral-500);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">
                    ${t('spatial.layers') || 'Layers'}
                </h4>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="border-bottom:1px solid var(--neutral-200);">
                            <th style="font-size:10px;padding:4px 8px;text-align:left;color:var(--neutral-400);">Layer</th>
                            <th style="font-size:10px;padding:4px 8px;text-align:right;color:var(--neutral-400);">Entities</th>
                            <th style="font-size:10px;padding:4px 8px;text-align:right;color:var(--neutral-400);">Polygons</th>
                            <th style="font-size:10px;padding:4px 8px;text-align:right;color:var(--neutral-400);">Area</th>
                        </tr>
                    </thead>
                    <tbody>${layerRows}</tbody>
                </table>
            </div>

            ${complianceHTML}

            <!-- Actions -->
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                <button class="btn btn-secondary" data-cc-action="cc-73a92f69" style="font-size:12px;">
                    ${t('back') || 'Back'}
                </button>
                <button class="btn btn-primary" data-cc-action="cc-b0aeaf43" style="font-size:12px;">
                    ${t('spatial.importAsElement') || 'Import as Element'}
                </button>
            </div>
        </div>
    `;
}
// ----------------------------------------------------------------
// IMPORT - Create ecbyts element
// ----------------------------------------------------------------
/**
 * Cria elemento blueprint a partir do resultado do processamento.
 * Atualiza dados e reconstroi mesh com vertices reais do DXF.
 */
export async function handleSpatialImport() {
    if (!_wizardState?.result) return;
    try {
        const result = _wizardState.result;
        const { addNewElement, rebuildElementMesh } = await import('../../core/elements/manager.js' as string);
        // Cria elemento com dados default (mesh inicial e retangulo placeholder)
        const element = addNewElement('blueprint');
        if (!element) throw new Error('Failed to create blueprint element');
        // Sobrescreve dados com resultado do processamento DXF
        // (vertices reais, geometria GeoJSON, area, layers, compliance)
        Object.assign(element.data, result.element);
        // Reconstroi mesh 3D com os vertices reais do DXF
        rebuildElementMesh(element.id);
        // Renomeia elemento com nome do arquivo fonte
        const fileName = _wizardState.file?.name || 'Blueprint';
        const baseName = fileName.replace(/\.dxf$/i, '');
        element.name = baseName;
        element.label = baseName;
        requestSpatialUIRefresh('spatial.blueprint-imported');
        handleCloseSpatialModal();
        showToast(
            `${t('spatial.imported') || 'Blueprint imported'}: ${result.area_m2.toLocaleString()} m\u00B2`,
            'success',
        );
    } catch (err: any) {
        log.error('Blueprint import failed', err?.message || String(err));
        showToast(err?.message || String(err), 'error');
    }
}
// ----------------------------------------------------------------
// NAVIGATION - Wizard step navigation
// ----------------------------------------------------------------
/**
 * Volta do step Results para o step Config.
 * Wrapper exportado para uso via onclick no HTML.
 */
export function handleSpatialBack() {
    renderConfigStep();
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const spatialHandlers = {
    handleOpenSpatialModal,
    handleCloseSpatialModal,
    handleSpatialFileUpload,
    handleSpatialDirectFile,
    handleSpatialCRSChange,
    handleSpatialCategoryChange,
    handleSpatialProcess,
    handleSpatialImport,
    handleSpatialBack,
};
