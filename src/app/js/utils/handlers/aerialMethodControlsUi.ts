// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   AERIAL METHOD CONTROLS & RESULTS UI HELPERS
   ================================================================

   Pure-logic + DOM helpers for the aerial recognition modal:
   - Method sub-controls visibility (algorithm, slic, yolos, sam, etc.)
   - Calibration slider config + DOM sync
   - SLIC slider listeners
   - Results table & summary HTML builders
   - Feature deduplication, sequential naming, extent computation

   All DOM access is parameterized via `getElementById` for testability.
   No closures over `aerial.js` state — caller passes calibration/features
   explicitly.

   ================================================================ */

type GetElementById = (id: string) => any;

/** param → slider id slug (drives `aerial-cal-<slug>` / `-val` element ids). */
export const CALIBRATION_SLIDER_MAP: Readonly<Record<string, string>> = Object.freeze({
    shadowSensitivity: 'shadow',
    vegetationSensitivity: 'vegetation',
    buildingBrightness: 'building',
    waterSensitivity: 'water',
    featureSize: 'featuresize',
    edgeSharpness: 'edgesharpness',
    maxFeatures: 'maxfeatures',
});

/** method radio value → sub-control container id (one shown, others hidden). */
export const METHOD_SUBCONTROL_IDS: Readonly<Record<string, string>> = Object.freeze({
    algorithm: 'aerial-calibration-step',
    usernn: 'aerial-paint-controls',
    slic: 'aerial-slic-controls',
    yolos: 'aerial-yolos-controls',
    sam: 'aerial-sam-controls',
    samAuto: 'aerial-samAuto-controls',
    textPrompt: 'aerial-textPrompt-controls',
    tileMap: 'aerial-tileMap-controls',
    instance: 'aerial-instance-controls',
    changeDetect: 'aerial-changeDetect-controls',
    classify: 'aerial-classify-controls',
    spectral: 'aerial-spectral-controls',
    embeddings: 'aerial-embeddings-controls',
});

/** Apply a calibration param change immutably; returns null on bad input. */
export function applyCalibrationChange(
    currentCalibration: any,
    defaults: any,
    param: any,
    rawValue: any,
): Record<string, any> | null {
    const numVal = parseInt(rawValue, 10);
    if (Number.isNaN(numVal)) return null;
    const base = currentCalibration ? { ...currentCalibration } : { ...defaults };
    (base as Record<string, any>)[param] = numVal;
    return base;
}

/** Element id for a calibration slider's value display, or null if unknown. */
export function getCalibrationValueElementId(param: any): string | null {
    const slug = (CALIBRATION_SLIDER_MAP as Record<string, any>)[param];
    return slug ? `aerial-cal-${slug}-val` : null;
}

/** Update the value-display element for one calibration slider. */
export function updateCalibrationDisplay(param: any, numVal: any, getElementById: GetElementById): void {
    const id = getCalibrationValueElementId(param);
    if (!id) return;
    const el = getElementById(id);
    if (el) el.textContent = String(numVal);
}

/** Sync every calibration slider DOM element with the given values. */
export function syncCalibrationSlidersDom(calibration: any, defaults: any, getElementById: GetElementById): number {
    const cal = calibration || defaults;
    let touched = 0;
    for (const [param, slug] of Object.entries(CALIBRATION_SLIDER_MAP)) {
        const slider = getElementById(`aerial-cal-${slug}`);
        const valEl = getElementById(`aerial-cal-${slug}-val`);
        const val = (cal as Record<string, any>)[param] ?? (defaults as Record<string, any>)[param];
        if (slider) {
            slider.value = val;
            touched++;
        }
        if (valEl) valEl.textContent = String(val);
    }
    return touched;
}

/** Toggle the advanced calibration section; returns new visible state or null. */
export function toggleAdvancedCalibration(getElementById: GetElementById): boolean | null {
    const adv = getElementById('aerial-cal-advanced');
    if (!adv) return null;
    const isHidden = adv.style.display === 'none';
    adv.style.display = isHidden ? '' : 'none';
    return isHidden; // true if now visible
}

/** Show only the active method's sub-control container; hide all others. */
export function setMethodSubcontrolsVisibility(
    method: any,
    getElementById: GetElementById,
): { shown: string | null; hidden: string[] } {
    let shown: string | null = null;
    const hidden: string[] = [];
    for (const [key, elId] of Object.entries(METHOD_SUBCONTROL_IDS)) {
        const el = getElementById(elId);
        if (!el) continue;
        if (key === method) {
            el.style.display = '';
            shown = elId;
        } else {
            el.style.display = 'none';
            hidden.push(elId);
        }
    }
    return { shown, hidden };
}

/** Wire SLIC slider `oninput` handlers to mirror values into their `<span>`s. */
export function initSlicControlListeners(getElementById: GetElementById): {
    numWired: boolean;
    compactWired: boolean;
} {
    const numSlider = getElementById('aerial-slic-num');
    const numVal = getElementById('aerial-slic-num-val');
    const compactSlider = getElementById('aerial-slic-compact');
    const compactVal = getElementById('aerial-slic-compact-val');

    let numWired = false;
    let compactWired = false;

    if (numSlider && numVal) {
        numSlider.oninput = () => {
            numVal.textContent = numSlider.value;
        };
        numWired = true;
    }
    if (compactSlider && compactVal) {
        compactSlider.oninput = () => {
            compactVal.textContent = compactSlider.value;
        };
        compactWired = true;
    }
    return { numWired, compactWired };
}

/** True when the method should activate paint-mode canvas interaction. */
export function shouldEnablePaintMode(method: any): boolean {
    return method === 'usernn';
}

/** True when switching away from `method` should abort an auto-mask run. */
export function shouldAbortAutoMaskForMethod(method: any): boolean {
    return method !== 'samAuto' && method !== 'textPrompt';
}

/** Confidence (0-100) → 'high'|'medium'|'low' bucket for badge styling. */
export function getConfidenceClass(confPct: any): string {
    if (confPct >= 70) return 'high';
    if (confPct >= 40) return 'medium';
    return 'low';
}

/** Build HTML for the detected-features table (rows + empty-state). */
export function buildResultsTableHtml(arg: any): string {
    const {
        features,
        selected,
        familyIcons,
        familyColors,
        getIcon,
        escapeHtml,
        escapeAttr,
        translate,
        // accepts familyLabels for API symmetry with buildFeatureSummaryHtml; unused here
    } = arg || {};
    if (!Array.isArray(features) || features.length === 0) {
        const msg = translate?.('noFeaturesDetected') || 'No features detected';
        return `<p style="color:var(--window-muted);font-size:12px;">${msg}</p>`;
    }

    return features
        .map((f: any, i: number) => {
            const iconName = (familyIcons as Record<string, any>)[f.family] || 'map-pin';
            const icon = getIcon(iconName, { size: '14px' });
            const confPct = Math.round((f.confidence ?? 0) * 100);
            const confClass = getConfidenceClass(confPct);
            const isSelected = !!selected?.[i];
            const checked = isSelected ? 'checked' : '';
            const selectedClass = isSelected ? ' selected' : '';
            const color = (familyColors as Record<string, any>)[f.family] || '#888';
            const posStr = `(${f.position.x.toFixed(0)}, ${f.position.z.toFixed(0)})`;

            return `<div class="aerial-feature-row${selectedClass}" style="border-left-color:${isSelected ? color : 'transparent'};">
            <input data-field-meta="true" data-field-meta-key="auto-tpl:aerial:input:L1001" type="checkbox" id="aerial-feature-${i}" ${checked} data-cc-call-change="handleAerialToggleFeature|j:${encodeURIComponent(String(i))}">
            <span style="width:16px;height:16px;flex-shrink:0;display:inline-flex;align-items:center;overflow:hidden;">${icon}</span>
            <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(f.label)} ${posStr}">${escapeHtml(f.label)}</span>
            <span style="font-size:10px;color:var(--neutral-500);min-width:60px;">${posStr}</span>
            <span class="feature-conf ${confClass}">${confPct}%</span>
        </div>`;
        })
        .join('');
}

/** Summary-pills HTML grouped by family, ordered by descending count. */
export function buildFeatureSummaryHtml(arg: any): string {
    const { features, familyIcons, familyLabels, familyColors, getIcon } = arg || {};
    if (!Array.isArray(features) || features.length === 0) return '';

    const counts: Record<string, number> = {};
    for (const f of features) counts[f.family] = (counts[f.family] || 0) + 1;

    return Object.entries(counts)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .map(([family, count]) => {
            const color = (familyColors as Record<string, any>)[family] || '#888';
            const label = (familyLabels as Record<string, any>)[family] || family;
            const iconName = (familyIcons as Record<string, any>)[family] || 'map-pin';
            const icon = getIcon(iconName, { size: '12px' });
            return `<span class="aerial-summary-pill">
            <span class="pill-dot" style="background:${color};"></span>
            ${icon}
            <span>${count}</span>
            <span style="font-weight:400;opacity:0.8;">${label}</span>
        </span>`;
        })
        .join('');
}

/** Number features sequentially per family ("Edificacao 1", "Edificacao 2"…). Mutates input. */
export function assignSequentialFeatureNames(features: any, familyLabels: any): any {
    if (!Array.isArray(features)) return features;
    const counters: Record<string, number> = {};
    for (const f of features) {
        counters[f.family] = (counters[f.family] || 0) + 1;
        const baseLabel = (familyLabels as Record<string, any>)[f.family] || f.family;
        f.label = `${baseLabel} ${counters[f.family]}`;
    }
    return features;
}

/** Dedup incoming features by same-family + position within `dist` meters (default 5). */
export function filterDuplicateFeatures(incoming: any, existing: any, dist = 5): any[] {
    if (!Array.isArray(incoming)) return [];
    if (!Array.isArray(existing) || existing.length === 0) return incoming.slice();
    return incoming.filter(
        (nf: any) =>
            !existing.some(
                (ef: any) =>
                    ef.family === nf.family &&
                    Math.abs(ef.position.x - nf.position.x) < dist &&
                    Math.abs(ef.position.z - nf.position.z) < dist,
            ),
    );
}

/** Axis-aligned XZ bounding extent for an array of vertices. Returns null on empty. */
export function computeBoundaryExtent(
    vertices: any,
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    if (!Array.isArray(vertices) || vertices.length === 0) return null;
    let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
    let count = 0;
    for (const v of vertices) {
        if (!v || typeof v.x !== 'number' || typeof v.z !== 'number') continue;
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.z < minZ) minZ = v.z;
        if (v.z > maxZ) maxZ = v.z;
        count++;
    }
    if (count === 0) return null;
    return { minX, maxX, minZ, maxZ };
}

/** True when extent has positive area on both axes. */
export function isExtentValid(extent: any): boolean {
    if (!extent) return false;
    return extent.minX < extent.maxX && extent.minZ < extent.maxZ;
}

/** Centered XZ extent of `width`×`height` meters (defaults: 200×200). */
export function buildCenteredExtent(
    width: any,
    height: any,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const w = Math.max(1, Math.abs(width) || 200);
    const h = Math.max(1, Math.abs(height) || 200);
    return { minX: -w / 2, maxX: w / 2, minZ: -h / 2, maxZ: h / 2 };
}

/** System prompt for AI georef suggestion (single source of truth, easy to test). */
export const AI_GEOREF_SYSTEM_PROMPT =
    'You are a geospatial analyst specializing in aerial and satellite image georeferencing. ' +
    'You identify geographic locations from visual features with high precision.';

/** User prompt for AI georef. Plain template, no interpolation. */
export const AI_GEOREF_USER_PROMPT = `Analyze this aerial/satellite image to determine its geographic location. Use all available clues:

VISUAL FEATURES TO ANALYZE:
- Road network patterns, intersections, highway interchanges
- Water bodies: rivers, lakes, canals (shape, width, flow direction)
- Building layouts, institutional campuses, industrial areas
- Sports facilities: running tracks, soccer fields, tennis courts
- Vegetation patterns, parks, forests, agricultural fields
- Bridges, overpasses, railway lines
- Any visible text, signs, logos, or watermarks (e.g., "Google Earth")
- Shadow angles (indicate hemisphere and approximate latitude)
- Urban grid orientation and density

Return ONLY valid JSON (no markdown, no code fences):
{
  "location": "Specific Place, City, State/Region, Country",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of how you identified the location",
  "bounds": { "sw": {"lat": -90..90, "lon": -180..180}, "ne": {"lat": -90..90, "lon": -180..180} },
  "landmarks": [
    { "label": "specific feature description", "imgX_pct": 0-100, "imgY_pct": 0-100, "lat": number, "lon": number }
  ]
}

REQUIREMENTS:
- Identify 3-6 landmarks that are clearly visible and geographically distinctive
- imgX_pct = percentage from LEFT edge, imgY_pct = percentage from TOP edge
- Place landmarks at recognizable points: road intersections, building corners, field edges, bridge endpoints
- Spread landmarks across the image (not clustered in one area)
- bounds should tightly enclose the visible area
- Be as precise as possible with coordinates (6 decimal places)`;

/** Parse an AI georef LLM response (strips ``` fences, isolates first {…}). */
export function parseAiGeorefResponse(content: any): any {
    if (typeof content !== 'string') return null;
    let jsonStr = content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = (fenceMatch[1] as string).trim();
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (braceMatch) jsonStr = braceMatch[0];
    try {
        return JSON.parse(jsonStr);
    } catch {
        return null;
    }
}

/** True when landmark has finite imgX_pct/imgY_pct and valid WGS84 lat/lon. */
export function isValidGeorefLandmark(lm: any): boolean {
    if (!lm) return false;
    const { imgX_pct, imgY_pct, lat, lon } = lm;
    if (![imgX_pct, imgY_pct, lat, lon].every(Number.isFinite)) return false;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
    return true;
}

/** AI landmarks → GCP records. `idAllocator.next()` supplies sequential ids. */
export function landmarksToGcpRecords(landmarks: any, imageW: any, imageH: any, idAllocator: any): any[] {
    if (!Array.isArray(landmarks) || !idAllocator || typeof idAllocator.next !== 'function') {
        return [];
    }
    const out: any[] = [];
    for (const lm of landmarks) {
        if (!isValidGeorefLandmark(lm)) continue;
        const imgX = (lm.imgX_pct / 100) * imageW;
        const imgY = (lm.imgY_pct / 100) * imageH;
        out.push({
            id: idAllocator.next(),
            imgX: Math.max(0, Math.min(imageW, imgX)),
            imgY: Math.max(0, Math.min(imageH, imgY)),
            lat: lm.lat,
            lon: lm.lon,
            label: lm.label || `AI #${out.length + 1}`,
        });
    }
    return out;
}

/** Bounds → MapLibre `flyTo()` argument (center+zoom16), or null if invalid. */
export function buildBoundsFlyTo(bounds: any): { center: [number, number]; zoom: number } | null {
    if (!bounds || !bounds.sw || !bounds.ne) return null;
    const { sw, ne } = bounds;
    if (!Number.isFinite(sw.lat) || !Number.isFinite(sw.lon)) return null;
    if (!Number.isFinite(ne.lat) || !Number.isFinite(ne.lon)) return null;
    const centerLat = (sw.lat + ne.lat) / 2;
    const centerLon = (sw.lon + ne.lon) / 2;
    return { center: [centerLon, centerLat], zoom: 16 };
}
