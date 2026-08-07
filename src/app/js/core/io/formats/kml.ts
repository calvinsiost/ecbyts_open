// Generated from src/app/js/core/io/formats/kml.ts by TS-MIGRATION-001. Do not edit manually.
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
   KML FORMAT — Exportação para Google Earth
   ================================================================

   Gera KML (Keyhole Markup Language) para visualização no
   Google Earth, Google Maps e outros softwares GIS.

   ESTRUTURA:
   - Document com nome do projeto
   - Folders agrupados por família de elemento
   - Placemarks com ícones, descrições HTML e geometria 3D
   - Suporte a extrusão para edifícios

   REQUER: Origem UTM configurada para coordenadas corretas.

   ================================================================ */

import { registerFormat } from './registry.js';
import { relativeToWGS84, getElementPosition } from '../geo/coordinates.js';

// ----------------------------------------------------------------
// REGISTRO
// ----------------------------------------------------------------

registerFormat({
    id: 'kml',
    name: 'KML (Google Earth)',
    extensions: ['.kml'],
    mimeType: 'application/vnd.google-earth.kml+xml',
    canExport: true,
    canImport: false,
    needsOrigin: true,
    exportScopes: ['elements'],
});

// ----------------------------------------------------------------
// NOMES DE FAMÍLIA PARA EXIBIÇÃO
// ----------------------------------------------------------------

const FAMILY_LABELS: Record<string, string> = {
    plume: 'Contamination Plumes',
    well: 'Monitoring Wells',
    lake: 'Lakes',
    river: 'Rivers',
    spring: 'Springs',
    building: 'Buildings',
    tank: 'Storage Tanks',
    marker: 'Markers',
    boundary: 'Boundaries',
    stratum: 'Geological Layers',
    sample: 'Sample Points',
    area: 'Organizational Areas',
    individual: 'Individuals',
    incident: 'Incidents',
    emission_source: 'Emission Sources',
    waste_stream: 'Waste Streams',
    effluent_point: 'Effluent Points',
    habitat: 'Habitats',
};

// ----------------------------------------------------------------
// CORES POR FAMÍLIA (ABGR format for KML)
// ----------------------------------------------------------------

const FAMILY_COLORS: Record<string, string> = {
    plume: 'aa0000ff', // Vermelho semi-transparente
    well: 'ff00aa00', // Verde
    lake: 'ffd99a4a', // Azul
    river: 'ffd3a85f', // Azul claro
    spring: 'ff00ffaa', // Ciano
    building: 'ff808080', // Cinza
    tank: 'ff0088ff', // Laranja
    boundary: 'ff00ff00', // Verde
    marker: 'ff0000ff', // Vermelho
    habitat: 'ff00aa44', // Verde escuro
    emission_source: 'ff555555', // Cinza escuro
    effluent_point: 'ff884400', // Marrom
    stratum: 'ffa09060', // Bege (geologia)
    sample: 'ff4488ff', // Azul vivo
    area: 'aa88ff00', // Lima semi-transparente
    individual: 'ff8844ff', // Roxo
    incident: 'ff0000ff', // Vermelho (alerta)
    waste_stream: 'ff00aaff', // Laranja
};

// ----------------------------------------------------------------
// EXPORTAÇÃO
// ----------------------------------------------------------------

/**
 * Exporta modelo como KML.
 *
 * @param {any} model - Modelo completo
 * @param {Object} [_options]
 * @returns {Blob}
 */
export function exportKML(model: any, _options: any = {}) {
    const _model = (model) as any;
    const projectName = _model.project?.name || 'ecbyts';
    const projectDesc = _model.project?.description || '';

    // Agrupa elementos por família
    const groups: Record<string, any[]> = {};
    for (const el of _model.elements || []) {
        const f = el.family || 'marker';
        if (!groups[f]) groups[f] = [];
        groups[f].push(el);
    }

    // Monta XML
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"
     xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
  <name>${escXml(projectName)}</name>
  <description>${escXml(projectDesc)}</description>
  <open>1</open>
`;

    // Estilos por família
    for (const [familyId, color] of Object.entries(FAMILY_COLORS)) {
        kml += `  <Style id="style-${familyId}">
    <IconStyle>
      <color>${color}</color>
      <scale>1.0</scale>
      <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
    </IconStyle>
    <PolyStyle>
      <color>${color}</color>
      <outline>1</outline>
    </PolyStyle>
    <LineStyle>
      <color>${color}</color>
      <width>3</width>
    </LineStyle>
  </Style>
`;
    }

    // Folders por família
    /** @type {Record<string, string>} */
    const _labels = FAMILY_LABELS;
    for (const [familyId, elements] of Object.entries(groups)) {
        const label = _labels[familyId] || familyId;
        kml += `  <Folder>
    <name>${escXml(label)}</name>
    <open>0</open>
`;
        for (const el of elements) {
            kml += elementToPlacemark(el, familyId);
        }
        kml += `  </Folder>
`;
    }

    kml += `</Document>
</kml>`;

    return new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
}

// ----------------------------------------------------------------
// PLACEMARKS
// ----------------------------------------------------------------

function elementToPlacemark(el: any, familyId: string) {
    const data = el.data || {};
    const descHtml = buildDescription(el);

    // Determina geometria
    if (data.path && data.path.length >= 2) {
        return lineStringPlacemark(el, familyId, descHtml);
    }
    if (data.vertices && data.vertices.length >= 3) {
        return polygonPlacemark(el, familyId, descHtml, data.vertices);
    }
    if (data.footprint && data.position) {
        return buildingPlacemark(el, familyId, descHtml);
    }
    if (familyId === 'plume' || familyId === 'lake' || familyId === 'habitat') {
        return ellipsePlacemark(el, familyId, descHtml);
    }

    // Default: ponto
    return pointPlacemark(el, familyId, descHtml);
}

function pointPlacemark(el: any, familyId: string, descHtml: string) {
    const pos = getElementPosition(el);
    const wgs = (relativeToWGS84(pos)) as any;

    return `    <Placemark>
      <name>${escXml(el.name)}</name>
      <description><![CDATA[${descHtml}]]></description>
      <styleUrl>#style-${familyId}</styleUrl>
      <Point>
        <altitudeMode>relativeToGround</altitudeMode>
        <coordinates>${r7(wgs.longitude)},${r7(wgs.latitude)},${r2(wgs.elevation || 0)}</coordinates>
      </Point>
    </Placemark>
`;
}

function lineStringPlacemark(el: any, familyId: string, descHtml: string) {
    const coords = (el.data.path || [])
        .map((p: any) => {
            const wgs = relativeToWGS84(p);
            return `${r7(wgs.longitude)},${r7(wgs.latitude)},0`;
        })
        .join(' ');

    return `    <Placemark>
      <name>${escXml(el.name)}</name>
      <description><![CDATA[${descHtml}]]></description>
      <styleUrl>#style-${familyId}</styleUrl>
      <LineString>
        <altitudeMode>clampToGround</altitudeMode>
        <coordinates>${coords}</coordinates>
      </LineString>
    </Placemark>
`;
}

function polygonPlacemark(
    el: any,
    familyId: string,
    descHtml: string,
    vertices: any[],
) {
    const coords = vertices.map((/** @type {any} */ v) => {
        const wgs = relativeToWGS84(v);
        return `${r7(wgs.longitude)},${r7(wgs.latitude)},0`;
    });
    // Fechar anel
    if (vertices.length > 0) {
        const first = relativeToWGS84(vertices[0]);
        coords.push(`${r7(first.longitude)},${r7(first.latitude)},0`);
    }

    return `    <Placemark>
      <name>${escXml(el.name)}</name>
      <description><![CDATA[${descHtml}]]></description>
      <styleUrl>#style-${familyId}</styleUrl>
      <Polygon>
        <altitudeMode>clampToGround</altitudeMode>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coords.join(' ')}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
`;
}

function buildingPlacemark(el: any, familyId: string, descHtml: string) {
    const p = el.data.position;
    const hw = (el.data.footprint.width || 10) / 2;
    const hl = (el.data.footprint.length || 10) / 2;
    const height = el.data.height || 5;

    const corners = [
        { x: p.x - hw, y: 0, z: p.z - hl },
        { x: p.x + hw, y: 0, z: p.z - hl },
        { x: p.x + hw, y: 0, z: p.z + hl },
        { x: p.x - hw, y: 0, z: p.z + hl },
    ];

    const coords = corners.map((/** @type {any} */ c) => {
        const wgs = relativeToWGS84(c);
        return `${r7(wgs.longitude)},${r7(wgs.latitude)},${r2(height)}`;
    });
    const first = relativeToWGS84(corners[0]);
    coords.push(`${r7(first.longitude)},${r7(first.latitude)},${r2(height)}`);

    return `    <Placemark>
      <name>${escXml(el.name)}</name>
      <description><![CDATA[${descHtml}]]></description>
      <styleUrl>#style-${familyId}</styleUrl>
      <Polygon>
        <extrude>1</extrude>
        <altitudeMode>relativeToGround</altitudeMode>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coords.join(' ')}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
`;
}

function ellipsePlacemark(el: any, familyId: string, descHtml: string) {
    const pos = getElementPosition(el);
    const data = el.data || {};
    let rx = 10,
        rz = 10;

    if (data.shape) {
        rx = data.shape.radiusX || 10;
        rz = data.shape.radiusY || data.shape.radiusZ || 10;
    }
    if (data.area) {
        rx = rz = Math.sqrt((data.area || 100) / Math.PI);
    }

    const numPoints = 32;
    /** @type {string[]} */
    const coords = [];
    for (let i = 0; i <= numPoints; i++) {
        const angle = (2 * Math.PI * i) / numPoints;
        const point = {
            x: pos.x + rx * Math.cos(angle),
            y: pos.y,
            z: pos.z + rz * Math.sin(angle),
        };
        const wgs = relativeToWGS84(point);
        coords.push(`${r7(wgs.longitude)},${r7(wgs.latitude)},0`);
    }

    return `    <Placemark>
      <name>${escXml(el.name)}</name>
      <description><![CDATA[${descHtml}]]></description>
      <styleUrl>#style-${familyId}</styleUrl>
      <Polygon>
        <altitudeMode>clampToGround</altitudeMode>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coords.join(' ')}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
`;
}

// ----------------------------------------------------------------
// DESCRIÇÃO HTML
// ----------------------------------------------------------------

function buildDescription(el: any) {
    const data = el.data || {};
    let html = `<h3>${escXml(el.name)}</h3>`;
    html += `<p><b>Family:</b> ${escXml(el.family)}</p>`;
    html += `<p><b>ID:</b> ${escXml(el.id)}</p>`;

    // Observações recentes
    const obs = data.observations || [];
    if (obs.length > 0) {
        html += `<h4>Observations (${obs.length})</h4><table border="1" cellpadding="4"><tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Date</th></tr>`;
        // Últimas 10
        const recent = obs.slice(-10);
        for (const o of recent) {
            html += `<tr>`;
            html += `<td>${escXml(o.parameterId || o.parameter || '')}</td>`;
            html += `<td>${o.value ?? o.reading ?? ''}</td>`;
            html += `<td>${escXml(o.unitId || o.unit || '')}</td>`;
            html += `<td>${escXml(o.date || '')}</td>`;
            html += `</tr>`;
        }
        html += `</table>`;
    }

    return html;
}

// ----------------------------------------------------------------
// UTILIDADES
// ----------------------------------------------------------------

function escXml(str: any) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function r7(n: any) {
    return (n || 0).toFixed(7);
}
function r2(n: any) {
    return (n || 0).toFixed(2);
}
