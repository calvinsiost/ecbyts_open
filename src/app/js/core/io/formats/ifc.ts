// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
// CCC-001 (2026-06-10): license alinhada com LICENSE raiz — CC-05 drift fix.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.2.0
// Architecture: Signed Provenance Chain (cryptographic chaining of validated
//               payloads via ECO1) — NOT blockchain consensus, NOT real-time
//               Digital Twin. Current data regime: campaign-based (Digital Model).
//               See CCC-001 §1.1 PN-1/PN-2/PN-7.
// Application: Environmental Engineering / BIM
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* =================================================================
   IFC FORMAT — Exportação IFC4 (ISO 16739-1:2018)
   =================================================================

   Gera arquivo STEP texto (ISO 10303-21) sem dependências externas.
   Cada elemento vira IfcBuildingElementProxy com placement 3D e
   dois PropertySets:
     - ecbyts_Metadata: family, id, name, observations_count
     - ecbyts_Observations: última observação por parameterId

   EIXOS: ecbyts usa Y-up (Three.js). IFC usa Z-up.
     IFCCARTESIANPOINT((pos.x, pos.z, pos.y))
     → IFC_X = easting, IFC_Y = northing, IFC_Z = elevation

   STRINGS: somente ASCII — diacríticos normalizados via NFD.
   LINE ENDINGS: \r\n (padrão ISO 10303-21).

   =================================================================

   Referência: ISO 16739-1:2018 (IFC4)
               ISO 10303-21:2016 (STEP Physical File)

   ================================================================= */
import { registerFormat } from './registry.js';
import { getElementPosition } from '../geo/coordinates.js';
// ----------------------------------------------------------------
// REGISTRO
// ----------------------------------------------------------------
registerFormat({
    id: 'ifc',
    name: 'IFC BIM (IFC4)',
    extensions: ['.ifc'],
    mimeType: 'application/x-step',
    canExport: true,
    canImport: false,
    needsOrigin: false,
    exportScopes: ['elements'],
    exportFn: exportIFC as unknown as import('./registry.js').FormatExportFn,
});
// ----------------------------------------------------------------
// HELPERS INTERNOS
// ----------------------------------------------------------------
/**
 * Gera GUID IFC: 22 caracteres, alfabeto customizado 0-9A-Za-z_$
 * (ISO 16739-1 §5.1.1.3 - IfcGloballyUniqueId)
 * @returns {string}
 */
function ifcGuid() {
    const ch = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
    let g = '';
    for (let i = 0; i < 22; i++)
        g += ch[Math.floor(Math.random() * 64)];
    return g;
}
/**
 * Sanitiza string para STEP: somente ASCII imprimível, aspas simples escapadas.
 * @param {*} str
 * @returns {string}
 */
function s(str: any) {
    return (str == null ? '' : String(str))
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remover diacríticos
        .replace(/'/g, "''") // escapar aspas simples em STEP
        .replace(/[^\x20-\x7E]/g, ''); // remover caracteres não-ASCII
}
/**
 * Formata número real para STEP: sempre com ponto decimal.
 * @param {number} v
 * @returns {string}
 */
function n(v: any) {
    const f = parseFloat(/** @type {any} */ (v));
    if (!isFinite(f))
        return '0.';
    // Remover zeros à direita mas garantir ponto decimal
    const str = f.toFixed(6).replace(/\.?0+$/, '');
    return str.includes('.') ? str + '.' : str + '.';
}
/**
 * Converte valor de observação para tipo STEP correto.
 * Numérico → IFCREAL, caso contrário → IFCLABEL.
 * @param {*} raw
 * @returns {string}
 */
function ifcVal(raw: any) {
    const f = parseFloat(raw);
    return isFinite(f) ? `IFCREAL(${n(f)})` : `IFCLABEL('${s(raw)}')`;
}
// ----------------------------------------------------------------
// EXPORTADOR PRINCIPAL
// ----------------------------------------------------------------
/**
 * Exporta o modelo ecbyts como arquivo IFC4 STEP.
 *
 * Estrutura gerada:
 *   IFCPROJECT → IFCSITE → [IFCBUILDINGELEMENTPROXY × N]
 *
 * Cada elemento recebe:
 *   - IfcLocalPlacement (posição 3D em espaço do modelo)
 *   - PropertySet ecbyts_Metadata
 *   - PropertySet ecbyts_Observations (se houver observações)
 *
 * @param {Object} model - Modelo ecbyts serializado por buildModel()
 * @returns {Blob} Arquivo IFC como Blob text/step
 */
export function exportIFC(model: any) {
    const lines: any[] = [];
    let idCounter = 0;
    const next = () => ++idCounter;
    // Timestamp ISO e Unix
    const now = new Date();
    const isoTs = now.toISOString().replace(/\.\d+Z$/, '');
    const unixTs = Math.floor(now.getTime() / 1000);
    // Nome do projeto sanitizado
    const projectName = s(/** @type {any} */ (model)?.project?.name || 'ecbyts Project');
    // --------------------------------------------------------
    // HEADER
    // --------------------------------------------------------
    lines.push('ISO-10303-21;');
    lines.push('HEADER;');
    lines.push(`FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');`);
    lines.push(`FILE_NAME('${projectName}.ifc','${isoTs}',('ecbyts'),('ecbyts'),'ecbyts v0.2.0','','');`);
    lines.push(`FILE_SCHEMA(('IFC4'));`);
    lines.push('ENDSEC;');
    lines.push('DATA;');
    // --------------------------------------------------------
    // ENTIDADES COMPARTILHADAS (IDs 1–18)
    // --------------------------------------------------------
    // Ownership
    const idOrg = next(); // 1
    const idPers = next(); // 2
    const idPAO = next(); // 3
    const idApp = next(); // 4
    const idOwner = next(); // 5
    lines.push(`#${idOrg}=IFCORGANIZATION($,'ecbyts',$,$,$);`);
    lines.push(`#${idPers}=IFCPERSON($,'ecbyts',$,$,$,$,$,$);`);
    lines.push(`#${idPAO}=IFCPERSONANDORGANIZATION(#${idPers},#${idOrg},$);`);
    lines.push(`#${idApp}=IFCAPPLICATION(#${idOrg},'0.2.0','ecbyts Environmental Digital Models','ecbyts');`);
    lines.push(`#${idOwner}=IFCOWNERHISTORY(#${idPAO},#${idApp},$,.NOTDEFINED.,$,$,$,${unixTs});`);
    // Units
    const idULen = next(); // 6
    const idUArea = next(); // 7
    const idUVol = next(); // 8
    const idUnits = next(); // 9
    lines.push(`#${idULen}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);
    lines.push(`#${idUArea}=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);`);
    lines.push(`#${idUVol}=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);`);
    lines.push(`#${idUnits}=IFCUNITASSIGNMENT((#${idULen},#${idUArea},#${idUVol}));`);
    // Geometric context
    const idWOrig = next(); // 10
    const idWAxis = next(); // 11
    const idCtx = next(); // 12
    lines.push(`#${idWOrig}=IFCCARTESIANPOINT((0.,0.,0.));`);
    lines.push(`#${idWAxis}=IFCAXIS2PLACEMENT3D(#${idWOrig},$,$);`);
    lines.push(`#${idCtx}=IFCGEOMETRICREPRESENTATIONCONTEXT('Model','Model',3,1.0E-5,#${idWAxis},$);`);
    // Project
    const idProject = next(); // 13
    lines.push(`#${idProject}=IFCPROJECT('${ifcGuid()}',#${idOwner},'${projectName}',$,$,$,$,(#${idCtx}),#${idUnits});`);
    // Site
    const idSOrig = next(); // 14
    const idSAxis = next(); // 15
    const idSPlace = next(); // 16
    const idSite = next(); // 17
    const idAgg = next(); // 18
    lines.push(`#${idSOrig}=IFCCARTESIANPOINT((0.,0.,0.));`);
    lines.push(`#${idSAxis}=IFCAXIS2PLACEMENT3D(#${idSOrig},$,$);`);
    lines.push(`#${idSPlace}=IFCLOCALPLACEMENT($,#${idSAxis});`);
    lines.push(`#${idSite}=IFCSITE('${ifcGuid()}',#${idOwner},'${projectName} Site',$,$,#${idSPlace},$,.ELEMENT.,$,$,$,$,$,$);`);
    lines.push(`#${idAgg}=IFCRELAGGREGATES('${ifcGuid()}',#${idOwner},$,$,#${idProject},(#${idSite}));`);
    // --------------------------------------------------------
    // ELEMENTOS
    // --------------------------------------------------------
    const elements = (model)?.elements ?? [];
    const proxyIds: any[] = [];
    for (const el of elements) {
        const pos = getElementPosition(el) as any;
        // Conversão de eixos: ecbyts Y-up → IFC Z-up
        // ecbyts: x=easting, y=elevation, z=northing
        // IFC:    X=easting, Y=northing,  Z=elevation
        const ifcX = pos.x;
        const ifcY = pos.z;
        const ifcZ = pos.y ?? 0;
        const elName = s(el.name || el.id || 'element');
        const elFamily = s(el.family || 'unknown');
        const elId = s(el.id || '');
        // Placement
        const idPt = next();
        const idAx = next();
        const idPlace = next();
        const idProxy = next();
        lines.push(`#${idPt}=IFCCARTESIANPOINT((${n(ifcX)},${n(ifcY)},${n(ifcZ)}));`);
        lines.push(`#${idAx}=IFCAXIS2PLACEMENT3D(#${idPt},$,$);`);
        lines.push(`#${idPlace}=IFCLOCALPLACEMENT(#${idSPlace},#${idAx});`);
        lines.push(`#${idProxy}=IFCBUILDINGELEMENTPROXY('${ifcGuid()}',#${idOwner},'${elName}','${elFamily}','${elFamily}',#${idPlace},$,$,.USERDEFINED.);`);
        proxyIds.push(idProxy);
        // ---- PropertySet 1: ecbyts_Metadata ----
        const obsCount = (el.data?.observations ?? []).length;
        const idPf = next(); // family
        const idPi = next(); // id
        const idPn = next(); // name
        const idPoc = next(); // obs count
        const idPS1 = next(); // pset
        const idRel1 = next(); // rel
        lines.push(`#${idPf}=IFCPROPERTYSINGLEVALUE('ecbyts_family',$,IFCLABEL('${elFamily}'),$);`);
        lines.push(`#${idPi}=IFCPROPERTYSINGLEVALUE('ecbyts_id',$,IFCLABEL('${elId}'),$);`);
        lines.push(`#${idPn}=IFCPROPERTYSINGLEVALUE('ecbyts_name',$,IFCLABEL('${elName}'),$);`);
        lines.push(`#${idPoc}=IFCPROPERTYSINGLEVALUE('ecbyts_observations_count',$,IFCINTEGER(${obsCount}),$);`);
        lines.push(`#${idPS1}=IFCPROPERTYSET('${ifcGuid()}',#${idOwner},'ecbyts_Metadata',$,(#${idPf},#${idPi},#${idPn},#${idPoc}));`);
        lines.push(`#${idRel1}=IFCRELDEFINESBYPROPERTIES('${ifcGuid()}',#${idOwner},$,$,(#${idProxy}),#${idPS1});`);
        // ---- PropertySet 2: ecbyts_Observations (se houver) ----
        const latest: Record<string, any> = {};
        for (const obs of el.data?.observations ?? []) {
            if (obs.parameterId == null)
                continue;
            if (!latest[obs.parameterId] || (obs.date || '') > (latest[obs.parameterId].date || '')) {
                latest[obs.parameterId] = obs;
            }
        }
        const paramIds = Object.keys(latest);
        if (paramIds.length > 0) {
            const propIds: any[] = [];
            for (const paramId of paramIds) {
                const obs = latest[paramId];
                const pid = next();
                propIds.push(pid);
                lines.push(`#${pid}=IFCPROPERTYSINGLEVALUE('${s(paramId)}',$,${ifcVal(obs.value)},$);`);
            }
            const idPS2 = next();
            const idRel2 = next();
            const propList = propIds.map((p: any) => `#${p}`).join(',');
            lines.push(`#${idPS2}=IFCPROPERTYSET('${ifcGuid()}',#${idOwner},'ecbyts_Observations',$,(${propList}));`);
            lines.push(`#${idRel2}=IFCRELDEFINESBYPROPERTIES('${ifcGuid()}',#${idOwner},$,$,(#${idProxy}),#${idPS2});`);
        }
    }
    // --------------------------------------------------------
    // CONTAINMENT (um único rel para todos os elementos)
    // --------------------------------------------------------
    if (proxyIds.length > 0) {
        const idContain = next();
        const elList = proxyIds.map((p: any) => `#${p}`).join(',');
        lines.push(`#${idContain}=IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid()}',#${idOwner},$,$,(${elList}),#${idSite});`);
    }
    // --------------------------------------------------------
    // FOOTER
    // --------------------------------------------------------
    lines.push('ENDSEC;');
    lines.push('END-ISO-10303-21;');
    return new Blob([lines.join('\r\n')], { type: 'application/x-step' });
}
