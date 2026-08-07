// @ts-check
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
   MESHES ESG (Environmental, Social, Governance)
   ================================================================

   Criadores de mesh 3D para familias ESG:
   - area: area organizacional (plano no chao)
   - individual: pessoa/animal/arvore
   - incident: incidente H&S (cone de alerta)
   - emission_source: chamine de emissao
   - waste_stream: container de residuos
   - effluent_point: ponto de descarga
   - habitat: area de habitat/ecossistema

   ================================================================ */
import { createTHREEProxy } from '../three-lazy.js';
const THREE: any = createTHREEProxy();
import { parseColor } from './meshHelpers.js';
import { getCachedGeometry, getCachedMaterial } from './meshFactory.js';
// ----------------------------------------------------------------
// AREA - Poligono 2D no chao representando setor/area
// ----------------------------------------------------------------
// SYS-TRUST-USE-001 #3 (2026-05-29, claude-adm): consome data.vertices quando
// presente (PolygonStrategy edit) com backward-compat para data.dimensions
// (caso legado retangular). Reuso do shape Three.js, como blueprint/boundary.
export function createAreaMesh(data: any, element: any) {
    const areaColor = parseColor(element?.color) || 0x4caf50;
    const matKey = `basic_${areaColor}_t_03`;
    const material = getCachedMaterial(matKey, () => new THREE.MeshBasicMaterial({
        color: areaColor,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
    }));
    const baseY = data.position?.y ?? 0;
    // Caminho 1 — polígono explícito (PolygonStrategy): data.vertices [{x,y,z}]
    if (Array.isArray(data?.vertices) && data.vertices.length >= 3) {
        const shape = new THREE.Shape();
        shape.moveTo(data.vertices[0].x, data.vertices[0].z);
        for (let i = 1; i < data.vertices.length; i++) {
            shape.lineTo(data.vertices[i].x, data.vertices[i].z);
        }
        shape.closePath();
        const geom = new THREE.ShapeGeometry(shape);
        geom.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geom, material);
        mesh.position.set(data.position?.x || 0, baseY + 0.05, data.position?.z || 0);
        return mesh;
    }
    // Caminho 2 — legado: retângulo por dimensões (preserva área criada antes de #3).
    const width = data.dimensions?.width || 20;
    const length = data.dimensions?.length || 20;
    const geometry = new THREE.PlaneGeometry(width, length);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(data.position?.x || 0, baseY + 0.05, data.position?.z || 0);
    return mesh;
}
// ----------------------------------------------------------------
// INDIVIDUAL - Pessoa, animal ou arvore
// ----------------------------------------------------------------
export function createIndividualMesh(data: any, element: any) {
    const indType = data.individualType || 'person';
    /** @type {Record<string,number>} */
    const colors = {
        person: 0x2196f3, // Azul
        animal: 0xff9800, // Laranja
        tree: 0x4caf50, // Verde
    };
    let geometry;
    if (indType === 'tree') {
        geometry = new THREE.ConeGeometry(0.8, 2.5, 8);
    }
    else {
        geometry = new THREE.SphereGeometry(0.6, 16, 16);
    }
    const indColor = parseColor(element?.color) || (colors as Record<string, number>)[indType] || colors.person;
    const matKey = `lam_${indColor}`;
    const material = getCachedMaterial(matKey, () => new THREE.MeshLambertMaterial({
        color: indColor,
    }));
    const mesh = new THREE.Mesh(geometry, material);
    const baseY = data.position?.y ?? 0;
    mesh.position.set(data.position?.x || 0, baseY + (indType === 'tree' ? 1.25 : 0.6), data.position?.z || 0);
    return mesh;
}
// ----------------------------------------------------------------
// INCIDENT - Marcador de alerta triangular (cone)
// ----------------------------------------------------------------
export function createIncidentMesh(data: any, element: any) {
    const severity = data.severity || 'medium';
    /** @type {Record<string,number>} */
    const colors = {
        low: 0xffeb3b,
        medium: 0xff9800,
        high: 0xf44336,
        critical: 0x9c27b0,
    };
    const geometry = getCachedGeometry('cone_3', () => new THREE.ConeGeometry(1, 1, 3));
    const incColor = parseColor(element?.color) || (colors as Record<string, number>)[severity] || colors.medium;
    const matKey = `lam_${incColor}`;
    const material = getCachedMaterial(matKey, () => new THREE.MeshLambertMaterial({
        color: incColor,
    }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(0.6, 1.2, 0.6);
    const baseY = data.position?.y ?? 0;
    mesh.position.set(data.position?.x || 0, baseY + 0.6, data.position?.z || 0);
    return mesh;
}
// ----------------------------------------------------------------
// EMISSION SOURCE - Chamine cilindrica vertical
// ----------------------------------------------------------------
export function createEmissionSourceMesh(data: any, element: any) {
    const height = data.height || 8;
    const radiusTop = 0.4;
    const radiusBottom = 0.6;
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 12);
    const emColor = parseColor(element?.color) || 0x607d8b;
    const matKey = `std_${emColor}_r07`;
    const material = getCachedMaterial(matKey, () => new THREE.MeshStandardMaterial({
        color: emColor,
        roughness: 0.7,
    }));
    const mesh = new THREE.Mesh(geometry, material);
    const baseY = data.position?.y ?? 0;
    mesh.position.set(data.position?.x || 0, baseY + height / 2, data.position?.z || 0);
    return mesh;
}
// ----------------------------------------------------------------
// WASTE STREAM - Cubo representando container/cacamba
// ----------------------------------------------------------------
export function createWasteStreamMesh(data: any, element: any) {
    const wasteClass = data.wasteClass || 'Class IIB';
    /** @type {Record<string,number>} */
    const colors = {
        'Class I': 0xf44336, // Vermelho (perigoso)
        'Class IIA': 0xff9800, // Laranja (nao inerte)
        'Class IIB': 0x4caf50, // Verde (inerte)
    };
    const geometry = new THREE.BoxGeometry(1.5, 1.2, 1.0);
    const wsColor = parseColor(element?.color) || (colors as Record<string, number>)[wasteClass] || 0x795548;
    const matKey = `lam_${wsColor}`;
    const material = getCachedMaterial(matKey, () => new THREE.MeshLambertMaterial({
        color: wsColor,
    }));
    const mesh = new THREE.Mesh(geometry, material);
    const baseY = data.position?.y ?? 0;
    mesh.position.set(data.position?.x || 0, baseY + 0.6, data.position?.z || 0);
    return mesh;
}
// ----------------------------------------------------------------
// EFFLUENT POINT - Cilindro horizontal (tubo de descarga)
// ----------------------------------------------------------------
export function createEffluentPointMesh(data: any, element: any) {
    const geometry = getCachedGeometry('effluent_cyl', () => {
        const g = new THREE.CylinderGeometry(0.35, 0.35, 1.5, 16);
        g.rotateZ(Math.PI / 2);
        return g;
    });
    const efColor = parseColor(element?.color) || 0x00bcd4;
    const matKey = `std_${efColor}_r04`;
    const material = getCachedMaterial(matKey, () => new THREE.MeshStandardMaterial({
        color: efColor,
        roughness: 0.4,
    }));
    const mesh = new THREE.Mesh(geometry, material);
    const baseY = data.position?.y ?? 0;
    mesh.position.set(data.position?.x || 0, baseY + 0.35, data.position?.z || 0);
    return mesh;
}
// ----------------------------------------------------------------
// HABITAT - Area verde irregular (circulo/retangulo no chao)
// ----------------------------------------------------------------
// SYS-TRUST-USE-001 #3 (2026-05-29, claude-adm): consome data.vertices quando
// presente (PolygonStrategy edit). Backward-compat com data.footprint (aerial
// recognition retangular) e data.area (círculo). Cor por protectionStatus mantida.
export function createHabitatMesh(data: any, element: any) {
    /** @type {Record<string,number>} */
    const protectionColors = {
        none: 0x8bc34a,
        buffer_zone: 0x4caf50,
        protected: 0x2e7d32,
        restoration: 0x1b5e20,
    };
    const habColor = parseColor(element?.color) || (protectionColors as Record<string, number>)[data.protectionStatus] || 0x8bc34a;
    const matKey = `basic_${habColor}_t_05`;
    const material = getCachedMaterial(matKey, () => new THREE.MeshBasicMaterial({
        color: habColor,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
    }));
    const baseY = data.position?.y ?? 0;
    // Caminho 1 — polígono explícito (PolygonStrategy): data.vertices [{x,y,z}]
    if (Array.isArray(data?.vertices) && data.vertices.length >= 3) {
        const shape = new THREE.Shape();
        shape.moveTo(data.vertices[0].x, data.vertices[0].z);
        for (let i = 1; i < data.vertices.length; i++) {
            shape.lineTo(data.vertices[i].x, data.vertices[i].z);
        }
        shape.closePath();
        const geom = new THREE.ShapeGeometry(shape);
        geom.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geom, material);
        mesh.position.set(data.position?.x || 0, baseY + 0.02, data.position?.z || 0);
        return mesh;
    }
    // Caminho 2 — legado: footprint retangular do aerial recognition.
    let geometry;
    if (data.footprint && data.footprint.width && data.footprint.length) {
        geometry = new THREE.PlaneGeometry(data.footprint.width, data.footprint.length);
        geometry.rotateX(-Math.PI / 2);
    }
    // Caminho 3 — legado: círculo equivalente à área declarada.
    else {
        const area = data.area || 25;
        const radius = Math.sqrt(area / Math.PI);
        geometry = new THREE.CircleGeometry(radius, 32);
        geometry.rotateX(-Math.PI / 2);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(data.position?.x || 0, baseY + 0.02, data.position?.z || 0);
    return mesh;
}
//# sourceMappingURL=meshESG.js.map
