// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.1.6

/* ================================================================
   SHAPEFILE IMPORT WIZARD — Preview QGIS-style antes de importar
   ================================================================

   Substitui o fluxo cego "selecionar ZIP -> aguardar 40s -> torcer".
   Mostra metadata (count, geometry types, attribute fields, sample
   values, bounds geo) e permite usuario escolher family target +
   campo de nome antes do commit.

   Pipeline: File -> previewShapefile() -> modal -> options -> importShapefile()

   ================================================================ */

import { buildModalShell } from './modals.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { drawPreview as _drawBboxPreview } from './bboxPreviewCanvas.js';

const KNOWN_FAMILIES = [
    'boundary',
    'well',
    'lake',
    'river',
    'plume',
    'building',
    'tank',
    'blueprint',
    'area',
    'habitat',
];

export type FamilyMode = 'fixed' | 'auto';

export interface ShapefileWizardResult {
    confirmed: boolean;
    targetFamily: string;
    nameField: string | null;
    familyMode: FamilyMode;
    autoFit: boolean;
    simplifyLod?: 'MEDIUM' | null;
}

/**
 * Abre wizard de preview do shapefile e retorna opcoes escolhidas.
 */
export async function openShapefileWizard(
    file: File,
    opts: { skipPreview?: boolean } = {},
): Promise<ShapefileWizardResult | null> {
    if (opts?.skipPreview) {
        return {
            confirmed: true,
            targetFamily: 'boundary',
            nameField: null,
            familyMode: 'auto',
            autoFit: true,
        };
    }
    const { previewShapefile, suggestFamilyFromGeometries } = await import('../../core/io/formats/shapefile.js');
    // Parsea metadata (cacheado, sera reusado por importShapefile depois)
    let metadata: any;
    try {
        metadata = await previewShapefile(file);
    } catch (err: any) {
        const errMsg = err?.message || String(err);
        const errOverlay = document.createElement('div');
        errOverlay.className = 'sym-overlay';
        errOverlay.innerHTML = `<div class="sym-dialog" style="width:min(480px,95vw);padding:24px;">
            <h2 style="margin:0 0 8px;color:#dc3545;">${escapeHtml(t('shapefileWizard.errorTitle') || 'Erro ao ler shapefile')}</h2>
            <p style="margin:0 0 16px;color:#666;">${escapeHtml(errMsg)}</p>
            <button class="btn btn-secondary" id="shp-err-close">${escapeHtml(t('cancel') || 'Fechar')}</button>
        </div>`;
        document.body.appendChild(errOverlay);
        await new Promise<void>((resolve) => {
            const btn = errOverlay.querySelector('#shp-err-close');
            btn?.addEventListener('click', () => {
                errOverlay.remove();
                resolve();
            });
        });
        return null;
    }
    const suggestedFamily = suggestFamilyFromGeometries(metadata.geometryTypes);
    const suggestedName = _suggestNameField(metadata.attributeKeys);
    return new Promise((resolve) => {
        const modal = buildModalShell({
            title: t('shapefileWizard.title') || 'Shapefile Import Wizard',
            width: '720px',
            onClose: () => {
                resolve({
                    confirmed: false,
                    targetFamily: suggestedFamily,
                    nameField: null,
                    familyMode: 'fixed',
                    autoFit: true,
                });
            },
        }) as { overlay: HTMLElement; body: HTMLElement; footer: HTMLElement; close: () => void };
        const { overlay, body, footer, close } = modal;
        body.innerHTML = _renderBody(metadata, suggestedFamily, suggestedName);
        // Renderizar bbox preview no canvas — usa features da metadata (sample feature is
        // not enough; previewShapefile carrega todos os features para metadata).
        try {
            const canvas = overlay.querySelector('#shp-wiz-bbox-canvas') as HTMLCanvasElement | null;
            if (canvas) {
                const featList = Array.isArray(metadata.features)
                    ? metadata.features
                    : metadata.sampleFeature
                      ? [metadata.sampleFeature]
                      : [];
                const result: any = _drawBboxPreview(canvas, featList, { padding: 22 });
                const extentEl = overlay.querySelector('#shp-wiz-bbox-extent');
                if (extentEl) {
                    extentEl.textContent = result.label || '';
                }
                if (canvas.setAttribute) {
                    const ariaLabel =
                        (t('gis.bboxPreview.title') || 'Geographic Preview') +
                        ', ' +
                        metadata.featureCount +
                        ' features, ' +
                        (result.label || '');
                    canvas.setAttribute('aria-label', ariaLabel);
                }
            }
        } catch (err: any) {
            console.debug('[shapefile-wizard] bbox preview draw failed', err?.message || err);
        }
        // Botoes
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = t('cancel') || 'Cancelar';
        cancelBtn.addEventListener('click', () => {
            close();
        });
        const importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.className = 'btn btn-primary';
        importBtn.textContent =
            (t('shapefileWizard.importBtn') || 'Importar') +
            ' ' +
            metadata.featureCount +
            ' ' +
            (t('shapefileWizard.elements') || 'elementos');
        importBtn.addEventListener('click', () => {
            const familySelect = overlay.querySelector('#shp-wiz-family') as HTMLSelectElement | null;
            const familyModeRadio = overlay.querySelector(
                'input[name="shp-wiz-mode"]:checked',
            ) as HTMLInputElement | null;
            const nameSelect = overlay.querySelector('#shp-wiz-name') as HTMLSelectElement | null;
            const autoFitChk = overlay.querySelector('#shp-wiz-autofit') as HTMLInputElement | null;
            const simplifyChk = overlay.querySelector('#shp-wiz-simplify') as HTMLInputElement | null;
            const familyMode = (familyModeRadio?.value || 'fixed') as FamilyMode;
            overlay.remove();
            resolve({
                confirmed: true,
                targetFamily: familySelect?.value || suggestedFamily,
                nameField: nameSelect?.value || null,
                familyMode,
                autoFit: autoFitChk?.checked !== false,
                simplifyLod: simplifyChk?.checked ? 'MEDIUM' : null,
            });
        });
        footer.appendChild(cancelBtn);
        footer.appendChild(importBtn);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => importBtn.focus());
    });
}

function _suggestNameField(attributeKeys: string[]): string | null {
    const candidates = ['NM_MUN', 'NAME', 'Name', 'NOME', 'nome', 'name', 'ID', 'id'];
    for (const c of candidates) {
        if (attributeKeys.includes(c)) return c;
    }
    return null;
}

function _renderBody(metadata: any, suggestedFamily: string, suggestedName: string | null): string {
    const geomList = Object.entries(metadata.geometryTypes)
        .sort((a: any, b: any) => b[1] - a[1])
        .map(([type, count]) => `<li><strong>${escapeHtml(type)}</strong>: ${count}</li>`)
        .join('');
    const sampleTable = metadata.sampleFeature?.properties
        ? Object.entries(metadata.sampleFeature.properties)
              .slice(0, 12)
              .map(
                  ([k, v]) =>
                      `<tr><td style="padding:2px 8px;color:#888;">${escapeHtml(k)}</td><td style="padding:2px 8px;">${escapeHtml(String(v ?? ''))}</td></tr>`,
              )
              .join('')
        : '<tr><td colspan="2" style="color:#888;">sem atributos</td></tr>';
    const familyOptions = KNOWN_FAMILIES.map(
        (f) => `<option value="${escapeHtml(f)}"${f === suggestedFamily ? ' selected' : ''}>${escapeHtml(f)}</option>`,
    ).join('');
    const nameOptions = [
        `<option value="">${escapeHtml(t('shapefileWizard.autoDetect') || 'Auto-detect (NAME/NM_MUN/NOME/ID)')}</option>`,
        ...metadata.attributeKeys.map(
            (k: string) =>
                `<option value="${escapeHtml(k)}"${k === suggestedName ? ' selected' : ''}>${escapeHtml(k)}</option>`,
        ),
    ].join('');
    const boundsTxt = metadata.bounds
        ? `lat [${metadata.bounds.minLat.toFixed(2)}, ${metadata.bounds.maxLat.toFixed(2)}], lon [${metadata.bounds.minLon.toFixed(2)}, ${metadata.bounds.maxLon.toFixed(2)}]`
        : 'n/a';
    return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <section>
                <h3 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;color:#888;">
                    ${escapeHtml(t('shapefileWizard.previewTitle') || 'Preview')}
                </h3>
                <div style="margin:0 0 10px;border:1px solid rgba(0,0,0,0.08);border-radius:4px;overflow:hidden;background:#fafafa;">
                    <canvas
                        id="shp-wiz-bbox-canvas"
                        width="320"
                        height="220"
                        role="img"
                        style="display:block;width:100%;height:auto;"
                        aria-label="${escapeHtml(t('gis.bboxPreview.title') || 'Geographic Preview')}"
                    ></canvas>
                </div>
                <p id="shp-wiz-bbox-extent" style="margin:0 0 10px;font-size:11px;color:#666;font-family:ui-monospace,monospace;"></p>
                <p style="margin:0 0 4px;"><strong>${escapeHtml(t('shapefileWizard.layer') || 'Layer')}:</strong> ${escapeHtml(metadata.layerName)}</p>
                <p style="margin:0 0 4px;"><strong>${escapeHtml(t('shapefileWizard.featureCount') || 'Features')}:</strong> ${metadata.featureCount}</p>
                <p style="margin:0 0 8px;"><strong>${escapeHtml(t('shapefileWizard.geometries') || 'Geometrias')}:</strong></p>
                <ul style="margin:0 0 12px 18px;padding:0;font-size:13px;">${geomList}</ul>
                <p style="margin:0 0 4px;"><strong>${escapeHtml(t('shapefileWizard.bounds') || 'Limites geo')}:</strong></p>
                <p style="margin:0 0 12px;font-size:12px;color:#666;">${escapeHtml(boundsTxt)}</p>
                <p style="margin:0 0 4px;"><strong>${escapeHtml(t('shapefileWizard.attributes') || 'Atributos')}:</strong> ${metadata.attributeKeys.length}</p>
                <p style="margin:0 0 4px;font-size:11px;color:#888;">${escapeHtml(t('shapefileWizard.sampleFeature') || 'Amostra do primeiro feature')}:</p>
                <table style="width:100%;font-size:12px;border-collapse:collapse;background:rgba(0,0,0,0.03);">
                    ${sampleTable}
                </table>
            </section>

            <section>
                <h3 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;color:#888;">
                    ${escapeHtml(t('shapefileWizard.mappingTitle') || 'Mapeamento')}
                </h3>

                <div style="margin-bottom:12px;">
                    <label style="display:block;font-size:12px;margin-bottom:4px;color:#666;">
                        ${escapeHtml(t('shapefileWizard.familyMode') || 'Modo de family')}
                    </label>
                    <label style="display:block;font-size:13px;cursor:pointer;">
                        <input type="radio" name="shp-wiz-mode" value="fixed" checked>
                        ${escapeHtml(t('shapefileWizard.modeFixed') || 'Family fixa (escolha abaixo)')}
                    </label>
                    <label style="display:block;font-size:13px;cursor:pointer;">
                        <input type="radio" name="shp-wiz-mode" value="auto">
                        ${escapeHtml(t('shapefileWizard.modeAuto') || 'Auto (Polygon→boundary, Point→well, Line→river)')}
                    </label>
                </div>

                <div style="margin-bottom:12px;">
                    <label for="shp-wiz-family" style="display:block;font-size:12px;margin-bottom:4px;color:#666;">
                        ${escapeHtml(t('shapefileWizard.targetFamily') || 'Family target')}
                    </label>
                    <select id="shp-wiz-family" class="form-input">${familyOptions}</select>
                    <p style="margin:4px 0 0;font-size:11px;color:#888;">
                        ${escapeHtml(t('shapefileWizard.suggestedFromGeom') || 'Sugerido pela geometria predominante')}: <strong>${escapeHtml(suggestedFamily)}</strong>
                    </p>
                </div>

                <div style="margin-bottom:12px;">
                    <label for="shp-wiz-name" style="display:block;font-size:12px;margin-bottom:4px;color:#666;">
                        ${escapeHtml(t('shapefileWizard.nameField') || 'Campo para nome do elemento')}
                    </label>
                    <select id="shp-wiz-name" class="form-input">${nameOptions}</select>
                </div>

                <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.08);">
                    <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
                        <input type="checkbox" id="shp-wiz-autofit" checked>
                        <span>${escapeHtml(t('shapefileWizard.autoFit') || 'Auto-fit camera apos import')}</span>
                    </label>
                    <p style="margin:4px 0 0 24px;font-size:11px;color:#888;">
                        ${escapeHtml(t('shapefileWizard.autoFitHint') || 'Reposiciona a camera 3D para englobar todos os elementos importados')}
                    </p>

                    <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-top:8px;">
                        <input type="checkbox" id="shp-wiz-simplify" ${metadata.featureCount > 500 ? 'checked' : ''}>
                        <span>${escapeHtml(t('shapefileWizard.simplify') || 'Simplificar polygons (LOD MEDIUM, 50m)')}</span>
                    </label>
                    <p style="margin:4px 0 0 24px;font-size:11px;color:#888;">
                        ${escapeHtml(t('shapefileWizard.simplifyHint') || 'Reduz vertices para render mais leve. Recomendado para >500 features.')}
                    </p>
                </div>
            </section>
        </div>
    `;
}
