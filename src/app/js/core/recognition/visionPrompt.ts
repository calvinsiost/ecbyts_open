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
   VISION PROMPT — AI prompt for aerial image analysis
   ================================================================

   Gera o prompt de sistema para analise de imagem aerea via LLM
   com suporte a visao (GPT-4o, Claude, Gemini). Inclui parser
   robusto para extrair JSON da resposta do modelo.

   ================================================================ */

// ----------------------------------------------------------------
// PROMPT BUILDER
// ----------------------------------------------------------------

interface Extent {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

interface Annotation {
    /** Normalized X (0..1) */
    nx: number;
    /** Normalized Y (0..1) */
    ny: number;
    family: string;
}

interface DetectedFeature {
    family: string;
    confidence: number;
    label: string;
    position: { x: number; z: number };
    dimensions: Record<string, unknown>;
    rotation: number;
    sourceMethod: string;
}

/**
 * Build system prompt for vision-based aerial analysis.
 * Constroi prompt instruindo o LLM a detectar feicoes ambientais.
 *
 * @param extent - { minX, maxX, minZ, maxZ } in meters
 * @param annotations - User annotations [{ nx, ny, family }]
 * @returns System prompt
 */
export function buildVisionPrompt(extent: Extent, annotations: Array<Annotation> = []): string {
    const w = Math.round(extent.maxX - extent.minX);
    const h = Math.round(extent.maxZ - extent.minZ);
    const mPerPx = Math.max(w, h) / 512;

    let prompt = `You are an environmental site analysis expert. Analyze this aerial/satellite image and identify all visible features.

The image covers a rectangular area of ${w}m wide x ${h}m tall.
Coordinate system: X axis = ${extent.minX.toFixed(1)} (left edge) to ${extent.maxX.toFixed(1)} (right edge). Z axis = ${extent.minZ.toFixed(1)} (top edge) to ${extent.maxZ.toFixed(1)} (bottom edge).
Effective resolution: approximately ${mPerPx.toFixed(1)}m per pixel. Features smaller than ${Math.round(mPerPx * 5)}m may be hard to distinguish.

IMPORTANT — Position precision:
- The image maps linearly to the coordinate ranges above.
- A feature at 32% from the left edge has x = ${(extent.minX + 0.32 * (extent.maxX - extent.minX)).toFixed(1)}.
- A feature at 67% from the top edge has z = ${(extent.minZ + 0.67 * (extent.maxZ - extent.minZ)).toFixed(1)}.
- Use ONE decimal place. Do NOT round to multiples of 10 or 50.

SYSTEMATIC SCAN — Mentally divide the image into a 3x3 grid. Report features from ALL 9 sectors:
  Top-left(x≈${(extent.minX + w * 0.17).toFixed(0)},z≈${(extent.minZ + h * 0.17).toFixed(0)})  Top-center(x≈${(extent.minX + w * 0.5).toFixed(0)},z≈${(extent.minZ + h * 0.17).toFixed(0)})  Top-right(x≈${(extent.minX + w * 0.83).toFixed(0)},z≈${(extent.minZ + h * 0.17).toFixed(0)})
  Mid-left(x≈${(extent.minX + w * 0.17).toFixed(0)},z≈${(extent.minZ + h * 0.5).toFixed(0)})  Center(x≈${(extent.minX + w * 0.5).toFixed(0)},z≈${(extent.minZ + h * 0.5).toFixed(0)})  Mid-right(x≈${(extent.minX + w * 0.83).toFixed(0)},z≈${(extent.minZ + h * 0.5).toFixed(0)})
  Bot-left(x≈${(extent.minX + w * 0.17).toFixed(0)},z≈${(extent.minZ + h * 0.83).toFixed(0)})  Bot-center(x≈${(extent.minX + w * 0.5).toFixed(0)},z≈${(extent.minZ + h * 0.83).toFixed(0)})  Bot-right(x≈${(extent.minX + w * 0.83).toFixed(0)},z≈${(extent.minZ + h * 0.83).toFixed(0)})

For EACH visible feature, return a JSON object with these fields:
- "family": one of "building", "lake", "river", "tank", "habitat", "marker", "well"
- "label": descriptive English name (e.g. "Steel Warehouse", "Retention Pond", "Dense Forest Patch", "Paved Access Road"). Do NOT use generic names like "Building 1".
- "confidence": 0.0 to 1.0
- "position": {"x": number, "z": number} — precise coordinates per the mapping above
- "rotation": degrees (0-360) of the feature's long axis. 0=horizontal, 90=vertical. Only for buildings and tanks.
- "dimensions": REQUIRED for every feature (see formats below)

DIMENSION FORMATS BY FAMILY:
- building: {"footprint": {"width": meters, "length": meters}, "height": estimated_meters, "type": "industrial"|"commercial"|"residential"}
- tank: {"dimensions": {"diameter": meters, "length": meters}, "type": "aboveground"|"underground"}
- lake: {"shape": {"radiusX": meters, "radiusY": meters, "depth": 3}}
- river: {"path": [{"x": n, "z": n}, ...], "width": meters}
- habitat: {"habitatType": "forest"|"wetland"|"grassland"|"riparian", "protectionStatus": "none", "area": square_meters}
- well: {} (position only)
- marker: {"markerType": "road"|"parking"|"soil"|"construction"|"fence"|"other"}

FAMILY CLASSIFICATION RULES:
- "building": Clearly defined rectangular structures with rooftops (gray, white, colored)
- "tank": Circular/cylindrical objects, often white or metallic, near industrial buildings
- "lake": Standing water (blue, dark blue, dark reflective areas NOT linear)
- "river": Linear water features, streams, drainage channels
- "habitat": Dense vegetation zones (forest=dark green canopy, grassland=lighter green, wetland=mixed green/water)
- "marker": Roads, parking lots, bare soil, construction sites, fences, disturbed land, ANY non-building infrastructure
- "well": Small circular objects that could be wellheads (rare — only if clearly visible)
- Do NOT classify bare/cleared land as "habitat" — use "marker" with markerType "soil"
- Do NOT classify roads/parking as "building" — use "marker"

WHAT TO LOOK FOR:
1. Buildings and structures (rectangular shapes with defined edges, shadows, rooftops)
2. Storage tanks (circular/oval shapes, usually white/gray, near industrial areas)
3. Water bodies: ponds/lakes (dark reflective areas), rivers/streams (sinuous linear features)
4. Vegetation zones (green areas — distinguish forest canopy from grassland by color intensity)
5. Roads and parking (gray linear features, asphalt rectangles — classify as "marker")
6. Bare soil or construction sites (brown, ochre, or discolored patches — classify as "marker")
7. Other infrastructure (fences, barriers, clearings — classify as "marker")

RULES:
- Return ONLY a JSON array. No explanation text before or after.
- Estimate realistic dimensions for the ${w}m x ${h}m scale.
- Every building/tank MUST include footprint/dimensions. Every habitat MUST include area.
- Set confidence based on how clearly identifiable the feature is.
- Include at least the most prominent features. Maximum 30 features.
- Prioritize buildings (they are most important for environmental site modeling).
- Do NOT list the same physical feature twice from different angles or interpretations.
- This image is from a satellite tile (~${mPerPx.toFixed(1)}m/pixel). Focus on shapes and positions, not exact colors.

Example output:
[{"family":"building","label":"Industrial Warehouse","confidence":0.90,"position":{"x":${(extent.minX + 0.32 * w).toFixed(1)},"z":${(extent.minZ + 0.27 * h).toFixed(1)}},"rotation":15,"dimensions":{"footprint":{"width":25,"length":40},"height":8,"type":"industrial"}},{"family":"marker","label":"Paved Access Road","confidence":0.80,"position":{"x":${(extent.minX + 0.48 * w).toFixed(1)},"z":${(extent.minZ + 0.53 * h).toFixed(1)}},"dimensions":{"markerType":"road"}}]`;

    // Append user annotation hints if provided
    // Rotulos fornecidos pelo usuario - tratados como verdade de campo
    if (annotations.length > 0) {
        const ww = extent.maxX - extent.minX;
        const hh = extent.maxZ - extent.minZ;
        let section = `\n\nUSER-PROVIDED LABELS (high confidence ground truth):
The user has manually identified the following features on the image. Treat these as confirmed detections with confidence >= 0.95. Include them in your output and use them to calibrate your detection of similar features nearby.\n`;
        for (const ann of annotations) {
            const worldX = extent.minX + ann.nx * ww;
            const worldZ = extent.minZ + ann.ny * hh;
            section += `- ${ann.family} at position (${worldX.toFixed(1)}, ${worldZ.toFixed(1)})\n`;
        }
        prompt += section;
    }

    return prompt;
}

/**
 * Build user message text for vision request.
 * @param annotations - User annotations [{ nx, ny, family }]
 * @returns
 */
export function buildUserMessage(annotations: Array<Annotation> = []): string {
    let msg =
        'Analyze this aerial/satellite image. Return ONLY a JSON array of detected features. Scan all 9 sectors systematically. Use precise decimal coordinates (not rounded to 10s). Include dimensions for every feature. Use descriptive English labels. Classify roads and bare soil as "marker".';
    if (annotations.length > 0) {
        msg += ` The user has manually labeled ${annotations.length} feature(s) on the image — include these with high confidence and look for similar features nearby.`;
    }
    return msg;
}

// ----------------------------------------------------------------
// RESPONSE PARSER
// ----------------------------------------------------------------

/**
 * Parse LLM vision response into DetectedFeature array.
 * Tenta multiplas estrategias de extracao de JSON.
 *
 * @param text - Raw LLM response text
 * @param extent - { minX, maxX, minZ, maxZ } for clamping
 * @returns
 */
export function parseVisionResponse(text: string, extent: Extent): Array<DetectedFeature> {
    let parsed: unknown = null;

    // Strategy 1: Direct JSON parse
    try {
        parsed = JSON.parse(text.trim());
    } catch (e) {
        const err = e as Error;
        console.debug('[visionPrompt] direct-parse:', err?.message || err);
        // Strategy 2: Extract from markdown code block
        const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeMatch && codeMatch[1] != null) {
            try {
                parsed = JSON.parse(codeMatch[1].trim());
            } catch (e2) {
                const err2 = e2 as Error;
                console.debug('[visionPrompt] codeblock-parse:', err2?.message || err2);
                /* continue */
            }
        }

        // Strategy 3: Find JSON array in text
        if (!parsed) {
            const arrMatch = text.match(/\[[\s\S]*\]/);
            if (arrMatch) {
                try {
                    parsed = JSON.parse(arrMatch[0]);
                } catch (e3) {
                    const err3 = e3 as Error;
                    console.debug('[visionPrompt] array-parse:', err3?.message || err3);
                    /* continue */
                }
            }
        }
    }

    if (!Array.isArray(parsed)) {
        console.warn('Vision response could not be parsed as array:', text.substring(0, 200));
        return [];
    }

    // Validate and normalize each feature
    const validFamilies = ['building', 'lake', 'river', 'tank', 'habitat', 'marker', 'well'];

    return parsed
        .filter((f: unknown) => f != null && typeof f === 'object')
        .map((f: Record<string, any>) => {
            const family = validFamilies.includes(f.family) ? f.family : 'marker';
            const pos = f.position || {};
            const x = typeof pos.x === 'number' ? pos.x : 0;
            const z = typeof pos.z === 'number' ? pos.z : 0;

            // Parse rotation (degrees -> radians) if provided
            const rotDeg = typeof f.rotation === 'number' ? f.rotation : 0;
            const rotation = (rotDeg * Math.PI) / 180;

            return {
                family,
                confidence: Math.max(0, Math.min(1, typeof f.confidence === 'number' ? f.confidence : 0.5)),
                label: f.label || `${family} (detected)`,
                position: {
                    x: Math.max(extent.minX, Math.min(extent.maxX, x)),
                    z: Math.max(extent.minZ, Math.min(extent.maxZ, z)),
                },
                dimensions: f.dimensions || {},
                rotation,
                sourceMethod: 'ai',
            };
        })
        .slice(0, 30);
}
