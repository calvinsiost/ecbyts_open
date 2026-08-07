// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   GAC-DD38 PIPELINE PRESET - native flow for class and LMS.

   This seed is derived from the original Visual Paradigm file
   01_DadosAnaliticos.vpp. Training can open GAC/DD-38 without a local
   imported key, but without replacing the source content with a synthetic
   flow. Public Training IDs stay stable; the real VPP node receives a
   click-go alias.
   ================================================================ */

import type { PipelinePack, PipelinePackEdge, PipelinePackNode, PipelineModuleTarget } from './pipelinePack.js';

export const GAC_DD38_PIPELINE_ID = "m01.gac.flow.dd38";
export const GAC_DD38_TEMPLATE_ID = "gac-dd38-environmental-management";
export const GAC_DD38_SELECTED_NODE_ID = "gac.phase.characterization";
export const GAC_DD38_SELECTED_VPP_NODE_ID = "kLUgpZGGAqAeH3pw";
export const GAC_DD38_PIPELINE_NAME = "GAC-DD38 (CETESB DD 038/2017)";
export const GAC_DD38_SOURCE_FILE = "01_DadosAnaliticos.vpp";

type GacDd38PipelineModel = {
    readonly name: string;
    readonly presetId: string;
    readonly templateId: string;
    readonly standard: string;
    readonly sourceFile: string;
    readonly sourceFormat: string;
    readonly sourceCounts: Record<string, number>;
    readonly startNodeId: string;
    readonly selectedNodeId: string;
    readonly selectedVppNodeId: string;
    readonly lanes: readonly Record<string, unknown>[];
    readonly groups: readonly Record<string, unknown>[];
    readonly nodes: readonly Record<string, unknown>[];
    readonly edges: readonly Record<string, unknown>[];
};

const GAC_DD38_VPP_MODEL: GacDd38PipelineModel = {
    "name": "GAC-DD38 (CETESB DD 038/2017) - original Visual Paradigm",
    "startNodeId": "r1XUAZGGAqACZwX7",
    "nodes": [
        {
            "id": "VX0cAZGGAqACZwje",
            "type": "data_store",
            "label": "Fichas de Campo",
            "x": 1288,
            "y": 1161,
            "w": 97,
            "h": 61,
            "color": "#c0c000",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Fichas de Campo - Caracterização - Campo - VPP VX0cAZGGAqACZwje",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "VX0cAZGGAqACZwje",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Campo",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "DHncAZGGAqACZwmr",
            "type": "data_store",
            "label": "LIMS",
            "x": 1324,
            "y": 1675,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Laboratório",
            "phase": "Caracterização",
            "contextLabel": "LIMS - Caracterização - Laboratório - VPP DHncAZGGAqACZwmr",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "DHncAZGGAqACZwmr",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Laboratório",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "ELlVAZGGAqACZ3ep",
            "type": "data_store",
            "label": "PDF",
            "x": 1305,
            "y": 1771,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Laboratório",
            "phase": "Caracterização",
            "contextLabel": "PDF - Caracterização - Laboratório - VPP ELlVAZGGAqACZ3ep",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "ELlVAZGGAqACZ3ep",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Laboratório",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "GL.kJZGGAqAeHzhl",
            "type": "data_store",
            "label": "Sistemas Manutenção (ERP e/ou outros)",
            "x": 126,
            "y": 2246,
            "w": 130,
            "h": 74,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Detecção",
            "contextLabel": "Sistemas Manutenção (ERP e/ou outros) - Detecção - Atividades Especializadas - VPP GL.kJZGGAqAeHzhl",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "GL.kJZGGAqAeHzhl",
                "standard": "CETESB DD 038/2017",
                "phase": "Detecção",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "gtdMJZGGAqAeH8eA",
            "type": "data_store",
            "label": "Documentos",
            "x": 476,
            "y": 602,
            "w": 86,
            "h": 56,
            "color": "#c0c000",
            "lane": "Responsável Técnico",
            "phase": "Detecção",
            "contextLabel": "Documentos - Detecção - Responsável Técnico - VPP gtdMJZGGAqAeH8eA",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "gtdMJZGGAqAeH8eA",
                "standard": "CETESB DD 038/2017",
                "phase": "Detecção",
                "lane": "Responsável Técnico",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "cI7sJZGGAqAeH0xS",
            "type": "data_store",
            "label": "GIS",
            "x": 546,
            "y": 2378,
            "w": 62,
            "h": 52,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Detecção",
            "contextLabel": "GIS - Detecção - Atividades Especializadas - VPP cI7sJZGGAqAeH0xS",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "cI7sJZGGAqAeH0xS",
                "standard": "CETESB DD 038/2017",
                "phase": "Detecção",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "ATmcJZGGAqAeH3sk",
            "type": "data_store",
            "label": "Imagem (CAD, COREL, etc.)",
            "x": 606,
            "y": 2152,
            "w": 94,
            "h": 64,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Detecção",
            "contextLabel": "Imagem (CAD, COREL, etc.) - Detecção - Atividades Especializadas - VPP ATmcJZGGAqAeH3sk",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "ATmcJZGGAqAeH3sk",
                "standard": "CETESB DD 038/2017",
                "phase": "Detecção",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "p8E8pZGGAqAeH.GP",
            "type": "data_store",
            "label": "Imagens",
            "x": 1285,
            "y": 1245,
            "w": 97,
            "h": 61,
            "color": "#c0c000",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Imagens - Caracterização - Campo - VPP p8E8pZGGAqAeH.GP",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "p8E8pZGGAqAeH.GP",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Campo",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "ZTAipZGGAqAeH.QL",
            "type": "data_store",
            "label": "EDD",
            "x": 1305,
            "y": 1821,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "EDD - Caracterização - Atividades Especializadas - VPP ZTAipZGGAqAeH.QL",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "ZTAipZGGAqAeH.QL",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "qJ7ypZGGAqAeHwZb",
            "type": "data_store",
            "label": "Documentos",
            "x": 1280,
            "y": 562,
            "w": 86,
            "h": 56,
            "color": "#c0c000",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Documentos - Caracterização - Responsável Técnico - VPP qJ7ypZGGAqAeHwZb",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "qJ7ypZGGAqAeHwZb",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Responsável Técnico",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "qT2GpZGGAqAeH8dF",
            "type": "data_store",
            "label": "GIS",
            "x": 1510,
            "y": 2401,
            "w": 62,
            "h": 52,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "GIS - Caracterização - Atividades Especializadas - VPP qT2GpZGGAqAeH8dF",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "qT2GpZGGAqAeH8dF",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "TPWWpZGGAqAeH8q8",
            "type": "data_store",
            "label": "Imagem (CAD, COREL, etc.)",
            "x": 1340,
            "y": 2491,
            "w": 94,
            "h": 64,
            "color": "#c0c000",
            "lane": "Órgãos Públicos",
            "phase": "Caracterização",
            "contextLabel": "Imagem (CAD, COREL, etc.) - Caracterização - Órgãos Públicos - VPP TPWWpZGGAqAeH8q8",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "TPWWpZGGAqAeH8q8",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Órgãos Públicos",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "MIT45ZGGAqAeH6PU",
            "type": "data_store",
            "label": "Fichas de Campo",
            "x": 2170,
            "y": 1171,
            "w": 97,
            "h": 61,
            "color": "#c0c000",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Fichas de Campo - Caracterização - Campo - VPP MIT45ZGGAqAeH6PU",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "MIT45ZGGAqAeH6PU",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Campo",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "IkT45ZGGAqAeH6QG",
            "type": "data_store",
            "label": "Imagens",
            "x": 2168,
            "y": 1251,
            "w": 97,
            "h": 61,
            "color": "#c0c000",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Imagens - Caracterização - Campo - VPP IkT45ZGGAqAeH6QG",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "IkT45ZGGAqAeH6QG",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Campo",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "c4aE5ZGGAqAeHxR0",
            "type": "data_store",
            "label": "LIMS",
            "x": 2225,
            "y": 1685,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Laboratório",
            "phase": "Caracterização",
            "contextLabel": "LIMS - Caracterização - Laboratório - VPP c4aE5ZGGAqAeHxR0",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "c4aE5ZGGAqAeHxR0",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Laboratório",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "jEaE5ZGGAqAeHxR_",
            "type": "data_store",
            "label": "PDF",
            "x": 2208,
            "y": 1781,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Laboratório",
            "phase": "Caracterização",
            "contextLabel": "PDF - Caracterização - Laboratório - VPP jEaE5ZGGAqAeHxR_",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "jEaE5ZGGAqAeHxR_",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Laboratório",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "HUaE5ZGGAqAeHxST",
            "type": "data_store",
            "label": "EDD",
            "x": 2205,
            "y": 1831,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "EDD - Caracterização - Atividades Especializadas - VPP HUaE5ZGGAqAeHxST",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "HUaE5ZGGAqAeHxST",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "OlNE5ZGGAqAeH0Zt",
            "type": "data_store",
            "label": "Documentos",
            "x": 2088,
            "y": 585,
            "w": 86,
            "h": 56,
            "color": "#c0c000",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Documentos - Caracterização - Responsável Técnico - VPP OlNE5ZGGAqAeH0Zt",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "OlNE5ZGGAqAeH0Zt",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Responsável Técnico",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "jIUU5ZGGAqAeH6Xt",
            "type": "data_store",
            "label": "PDF",
            "x": 2005,
            "y": 2011,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "PDF - Caracterização - Atividades Especializadas - VPP jIUU5ZGGAqAeH6Xt",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "jIUU5ZGGAqAeH6Xt",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "1XUU5ZGGAqAeH6u5",
            "type": "data_store",
            "label": "Excel",
            "x": 2005,
            "y": 2062,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Excel - Caracterização - Atividades Especializadas - VPP 1XUU5ZGGAqAeH6u5",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "1XUU5ZGGAqAeH6u5",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "LRsU5ZGGAqAeH7KG",
            "type": "data_store",
            "label": "GIS",
            "x": 2005,
            "y": 2118,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "GIS - Caracterização - Atividades Especializadas - VPP LRsU5ZGGAqAeH7KG",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "LRsU5ZGGAqAeH7KG",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "rCmO5ZGGAqAeH9aP",
            "type": "data_store",
            "label": "GIS",
            "x": 2444,
            "y": 2425,
            "w": 62,
            "h": 52,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "GIS - Caracterização - Atividades Especializadas - VPP rCmO5ZGGAqAeH9aP",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "rCmO5ZGGAqAeH9aP",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "limO5ZGGAqAeH9aU",
            "type": "data_store",
            "label": "Imagem (CAD, COREL, etc.)",
            "x": 2284,
            "y": 2491,
            "w": 94,
            "h": 64,
            "color": "#c0c000",
            "lane": "Órgãos Públicos",
            "phase": "Caracterização",
            "contextLabel": "Imagem (CAD, COREL, etc.) - Caracterização - Órgãos Públicos - VPP limO5ZGGAqAeH9aU",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "limO5ZGGAqAeH9aU",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Órgãos Públicos",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "3xoyFZGGAqAeH89N",
            "type": "data_store",
            "label": "Documentos",
            "x": 2890,
            "y": 511,
            "w": 86,
            "h": 56,
            "color": "#c0c000",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Documentos - Caracterização - Responsável Técnico - VPP 3xoyFZGGAqAeH89N",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "3xoyFZGGAqAeH89N",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Responsável Técnico",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "g_8yFZGGAqAeHxHR",
            "type": "data_store",
            "label": "Documentos",
            "x": 2868,
            "y": 2035,
            "w": 86,
            "h": 56,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Documentos - Caracterização - Atividades Especializadas - VPP g_8yFZGGAqAeHxHR",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "g_8yFZGGAqAeHxHR",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "y2qaFZGGAqAeH4mQ",
            "type": "data_store",
            "label": "GIS",
            "x": 2894,
            "y": 2411,
            "w": 62,
            "h": 52,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "GIS - Caracterização - Atividades Especializadas - VPP y2qaFZGGAqAeH4mQ",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "y2qaFZGGAqAeH4mQ",
                "standard": "CETESB DD 038/2017",
                "phase": "Caracterização",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "29OWFZGGAqAeH4jG",
            "type": "data_store",
            "label": "Documentos",
            "x": 3807,
            "y": 514,
            "w": 86,
            "h": 56,
            "color": "#c0c000",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Documentos - Remediação - Responsável Técnico - VPP 29OWFZGGAqAeH4jG",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "29OWFZGGAqAeH4jG",
                "standard": "CETESB DD 038/2017",
                "phase": "Remediação",
                "lane": "Responsável Técnico",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "1pJpFZGGAqAeH40N",
            "type": "data_store",
            "label": "GIS",
            "x": 3547,
            "y": 2071,
            "w": 62,
            "h": 52,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "GIS - Remediação - Atividades Especializadas - VPP 1pJpFZGGAqAeH40N",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "1pJpFZGGAqAeH40N",
                "standard": "CETESB DD 038/2017",
                "phase": "Remediação",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "KztpFZGGAqAeH5.X",
            "type": "data_store",
            "label": "Documentos",
            "x": 3787,
            "y": 2068,
            "w": 80,
            "h": 52,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "Documentos - Remediação - Atividades Especializadas - VPP KztpFZGGAqAeH5.X",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "KztpFZGGAqAeH5.X",
                "standard": "CETESB DD 038/2017",
                "phase": "Remediação",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "txzpFZGGAqAeH6aR",
            "type": "data_store",
            "label": "Sistemas de Manutenção (ERP, etc.)",
            "x": 4027,
            "y": 2054,
            "w": 104,
            "h": 76,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "Sistemas de Manutenção (ERP, etc.) - Remediação - Atividades Especializadas - VPP txzpFZGGAqAeH6aR",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "txzpFZGGAqAeH6aR",
                "standard": "CETESB DD 038/2017",
                "phase": "Remediação",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "hCXpFZGGAqAeH65T",
            "type": "data_store",
            "label": "Documentos",
            "x": 4037,
            "y": 2130,
            "w": 80,
            "h": 52,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "Documentos - Remediação - Atividades Especializadas - VPP hCXpFZGGAqAeH65T",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "hCXpFZGGAqAeH65T",
                "standard": "CETESB DD 038/2017",
                "phase": "Remediação",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "q9klFZGGAqAeH9QR",
            "type": "data_store",
            "label": "CAD",
            "x": 3787,
            "y": 2261,
            "w": 62,
            "h": 52,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "CAD - Remediação - Atividades Especializadas - VPP q9klFZGGAqAeH9QR",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "q9klFZGGAqAeH9QR",
                "standard": "CETESB DD 038/2017",
                "phase": "Remediação",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "iUNjFZGGAqAeH3pA",
            "type": "data_store",
            "label": "Documentos",
            "x": 4398,
            "y": 2064,
            "w": 80,
            "h": 52,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "Documentos - Remediação - Atividades Especializadas - VPP iUNjFZGGAqAeH3pA",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "iUNjFZGGAqAeH3pA",
                "standard": "CETESB DD 038/2017",
                "phase": "Remediação",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "mVyzFZGGAqAeHyYp",
            "type": "data_store",
            "label": "Documentos",
            "x": 5024,
            "y": 508,
            "w": 86,
            "h": 56,
            "color": "#c0c000",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Documentos - Acompanhamento - Responsável Técnico - VPP mVyzFZGGAqAeHyYp",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "mVyzFZGGAqAeHyYp",
                "standard": "CETESB DD 038/2017",
                "phase": "Acompanhamento",
                "lane": "Responsável Técnico",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "._JzFZGGAqAeH0qs",
            "type": "data_store",
            "label": "GIS",
            "x": 5030,
            "y": 2252,
            "w": 62,
            "h": 52,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Acompanhamento",
            "contextLabel": "GIS - Acompanhamento - Atividades Especializadas - VPP ._JzFZGGAqAeH0qs",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "._JzFZGGAqAeH0qs",
                "standard": "CETESB DD 038/2017",
                "phase": "Acompanhamento",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": ".kl3FZGGAqAeH38q",
            "type": "data_store",
            "label": "Fichas de Campo",
            "x": 5086,
            "y": 1190,
            "w": 97,
            "h": 61,
            "color": "#c0c000",
            "lane": "Campo",
            "phase": "Acompanhamento",
            "contextLabel": "Fichas de Campo - Acompanhamento - Campo - VPP .kl3FZGGAqAeH38q",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": ".kl3FZGGAqAeH38q",
                "standard": "CETESB DD 038/2017",
                "phase": "Acompanhamento",
                "lane": "Campo",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "3kl3FZGGAqAeH38v",
            "type": "data_store",
            "label": "LIMS",
            "x": 5122,
            "y": 1692,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Laboratório",
            "phase": "Acompanhamento",
            "contextLabel": "LIMS - Acompanhamento - Laboratório - VPP 3kl3FZGGAqAeH38v",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "3kl3FZGGAqAeH38v",
                "standard": "CETESB DD 038/2017",
                "phase": "Acompanhamento",
                "lane": "Laboratório",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "yUl3FZGGAqAeH386",
            "type": "data_store",
            "label": "PDF",
            "x": 5104,
            "y": 1788,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Laboratório",
            "phase": "Acompanhamento",
            "contextLabel": "PDF - Acompanhamento - Laboratório - VPP yUl3FZGGAqAeH386",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "yUl3FZGGAqAeH386",
                "standard": "CETESB DD 038/2017",
                "phase": "Acompanhamento",
                "lane": "Laboratório",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "YMl3FZGGAqAeH397",
            "type": "data_store",
            "label": "Imagens",
            "x": 5084,
            "y": 1274,
            "w": 97,
            "h": 61,
            "color": "#c0c000",
            "lane": "Campo",
            "phase": "Acompanhamento",
            "contextLabel": "Imagens - Acompanhamento - Campo - VPP YMl3FZGGAqAeH397",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "YMl3FZGGAqAeH397",
                "standard": "CETESB DD 038/2017",
                "phase": "Acompanhamento",
                "lane": "Campo",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "nMl3FZGGAqAeH3.P",
            "type": "data_store",
            "label": "EDD",
            "x": 5104,
            "y": 1838,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Acompanhamento",
            "contextLabel": "EDD - Acompanhamento - Atividades Especializadas - VPP nMl3FZGGAqAeH3.P",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "nMl3FZGGAqAeH3.P",
                "standard": "CETESB DD 038/2017",
                "phase": "Acompanhamento",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "pWavFZGGAqAeH5AN",
            "type": "data_store",
            "label": "Fichas de Campo",
            "x": 5701,
            "y": 1174,
            "w": 97,
            "h": 61,
            "color": "#c0c000",
            "lane": "Campo",
            "phase": "Fechamento",
            "contextLabel": "Fichas de Campo - Fechamento - Campo - VPP pWavFZGGAqAeH5AN",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "pWavFZGGAqAeH5AN",
                "standard": "CETESB DD 038/2017",
                "phase": "Fechamento",
                "lane": "Campo",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "COavFZGGAqAeH5AS",
            "type": "data_store",
            "label": "LIMS",
            "x": 5737,
            "y": 1675,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Laboratório",
            "phase": "Fechamento",
            "contextLabel": "LIMS - Fechamento - Laboratório - VPP COavFZGGAqAeH5AS",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "COavFZGGAqAeH5AS",
                "standard": "CETESB DD 038/2017",
                "phase": "Fechamento",
                "lane": "Laboratório",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "S.avFZGGAqAeH5Ac",
            "type": "data_store",
            "label": "PDF",
            "x": 5718,
            "y": 1774,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Laboratório",
            "phase": "Fechamento",
            "contextLabel": "PDF - Fechamento - Laboratório - VPP S.avFZGGAqAeH5Ac",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "S.avFZGGAqAeH5Ac",
                "standard": "CETESB DD 038/2017",
                "phase": "Fechamento",
                "lane": "Laboratório",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": ".ZavFZGGAqAeH5A1",
            "type": "data_store",
            "label": "Imagens",
            "x": 5698,
            "y": 1258,
            "w": 97,
            "h": 61,
            "color": "#c0c000",
            "lane": "Campo",
            "phase": "Fechamento",
            "contextLabel": "Imagens - Fechamento - Campo - VPP .ZavFZGGAqAeH5A1",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": ".ZavFZGGAqAeH5A1",
                "standard": "CETESB DD 038/2017",
                "phase": "Fechamento",
                "lane": "Campo",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "FlavFZGGAqAeH5A_",
            "type": "data_store",
            "label": "EDD",
            "x": 5718,
            "y": 1824,
            "w": 70,
            "h": 50,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Fechamento",
            "contextLabel": "EDD - Fechamento - Atividades Especializadas - VPP FlavFZGGAqAeH5A_",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "FlavFZGGAqAeH5A_",
                "standard": "CETESB DD 038/2017",
                "phase": "Fechamento",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "U_jvFZGGAqAeH7rR",
            "type": "data_store",
            "label": "GIS",
            "x": 5697,
            "y": 2085,
            "w": 62,
            "h": 52,
            "color": "#c0c000",
            "lane": "Atividades Especializadas",
            "phase": "Fechamento",
            "contextLabel": "GIS - Fechamento - Atividades Especializadas - VPP U_jvFZGGAqAeH7rR",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "targetModule": "files",
            "moduleInputParams": {
                "presetId": "m01.gac.flow.dd38",
                "templateId": "gac-dd38-environmental-management",
                "nodeId": "U_jvFZGGAqAeH7rR",
                "standard": "CETESB DD 038/2017",
                "phase": "Fechamento",
                "lane": "Atividades Especializadas",
                "sourceFile": "01_DadosAnaliticos.vpp"
            }
        },
        {
            "id": "GP2vJZGGAqAeH0Yr",
            "type": "end",
            "label": "BPEndEvent",
            "x": 6185,
            "y": 2532,
            "w": 20,
            "h": 20,
            "color": "#f57a7a",
            "lane": "Órgãos Públicos",
            "phase": "Fechamento",
            "contextLabel": "BPEndEvent - Fechamento - Órgãos Públicos - VPP GP2vJZGGAqAeH0Yr",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "nodeId": "gac.end"
        },
        {
            "id": "h9P1AZGGAqACZ.Za",
            "type": "condition",
            "label": "Aceite",
            "x": 1717,
            "y": 2492,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Órgãos Públicos",
            "phase": "Caracterização",
            "contextLabel": "Aceite - Caracterização - Órgãos Públicos - VPP h9P1AZGGAqACZ.Za",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "RQHURZGGAqAeHycC",
            "type": "condition",
            "label": "Aceite?",
            "x": 930,
            "y": 2513,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Órgãos Públicos",
            "phase": "Detecção",
            "contextLabel": "Aceite? - Detecção - Órgãos Públicos - VPP RQHURZGGAqAeHycC",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "TPK4JZGGAqAeH0LM",
            "type": "condition",
            "label": "Ações Emergenciais",
            "x": 550,
            "y": 68,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Resp. Legal",
            "phase": "Detecção",
            "contextLabel": "Ações Emergenciais - Detecção - Resp. Legal - VPP TPK4JZGGAqAeH0LM",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "0zyTJZGGAqAeH3fM",
            "type": "condition",
            "label": "Aceite",
            "x": 2623,
            "y": 2488,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Órgãos Públicos",
            "phase": "Caracterização",
            "contextLabel": "Aceite - Caracterização - Órgãos Públicos - VPP 0zyTJZGGAqAeH3fM",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "fjNTJZGGAqAeH32S",
            "type": "condition",
            "label": "Aceite",
            "x": 3218,
            "y": 2488,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Órgãos Públicos",
            "phase": "Caracterização",
            "contextLabel": "Aceite - Caracterização - Órgãos Públicos - VPP fjNTJZGGAqAeH32S",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "T6hPJZGGAqAeHw6x",
            "type": "condition",
            "label": "Aceite",
            "x": 4264,
            "y": 2474,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Órgãos Públicos",
            "phase": "Remediação",
            "contextLabel": "Aceite - Remediação - Órgãos Públicos - VPP T6hPJZGGAqAeHw6x",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "QRxPJZGGAqAeHxBV",
            "type": "condition",
            "label": "Aceite",
            "x": 5329,
            "y": 2492,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Órgãos Públicos",
            "phase": "Acompanhamento",
            "contextLabel": "Aceite - Acompanhamento - Órgãos Públicos - VPP QRxPJZGGAqAeHxBV",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "wlpPJZGGAqAeHxGF",
            "type": "condition",
            "label": "Aceite",
            "x": 5908,
            "y": 2500,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Órgãos Públicos",
            "phase": "Fechamento",
            "contextLabel": "Aceite - Fechamento - Órgãos Públicos - VPP wlpPJZGGAqAeHxGF",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "8.5QpZGGAqAeH0E_",
            "type": "condition",
            "label": "Aceite",
            "x": 4551,
            "y": 2488,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Órgãos Públicos",
            "phase": "Remediação",
            "contextLabel": "Aceite - Remediação - Órgãos Públicos - VPP 8.5QpZGGAqAeH0E_",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "JiLspZGGAqAeHyaT",
            "type": "condition",
            "label": "Método Laboratorial?",
            "x": 1101,
            "y": 762,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Método Laboratorial? - Caracterização - Responsável Técnico - VPP JiLspZGGAqAeHyaT",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "li8apZGGAqAeHzNc",
            "type": "condition",
            "label": "Tipo",
            "x": 1397,
            "y": 825,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Tipo - Caracterização - Responsável Técnico - VPP li8apZGGAqAeHzNc",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "bxdk5ZGGAqAeH1Eq",
            "type": "condition",
            "label": "Necessidade Alta Resolução?",
            "x": 1848,
            "y": 765,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Necessidade Alta Resolução? - Caracterização - Responsável Técnico - VPP bxdk5ZGGAqAeH1Eq",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "8qLJ5ZGGAqAeHwPP",
            "type": "condition",
            "label": "Há Risco?",
            "x": 3151,
            "y": 2645,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Órgãos Públicos",
            "phase": "Caracterização",
            "contextLabel": "Há Risco? - Caracterização - Órgãos Públicos - VPP 8qLJ5ZGGAqAeHwPP",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "QDFyFZGGAqAeH26W",
            "type": "condition",
            "label": "Necessária Av. Risco Ecológico?",
            "x": 3153,
            "y": 478,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Necessária Av. Risco Ecológico? - Caracterização - Responsável Técnico - VPP QDFyFZGGAqAeH26W",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "B22KFZGGAqAeHxDo",
            "type": "condition",
            "label": "Necessária Modelagem Matemática?",
            "x": 3158,
            "y": 388,
            "w": 40,
            "h": 40,
            "color": "#ff992e",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Necessária Modelagem Matemática? - Caracterização - Responsável Técnico - VPP B22KFZGGAqAeHxDo",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "r1XUAZGGAqACZwX7",
            "type": "trigger",
            "label": "BPStartEvent",
            "x": 98,
            "y": 88,
            "w": 20,
            "h": 20,
            "color": "#c3f57a",
            "lane": "Resp. Legal",
            "phase": "Detecção",
            "contextLabel": "BPStartEvent - Detecção - Resp. Legal - VPP r1XUAZGGAqACZwX7",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "nodeId": "gac.start"
        },
        {
            "id": "39y0AZGGAqACZwaU",
            "type": "action",
            "label": "Plano de Ação",
            "x": 340,
            "y": 78,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Resp. Legal",
            "phase": "Detecção",
            "contextLabel": "Plano de Ação - Detecção - Resp. Legal - VPP 39y0AZGGAqACZwaU",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "g27cAZGGAqACZwma",
            "type": "action",
            "label": "Recebimentos das Amostras",
            "x": 1051,
            "y": 1405,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Caracterização",
            "contextLabel": "Recebimentos das Amostras - Caracterização - Laboratório - VPP g27cAZGGAqACZwma",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "ECg8AZGGAqACZwnO",
            "type": "action",
            "label": "Preparo",
            "x": 1051,
            "y": 1455,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Caracterização",
            "contextLabel": "Preparo - Caracterização - Laboratório - VPP ECg8AZGGAqACZwnO",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "7ji8AZGGAqACZwoO",
            "type": "action",
            "label": "Execução das Corridas Analíticas",
            "x": 1048,
            "y": 1511,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Caracterização",
            "contextLabel": "Execução das Corridas Analíticas - Caracterização - Laboratório - VPP 7ji8AZGGAqACZwoO",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "2VuVAZGGAqACZ2Jl",
            "type": "action",
            "label": "Elaboração do Relatório Técnico da Avaliaçao Confirmatória",
            "x": 1661,
            "y": 648,
            "w": 128,
            "h": 76,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Elaboração do Relatório Técnico da Avaliaçao Confirmatória - Caracterização - Responsável Técnico - VPP 2VuVAZGGAqACZ2Jl",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "3cE1AZGGAqACZ6.g",
            "type": "action",
            "label": "Avaliação do Relatório Confirmatória",
            "x": 1603,
            "y": 2482,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Caracterização",
            "contextLabel": "Avaliação do Relatório Confirmatória - Caracterização - Órgãos Públicos - VPP 3cE1AZGGAqACZ6.g",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "Dc61AZGGAqACZ8Qf",
            "type": "action",
            "label": "Mobilização para Execução do Plano Investigação Confirmatória",
            "x": 1051,
            "y": 85,
            "w": 147,
            "h": 57,
            "color": "#ffc080",
            "lane": "Resp. Legal",
            "phase": "Caracterização",
            "contextLabel": "Mobilização para Execução do Plano Investigação Confirmatória - Caracterização - Resp. Legal - VPP Dc61AZGGAqACZ8Qf",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "PModAZGGAqACZwnJ",
            "type": "action",
            "label": "Elaboração do Relatório Técnico da Avaliaçao Preliminar",
            "x": 744,
            "y": 733,
            "w": 200,
            "h": 54,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Detecção",
            "contextLabel": "Elaboração do Relatório Técnico da Avaliaçao Preliminar - Detecção - Responsável Técnico - VPP PModAZGGAqACZwnJ",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "B2sURZGGAqAeHxCO",
            "type": "action",
            "label": "Avaliação do Relatório de Avaliação Preliminar",
            "x": 748,
            "y": 2501,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Detecção",
            "contextLabel": "Avaliação do Relatório de Avaliação Preliminar - Detecção - Órgãos Públicos - VPP B2sURZGGAqAeHxCO",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "yMO4JZGGAqAeH0yc",
            "type": "action",
            "label": "Execução Ações Emergenciais (Manutenção, Emergências, etc.)",
            "x": 80,
            "y": 1962,
            "w": 150,
            "h": 55,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Detecção",
            "contextLabel": "Execução Ações Emergenciais (Manutenção, Emergências, etc.) - Detecção - Atividades Especializadas - VPP yMO4JZGGAqAeH0yc",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "FrB4JZGGAqAeH1ea",
            "type": "action",
            "label": "Planejamento para Gerenciamento do Plano Avaliação Preliminar",
            "x": 194,
            "y": 319,
            "w": 150,
            "h": 52,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Detecção",
            "contextLabel": "Planejamento para Gerenciamento do Plano Avaliação Preliminar - Detecção - Responsável Técnico - VPP FrB4JZGGAqAeH1ea",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "Yc8MJZGGAqAeH4kJ",
            "type": "action",
            "label": "Descritivo / Processo Produtivo / Histórico",
            "referenceOnly": true,
            "detachedReference": true,
            "sourceFormat": "visual-paradigm-vpp",
            "detachedReferenceReason": "visible in VPP but not connected to BPMN flow"
        },
        {
            "id": "kPCMJZGGAqAeH4vm",
            "type": "action",
            "label": "Perfis, Sondagens, Poços, pontos de monitoramento pré-existentes e poços de abastecimento",
            "x": 484,
            "y": 1858,
            "w": 142,
            "h": 82,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Detecção",
            "contextLabel": "Perfis, Sondagens, Poços, pontos de monitoramento pré-existentes e poços de abastecimento - Detecção - Atividades Especializadas - VPP kPCMJZGGAqAeH4vm",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "b_CMJZGGAqAeH4wT",
            "type": "action",
            "label": "Levantamento aerofotogramétrico temporal",
            "x": 286,
            "y": 2104,
            "w": 142,
            "h": 50,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Detecção",
            "contextLabel": "Levantamento aerofotogramétrico temporal - Detecção - Atividades Especializadas - VPP b_CMJZGGAqAeH4wT",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "uQiMJZGGAqAeH4xE",
            "type": "action",
            "label": "Localização Poços abastecimento",
            "x": 286,
            "y": 1910,
            "w": 142,
            "h": 40,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Detecção",
            "contextLabel": "Localização Poços abastecimento - Detecção - Atividades Especializadas - VPP uQiMJZGGAqAeH4xE",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "7oiMJZGGAqAeH4xz",
            "type": "action",
            "label": "Mapa do uso e ocupação do solo na área e no seu entorno",
            "x": 288,
            "y": 2174,
            "w": 142,
            "h": 48,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Detecção",
            "contextLabel": "Mapa do uso e ocupação do solo na área e no seu entorno - Detecção - Atividades Especializadas - VPP 7oiMJZGGAqAeH4xz",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "0iiMJZGGAqAeH4y2",
            "type": "action",
            "label": "Mapas geológicos, pedológicos e hidrogeológicos regionais;",
            "x": 286,
            "y": 2038,
            "w": 142,
            "h": 50,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Detecção",
            "contextLabel": "Mapas geológicos, pedológicos e hidrogeológicos regionais; - Detecção - Atividades Especializadas - VPP 0iiMJZGGAqAeH4y2",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "kJ_MJZGGAqAeH.fP",
            "type": "action",
            "label": "Coordenadas Centróide / Planta ou croqui de localização da área",
            "x": 286,
            "y": 1964,
            "w": 142,
            "h": 56,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Detecção",
            "contextLabel": "Coordenadas Centróide / Planta ou croqui de localização da área - Detecção - Atividades Especializadas - VPP kJ_MJZGGAqAeH.fP",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "IzicJZGGAqAeH3IT",
            "type": "action",
            "label": "Investigações pré-existentes",
            "x": 198,
            "y": 677,
            "w": 136,
            "h": 40,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Detecção",
            "contextLabel": "Investigações pré-existentes - Detecção - Responsável Técnico - VPP IzicJZGGAqAeH3IT",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "xt9yJZGGAqAeH6lh",
            "type": "action",
            "label": "Descritivo / Processo Produtivo / Histórico",
            "x": 200,
            "y": 539,
            "w": 142,
            "h": 40,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Detecção",
            "contextLabel": "Descritivo / Processo Produtivo / Histórico - Detecção - Responsável Técnico - VPP xt9yJZGGAqAeH6lh",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "ngOKJZGGAqAeH7MS",
            "type": "action",
            "label": "Planta - Áreas Fontes / Potenciais",
            "x": 484,
            "y": 2114,
            "w": 142,
            "h": 40,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Detecção",
            "contextLabel": "Planta - Áreas Fontes / Potenciais - Detecção - Atividades Especializadas - VPP ngOKJZGGAqAeH7MS",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "rSRKJZGGAqAeH7Ml",
            "type": "action",
            "label": "Fotos - Áreas Fontes / Fotenciais",
            "x": 484,
            "y": 2050,
            "w": 142,
            "h": 40,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Detecção",
            "contextLabel": "Fotos - Áreas Fontes / Fotenciais - Detecção - Atividades Especializadas - VPP rSRKJZGGAqAeH7Ml",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "_87KJZGGAqAeH7Oa",
            "type": "action",
            "label": "Modelo Conceitual Inicial",
            "x": 540,
            "y": 427,
            "w": 150,
            "h": 54,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Detecção",
            "contextLabel": "Modelo Conceitual Inicial - Detecção - Responsável Técnico - VPP _87KJZGGAqAeH7Oa",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "DhGOJZGGAqAeH8dM",
            "type": "action",
            "label": "Entrevistas",
            "x": 200,
            "y": 441,
            "w": 136,
            "h": 40,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Detecção",
            "contextLabel": "Entrevistas - Detecção - Responsável Técnico - VPP DhGOJZGGAqAeH8dM",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "3T5OJZGGAqAeH8wP",
            "type": "action",
            "label": "Recomendações, Partes Relacionadas, Matrícula Imóvel, Declarações e Termos",
            "x": 748,
            "y": 651,
            "w": 197,
            "h": 55,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Detecção",
            "contextLabel": "Recomendações, Partes Relacionadas, Matrícula Imóvel, Declarações e Termos - Detecção - Responsável Técnico - VPP 3T5OJZGGAqAeH8wP",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "daweJZGGAqAeH.RR",
            "type": "action",
            "label": "Plano de Investigação Confirmatória: \nIndicação em planta dos pontos de amostragem",
            "x": 748,
            "y": 423,
            "w": 198,
            "h": 55,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Detecção",
            "contextLabel": "Plano de Investigação Confirmatória: \nIndicação em planta dos pontos de amostragem - Detecção - Responsável Técnico - VPP daweJZGGAqAeH.RR",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "Z74eJZGGAqAeH.Wz",
            "type": "action",
            "label": "Plano de Investigação Confirmatória \nIndicação screening e métodos estatísticos",
            "x": 748,
            "y": 497,
            "w": 197,
            "h": 55,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Detecção",
            "contextLabel": "Plano de Investigação Confirmatória \nIndicação screening e métodos estatísticos - Detecção - Responsável Técnico - VPP Z74eJZGGAqAeH.Wz",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "WX4eJZGGAqAeH.XC",
            "type": "action",
            "label": "Plano de Investigação Confirmatória \nIndicação SQIs",
            "x": 744,
            "y": 569,
            "w": 200,
            "h": 55,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Detecção",
            "contextLabel": "Plano de Investigação Confirmatória \nIndicação SQIs - Detecção - Responsável Técnico - VPP WX4eJZGGAqAeH.XC",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "72WlJZGGAqAeH7yo",
            "type": "action",
            "label": "Planejamento para Gerenciamento do Plano Investigação Confirmatória",
            "x": 1048,
            "y": 311,
            "w": 147,
            "h": 57,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Planejamento para Gerenciamento do Plano Investigação Confirmatória - Caracterização - Responsável Técnico - VPP 72WlJZGGAqAeH7yo",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "yjK1JZGGAqAeHw34",
            "type": "action",
            "label": "Avaliação de Resultados de Screening",
            "x": 1191,
            "y": 701,
            "w": 141,
            "h": 40,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Avaliação de Resultados de Screening - Caracterização - Responsável Técnico - VPP yjK1JZGGAqAeHw34",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "y4ejJZGGAqAeH1sC",
            "type": "action",
            "label": "Mobilização para Execução do Plano Investigação Detalhada",
            "x": 1777,
            "y": 85,
            "w": 147,
            "h": 57,
            "color": "#ffc080",
            "lane": "Resp. Legal",
            "phase": "Caracterização",
            "contextLabel": "Mobilização para Execução do Plano Investigação Detalhada - Caracterização - Resp. Legal - VPP y4ejJZGGAqAeH1sC",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "kSBjJZGGAqAeH17b",
            "type": "action",
            "label": "Mobilização para Execução da Avaliação de Risco",
            "x": 2621,
            "y": 91,
            "w": 147,
            "h": 57,
            "color": "#ffc080",
            "lane": "Resp. Legal",
            "phase": "Caracterização",
            "contextLabel": "Mobilização para Execução da Avaliação de Risco - Caracterização - Resp. Legal - VPP kSBjJZGGAqAeH17b",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "LTyTJZGGAqAeH3fG",
            "type": "action",
            "label": "Avaliação do Relatório Detalhada",
            "x": 2498,
            "y": 2482,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Caracterização",
            "contextLabel": "Avaliação do Relatório Detalhada - Caracterização - Órgãos Públicos - VPP LTyTJZGGAqAeH3fG",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "ZjNTJZGGAqAeH32M",
            "type": "action",
            "label": "Avaliação do Relatório Avaliação de Risco",
            "x": 3078,
            "y": 2488,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Caracterização",
            "contextLabel": "Avaliação do Relatório Avaliação de Risco - Caracterização - Órgãos Públicos - VPP ZjNTJZGGAqAeH32M",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "CSNbJZGGAqAeH6YT",
            "type": "action",
            "label": "Elaboração do Relatório Técnico da Avaliaçao Detalhada",
            "x": 2501,
            "y": 835,
            "w": 107,
            "h": 76,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Elaboração do Relatório Técnico da Avaliaçao Detalhada - Caracterização - Responsável Técnico - VPP CSNbJZGGAqAeH6YT",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "oTtbJZGGAqAeH6t9",
            "type": "action",
            "label": "Elaboração do Relatório Técnico da Avaliaçao de Risco",
            "x": 3107,
            "y": 861,
            "w": 156,
            "h": 50,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Elaboração do Relatório Técnico da Avaliaçao de Risco - Caracterização - Responsável Técnico - VPP oTtbJZGGAqAeH6t9",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "TahPJZGGAqAeHw6k",
            "type": "action",
            "label": "Avaliação do Relatório relatórios da Elaboração do Plano de Intervenção",
            "x": 4131,
            "y": 2474,
            "w": 108,
            "h": 90,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Remediação",
            "contextLabel": "Avaliação do Relatório relatórios da Elaboração do Plano de Intervenção - Remediação - Órgãos Públicos - VPP TahPJZGGAqAeHw6k",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "FhxPJZGGAqAeHxBP",
            "type": "action",
            "label": "Avaliação do atendimento dos Critérios para Encerramento",
            "x": 5115,
            "y": 2492,
            "w": 196,
            "h": 64,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Acompanhamento",
            "contextLabel": "Avaliação do atendimento dos Critérios para Encerramento - Acompanhamento - Órgãos Públicos - VPP FhxPJZGGAqAeHxBP",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "xFpPJZGGAqAeHxF_",
            "type": "action",
            "label": "Avaliação do atendimento dos Critérios para considerar a Área Reabilitada",
            "x": 5744,
            "y": 2500,
            "w": 142,
            "h": 64,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Fechamento",
            "contextLabel": "Avaliação do atendimento dos Critérios para considerar a Área Reabilitada - Fechamento - Órgãos Públicos - VPP xFpPJZGGAqAeHxF_",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "hopvJZGGAqAeH1GK",
            "type": "action",
            "label": "Emissão do Termo de Área Reabilitada para o Uso Declarado (AR)",
            "x": 5998,
            "y": 2494,
            "w": 107,
            "h": 84,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Fechamento",
            "contextLabel": "Emissão do Termo de Área Reabilitada para o Uso Declarado (AR) - Fechamento - Órgãos Públicos - VPP hopvJZGGAqAeH1GK",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": ".9cfJZGGAqAeH47i",
            "type": "action",
            "label": "Plantas com a indicação dos componentes do sistema de remediação",
            "x": 3597,
            "y": 2085,
            "w": 108,
            "h": 84,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "Plantas com a indicação dos componentes do sistema de remediação - Remediação - Atividades Especializadas - VPP .9cfJZGGAqAeH47i",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "HDcfJZGGAqAeH47x",
            "type": "action",
            "label": "A indicação da área e do volume a serem atingidos pela atuação dos sistemas",
            "x": 3594,
            "y": 2198,
            "w": 108,
            "h": 86,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "A indicação da área e do volume a serem atingidos pela atuação dos sistemas - Remediação - Atividades Especializadas - VPP HDcfJZGGAqAeH47x",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "djcfJZGGAqAeH48A",
            "type": "action",
            "label": "A especificação dos parâmetros de controle da eficiência e eficácia",
            "x": 3597,
            "y": 2295,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "A especificação dos parâmetros de controle da eficiência e eficácia - Remediação - Atividades Especializadas - VPP djcfJZGGAqAeH48A",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "lTcfJZGGAqAeH48P",
            "type": "action",
            "label": "Resultados dos ensaios de bancada e piloto realizados",
            "x": 3600,
            "y": 2370,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "Resultados dos ensaios de bancada e piloto realizados - Remediação - Atividades Especializadas - VPP lTcfJZGGAqAeH48P",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "2zcfJZGGAqAeH48e",
            "type": "action",
            "label": "Relatório de Instalação do Sistema de Remediação",
            "x": 4528,
            "y": 491,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Relatório de Instalação do Sistema de Remediação - Remediação - Responsável Técnico - VPP 2zcfJZGGAqAeH48e",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "sLcfJZGGAqAeH48t",
            "type": "action",
            "label": "As built do sistema de remediação",
            "x": 4197,
            "y": 1945,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "As built do sistema de remediação - Remediação - Atividades Especializadas - VPP sLcfJZGGAqAeH48t",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "QrcfJZGGAqAeH488",
            "type": "action",
            "label": "Avaliação técnica do sistema de remediação em relação aos parâmetros definidos no projeto executivo,",
            "x": 4197,
            "y": 2031,
            "w": 108,
            "h": 118,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "Avaliação técnica do sistema de remediação em relação aos parâmetros definidos no projeto executivo, - Remediação - Atividades Especializadas - VPP QrcfJZGGAqAeH488",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "7rcfJZGGAqAeH49L",
            "type": "action",
            "label": "Relatório de Avaliação do Desempenho do Sistema de Remediação",
            "x": 5223,
            "y": 418,
            "w": 108,
            "h": 78,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Relatório de Avaliação do Desempenho do Sistema de Remediação - Acompanhamento - Responsável Técnico - VPP 7rcfJZGGAqAeH49L",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "9bcfJZGGAqAeH49a",
            "type": "action",
            "label": "Plano de Destinação de Materiais e Resíduos",
            "x": 4827,
            "y": 560,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Plano de Destinação de Materiais e Resíduos - Acompanhamento - Responsável Técnico - VPP 9bcfJZGGAqAeH49a",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "R7cfJZGGAqAeH49p",
            "type": "action",
            "label": "A especificação do tratamento e da destinação dos efluentes líquidos e gasosos",
            "x": 3557,
            "y": 541,
            "w": 108,
            "h": 82,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "A especificação do tratamento e da destinação dos efluentes líquidos e gasosos - Remediação - Responsável Técnico - VPP R7cfJZGGAqAeH49p",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "XcCfJZGGAqAeH5Zh",
            "type": "action",
            "label": "As metas de remediação propostas para as medidas de remediação",
            "x": 3551,
            "y": 764,
            "w": 108,
            "h": 98,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "As metas de remediação propostas para as medidas de remediação - Remediação - Responsável Técnico - VPP XcCfJZGGAqAeH5Zh",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "MCCfJZGGAqAeH5Zw",
            "type": "action",
            "label": "A localização dos pontos de conformidade para todas as medidas de intervenção",
            "x": 3354,
            "y": 1990,
            "w": 108,
            "h": 96,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "A localização dos pontos de conformidade para todas as medidas de intervenção - Remediação - Atividades Especializadas - VPP MCCfJZGGAqAeH5Zw",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "QiCfJZGGAqAeH5Z_",
            "type": "action",
            "label": "Cronograma contendo a previsão da implantação das medidas de intervenção",
            "x": 3557,
            "y": 644,
            "w": 108,
            "h": 102,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Cronograma contendo a previsão da implantação das medidas de intervenção - Remediação - Responsável Técnico - VPP QiCfJZGGAqAeH5Z_",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "fiCfJZGGAqAeH5aO",
            "type": "action",
            "label": "Proposta de monitoramento da eficiência e eficácia das medidas de remediação",
            "x": 3704,
            "y": 435,
            "w": 108,
            "h": 90,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Proposta de monitoramento da eficiência e eficácia das medidas de remediação - Remediação - Responsável Técnico - VPP fiCfJZGGAqAeH5aO",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "LSCfJZGGAqAeH5ad",
            "type": "action",
            "label": "Proposta de Monitoramento para Encerramento",
            "x": 3704,
            "y": 640,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Proposta de Monitoramento para Encerramento - Remediação - Responsável Técnico - VPP LSCfJZGGAqAeH5ad",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "dyCfJZGGAqAeH5as",
            "type": "action",
            "label": "Plano de manutenção das medidas de remediação",
            "x": 3704,
            "y": 540,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Plano de manutenção das medidas de remediação - Remediação - Responsável Técnico - VPP dyCfJZGGAqAeH5as",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "BKCfJZGGAqAeH5a7",
            "type": "action",
            "label": "Plano de contingência",
            "x": 3700,
            "y": 718,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Plano de contingência - Remediação - Responsável Técnico - VPP BKCfJZGGAqAeH5a7",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "mqCfJZGGAqAeH5bK",
            "type": "action",
            "label": "Relação dos Responsáveis Legais",
            "x": 3697,
            "y": 798,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Relação dos Responsáveis Legais - Remediação - Responsável Técnico - VPP mqCfJZGGAqAeH5bK",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "qaCfJZGGAqAeH5bZ",
            "type": "action",
            "label": "Dimensionamento do sistema de remediação",
            "x": 3597,
            "y": 1985,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "Dimensionamento do sistema de remediação - Remediação - Atividades Especializadas - VPP qaCfJZGGAqAeH5bZ",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "C6CfJZGGAqAeH5bo",
            "type": "action",
            "label": "Descrição das técnicas de remediação e de engenharia a serem adotadas,",
            "x": 3557,
            "y": 438,
            "w": 108,
            "h": 84,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Descrição das técnicas de remediação e de engenharia a serem adotadas, - Remediação - Responsável Técnico - VPP C6CfJZGGAqAeH5bo",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "ReifJZGGAqAeH5q2",
            "type": "action",
            "label": "Definição dos objetivos e prazos do Plano de Intervenção",
            "x": 3377,
            "y": 431,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Definição dos objetivos e prazos do Plano de Intervenção - Remediação - Responsável Técnico - VPP ReifJZGGAqAeH5q2",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "H.ifJZGGAqAeH5rF",
            "type": "action",
            "label": "Seleção das técnicas a serem empregadas",
            "x": 3377,
            "y": 664,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Seleção das técnicas a serem empregadas - Remediação - Responsável Técnico - VPP H.ifJZGGAqAeH5rF",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "TBifJZGGAqAeH5rU",
            "type": "action",
            "label": "Compilação e Avaliação do Plano de Intervenção",
            "x": 3910,
            "y": 315,
            "w": 182,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Compilação e Avaliação do Plano de Intervenção - Remediação - Responsável Técnico - VPP TBifJZGGAqAeH5rU",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": ".ZifJZGGAqAeH5s9",
            "type": "action",
            "label": "Avaliação das medidas de intervenção selecionadas e duração (curto, médio e longo prazo)",
            "x": 3377,
            "y": 524,
            "w": 108,
            "h": 116,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Avaliação das medidas de intervenção selecionadas e duração (curto, médio e longo prazo) - Remediação - Responsável Técnico - VPP .ZifJZGGAqAeH5s9",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "LTKfJZGGAqAeH6cw",
            "type": "action",
            "label": "Análise técnica, econômica e financeira",
            "x": 3597,
            "y": 1868,
            "w": 108,
            "h": 70,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "Análise técnica, econômica e financeira - Remediação - Atividades Especializadas - VPP LTKfJZGGAqAeH6cw",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "jJqfJZGGAqAeH6wr",
            "type": "action",
            "label": "Mapa de Intervenção com a localização das medidas de intervenção propostas",
            "x": 3354,
            "y": 1864,
            "w": 108,
            "h": 96,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "Mapa de Intervenção com a localização das medidas de intervenção propostas - Remediação - Atividades Especializadas - VPP jJqfJZGGAqAeH6wr",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "psafJZGGAqAeH7J2",
            "type": "action",
            "label": "A especificação das medidas destinadas ao controle ou à eliminação das fontes de contaminação",
            "x": 3377,
            "y": 770,
            "w": 108,
            "h": 114,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "A especificação das medidas destinadas ao controle ou à eliminação das fontes de contaminação - Remediação - Responsável Técnico - VPP psafJZGGAqAeH7J2",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "stUgpZGGAqAeH3ol",
            "type": "action",
            "label": "Mapa potenciométrico",
            "x": 1297,
            "y": 1915,
            "w": 124,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Mapa potenciométrico - Caracterização - Atividades Especializadas - VPP stUgpZGGAqAeH3ol",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "l9UgpZGGAqAeH3o0",
            "type": "action",
            "label": "Interpretação dos resultados das análises químicas das amostras coletadas (plumas, etc.)",
            "x": 1293,
            "y": 1998,
            "w": 126,
            "h": 78,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Interpretação dos resultados das análises químicas das amostras coletadas (plumas, etc.) - Caracterização - Atividades Especializadas - VPP l9UgpZGGAqAeH3o0",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "jDUgpZGGAqAeH3pD",
            "type": "action",
            "label": "Preparação dos Laudos analíticos",
            "x": 1053,
            "y": 1601,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Caracterização",
            "contextLabel": "Preparação dos Laudos analíticos - Caracterização - Laboratório - VPP jDUgpZGGAqAeH3pD",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "njUgpZGGAqAeH3pS",
            "type": "action",
            "label": "Plano de Amostragem / Elaboração de Cadeias de Custódia",
            "x": 1048,
            "y": 851,
            "w": 130,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Plano de Amostragem / Elaboração de Cadeias de Custódia - Caracterização - Responsável Técnico - VPP njUgpZGGAqAeH3pS",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "AzUgpZGGAqAeH3ph",
            "type": "action",
            "label": "Documentação fotográfica relativa aos serviços de campo;",
            "x": 1067,
            "y": 1071,
            "w": 156,
            "h": 53,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Documentação fotográfica relativa aos serviços de campo; - Caracterização - Campo - VPP AzUgpZGGAqAeH3ph",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "kLUgpZGGAqAeH3pw",
            "type": "action",
            "label": "Atualização do Modelo Conceitual, gerando o Modelo Conceitual 2",
            "x": 1661,
            "y": 465,
            "w": 128,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Atualização do Modelo Conceitual, gerando o Modelo Conceitual 2 - Caracterização - Responsável Técnico - VPP kLUgpZGGAqAeH3pw",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp",
            "nodeId": "gac.phase.characterization"
        },
        {
            "id": "tHUgpZGGAqAeH3qs",
            "type": "action",
            "label": "Planta com a localização",
            "x": 1067,
            "y": 1918,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Planta com a localização - Caracterização - Atividades Especializadas - VPP tHUgpZGGAqAeH3qs",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "HnUgpZGGAqAeH3q7",
            "type": "action",
            "label": "Definição do posicionamento dos pontos de investigação e de coleta",
            "x": 1187,
            "y": 611,
            "w": 146,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Definição do posicionamento dos pontos de investigação e de coleta - Caracterização - Responsável Técnico - VPP HnUgpZGGAqAeH3q7",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "I3UgpZGGAqAeH3rK",
            "type": "action",
            "label": "Definição dos métodos de screening",
            "x": 1061,
            "y": 388,
            "w": 126,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Definição dos métodos de screening - Caracterização - Responsável Técnico - VPP I3UgpZGGAqAeH3rK",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "UPUgpZGGAqAeH3rZ",
            "type": "action",
            "label": "Georreferenciamento pontos de amostragem",
            "x": 1067,
            "y": 1991,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Georreferenciamento pontos de amostragem - Caracterização - Atividades Especializadas - VPP UPUgpZGGAqAeH3rZ",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "CvUgpZGGAqAeH3ro",
            "type": "action",
            "label": "Representação do perfil de cada sondagem realizada",
            "x": 1058,
            "y": 2248,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Representação do perfil de cada sondagem realizada - Caracterização - Atividades Especializadas - VPP CvUgpZGGAqAeH3ro",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "mfUgpZGGAqAeH3r3",
            "type": "action",
            "label": "Seções",
            "x": 1291,
            "y": 2118,
            "w": 130,
            "h": 40,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Seções - Caracterização - Atividades Especializadas - VPP mfUgpZGGAqAeH3r3",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "R_UgpZGGAqAeH3sG",
            "type": "action",
            "label": "Descrição da geologia, pedologia e hidrogeologia local,",
            "x": 1058,
            "y": 2078,
            "w": 122,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Descrição da geologia, pedologia e hidrogeologia local, - Caracterização - Atividades Especializadas - VPP R_UgpZGGAqAeH3sG",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "VA0gpZGGAqAeH3sV",
            "type": "action",
            "label": "Perfil construtivo dos poços de monitoramento instalados",
            "x": 1061,
            "y": 2338,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Perfil construtivo dos poços de monitoramento instalados - Caracterização - Atividades Especializadas - VPP VA0gpZGGAqAeH3sV",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "rg0gpZGGAqAeH3sk",
            "type": "action",
            "label": "Tebelamento de dados de poços de monitoramento",
            "x": 1058,
            "y": 2162,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Tebelamento de dados de poços de monitoramento - Caracterização - Atividades Especializadas - VPP rg0gpZGGAqAeH3sk",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "xkCgpZGGAqAeH4ph",
            "type": "action",
            "label": "Recomendações, Partes Relacionadas, Matrícula Imóvel, Declarações e Termos",
            "x": 1661,
            "y": 551,
            "w": 128,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Recomendações, Partes Relacionadas, Matrícula Imóvel, Declarações e Termos - Caracterização - Responsável Técnico - VPP xkCgpZGGAqAeH4ph",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "3UCgpZGGAqAeH4pw",
            "type": "action",
            "label": "Destinação de Materiais e Resíduos",
            "x": 1067,
            "y": 1281,
            "w": 140,
            "h": 64,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Destinação de Materiais e Resíduos - Caracterização - Campo - VPP 3UCgpZGGAqAeH4pw",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "le5QpZGGAqAeH0E5",
            "type": "action",
            "label": "Entendimento do Processo de Implementação do Sitema de Remediação",
            "x": 4394,
            "y": 2481,
            "w": 136,
            "h": 64,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Remediação",
            "contextLabel": "Entendimento do Processo de Implementação do Sitema de Remediação - Remediação - Órgãos Públicos - VPP le5QpZGGAqAeH0E5",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "gFjQpZGGAqAeH0_s",
            "type": "action",
            "label": "Alteraração da classificação da área \npara Área em Processo de Remediação (ACRe)",
            "x": 4618,
            "y": 2481,
            "w": 136,
            "h": 64,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Remediação",
            "contextLabel": "Alteraração da classificação da área \npara Área em Processo de Remediação (ACRe) - Remediação - Órgãos Públicos - VPP gFjQpZGGAqAeH0_s",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "Ub8wpZGGAqAeH2OA",
            "type": "action",
            "label": "Mobilização para Elaboração do Plano de Intervenção",
            "x": 3344,
            "y": 115,
            "w": 150,
            "h": 64,
            "color": "#ffc080",
            "lane": "Resp. Legal",
            "phase": "Remediação",
            "contextLabel": "Mobilização para Elaboração do Plano de Intervenção - Remediação - Resp. Legal - VPP Ub8wpZGGAqAeH2OA",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "fRawpZGGAqAeH2jK",
            "type": "action",
            "label": "Mobilização para a Implementação do Plano de Intervenção",
            "x": 4154,
            "y": 104,
            "w": 150,
            "h": 64,
            "color": "#ffc080",
            "lane": "Resp. Legal",
            "phase": "Remediação",
            "contextLabel": "Mobilização para a Implementação do Plano de Intervenção - Remediação - Resp. Legal - VPP fRawpZGGAqAeH2jK",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "A3KYpZGGAqAeH7DL",
            "type": "action",
            "label": "Planejamento para Gerenciamento do Plano Investigação Detalhada",
            "x": 1828,
            "y": 301,
            "w": 147,
            "h": 57,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Planejamento para Gerenciamento do Plano Investigação Detalhada - Caracterização - Responsável Técnico - VPP A3KYpZGGAqAeH7DL",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "kFqYpZGGAqAeH7QP",
            "type": "action",
            "label": "Planejamento para Gerenciamento da Avaliação de Risco",
            "x": 2671,
            "y": 311,
            "w": 147,
            "h": 57,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Planejamento para Gerenciamento da Avaliação de Risco - Caracterização - Responsável Técnico - VPP kFqYpZGGAqAeH7QP",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "Vc1YpZGGAqAeH99X",
            "type": "action",
            "label": "Texto e ilustrações com a atualização do Modelo Conceitual (MCA 3)",
            "x": 2483,
            "y": 625,
            "w": 145,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Texto e ilustrações com a atualização do Modelo Conceitual (MCA 3) - Caracterização - Responsável Técnico - VPP Vc1YpZGGAqAeH99X",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "6y1YpZGGAqAeH9.E",
            "type": "action",
            "label": "Definições SQIs",
            "x": 1821,
            "y": 531,
            "w": 150,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Definições SQIs - Caracterização - Responsável Técnico - VPP 6y1YpZGGAqAeH9.E",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "JK1YpZGGAqAeH9.T",
            "type": "action",
            "label": "Quantificação e caracterização das contaminações",
            "x": 2253,
            "y": 2165,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Quantificação e caracterização das contaminações - Caracterização - Atividades Especializadas - VPP JK1YpZGGAqAeH9.T",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "w61YpZGGAqAeH9.x",
            "type": "action",
            "label": "Avaliação da caracterização das contaminações",
            "x": 2483,
            "y": 512,
            "w": 134,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Avaliação da caracterização das contaminações - Caracterização - Responsável Técnico - VPP w61YpZGGAqAeH9.x",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "Bm1YpZGGAqAeH9_P",
            "type": "action",
            "label": "Definição dos procedimentos efetuados durante a instalação de cada poço de monitoramento",
            "x": 1821,
            "y": 375,
            "w": 156,
            "h": 68,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Definição dos procedimentos efetuados durante a instalação de cada poço de monitoramento - Caracterização - Responsável Técnico - VPP Bm1YpZGGAqAeH9_P",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "cu1YpZGGAqAeH9_8",
            "type": "action",
            "label": "Definição da investigação de alta resolução",
            "x": 1808,
            "y": 851,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Definição da investigação de alta resolução - Caracterização - Responsável Técnico - VPP cu1YpZGGAqAeH9_8",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "me1YpZGGAqAeH.AL",
            "type": "action",
            "label": "Recebimento Resultados Laboratoriais / Propriedades do Meio / QAQC",
            "x": 2228,
            "y": 748,
            "w": 158,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Recebimento Resultados Laboratoriais / Propriedades do Meio / QAQC - Caracterização - Responsável Técnico - VPP me1YpZGGAqAeH.AL",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "Xh1YpZGGAqAeH.A4",
            "type": "action",
            "label": "Interpretação dados hidrogeológicos",
            "x": 2471,
            "y": 401,
            "w": 170,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Interpretação dados hidrogeológicos - Caracterização - Responsável Técnico - VPP Xh1YpZGGAqAeH.A4",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "tUY4pZGGAqAeHyhc",
            "type": "action",
            "label": "Definição do posicionamento dos pontos de amostragem",
            "x": 1821,
            "y": 452,
            "w": 150,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Definição do posicionamento dos pontos de amostragem - Caracterização - Responsável Técnico - VPP tUY4pZGGAqAeHyhc",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "QMY4pZGGAqAeHyhr",
            "type": "action",
            "label": "Definição de Métodos de Investigação e Amostragem",
            "x": 1821,
            "y": 608,
            "w": 156,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Definição de Métodos de Investigação e Amostragem - Caracterização - Responsável Técnico - VPP QMY4pZGGAqAeHyhr",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "oZTkpZGGAqAeH5ZU",
            "type": "action",
            "label": "Recomendações, Partes Relacionadas, Matrícula Imóvel, Declarações e Termos",
            "x": 2483,
            "y": 728,
            "w": 138,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Recomendações, Partes Relacionadas, Matrícula Imóvel, Declarações e Termos - Caracterização - Responsável Técnico - VPP oZTkpZGGAqAeH5ZU",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "2AUMpZGGAqAeH.pF",
            "type": "action",
            "label": "Compilação dados para Modelagem Matemática",
            "x": 2828,
            "y": 1931,
            "w": 108,
            "h": 88,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Compilação dados para Modelagem Matemática - Caracterização - Atividades Especializadas - VPP 2AUMpZGGAqAeH.pF",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "rgUMpZGGAqAeH.pU",
            "type": "action",
            "label": "Cálculo das CMAs a partir da Modelagem",
            "x": 2828,
            "y": 2041,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Cálculo das CMAs a partir da Modelagem - Caracterização - Atividades Especializadas - VPP rgUMpZGGAqAeH.pU",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "fQUMpZGGAqAeHwAD",
            "type": "action",
            "label": "Conclusão Modelagem Matemática",
            "x": 2828,
            "y": 2131,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Conclusão Modelagem Matemática - Caracterização - Atividades Especializadas - VPP fQUMpZGGAqAeHwAD",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "NBhMpZGGAqAeH0bj",
            "type": "action",
            "label": "Plantas e seções atualizadas com Receptores, bens a proteger, etc.",
            "x": 2683,
            "y": 2202,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Plantas e seções atualizadas com Receptores, bens a proteger, etc. - Caracterização - Atividades Especializadas - VPP NBhMpZGGAqAeH0bj",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "SKpMpZGGAqAeH1Oa",
            "type": "action",
            "label": "Avaliação sobre a a necessidade de implementação de medidas de intervenção",
            "x": 3101,
            "y": 622,
            "w": 162,
            "h": 78,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Avaliação sobre a a necessidade de implementação de medidas de intervenção - Caracterização - Responsável Técnico - VPP SKpMpZGGAqAeH1Oa",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "ZqpMpZGGAqAeH1Op",
            "type": "action",
            "label": "Recomendações, Partes Relacionadas, Matrícula Imóvel, Declarações e Termos",
            "x": 3107,
            "y": 782,
            "w": 156,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Recomendações, Partes Relacionadas, Matrícula Imóvel, Declarações e Termos - Caracterização - Responsável Técnico - VPP ZqpMpZGGAqAeH1Op",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "XAlMpZGGAqAeH1u1",
            "type": "action",
            "label": "Atualização do Modelo Conceitual",
            "x": 2953,
            "y": 305,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Atualização do Modelo Conceitual - Caracterização - Responsável Técnico - VPP XAlMpZGGAqAeH1u1",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "uQlMpZGGAqAeH1vE",
            "type": "action",
            "label": "Identificar os receptores humanos considerando o uso atual e futuro da área",
            "x": 2693,
            "y": 391,
            "w": 108,
            "h": 98,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Identificar os receptores humanos considerando o uso atual e futuro da área - Caracterização - Responsável Técnico - VPP uQlMpZGGAqAeH1vE",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "dwlMpZGGAqAeH1vT",
            "type": "action",
            "label": "Identificar as substâncias químicas de interesse em cada unidade de exposição",
            "x": 2693,
            "y": 595,
            "w": 108,
            "h": 100,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Identificar as substâncias químicas de interesse em cada unidade de exposição - Caracterização - Responsável Técnico - VPP dwlMpZGGAqAeH1vT",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "PIlMpZGGAqAeH1vi",
            "type": "action",
            "label": "Identificar todos os caminhos de exposição presentes e potenciais, atuais e futuros",
            "x": 2693,
            "y": 741,
            "w": 108,
            "h": 98,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Identificar todos os caminhos de exposição presentes e potenciais, atuais e futuros - Caracterização - Responsável Técnico - VPP PIlMpZGGAqAeH1vi",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "wYlMpZGGAqAeH1vx",
            "type": "action",
            "label": "Calcular o risco para cada substância química de interesse",
            "x": 2673,
            "y": 1851,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Calcular o risco para cada substância química de interesse - Caracterização - Atividades Especializadas - VPP wYlMpZGGAqAeH1vx",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "I7dMpZGGAqAeH2_0",
            "type": "action",
            "label": "Calcular as Concentrações Máximas Aceitáveis para as Substâncias Químicas",
            "x": 2677,
            "y": 2008,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Calcular as Concentrações Máximas Aceitáveis para as Substâncias Químicas - Caracterização - Atividades Especializadas - VPP I7dMpZGGAqAeH2_0",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "RHdMpZGGAqAeH3AD",
            "type": "action",
            "label": "Calcular o risco total para cada unidade de exposição",
            "x": 2677,
            "y": 1931,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Calcular o risco total para cada unidade de exposição - Caracterização - Atividades Especializadas - VPP RHdMpZGGAqAeH3AD",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "tndMpZGGAqAeH3AS",
            "type": "action",
            "label": "Mapas de Risco",
            "x": 2683,
            "y": 2301,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Mapas de Risco - Caracterização - Atividades Especializadas - VPP tndMpZGGAqAeH3AS",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "X3dMpZGGAqAeH3Aw",
            "type": "action",
            "label": "Execução da Avaliação de Risco Ecológico",
            "x": 2943,
            "y": 2325,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Execução da Avaliação de Risco Ecológico - Caracterização - Atividades Especializadas - VPP X3dMpZGGAqAeH3Aw",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "unLMpZGGAqAeH4uE",
            "type": "action",
            "label": "Análise da Avaliação de Risco",
            "x": 3101,
            "y": 571,
            "w": 162,
            "h": 42,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Análise da Avaliação de Risco - Caracterização - Responsável Técnico - VPP unLMpZGGAqAeH4uE",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "HXLMpZGGAqAeH4uT",
            "type": "action",
            "label": "Análise das incertezas associadas à Avaliação de Risco realizada",
            "x": 3088,
            "y": 311,
            "w": 180,
            "h": 54,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Análise das incertezas associadas à Avaliação de Risco realizada - Caracterização - Responsável Técnico - VPP HXLMpZGGAqAeH4uT",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "YPLMpZGGAqAeH4ui",
            "type": "action",
            "label": "Proposta de Plano de Monitoramento para Encerramento",
            "x": 3101,
            "y": 712,
            "w": 162,
            "h": 58,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Proposta de Plano de Monitoramento para Encerramento - Caracterização - Responsável Técnico - VPP YPLMpZGGAqAeH4ui",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "svLMpZGGAqAeH4ux",
            "type": "action",
            "label": "Identificar as unidades de exposição;",
            "x": 2693,
            "y": 511,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Identificar as unidades de exposição; - Caracterização - Responsável Técnico - VPP svLMpZGGAqAeH4ux",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "qw8cpZGGAqAeH1Kb",
            "type": "action",
            "label": "Coleta de Dados e Campo e Amostras",
            "x": 1067,
            "y": 1135,
            "w": 150,
            "h": 60,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Coleta de Dados e Campo e Amostras - Caracterização - Campo - VPP qw8cpZGGAqAeH1Kb",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "8WqcpZGGAqAeH18H",
            "type": "action",
            "label": "Pré Campo / Instalação dos pontos de monitoramento",
            "x": 1068,
            "y": 975,
            "w": 150,
            "h": 64,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Pré Campo / Instalação dos pontos de monitoramento - Caracterização - Campo - VPP 8WqcpZGGAqAeH18H",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "nSmCpZGGAqAeH7Rz",
            "type": "action",
            "label": "Acondicionamento e Transporte",
            "x": 1071,
            "y": 1215,
            "w": 146,
            "h": 50,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Acondicionamento e Transporte - Caracterização - Campo - VPP nSmCpZGGAqAeH7Rz",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "xoRipZGGAqAeHzcW",
            "type": "action",
            "label": "Recebimento Resultados Laboratoriais / QAQC",
            "x": 1451,
            "y": 811,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Recebimento Resultados Laboratoriais / QAQC - Caracterização - Responsável Técnico - VPP xoRipZGGAqAeHzcW",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "ky9apZGGAqAeH3aX",
            "type": "action",
            "label": "Compilação de Dados",
            "x": 1071,
            "y": 1835,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Compilação de Dados - Caracterização - Atividades Especializadas - VPP ky9apZGGAqAeH3aX",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "tzu2pZGGAqAeH987",
            "type": "action",
            "label": "Definição dos métodos de investigação e amostragem utilizados;",
            "x": 1187,
            "y": 508,
            "w": 146,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Definição dos métodos de investigação e amostragem utilizados; - Caracterização - Responsável Técnico - VPP tzu2pZGGAqAeH987",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "plxw5ZGGAqAeH4te",
            "type": "action",
            "label": "Identificação de Evidências do Passivo Ambiental",
            "x": 154,
            "y": 78,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Resp. Legal",
            "phase": "Detecção",
            "contextLabel": "Identificação de Evidências do Passivo Ambiental - Detecção - Resp. Legal - VPP plxw5ZGGAqAeH4te",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "GoT45ZGGAqAeH6PZ",
            "type": "action",
            "label": "Documentação fotográfica relativa aos serviços de campo;",
            "x": 1951,
            "y": 1075,
            "w": 156,
            "h": 53,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Documentação fotográfica relativa aos serviços de campo; - Caracterização - Campo - VPP GoT45ZGGAqAeH6PZ",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "9YT45ZGGAqAeH6Po",
            "type": "action",
            "label": "Coleta de Dados e Campo e Amostras",
            "x": 1951,
            "y": 1141,
            "w": 150,
            "h": 60,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Coleta de Dados e Campo e Amostras - Caracterização - Campo - VPP 9YT45ZGGAqAeH6Po",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "X4T45ZGGAqAeH6P3",
            "type": "action",
            "label": "Pré Campo / Instalação dos pontos de monitoramento",
            "x": 1951,
            "y": 985,
            "w": 150,
            "h": 64,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Pré Campo / Instalação dos pontos de monitoramento - Caracterização - Campo - VPP X4T45ZGGAqAeH6P3",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "tkT45ZGGAqAeH6QL",
            "type": "action",
            "label": "Acondicionamento e Transporte",
            "x": 1953,
            "y": 1221,
            "w": 146,
            "h": 50,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Acondicionamento e Transporte - Caracterização - Campo - VPP tkT45ZGGAqAeH6QL",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "R0T45ZGGAqAeH6Qk",
            "type": "action",
            "label": "Destinação de Materiais e Resíduos",
            "x": 1953,
            "y": 1301,
            "w": 140,
            "h": 64,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Caracterização",
            "contextLabel": "Destinação de Materiais e Resíduos - Caracterização - Campo - VPP R0T45ZGGAqAeH6Qk",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "ZoaE5ZGGAqAeHxRo",
            "type": "action",
            "label": "Recebimentos das Amostras",
            "x": 1951,
            "y": 1405,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Caracterização",
            "contextLabel": "Recebimentos das Amostras - Caracterização - Laboratório - VPP ZoaE5ZGGAqAeHxRo",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "JYaE5ZGGAqAeHxRu",
            "type": "action",
            "label": "Preparo",
            "x": 1951,
            "y": 1461,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Caracterização",
            "contextLabel": "Preparo - Caracterização - Laboratório - VPP JYaE5ZGGAqAeHxRu",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "QEaE5ZGGAqAeHxR5",
            "type": "action",
            "label": "Execução das Corridas Analíticas",
            "x": 1951,
            "y": 1511,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Caracterização",
            "contextLabel": "Execução das Corridas Analíticas - Caracterização - Laboratório - VPP QEaE5ZGGAqAeHxR5",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "ZkaE5ZGGAqAeHxSE",
            "type": "action",
            "label": "Preparação dos Laudos analíticos",
            "x": 1957,
            "y": 1605,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Caracterização",
            "contextLabel": "Preparação dos Laudos analíticos - Caracterização - Laboratório - VPP ZkaE5ZGGAqAeHxSE",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "CNqk5ZGGAqAeH7cL",
            "type": "action",
            "label": "Execução da investigação de alta resolução",
            "x": 1821,
            "y": 1835,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Execução da investigação de alta resolução - Caracterização - Atividades Especializadas - VPP CNqk5ZGGAqAeH7cL",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "tdRk5ZGGAqAeHxzR",
            "type": "action",
            "label": "Representação Resultados Alta resolução",
            "x": 1821,
            "y": 1921,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Representação Resultados Alta resolução - Caracterização - Atividades Especializadas - VPP tdRk5ZGGAqAeHxzR",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "ZGtM5ZGGAqAeH4d9",
            "type": "action",
            "label": "Compilação de Dados",
            "x": 2081,
            "y": 1845,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Compilação de Dados - Caracterização - Atividades Especializadas - VPP ZGtM5ZGGAqAeH4d9",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "ddmc5ZGGAqAeH2Ya",
            "type": "action",
            "label": "Plano de Amostragem / Elaboração de Cadeias de Custódia",
            "x": 1941,
            "y": 855,
            "w": 130,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Caracterização",
            "contextLabel": "Plano de Amostragem / Elaboração de Cadeias de Custódia - Caracterização - Responsável Técnico - VPP ddmc5ZGGAqAeH2Ya",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "yi025ZGGAqAeH.X6",
            "type": "action",
            "label": "Planta e seções, com a localização e dimensionamento das fontes",
            "x": 2077,
            "y": 1918,
            "w": 124,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Planta e seções, com a localização e dimensionamento das fontes - Caracterização - Atividades Especializadas - VPP yi025ZGGAqAeH.X6",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "bS025ZGGAqAeH.YJ",
            "type": "action",
            "label": "Georreferenciamento pontos de amostragem",
            "x": 2077,
            "y": 1991,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Georreferenciamento pontos de amostragem - Caracterização - Atividades Especializadas - VPP bS025ZGGAqAeH.YJ",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "eVR25ZGGAqAeHy0b",
            "type": "action",
            "label": "Tebelamento de dados de poços de monitoramento",
            "x": 2073,
            "y": 2078,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Tebelamento de dados de poços de monitoramento - Caracterização - Atividades Especializadas - VPP eVR25ZGGAqAeHy0b",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "Ys125ZGGAqAeH0h2",
            "type": "action",
            "label": "Representação do perfil de cada sondagem realizada",
            "x": 2073,
            "y": 2152,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Representação do perfil de cada sondagem realizada - Caracterização - Atividades Especializadas - VPP Ys125ZGGAqAeH0h2",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "dc125ZGGAqAeH0iF",
            "type": "action",
            "label": "Perfil construtivo dos poços de monitoramento instalados",
            "x": 2073,
            "y": 2232,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Perfil construtivo dos poços de monitoramento instalados - Caracterização - Atividades Especializadas - VPP dc125ZGGAqAeH0iF",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "Veb25ZGGAqAeH2cF",
            "type": "action",
            "label": "Mapa potenciométrico",
            "x": 2261,
            "y": 1901,
            "w": 124,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Mapa potenciométrico - Caracterização - Atividades Especializadas - VPP Veb25ZGGAqAeH2cF",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "OAoO5ZGGAqAeH4tw",
            "type": "action",
            "label": "Interpretação dos resultados das análises químicas das amostras coletadas (plumas, etc.)",
            "x": 2257,
            "y": 2011,
            "w": 126,
            "h": 78,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Caracterização",
            "contextLabel": "Interpretação dos resultados das análises químicas das amostras coletadas (plumas, etc.) - Caracterização - Atividades Especializadas - VPP OAoO5ZGGAqAeH4tw",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "crl.5ZGGAqAeH8aS",
            "type": "action",
            "label": "Comunicação ao órgão ambiental",
            "x": 70,
            "y": 2495,
            "w": 150,
            "h": 55,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Detecção",
            "contextLabel": "Comunicação ao órgão ambiental - Detecção - Órgãos Públicos - VPP crl.5ZGGAqAeH8aS",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "0vT.5ZGGAqAeH9.P",
            "type": "action",
            "label": "Inclusão como Área com Potencial de Contaminação (AP)",
            "x": 70,
            "y": 2573,
            "w": 150,
            "h": 55,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Detecção",
            "contextLabel": "Inclusão como Área com Potencial de Contaminação (AP) - Detecção - Órgãos Públicos - VPP 0vT.5ZGGAqAeH9.P",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "GESB5ZGGAqAeHx_m",
            "type": "action",
            "label": "Inclusão como Área Suspeita de Contaminação (AS)",
            "x": 806,
            "y": 2625,
            "w": 150,
            "h": 55,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Detecção",
            "contextLabel": "Inclusão como Área Suspeita de Contaminação (AS) - Detecção - Órgãos Públicos - VPP GESB5ZGGAqAeHx_m",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "QoOh5ZGGAqAeH2oB",
            "type": "action",
            "label": "Inclusão como Área Contaminada sob Investigação (ACI)",
            "x": 1607,
            "y": 2621,
            "w": 150,
            "h": 55,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Caracterização",
            "contextLabel": "Inclusão como Área Contaminada sob Investigação (ACI) - Caracterização - Órgãos Públicos - VPP QoOh5ZGGAqAeH2oB",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "067h5ZGGAqAeH7K5",
            "type": "action",
            "label": "Inclusão como Área Contaminada com Risco Confirmado (ACRi)",
            "x": 2947,
            "y": 2748,
            "w": 150,
            "h": 55,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Caracterização",
            "contextLabel": "Inclusão como Área Contaminada com Risco Confirmado (ACRi) - Caracterização - Órgãos Públicos - VPP 067h5ZGGAqAeH7K5",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "eckR5ZGGAqAeH.JD",
            "type": "action",
            "label": "Inclusão como Área em Processo de Monitoramento para Encerramento (AME)",
            "x": 5219,
            "y": 2600,
            "w": 150,
            "h": 55,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Acompanhamento",
            "contextLabel": "Inclusão como Área em Processo de Monitoramento para Encerramento (AME) - Acompanhamento - Órgãos Públicos - VPP eckR5ZGGAqAeH.JD",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "aJ3J5ZGGAqAeHxr3",
            "type": "action",
            "label": "Mobilização para Elaboração do Acompanhamento",
            "x": 4827,
            "y": 136,
            "w": 150,
            "h": 64,
            "color": "#ffc080",
            "lane": "Resp. Legal",
            "phase": "Acompanhamento",
            "contextLabel": "Mobilização para Elaboração do Acompanhamento - Acompanhamento - Resp. Legal - VPP aJ3J5ZGGAqAeHxr3",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": ".uaZ5ZGGAqAeH9RL",
            "type": "action",
            "label": "Inclusão como Área em Processo de Monitoramento para Encerramento (AME)",
            "x": 3121,
            "y": 2748,
            "w": 150,
            "h": 55,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Caracterização",
            "contextLabel": "Inclusão como Área em Processo de Monitoramento para Encerramento (AME) - Caracterização - Órgãos Públicos - VPP .uaZ5ZGGAqAeH9RL",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "A1dmFZGGAqAeHxo9",
            "type": "action",
            "label": "Planejamento para Gerenciamento da Elaboração do Plano de Invervenção",
            "x": 3344,
            "y": 314,
            "w": 148,
            "h": 88,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Planejamento para Gerenciamento da Elaboração do Plano de Invervenção - Remediação - Responsável Técnico - VPP A1dmFZGGAqAeHxo9",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "Ot9mFZGGAqAeHxxT",
            "type": "action",
            "label": "Planejamento para Gerenciamento da Implementação do Plano de Invervenção",
            "x": 4154,
            "y": 314,
            "w": 148,
            "h": 76,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Planejamento para Gerenciamento da Implementação do Plano de Invervenção - Remediação - Responsável Técnico - VPP Ot9mFZGGAqAeHxxT",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "85PJFZGGAqAeH13G",
            "type": "action",
            "label": "Medidas destinadas ao controle ou à eliminação das fontes",
            "x": 3840,
            "y": 1861,
            "w": 108,
            "h": 96,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "Medidas destinadas ao controle ou à eliminação das fontes - Remediação - Atividades Especializadas - VPP 85PJFZGGAqAeH13G",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "2LpFFZGGAqAeH7Km",
            "type": "action",
            "label": "Compilação e Avaliação do  Projeto Executivo do Sistema de Remediação",
            "x": 3910,
            "y": 464,
            "w": 182,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Compilação e Avaliação do  Projeto Executivo do Sistema de Remediação - Remediação - Responsável Técnico - VPP 2LpFFZGGAqAeH7Km",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "XecDFZGGAqAeH6l2",
            "type": "action",
            "label": "Conjunto de Relatórios para Órgão Ambiental",
            "x": 3910,
            "y": 561,
            "w": 182,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Remediação",
            "contextLabel": "Conjunto de Relatórios para Órgão Ambiental - Remediação - Responsável Técnico - VPP XecDFZGGAqAeH6l2",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "S7xjFZGGAqAeH2od",
            "type": "action",
            "label": "Mobilização e Instalação dos Sistemas",
            "x": 4197,
            "y": 1861,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Remediação",
            "contextLabel": "Mobilização e Instalação dos Sistemas - Remediação - Atividades Especializadas - VPP S7xjFZGGAqAeH2od",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "O2gTFZGGAqAeH6Ku",
            "type": "action",
            "label": "Conjunto de Relatórios para Órgão Ambiental",
            "x": 5195,
            "y": 691,
            "w": 182,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Conjunto de Relatórios para Órgão Ambiental - Acompanhamento - Responsável Técnico - VPP O2gTFZGGAqAeH6Ku",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "XwvTFZGGAqAeHwkr",
            "type": "action",
            "label": "Alterações nos cenários de risco",
            "x": 4823,
            "y": 398,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Alterações nos cenários de risco - Acompanhamento - Responsável Técnico - VPP XwvTFZGGAqAeHwkr",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "dnQzFZGGAqAeHxZY",
            "type": "action",
            "label": "Alterações nos critérios de avaliação de eficácia e eficiência",
            "x": 4823,
            "y": 476,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Alterações nos critérios de avaliação de eficácia e eficiência - Acompanhamento - Responsável Técnico - VPP dnQzFZGGAqAeHxZY",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "wp8zFZGGAqAeHx8W",
            "type": "action",
            "label": "Acidentes ou outros episódios",
            "x": 4827,
            "y": 648,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Acidentes ou outros episódios - Acompanhamento - Responsável Técnico - VPP wp8zFZGGAqAeHx8W",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "dnmzFZGGAqAeHzos",
            "type": "action",
            "label": "Relatórios referentes à manutenção do sistema de remediação",
            "x": 4827,
            "y": 724,
            "w": 108,
            "h": 80,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Relatórios referentes à manutenção do sistema de remediação - Acompanhamento - Responsável Técnico - VPP dnmzFZGGAqAeHzos",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "cTezFZGGAqAeH0Kl",
            "type": "action",
            "label": "Alterações de layout ou alterações funcionais",
            "x": 5035,
            "y": 398,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Alterações de layout ou alterações funcionais - Acompanhamento - Responsável Técnico - VPP cTezFZGGAqAeH0Kl",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "SvJzFZGGAqAeH0qd",
            "type": "action",
            "label": "Representação gráfica da evolução das plumas de contaminação",
            "x": 4847,
            "y": 2040,
            "w": 108,
            "h": 96,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Acompanhamento",
            "contextLabel": "Representação gráfica da evolução das plumas de contaminação - Acompanhamento - Atividades Especializadas - VPP SvJzFZGGAqAeH0qd",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "YtDzFZGGAqAeH2Z.",
            "type": "action",
            "label": "Relatório de Acompanhamento das Medidas de Engenharia",
            "x": 5231,
            "y": 520,
            "w": 108,
            "h": 68,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Relatório de Acompanhamento das Medidas de Engenharia - Acompanhamento - Responsável Técnico - VPP YtDzFZGGAqAeH2Z.",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "wqrzFZGGAqAeH26T",
            "type": "action",
            "label": "Relatório de Acompanhamento das Medidas de Controle Institucional",
            "x": 5221,
            "y": 608,
            "w": 136,
            "h": 68,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Relatório de Acompanhamento das Medidas de Controle Institucional - Acompanhamento - Responsável Técnico - VPP wqrzFZGGAqAeH26T",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "rh4LFZGGAqAeH5nn",
            "type": "action",
            "label": "Recebimento dos resultados do monitoramento da eficiência e eficácia",
            "x": 4999,
            "y": 848,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Recebimento dos resultados do monitoramento da eficiência e eficácia - Acompanhamento - Responsável Técnico - VPP rh4LFZGGAqAeH5nn",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "UUUHFZGGAqAeH12Y",
            "type": "action",
            "label": "Alteraração da classificação da área \npara Área Contaminada em Processo de Reutilização (ACRu)",
            "x": 4228,
            "y": 2628,
            "w": 136,
            "h": 84,
            "color": "#ffc080",
            "lane": "Órgãos Públicos",
            "phase": "Remediação",
            "contextLabel": "Alteraração da classificação da área \npara Área Contaminada em Processo de Reutilização (ACRu) - Remediação - Órgãos Públicos - VPP UUUHFZGGAqAeH12Y",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "n7KnFZGGAqAeH8zg",
            "type": "action",
            "label": "Mobilização para Encerramento",
            "x": 5450,
            "y": 135,
            "w": 150,
            "h": 64,
            "color": "#ffc080",
            "lane": "Resp. Legal",
            "phase": "Fechamento",
            "contextLabel": "Mobilização para Encerramento - Fechamento - Resp. Legal - VPP n7KnFZGGAqAeH8zg",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "XxJXFZGGAqAeHzMw",
            "type": "action",
            "label": "Planejamento para Gerenciamento do Acompanhamento",
            "x": 4807,
            "y": 304,
            "w": 148,
            "h": 76,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Planejamento para Gerenciamento do Acompanhamento - Acompanhamento - Responsável Técnico - VPP XxJXFZGGAqAeHzMw",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "Ij23FZGGAqAeH2FZ",
            "type": "action",
            "label": "Planejamento para Gerenciamento do Encerramento",
            "x": 5431,
            "y": 304,
            "w": 148,
            "h": 76,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Fechamento",
            "contextLabel": "Planejamento para Gerenciamento do Encerramento - Fechamento - Responsável Técnico - VPP Ij23FZGGAqAeH2FZ",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "PEl3FZGGAqAeH38e",
            "type": "action",
            "label": "Recebimentos das Amostras",
            "x": 4851,
            "y": 1420,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Acompanhamento",
            "contextLabel": "Recebimentos das Amostras - Acompanhamento - Laboratório - VPP PEl3FZGGAqAeH38e",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "Kkl3FZGGAqAeH38k",
            "type": "action",
            "label": "Preparo",
            "x": 4849,
            "y": 1474,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Acompanhamento",
            "contextLabel": "Preparo - Acompanhamento - Laboratório - VPP Kkl3FZGGAqAeH38k",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "EUl3FZGGAqAeH380",
            "type": "action",
            "label": "Execução das Corridas Analíticas",
            "x": 4849,
            "y": 1540,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Acompanhamento",
            "contextLabel": "Execução das Corridas Analíticas - Acompanhamento - Laboratório - VPP EUl3FZGGAqAeH380",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": ".Ul3FZGGAqAeH38_",
            "type": "action",
            "label": "Preparação dos Laudos analíticos",
            "x": 4853,
            "y": 1620,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Acompanhamento",
            "contextLabel": "Preparação dos Laudos analíticos - Acompanhamento - Laboratório - VPP .Ul3FZGGAqAeH38_",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "7Ul3FZGGAqAeH39O",
            "type": "action",
            "label": "Documentação fotográfica relativa aos serviços de campo;",
            "x": 4865,
            "y": 1100,
            "w": 156,
            "h": 53,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Acompanhamento",
            "contextLabel": "Documentação fotográfica relativa aos serviços de campo; - Acompanhamento - Campo - VPP 7Ul3FZGGAqAeH39O",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "y0l3FZGGAqAeH39d",
            "type": "action",
            "label": "Coleta de Dados e Campo e Amostras",
            "x": 4865,
            "y": 1166,
            "w": 150,
            "h": 60,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Acompanhamento",
            "contextLabel": "Coleta de Dados e Campo e Amostras - Acompanhamento - Campo - VPP y0l3FZGGAqAeH39d",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "V0l3FZGGAqAeH39s",
            "type": "action",
            "label": "Pré Campo / Instalação dos pontos de monitoramento",
            "x": 4867,
            "y": 1004,
            "w": 150,
            "h": 64,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Acompanhamento",
            "contextLabel": "Pré Campo / Instalação dos pontos de monitoramento - Acompanhamento - Campo - VPP V0l3FZGGAqAeH39s",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "hMl3FZGGAqAeH3.A",
            "type": "action",
            "label": "Acondicionamento e Transporte",
            "x": 4871,
            "y": 1242,
            "w": 146,
            "h": 50,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Acompanhamento",
            "contextLabel": "Acondicionamento e Transporte - Acompanhamento - Campo - VPP hMl3FZGGAqAeH3.A",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "ysl3FZGGAqAeH3.e",
            "type": "action",
            "label": "Destinação de Materiais e Resíduos",
            "x": 4865,
            "y": 1308,
            "w": 140,
            "h": 64,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Acompanhamento",
            "contextLabel": "Destinação de Materiais e Resíduos - Acompanhamento - Campo - VPP ysl3FZGGAqAeH3.e",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "i7iPFZGGAqAeH8LY",
            "type": "action",
            "label": "Plano de Amostragem / Elaboração de Cadeias de Custódia",
            "x": 4827,
            "y": 866,
            "w": 130,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Acompanhamento",
            "contextLabel": "Plano de Amostragem / Elaboração de Cadeias de Custódia - Acompanhamento - Responsável Técnico - VPP i7iPFZGGAqAeH8LY",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "RKavFZGGAqAeH4_0",
            "type": "action",
            "label": "Recebimento dos resultados do monitoramento da eficiência e eficácia",
            "x": 5795,
            "y": 832,
            "w": 107,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Fechamento",
            "contextLabel": "Recebimento dos resultados do monitoramento da eficiência e eficácia - Fechamento - Responsável Técnico - VPP RKavFZGGAqAeH4_0",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "MGavFZGGAqAeH5AD",
            "type": "action",
            "label": "Recebimentos das Amostras",
            "x": 5465,
            "y": 1404,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Fechamento",
            "contextLabel": "Recebimentos das Amostras - Fechamento - Laboratório - VPP MGavFZGGAqAeH5AD",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "8mavFZGGAqAeH5AI",
            "type": "action",
            "label": "Preparo",
            "x": 5464,
            "y": 1458,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Fechamento",
            "contextLabel": "Preparo - Fechamento - Laboratório - VPP 8mavFZGGAqAeH5AI",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "vuavFZGGAqAeH5AX",
            "type": "action",
            "label": "Execução das Corridas Analíticas",
            "x": 5464,
            "y": 1524,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Fechamento",
            "contextLabel": "Execução das Corridas Analíticas - Fechamento - Laboratório - VPP vuavFZGGAqAeH5AX",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "bBavFZGGAqAeH5Ah",
            "type": "action",
            "label": "Preparação dos Laudos analíticos",
            "x": 5468,
            "y": 1604,
            "w": 150,
            "h": 40,
            "color": "#ffc080",
            "lane": "Laboratório",
            "phase": "Fechamento",
            "contextLabel": "Preparação dos Laudos analíticos - Fechamento - Laboratório - VPP bBavFZGGAqAeH5Ah",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "CRavFZGGAqAeH5Am",
            "type": "action",
            "label": "Documentação fotográfica relativa aos serviços de campo;",
            "x": 5480,
            "y": 1084,
            "w": 156,
            "h": 53,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Fechamento",
            "contextLabel": "Documentação fotográfica relativa aos serviços de campo; - Fechamento - Campo - VPP CRavFZGGAqAeH5Am",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "FxavFZGGAqAeH5Ar",
            "type": "action",
            "label": "Coleta de Dados e Campo e Amostras",
            "x": 5480,
            "y": 1150,
            "w": 150,
            "h": 60,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Fechamento",
            "contextLabel": "Coleta de Dados e Campo e Amostras - Fechamento - Campo - VPP FxavFZGGAqAeH5Ar",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "opavFZGGAqAeH5Aw",
            "type": "action",
            "label": "Pré Campo / Instalação dos pontos de monitoramento",
            "x": 5481,
            "y": 988,
            "w": 150,
            "h": 64,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Fechamento",
            "contextLabel": "Pré Campo / Instalação dos pontos de monitoramento - Fechamento - Campo - VPP opavFZGGAqAeH5Aw",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "0FavFZGGAqAeH5A6",
            "type": "action",
            "label": "Acondicionamento e Transporte",
            "x": 5485,
            "y": 1225,
            "w": 146,
            "h": 50,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Fechamento",
            "contextLabel": "Acondicionamento e Transporte - Fechamento - Campo - VPP 0FavFZGGAqAeH5A6",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "k1avFZGGAqAeH5BE",
            "type": "action",
            "label": "Destinação de Materiais e Resíduos",
            "x": 5480,
            "y": 1294,
            "w": 140,
            "h": 64,
            "color": "#ffc080",
            "lane": "Campo",
            "phase": "Fechamento",
            "contextLabel": "Destinação de Materiais e Resíduos - Fechamento - Campo - VPP k1avFZGGAqAeH5BE",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": ".NavFZGGAqAeH5BJ",
            "type": "action",
            "label": "Plano de Amostragem / Elaboração de Cadeias de Custódia",
            "x": 5441,
            "y": 850,
            "w": 130,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Fechamento",
            "contextLabel": "Plano de Amostragem / Elaboração de Cadeias de Custódia - Fechamento - Responsável Técnico - VPP .NavFZGGAqAeH5BJ",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "DvRvFZGGAqAeH5v4",
            "type": "action",
            "label": "Avaliação de dados e Produção de Relatório para Órgão Ambiental com propósito de reabilitação da área",
            "x": 5945,
            "y": 370,
            "w": 182,
            "h": 64,
            "color": "#ffc080",
            "lane": "Responsável Técnico",
            "phase": "Fechamento",
            "contextLabel": "Avaliação de dados e Produção de Relatório para Órgão Ambiental com propósito de reabilitação da área - Fechamento - Responsável Técnico - VPP DvRvFZGGAqAeH5v4",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        },
        {
            "id": "yPjvFZGGAqAeH7rC",
            "type": "action",
            "label": "Representação gráfica da evolução das plumas de contaminação",
            "x": 5480,
            "y": 1868,
            "w": 108,
            "h": 96,
            "color": "#ffc080",
            "lane": "Atividades Especializadas",
            "phase": "Fechamento",
            "contextLabel": "Representação gráfica da evolução das plumas de contaminação - Fechamento - Atividades Especializadas - VPP yPjvFZGGAqAeH7rC",
            "sourceFormat": "visual-paradigm-vpp",
            "sourceFile": "01_DadosAnaliticos.vpp"
        }
    ],
    "edges": [
        {
            "from": "ECg8AZGGAqACZwnO",
            "to": "7ji8AZGGAqACZwoO",
            "points": [
                [
                    1077,
                    1495
                ],
                [
                    1077,
                    1511
                ]
            ]
        },
        {
            "from": "2VuVAZGGAqACZ2Jl",
            "to": "3cE1AZGGAqACZ6.g",
            "points": [
                [
                    1679,
                    724
                ],
                [
                    1679,
                    2482
                ]
            ]
        },
        {
            "from": "B2sURZGGAqAeHxCO",
            "to": "RQHURZGGAqAeHycC",
            "points": [
                [
                    898,
                    2518
                ],
                [
                    942,
                    2518
                ]
            ]
        },
        {
            "from": "TPK4JZGGAqAeH0LM",
            "to": "FrB4JZGGAqAeH1ea",
            "points": [
                [
                    584,
                    94
                ],
                [
                    717,
                    94
                ],
                [
                    717,
                    273
                ],
                [
                    167,
                    273
                ],
                [
                    167,
                    334
                ],
                [
                    192,
                    335
                ]
            ]
        },
        {
            "from": "yMO4JZGGAqAeH0yc",
            "to": "FrB4JZGGAqAeH1ea",
            "points": [
                [
                    166,
                    1961
                ],
                [
                    166,
                    334
                ],
                [
                    192,
                    335
                ]
            ]
        },
        {
            "from": "uQiMJZGGAqAeH4xE",
            "to": "kJ_MJZGGAqAeH.fP",
            "points": [
                [
                    349,
                    1949
                ],
                [
                    349,
                    1963
                ]
            ]
        },
        {
            "from": "kJ_MJZGGAqAeH.fP",
            "to": "0iiMJZGGAqAeH4y2",
            "points": [
                [
                    364,
                    2019
                ],
                [
                    364,
                    2037
                ]
            ]
        },
        {
            "from": "0iiMJZGGAqAeH4y2",
            "to": "b_CMJZGGAqAeH4wT",
            "points": [
                [
                    367,
                    2088
                ],
                [
                    367,
                    2103
                ]
            ]
        },
        {
            "from": "b_CMJZGGAqAeH4wT",
            "to": "7oiMJZGGAqAeH4xz",
            "points": [
                [
                    368,
                    2154
                ],
                [
                    368,
                    2173
                ]
            ]
        },
        {
            "from": "IzicJZGGAqAeH3IT",
            "to": "uQiMJZGGAqAeH4xE",
            "points": [
                [
                    241,
                    716
                ],
                [
                    241,
                    1911
                ],
                [
                    295,
                    1910
                ]
            ]
        },
        {
            "from": "7oiMJZGGAqAeH4xz",
            "to": "kPCMJZGGAqAeH4vm",
            "points": [
                [
                    429,
                    2177
                ],
                [
                    465,
                    2177
                ],
                [
                    465,
                    1892
                ],
                [
                    482,
                    1892
                ]
            ]
        },
        {
            "from": "kPCMJZGGAqAeH4vm",
            "to": "rSRKJZGGAqAeH7Ml",
            "points": [
                [
                    541,
                    1939
                ],
                [
                    541,
                    2048
                ]
            ]
        },
        {
            "from": "rSRKJZGGAqAeH7Ml",
            "to": "ngOKJZGGAqAeH7MS",
            "points": [
                [
                    571,
                    2089
                ],
                [
                    571,
                    2113
                ]
            ]
        },
        {
            "from": "ngOKJZGGAqAeH7MS",
            "to": "_87KJZGGAqAeH7Oa",
            "points": [
                [
                    626,
                    2127
                ],
                [
                    698,
                    2127
                ],
                [
                    698,
                    472
                ],
                [
                    689,
                    473
                ]
            ]
        },
        {
            "from": "RQHURZGGAqAeHycC",
            "to": "PModAZGGAqACZwnJ",
            "points": [
                [
                    949,
                    2553
                ],
                [
                    949,
                    2587
                ],
                [
                    727,
                    2587
                ],
                [
                    727,
                    745
                ],
                [
                    742,
                    745
                ]
            ]
        },
        {
            "from": "_87KJZGGAqAeH7Oa",
            "to": "daweJZGGAqAeH.RR",
            "points": [
                [
                    689,
                    443
                ],
                [
                    747,
                    443
                ]
            ]
        },
        {
            "from": "daweJZGGAqAeH.RR",
            "to": "Z74eJZGGAqAeH.Wz",
            "points": [
                [
                    849,
                    477
                ],
                [
                    849,
                    496
                ]
            ]
        },
        {
            "from": "Z74eJZGGAqAeH.Wz",
            "to": "WX4eJZGGAqAeH.XC",
            "points": [
                [
                    848,
                    552
                ],
                [
                    848,
                    567
                ]
            ]
        },
        {
            "from": "WX4eJZGGAqAeH.XC",
            "to": "3T5OJZGGAqAeH8wP",
            "points": [
                [
                    848,
                    624
                ],
                [
                    848,
                    649
                ]
            ]
        },
        {
            "from": "3T5OJZGGAqAeH8wP",
            "to": "PModAZGGAqACZwnJ",
            "points": [
                [
                    846,
                    705
                ],
                [
                    846,
                    732
                ]
            ]
        },
        {
            "from": "PModAZGGAqACZwnJ",
            "to": "B2sURZGGAqAeHxCO",
            "points": [
                [
                    831,
                    786
                ],
                [
                    831,
                    2499
                ]
            ]
        },
        {
            "from": "Dc61AZGGAqACZ8Qf",
            "to": "72WlJZGGAqAeH7yo",
            "points": [
                [
                    1117,
                    142
                ],
                [
                    1117,
                    311
                ]
            ]
        },
        {
            "from": "3cE1AZGGAqACZ6.g",
            "to": "h9P1AZGGAqACZ.Za",
            "points": [
                [
                    1709,
                    2502
                ],
                [
                    1727,
                    2502
                ]
            ]
        },
        {
            "from": "LTyTJZGGAqAeH3fG",
            "to": "0zyTJZGGAqAeH3fM",
            "points": [
                [
                    2605,
                    2503
                ],
                [
                    2628,
                    2503
                ]
            ]
        },
        {
            "from": "ZjNTJZGGAqAeH32M",
            "to": "fjNTJZGGAqAeH32S",
            "points": [
                [
                    3185,
                    2501
                ],
                [
                    3225,
                    2501
                ]
            ]
        },
        {
            "from": "QoOh5ZGGAqAeH2oB",
            "to": "y4ejJZGGAqAeH1sC",
            "points": [
                [
                    1757,
                    2629
                ],
                [
                    1798,
                    2629
                ],
                [
                    1798,
                    142
                ]
            ]
        },
        {
            "from": "h9P1AZGGAqACZ.Za",
            "to": "2VuVAZGGAqACZ2Jl",
            "points": [
                [
                    1736,
                    2531
                ],
                [
                    1736,
                    2579
                ],
                [
                    1592,
                    2579
                ],
                [
                    1592,
                    687
                ],
                [
                    1661,
                    687
                ]
            ]
        },
        {
            "from": "CSNbJZGGAqAeH6YT",
            "to": "LTyTJZGGAqAeH3fG",
            "points": [
                [
                    2558,
                    911
                ],
                [
                    2558,
                    2482
                ]
            ]
        },
        {
            "from": "oTtbJZGGAqAeH6t9",
            "to": "ZjNTJZGGAqAeH32M",
            "points": [
                [
                    3117,
                    911
                ],
                [
                    3117,
                    2488
                ]
            ]
        },
        {
            "from": "0zyTJZGGAqAeH3fM",
            "to": "kSBjJZGGAqAeH17b",
            "points": [
                [
                    2660,
                    2505
                ],
                [
                    2660,
                    148
                ]
            ]
        },
        {
            "from": "067h5ZGGAqAeH7K5",
            "to": "Ub8wpZGGAqAeH2OA",
            "points": [
                [
                    3017,
                    2748
                ],
                [
                    3017,
                    2720
                ],
                [
                    3331,
                    2720
                ],
                [
                    3331,
                    145
                ],
                [
                    3344,
                    145
                ]
            ]
        },
        {
            "from": "0zyTJZGGAqAeH3fM",
            "to": "CSNbJZGGAqAeH6YT",
            "points": [
                [
                    2645,
                    2526
                ],
                [
                    2645,
                    2586
                ],
                [
                    2468,
                    2586
                ],
                [
                    2468,
                    872
                ],
                [
                    2501,
                    872
                ]
            ]
        },
        {
            "from": "fjNTJZGGAqAeH32S",
            "to": "oTtbJZGGAqAeH6t9",
            "points": [
                [
                    3227,
                    2517
                ],
                [
                    3227,
                    2588
                ],
                [
                    3068,
                    2588
                ],
                [
                    3068,
                    901
                ],
                [
                    3107,
                    901
                ]
            ]
        },
        {
            "from": "TahPJZGGAqAeHw6k",
            "to": "T6hPJZGGAqAeHw6x",
            "points": [
                [
                    4239,
                    2488
                ],
                [
                    4268,
                    2488
                ]
            ]
        },
        {
            "from": "FhxPJZGGAqAeHxBP",
            "to": "QRxPJZGGAqAeHxBV",
            "points": [
                [
                    5310,
                    2506
                ],
                [
                    5335,
                    2506
                ]
            ]
        },
        {
            "from": "xFpPJZGGAqAeHxF_",
            "to": "wlpPJZGGAqAeHxGF",
            "points": [
                [
                    5886,
                    2513
                ],
                [
                    5915,
                    2513
                ]
            ]
        },
        {
            "from": "wlpPJZGGAqAeHxGF",
            "to": "hopvJZGGAqAeH1GK",
            "points": [
                [
                    5940,
                    2512
                ],
                [
                    5998,
                    2512
                ]
            ]
        },
        {
            "from": "hopvJZGGAqAeH1GK",
            "to": "GP2vJZGGAqAeH0Yr",
            "points": [
                [
                    6104,
                    2542
                ],
                [
                    6185,
                    2542
                ]
            ]
        },
        {
            "from": "le5QpZGGAqAeH0E5",
            "to": "8.5QpZGGAqAeH0E_",
            "points": [
                [
                    4530,
                    2500
                ],
                [
                    4559,
                    2500
                ]
            ]
        },
        {
            "from": "8.5QpZGGAqAeH0E_",
            "to": "gFjQpZGGAqAeH0_s",
            "points": [
                [
                    4583,
                    2500
                ],
                [
                    4617,
                    2500
                ]
            ]
        },
        {
            "from": "xkCgpZGGAqAeH4ph",
            "to": "2VuVAZGGAqACZ2Jl",
            "points": [
                [
                    1728,
                    615
                ],
                [
                    1728,
                    648
                ]
            ]
        },
        {
            "from": "y4ejJZGGAqAeH1sC",
            "to": "A3KYpZGGAqAeH7DL",
            "points": [
                [
                    1872,
                    142
                ],
                [
                    1872,
                    301
                ]
            ]
        },
        {
            "from": "kSBjJZGGAqAeH17b",
            "to": "kFqYpZGGAqAeH7QP",
            "points": [
                [
                    2741,
                    148
                ],
                [
                    2741,
                    311
                ]
            ]
        },
        {
            "from": "oZTkpZGGAqAeH5ZU",
            "to": "CSNbJZGGAqAeH6YT",
            "points": [
                [
                    2553,
                    793
                ],
                [
                    2553,
                    835
                ]
            ]
        },
        {
            "from": "Vc1YpZGGAqAeH99X",
            "to": "oZTkpZGGAqAeH5ZU",
            "points": [
                [
                    2533,
                    690
                ],
                [
                    2533,
                    728
                ]
            ]
        },
        {
            "from": "kLUgpZGGAqAeH3pw",
            "to": "xkCgpZGGAqAeH4ph",
            "points": [
                [
                    1724,
                    530
                ],
                [
                    1724,
                    551
                ]
            ]
        },
        {
            "from": "2AUMpZGGAqAeH.pF",
            "to": "rgUMpZGGAqAeH.pU",
            "points": [
                [
                    2930,
                    2018
                ],
                [
                    2930,
                    2042
                ]
            ]
        },
        {
            "from": "rgUMpZGGAqAeH.pU",
            "to": "fQUMpZGGAqAeHwAD",
            "points": [
                [
                    2882,
                    2105
                ],
                [
                    2882,
                    2131
                ]
            ]
        },
        {
            "from": "7ji8AZGGAqACZwoO",
            "to": "jDUgpZGGAqAeH3pD",
            "points": [
                [
                    1086,
                    1551
                ],
                [
                    1086,
                    1601
                ]
            ]
        },
        {
            "from": "g27cAZGGAqACZwma",
            "to": "ECg8AZGGAqACZwnO",
            "points": [
                [
                    1101,
                    1445
                ],
                [
                    1101,
                    1455
                ]
            ]
        },
        {
            "from": "8WqcpZGGAqAeH18H",
            "to": "AzUgpZGGAqAeH3ph",
            "points": [
                [
                    1197,
                    1040
                ],
                [
                    1197,
                    1071
                ]
            ]
        },
        {
            "from": "JiLspZGGAqAeHyaT",
            "to": "njUgpZGGAqAeH3pS",
            "points": [
                [
                    1123,
                    800
                ],
                [
                    1123,
                    851
                ]
            ]
        },
        {
            "from": "nSmCpZGGAqAeH7Rz",
            "to": "3UCgpZGGAqAeH4pw",
            "points": [
                [
                    1077,
                    1264
                ],
                [
                    1077,
                    1281
                ]
            ]
        },
        {
            "from": "3UCgpZGGAqAeH4pw",
            "to": "g27cAZGGAqACZwma",
            "points": [
                [
                    1096,
                    1345
                ],
                [
                    1096,
                    1405
                ]
            ]
        },
        {
            "from": "njUgpZGGAqAeH3pS",
            "to": "8WqcpZGGAqAeH18H",
            "points": [
                [
                    1079,
                    915
                ],
                [
                    1079,
                    975
                ]
            ]
        },
        {
            "from": "JiLspZGGAqAeHyaT",
            "to": "8WqcpZGGAqAeH18H",
            "points": [
                [
                    1138,
                    786
                ],
                [
                    1206,
                    786
                ],
                [
                    1206,
                    975
                ]
            ]
        },
        {
            "from": "72WlJZGGAqAeH7yo",
            "to": "I3UgpZGGAqAeH3rK",
            "points": [
                [
                    1131,
                    368
                ],
                [
                    1131,
                    388
                ]
            ]
        },
        {
            "from": "I3UgpZGGAqAeH3rK",
            "to": "JiLspZGGAqAeHyaT",
            "points": [
                [
                    1121,
                    453
                ],
                [
                    1121,
                    762
                ]
            ]
        },
        {
            "from": "yjK1JZGGAqAeHw34",
            "to": "HnUgpZGGAqAeH3q7",
            "points": [
                [
                    1240,
                    701
                ],
                [
                    1240,
                    675
                ]
            ]
        },
        {
            "from": "jDUgpZGGAqAeH3pD",
            "to": "xoRipZGGAqAeHzcW",
            "points": [
                [
                    1108,
                    1641
                ],
                [
                    1108,
                    1748
                ],
                [
                    1521,
                    1748
                ],
                [
                    1521,
                    875
                ]
            ]
        },
        {
            "from": "AzUgpZGGAqAeH3ph",
            "to": "qw8cpZGGAqAeH1Kb",
            "points": [
                [
                    1187,
                    1124
                ],
                [
                    1187,
                    1135
                ]
            ]
        },
        {
            "from": "qw8cpZGGAqAeH1Kb",
            "to": "nSmCpZGGAqAeH7Rz",
            "points": [
                [
                    1076,
                    1195
                ],
                [
                    1076,
                    1216
                ]
            ]
        },
        {
            "from": "xoRipZGGAqAeHzcW",
            "to": "li8apZGGAqAeHzNc",
            "points": [
                [
                    1451,
                    849
                ],
                [
                    1433,
                    849
                ]
            ]
        },
        {
            "from": "li8apZGGAqAeHzNc",
            "to": "yjK1JZGGAqAeHw34",
            "points": [
                [
                    1416,
                    826
                ],
                [
                    1416,
                    722
                ],
                [
                    1332,
                    722
                ]
            ]
        },
        {
            "from": "ky9apZGGAqAeH3aX",
            "to": "tHUgpZGGAqAeH3qs",
            "points": [
                [
                    1147,
                    1900
                ],
                [
                    1147,
                    1918
                ]
            ]
        },
        {
            "from": "tHUgpZGGAqAeH3qs",
            "to": "UPUgpZGGAqAeH3rZ",
            "points": [
                [
                    1122,
                    1983
                ],
                [
                    1122,
                    1991
                ]
            ]
        },
        {
            "from": "li8apZGGAqAeHzNc",
            "to": "ky9apZGGAqAeH3aX",
            "points": [
                [
                    1418,
                    864
                ],
                [
                    1418,
                    1889
                ],
                [
                    1178,
                    1889
                ]
            ]
        },
        {
            "from": "UPUgpZGGAqAeH3rZ",
            "to": "R_UgpZGGAqAeH3sG",
            "points": [
                [
                    1123,
                    2055
                ],
                [
                    1123,
                    2078
                ]
            ]
        },
        {
            "from": "R_UgpZGGAqAeH3sG",
            "to": "rg0gpZGGAqAeH3sk",
            "points": [
                [
                    1118,
                    2143
                ],
                [
                    1118,
                    2162
                ]
            ]
        },
        {
            "from": "rg0gpZGGAqAeH3sk",
            "to": "CvUgpZGGAqAeH3ro",
            "points": [
                [
                    1099,
                    2227
                ],
                [
                    1099,
                    2248
                ]
            ]
        },
        {
            "from": "CvUgpZGGAqAeH3ro",
            "to": "VA0gpZGGAqAeH3sV",
            "points": [
                [
                    1123,
                    2313
                ],
                [
                    1123,
                    2338
                ]
            ]
        },
        {
            "from": "VA0gpZGGAqAeH3sV",
            "to": "stUgpZGGAqAeH3ol",
            "points": [
                [
                    1168,
                    2345
                ],
                [
                    1201,
                    2345
                ],
                [
                    1201,
                    1947
                ],
                [
                    1297,
                    1947
                ]
            ]
        },
        {
            "from": "stUgpZGGAqAeH3ol",
            "to": "l9UgpZGGAqAeH3o0",
            "points": [
                [
                    1340,
                    1980
                ],
                [
                    1340,
                    1998
                ]
            ]
        },
        {
            "from": "l9UgpZGGAqAeH3o0",
            "to": "mfUgpZGGAqAeH3r3",
            "points": [
                [
                    1357,
                    2076
                ],
                [
                    1357,
                    2118
                ]
            ]
        },
        {
            "from": "mfUgpZGGAqAeH3r3",
            "to": "kLUgpZGGAqAeH3pw",
            "points": [
                [
                    1416,
                    2157
                ],
                [
                    1576,
                    2157
                ],
                [
                    1576,
                    499
                ],
                [
                    1661,
                    499
                ]
            ]
        },
        {
            "from": "HnUgpZGGAqAeH3q7",
            "to": "tzu2pZGGAqAeH987",
            "points": [
                [
                    1231,
                    611
                ],
                [
                    1231,
                    573
                ]
            ]
        },
        {
            "from": "tzu2pZGGAqAeH987",
            "to": "njUgpZGGAqAeH3pS",
            "points": [
                [
                    1187,
                    539
                ],
                [
                    1053,
                    539
                ],
                [
                    1053,
                    852
                ]
            ]
        },
        {
            "from": "r1XUAZGGAqACZwX7",
            "to": "plxw5ZGGAqAeH4te",
            "points": [
                [
                    118,
                    95
                ],
                [
                    152,
                    95
                ]
            ]
        },
        {
            "from": "plxw5ZGGAqAeH4te",
            "to": "39y0AZGGAqACZwaU",
            "points": [
                [
                    304,
                    97
                ],
                [
                    338,
                    97
                ]
            ]
        },
        {
            "from": "X4T45ZGGAqAeH6P3",
            "to": "GoT45ZGGAqAeH6PZ",
            "points": [
                [
                    2080,
                    1050
                ],
                [
                    2080,
                    1075
                ]
            ]
        },
        {
            "from": "tkT45ZGGAqAeH6QL",
            "to": "R0T45ZGGAqAeH6Qk",
            "points": [
                [
                    2068,
                    1271
                ],
                [
                    2068,
                    1301
                ]
            ]
        },
        {
            "from": "GoT45ZGGAqAeH6PZ",
            "to": "9YT45ZGGAqAeH6Po",
            "points": [
                [
                    2071,
                    1129
                ],
                [
                    2071,
                    1141
                ]
            ]
        },
        {
            "from": "9YT45ZGGAqAeH6Po",
            "to": "tkT45ZGGAqAeH6QL",
            "points": [
                [
                    1957,
                    1201
                ],
                [
                    1957,
                    1222
                ]
            ]
        },
        {
            "from": "JYaE5ZGGAqAeHxRu",
            "to": "QEaE5ZGGAqAeHxR5",
            "points": [
                [
                    1980,
                    1501
                ],
                [
                    1980,
                    1511
                ]
            ]
        },
        {
            "from": "QEaE5ZGGAqAeHxR5",
            "to": "ZkaE5ZGGAqAeHxSE",
            "points": [
                [
                    1989,
                    1551
                ],
                [
                    1989,
                    1605
                ]
            ]
        },
        {
            "from": "ZoaE5ZGGAqAeHxRo",
            "to": "JYaE5ZGGAqAeHxRu",
            "points": [
                [
                    2001,
                    1445
                ],
                [
                    2001,
                    1461
                ]
            ]
        },
        {
            "from": "w61YpZGGAqAeH9.x",
            "to": "Vc1YpZGGAqAeH99X",
            "points": [
                [
                    2546,
                    577
                ],
                [
                    2546,
                    625
                ]
            ]
        },
        {
            "from": "CNqk5ZGGAqAeH7cL",
            "to": "tdRk5ZGGAqAeHxzR",
            "points": [
                [
                    1878,
                    1900
                ],
                [
                    1878,
                    1921
                ]
            ]
        },
        {
            "from": "bxdk5ZGGAqAeH1Eq",
            "to": "cu1YpZGGAqAeH9_8",
            "points": [
                [
                    1866,
                    803
                ],
                [
                    1866,
                    851
                ]
            ]
        },
        {
            "from": "cu1YpZGGAqAeH9_8",
            "to": "CNqk5ZGGAqAeH7cL",
            "points": [
                [
                    1821,
                    915
                ],
                [
                    1821,
                    1845
                ]
            ]
        },
        {
            "from": "bxdk5ZGGAqAeH1Eq",
            "to": "ddmc5ZGGAqAeH2Ya",
            "points": [
                [
                    1888,
                    785
                ],
                [
                    2006,
                    785
                ],
                [
                    2006,
                    855
                ]
            ]
        },
        {
            "from": "QMY4pZGGAqAeHyhr",
            "to": "bxdk5ZGGAqAeH1Eq",
            "points": [
                [
                    1863,
                    673
                ],
                [
                    1863,
                    771
                ]
            ]
        },
        {
            "from": "ddmc5ZGGAqAeH2Ya",
            "to": "X4T45ZGGAqAeH6P3",
            "points": [
                [
                    1979,
                    920
                ],
                [
                    1979,
                    985
                ]
            ]
        },
        {
            "from": "tdRk5ZGGAqAeHxzR",
            "to": "ddmc5ZGGAqAeH2Ya",
            "points": [
                [
                    1928,
                    1931
                ],
                [
                    1928,
                    889
                ],
                [
                    1941,
                    889
                ]
            ]
        },
        {
            "from": "ZkaE5ZGGAqAeHxSE",
            "to": "me1YpZGGAqAeH.AL",
            "points": [
                [
                    2031,
                    1645
                ],
                [
                    2031,
                    1734
                ],
                [
                    2322,
                    1734
                ],
                [
                    2322,
                    813
                ]
            ]
        },
        {
            "from": "A3KYpZGGAqAeH7DL",
            "to": "Bm1YpZGGAqAeH9_P",
            "points": [
                [
                    1896,
                    358
                ],
                [
                    1896,
                    375
                ]
            ]
        },
        {
            "from": "Bm1YpZGGAqAeH9_P",
            "to": "tUY4pZGGAqAeHyhc",
            "points": [
                [
                    1876,
                    443
                ],
                [
                    1876,
                    452
                ]
            ]
        },
        {
            "from": "tUY4pZGGAqAeHyhc",
            "to": "6y1YpZGGAqAeH9.E",
            "points": [
                [
                    1878,
                    517
                ],
                [
                    1878,
                    531
                ]
            ]
        },
        {
            "from": "6y1YpZGGAqAeH9.E",
            "to": "QMY4pZGGAqAeHyhr",
            "points": [
                [
                    1890,
                    595
                ],
                [
                    1890,
                    608
                ]
            ]
        },
        {
            "from": "Xh1YpZGGAqAeH.A4",
            "to": "w61YpZGGAqAeH9.x",
            "points": [
                [
                    2554,
                    465
                ],
                [
                    2554,
                    512
                ]
            ]
        },
        {
            "from": "R0T45ZGGAqAeH6Qk",
            "to": "ZoaE5ZGGAqAeHxRo",
            "points": [
                [
                    2060,
                    1365
                ],
                [
                    2060,
                    1405
                ]
            ]
        },
        {
            "from": "me1YpZGGAqAeH.AL",
            "to": "ZGtM5ZGGAqAeH4d9",
            "points": [
                [
                    2346,
                    813
                ],
                [
                    2346,
                    1847
                ],
                [
                    2184,
                    1847
                ]
            ]
        },
        {
            "from": "yi025ZGGAqAeH.X6",
            "to": "bS025ZGGAqAeH.YJ",
            "points": [
                [
                    2134,
                    1982
                ],
                [
                    2134,
                    1991
                ]
            ]
        },
        {
            "from": "bS025ZGGAqAeH.YJ",
            "to": "eVR25ZGGAqAeHy0b",
            "points": [
                [
                    2123,
                    2055
                ],
                [
                    2123,
                    2078
                ]
            ]
        },
        {
            "from": "Ys125ZGGAqAeH0h2",
            "to": "dc125ZGGAqAeH0iF",
            "points": [
                [
                    2108,
                    2217
                ],
                [
                    2108,
                    2232
                ]
            ]
        },
        {
            "from": "eVR25ZGGAqAeHy0b",
            "to": "Ys125ZGGAqAeH0h2",
            "points": [
                [
                    2116,
                    2143
                ],
                [
                    2116,
                    2152
                ]
            ]
        },
        {
            "from": "dc125ZGGAqAeH0iF",
            "to": "Veb25ZGGAqAeH2cF",
            "points": [
                [
                    2179,
                    2239
                ],
                [
                    2208,
                    2239
                ],
                [
                    2208,
                    1933
                ],
                [
                    2261,
                    1933
                ]
            ]
        },
        {
            "from": "Veb25ZGGAqAeH2cF",
            "to": "OAoO5ZGGAqAeH4tw",
            "points": [
                [
                    2312,
                    1965
                ],
                [
                    2312,
                    2011
                ]
            ]
        },
        {
            "from": "JK1YpZGGAqAeH9.T",
            "to": "Xh1YpZGGAqAeH.A4",
            "points": [
                [
                    2359,
                    2195
                ],
                [
                    2446,
                    2195
                ],
                [
                    2446,
                    433
                ],
                [
                    2471,
                    433
                ]
            ]
        },
        {
            "from": "crl.5ZGGAqAeH8aS",
            "to": "0vT.5ZGGAqAeH9.P",
            "points": [
                [
                    168,
                    2549
                ],
                [
                    168,
                    2572
                ]
            ]
        },
        {
            "from": "RQHURZGGAqAeHycC",
            "to": "GESB5ZGGAqAeHx_m",
            "points": [
                [
                    966,
                    2536
                ],
                [
                    987,
                    2536
                ],
                [
                    987,
                    2606
                ],
                [
                    879,
                    2606
                ],
                [
                    879,
                    2624
                ]
            ]
        },
        {
            "from": "GESB5ZGGAqAeHx_m",
            "to": "Dc61AZGGAqACZ8Qf",
            "points": [
                [
                    953,
                    2629
                ],
                [
                    1032,
                    2629
                ],
                [
                    1032,
                    142
                ],
                [
                    1055,
                    141
                ]
            ]
        },
        {
            "from": "h9P1AZGGAqACZ.Za",
            "to": "QoOh5ZGGAqAeH2oB",
            "points": [
                [
                    1750,
                    2519
                ],
                [
                    1781,
                    2519
                ],
                [
                    1781,
                    2602
                ],
                [
                    1691,
                    2602
                ],
                [
                    1691,
                    2621
                ]
            ]
        },
        {
            "from": "39y0AZGGAqACZwaU",
            "to": "crl.5ZGGAqAeH8aS",
            "points": [
                [
                    414,
                    117
                ],
                [
                    414,
                    135
                ],
                [
                    47,
                    135
                ],
                [
                    47,
                    2522
                ],
                [
                    68,
                    2523
                ]
            ]
        },
        {
            "from": "0vT.5ZGGAqAeH9.P",
            "to": "TPK4JZGGAqAeH0LM",
            "points": [
                [
                    219,
                    2601
                ],
                [
                    278,
                    2601
                ],
                [
                    278,
                    2419
                ],
                [
                    70,
                    2419
                ],
                [
                    70,
                    157
                ],
                [
                    502,
                    157
                ],
                [
                    502,
                    96
                ],
                [
                    557,
                    95
                ]
            ]
        },
        {
            "from": "TPK4JZGGAqAeH0LM",
            "to": "yMO4JZGGAqAeH0yc",
            "points": [
                [
                    584,
                    94
                ],
                [
                    652,
                    94
                ],
                [
                    652,
                    176
                ],
                [
                    109,
                    176
                ],
                [
                    109,
                    1961
                ]
            ]
        },
        {
            "from": "fjNTJZGGAqAeH32S",
            "to": "8qLJ5ZGGAqAeHwPP",
            "points": [
                [
                    3257,
                    2509
                ],
                [
                    3276,
                    2509
                ],
                [
                    3276,
                    2621
                ],
                [
                    3171,
                    2621
                ],
                [
                    3171,
                    2645
                ]
            ]
        },
        {
            "from": "8qLJ5ZGGAqAeHwPP",
            "to": "067h5ZGGAqAeH7K5",
            "points": [
                [
                    3151,
                    2665
                ],
                [
                    3021,
                    2665
                ],
                [
                    3021,
                    2748
                ]
            ]
        },
        {
            "from": ".uaZ5ZGGAqAeH9RL",
            "to": "aJ3J5ZGGAqAeHxr3",
            "points": [
                [
                    3191,
                    2802
                ],
                [
                    3191,
                    2835
                ],
                [
                    4804,
                    2835
                ],
                [
                    4804,
                    190
                ],
                [
                    4827,
                    190
                ]
            ]
        },
        {
            "from": "8qLJ5ZGGAqAeHwPP",
            "to": ".uaZ5ZGGAqAeH9RL",
            "points": [
                [
                    3191,
                    2665
                ],
                [
                    3214,
                    2665
                ],
                [
                    3214,
                    2748
                ]
            ]
        },
        {
            "from": "OAoO5ZGGAqAeH4tw",
            "to": "JK1YpZGGAqAeH9.T",
            "points": [
                [
                    2305,
                    2089
                ],
                [
                    2305,
                    2165
                ]
            ]
        },
        {
            "from": "FrB4JZGGAqAeH1ea",
            "to": "DhGOJZGGAqAeH8dM",
            "points": [
                [
                    266,
                    371
                ],
                [
                    266,
                    439
                ]
            ]
        },
        {
            "from": "DhGOJZGGAqAeH8dM",
            "to": "xt9yJZGGAqAeH6lh",
            "points": [
                [
                    248,
                    481
                ],
                [
                    248,
                    537
                ]
            ]
        },
        {
            "from": "xt9yJZGGAqAeH6lh",
            "to": "IzicJZGGAqAeH3IT",
            "points": [
                [
                    248,
                    578
                ],
                [
                    248,
                    675
                ]
            ]
        },
        {
            "from": "ZqpMpZGGAqAeH1Op",
            "to": "oTtbJZGGAqAeH6t9",
            "points": [
                [
                    3138,
                    847
                ],
                [
                    3138,
                    861
                ]
            ]
        },
        {
            "from": "unLMpZGGAqAeH4uE",
            "to": "SKpMpZGGAqAeH1Oa",
            "points": [
                [
                    3159,
                    613
                ],
                [
                    3159,
                    622
                ]
            ]
        },
        {
            "from": "SKpMpZGGAqAeH1Oa",
            "to": "YPLMpZGGAqAeH4ui",
            "points": [
                [
                    3164,
                    700
                ],
                [
                    3164,
                    712
                ]
            ]
        },
        {
            "from": "YPLMpZGGAqAeH4ui",
            "to": "ZqpMpZGGAqAeH1Op",
            "points": [
                [
                    3155,
                    770
                ],
                [
                    3155,
                    782
                ]
            ]
        },
        {
            "from": "kFqYpZGGAqAeH7QP",
            "to": "uQlMpZGGAqAeH1vE",
            "points": [
                [
                    2748,
                    368
                ],
                [
                    2748,
                    391
                ]
            ]
        },
        {
            "from": "uQlMpZGGAqAeH1vE",
            "to": "svLMpZGGAqAeH4ux",
            "points": [
                [
                    2731,
                    489
                ],
                [
                    2731,
                    511
                ]
            ]
        },
        {
            "from": "svLMpZGGAqAeH4ux",
            "to": "dwlMpZGGAqAeH1vT",
            "points": [
                [
                    2741,
                    575
                ],
                [
                    2741,
                    595
                ]
            ]
        },
        {
            "from": "dwlMpZGGAqAeH1vT",
            "to": "PIlMpZGGAqAeH1vi",
            "points": [
                [
                    2746,
                    695
                ],
                [
                    2746,
                    741
                ]
            ]
        },
        {
            "from": "wYlMpZGGAqAeH1vx",
            "to": "RHdMpZGGAqAeH3AD",
            "points": [
                [
                    2732,
                    1915
                ],
                [
                    2732,
                    1931
                ]
            ]
        },
        {
            "from": "RHdMpZGGAqAeH3AD",
            "to": "I7dMpZGGAqAeH2_0",
            "points": [
                [
                    2725,
                    1995
                ],
                [
                    2725,
                    2008
                ]
            ]
        },
        {
            "from": "PIlMpZGGAqAeH1vi",
            "to": "wYlMpZGGAqAeH1vx",
            "points": [
                [
                    2716,
                    839
                ],
                [
                    2716,
                    1851
                ]
            ]
        },
        {
            "from": "QDFyFZGGAqAeH26W",
            "to": "unLMpZGGAqAeH4uE",
            "points": [
                [
                    3171,
                    516
                ],
                [
                    3171,
                    571
                ]
            ]
        },
        {
            "from": "QDFyFZGGAqAeH26W",
            "to": "X3dMpZGGAqAeH3Aw",
            "points": [
                [
                    3153,
                    498
                ],
                [
                    2998,
                    498
                ],
                [
                    2998,
                    2325
                ]
            ]
        },
        {
            "from": "X3dMpZGGAqAeH3Aw",
            "to": "unLMpZGGAqAeH4uE",
            "points": [
                [
                    3048,
                    2331
                ],
                [
                    3048,
                    592
                ],
                [
                    3101,
                    592
                ]
            ]
        },
        {
            "from": "HXLMpZGGAqAeH4uT",
            "to": "B22KFZGGAqAeHxDo",
            "points": [
                [
                    3178,
                    365
                ],
                [
                    3178,
                    388
                ]
            ]
        },
        {
            "from": "B22KFZGGAqAeHxDo",
            "to": "QDFyFZGGAqAeH26W",
            "points": [
                [
                    3173,
                    423
                ],
                [
                    3173,
                    478
                ]
            ]
        },
        {
            "from": "B22KFZGGAqAeHxDo",
            "to": "2AUMpZGGAqAeH.pF",
            "points": [
                [
                    3160,
                    410
                ],
                [
                    2929,
                    410
                ],
                [
                    2929,
                    1931
                ]
            ]
        },
        {
            "from": "fQUMpZGGAqAeHwAD",
            "to": "QDFyFZGGAqAeH26W",
            "points": [
                [
                    2935,
                    2138
                ],
                [
                    2967,
                    2138
                ],
                [
                    2967,
                    479
                ],
                [
                    3171,
                    479
                ]
            ]
        },
        {
            "from": "XAlMpZGGAqAeH1u1",
            "to": "HXLMpZGGAqAeH4uT",
            "points": [
                [
                    3059,
                    329
                ],
                [
                    3088,
                    329
                ]
            ]
        },
        {
            "from": "I7dMpZGGAqAeH2_0",
            "to": "NBhMpZGGAqAeH0bj",
            "points": [
                [
                    2747,
                    2073
                ],
                [
                    2747,
                    2202
                ]
            ]
        },
        {
            "from": "NBhMpZGGAqAeH0bj",
            "to": "tndMpZGGAqAeH3AS",
            "points": [
                [
                    2743,
                    2267
                ],
                [
                    2743,
                    2301
                ]
            ]
        },
        {
            "from": "tndMpZGGAqAeH3AS",
            "to": "XAlMpZGGAqAeH1u1",
            "points": [
                [
                    2788,
                    2306
                ],
                [
                    2954,
                    2306
                ],
                [
                    2954,
                    386
                ],
                [
                    3008,
                    386
                ],
                [
                    3008,
                    370
                ]
            ]
        },
        {
            "from": "Ub8wpZGGAqAeH2OA",
            "to": "A1dmFZGGAqAeHxo9",
            "points": [
                [
                    3430,
                    180
                ],
                [
                    3430,
                    312
                ]
            ]
        },
        {
            "from": "fRawpZGGAqAeH2jK",
            "to": "Ot9mFZGGAqAeHxxT",
            "points": [
                [
                    4243,
                    168
                ],
                [
                    4243,
                    314
                ]
            ]
        },
        {
            "from": "A1dmFZGGAqAeHxo9",
            "to": "ReifJZGGAqAeH5q2",
            "points": [
                [
                    3424,
                    402
                ],
                [
                    3424,
                    432
                ]
            ]
        },
        {
            "from": "ReifJZGGAqAeH5q2",
            "to": ".ZifJZGGAqAeH5s9",
            "points": [
                [
                    3432,
                    495
                ],
                [
                    3432,
                    522
                ]
            ]
        },
        {
            "from": ".ZifJZGGAqAeH5s9",
            "to": "H.ifJZGGAqAeH5rF",
            "points": [
                [
                    3422,
                    640
                ],
                [
                    3422,
                    662
                ]
            ]
        },
        {
            "from": "H.ifJZGGAqAeH5rF",
            "to": "psafJZGGAqAeH7J2",
            "points": [
                [
                    3428,
                    728
                ],
                [
                    3428,
                    770
                ]
            ]
        },
        {
            "from": "psafJZGGAqAeH7J2",
            "to": "C6CfJZGGAqAeH5bo",
            "points": [
                [
                    3485,
                    777
                ],
                [
                    3544,
                    777
                ],
                [
                    3544,
                    480
                ],
                [
                    3557,
                    480
                ]
            ]
        },
        {
            "from": "C6CfJZGGAqAeH5bo",
            "to": "R7cfJZGGAqAeH49p",
            "points": [
                [
                    3611,
                    522
                ],
                [
                    3611,
                    542
                ]
            ]
        },
        {
            "from": "MCCfJZGGAqAeH5Zw",
            "to": "LTKfJZGGAqAeH6cw",
            "points": [
                [
                    3463,
                    2070
                ],
                [
                    3570,
                    2070
                ],
                [
                    3570,
                    1902
                ],
                [
                    3597,
                    1902
                ]
            ]
        },
        {
            "from": "LTKfJZGGAqAeH6cw",
            "to": "qaCfJZGGAqAeH5bZ",
            "points": [
                [
                    3651,
                    1938
                ],
                [
                    3651,
                    1985
                ]
            ]
        },
        {
            "from": "jJqfJZGGAqAeH6wr",
            "to": "MCCfJZGGAqAeH5Zw",
            "points": [
                [
                    3388,
                    1960
                ],
                [
                    3388,
                    1990
                ]
            ]
        },
        {
            "from": "mqCfJZGGAqAeH5bK",
            "to": "jJqfJZGGAqAeH6wr",
            "points": [
                [
                    3749,
                    862
                ],
                [
                    3749,
                    904
                ],
                [
                    3332,
                    904
                ],
                [
                    3332,
                    1871
                ],
                [
                    3354,
                    1871
                ]
            ]
        },
        {
            "from": "R7cfJZGGAqAeH49p",
            "to": "QiCfJZGGAqAeH5Z_",
            "points": [
                [
                    3599,
                    624
                ],
                [
                    3599,
                    642
                ]
            ]
        },
        {
            "from": "QiCfJZGGAqAeH5Z_",
            "to": "XcCfJZGGAqAeH5Zh",
            "points": [
                [
                    3612,
                    745
                ],
                [
                    3612,
                    762
                ]
            ]
        },
        {
            "from": "XcCfJZGGAqAeH5Zh",
            "to": "fiCfJZGGAqAeH5aO",
            "points": [
                [
                    3659,
                    771
                ],
                [
                    3691,
                    771
                ],
                [
                    3691,
                    480
                ],
                [
                    3703,
                    480
                ]
            ]
        },
        {
            "from": "fiCfJZGGAqAeH5aO",
            "to": "dyCfJZGGAqAeH5as",
            "points": [
                [
                    3773,
                    525
                ],
                [
                    3773,
                    540
                ]
            ]
        },
        {
            "from": "dyCfJZGGAqAeH5as",
            "to": "LSCfJZGGAqAeH5ad",
            "points": [
                [
                    3753,
                    604
                ],
                [
                    3753,
                    640
                ]
            ]
        },
        {
            "from": "LSCfJZGGAqAeH5ad",
            "to": "BKCfJZGGAqAeH5a7",
            "points": [
                [
                    3753,
                    704
                ],
                [
                    3753,
                    717
                ]
            ]
        },
        {
            "from": "BKCfJZGGAqAeH5a7",
            "to": "mqCfJZGGAqAeH5bK",
            "points": [
                [
                    3752,
                    782
                ],
                [
                    3752,
                    798
                ]
            ]
        },
        {
            "from": "TBifJZGGAqAeH5rU",
            "to": "2LpFFZGGAqAeH7Km",
            "points": [
                [
                    4048,
                    380
                ],
                [
                    4048,
                    462
                ]
            ]
        },
        {
            "from": "qaCfJZGGAqAeH5bZ",
            "to": ".9cfJZGGAqAeH47i",
            "points": [
                [
                    3644,
                    2050
                ],
                [
                    3644,
                    2085
                ]
            ]
        },
        {
            "from": ".9cfJZGGAqAeH47i",
            "to": "HDcfJZGGAqAeH47x",
            "points": [
                [
                    3641,
                    2170
                ],
                [
                    3641,
                    2197
                ]
            ]
        },
        {
            "from": "HDcfJZGGAqAeH47x",
            "to": "djcfJZGGAqAeH48A",
            "points": [
                [
                    3639,
                    2284
                ],
                [
                    3639,
                    2295
                ]
            ]
        },
        {
            "from": "djcfJZGGAqAeH48A",
            "to": "lTcfJZGGAqAeH48P",
            "points": [
                [
                    3653,
                    2360
                ],
                [
                    3653,
                    2370
                ]
            ]
        },
        {
            "from": "lTcfJZGGAqAeH48P",
            "to": "85PJFZGGAqAeH13G",
            "points": [
                [
                    3705,
                    2375
                ],
                [
                    3893,
                    2375
                ],
                [
                    3893,
                    1958
                ]
            ]
        },
        {
            "from": "85PJFZGGAqAeH13G",
            "to": "TBifJZGGAqAeH5rU",
            "points": [
                [
                    3893,
                    1862
                ],
                [
                    3893,
                    372
                ],
                [
                    3908,
                    372
                ]
            ]
        },
        {
            "from": "XecDFZGGAqAeH6l2",
            "to": "TahPJZGGAqAeHw6k",
            "points": [
                [
                    4091,
                    597
                ],
                [
                    4114,
                    597
                ],
                [
                    4114,
                    2484
                ],
                [
                    4131,
                    2484
                ]
            ]
        },
        {
            "from": "gFjQpZGGAqAeH0_s",
            "to": "aJ3J5ZGGAqAeHxr3",
            "points": [
                [
                    4754,
                    2511
                ],
                [
                    4804,
                    2511
                ],
                [
                    4804,
                    191
                ],
                [
                    4827,
                    191
                ]
            ]
        },
        {
            "from": "2LpFFZGGAqAeH7Km",
            "to": "XecDFZGGAqAeH6l2",
            "points": [
                [
                    4060,
                    528
                ],
                [
                    4060,
                    562
                ]
            ]
        },
        {
            "from": "T6hPJZGGAqAeHw6x",
            "to": "XecDFZGGAqAeH6l2",
            "points": [
                [
                    4283,
                    2514
                ],
                [
                    4283,
                    2588
                ],
                [
                    4101,
                    2588
                ],
                [
                    4101,
                    618
                ],
                [
                    4091,
                    618
                ]
            ]
        },
        {
            "from": "S7xjFZGGAqAeH2od",
            "to": "sLcfJZGGAqAeH48t",
            "points": [
                [
                    4239,
                    1925
                ],
                [
                    4239,
                    1945
                ]
            ]
        },
        {
            "from": "sLcfJZGGAqAeH48t",
            "to": "QrcfJZGGAqAeH488",
            "points": [
                [
                    4261,
                    2010
                ],
                [
                    4261,
                    2031
                ]
            ]
        },
        {
            "from": "8.5QpZGGAqAeH0E_",
            "to": "2zcfJZGGAqAeH48e",
            "points": [
                [
                    4573,
                    2487
                ],
                [
                    4573,
                    555
                ]
            ]
        },
        {
            "from": "7rcfJZGGAqAeH49L",
            "to": "YtDzFZGGAqAeH2Z.",
            "points": [
                [
                    5232,
                    495
                ],
                [
                    5232,
                    525
                ]
            ]
        },
        {
            "from": "YtDzFZGGAqAeH2Z.",
            "to": "wqrzFZGGAqAeH26T",
            "points": [
                [
                    5302,
                    587
                ],
                [
                    5302,
                    607
                ]
            ]
        },
        {
            "from": "wqrzFZGGAqAeH26T",
            "to": "O2gTFZGGAqAeH6Ku",
            "points": [
                [
                    5272,
                    675
                ],
                [
                    5272,
                    691
                ]
            ]
        },
        {
            "from": "rh4LFZGGAqAeH5nn",
            "to": "SvJzFZGGAqAeH0qd",
            "points": [
                [
                    5053,
                    912
                ],
                [
                    5053,
                    962
                ],
                [
                    4829,
                    962
                ],
                [
                    4829,
                    2047
                ],
                [
                    4847,
                    2047
                ]
            ]
        },
        {
            "from": "XwvTFZGGAqAeHwkr",
            "to": "dnQzFZGGAqAeHxZY",
            "points": [
                [
                    4862,
                    462
                ],
                [
                    4862,
                    475
                ]
            ]
        },
        {
            "from": "dnQzFZGGAqAeHxZY",
            "to": "9bcfJZGGAqAeH49a",
            "points": [
                [
                    4880,
                    540
                ],
                [
                    4880,
                    560
                ]
            ]
        },
        {
            "from": "9bcfJZGGAqAeH49a",
            "to": "wp8zFZGGAqAeHx8W",
            "points": [
                [
                    4872,
                    624
                ],
                [
                    4872,
                    647
                ]
            ]
        },
        {
            "from": "wp8zFZGGAqAeHx8W",
            "to": "dnmzFZGGAqAeHzos",
            "points": [
                [
                    4880,
                    712
                ],
                [
                    4880,
                    724
                ]
            ]
        },
        {
            "from": "Ot9mFZGGAqAeHxxT",
            "to": "S7xjFZGGAqAeH2od",
            "points": [
                [
                    4178,
                    390
                ],
                [
                    4178,
                    1871
                ],
                [
                    4196,
                    1871
                ]
            ]
        },
        {
            "from": "2zcfJZGGAqAeH48e",
            "to": "le5QpZGGAqAeH0E5",
            "points": [
                [
                    4528,
                    528
                ],
                [
                    4487,
                    528
                ],
                [
                    4487,
                    2481
                ]
            ]
        },
        {
            "from": "T6hPJZGGAqAeHw6x",
            "to": "UUUHFZGGAqAeH12Y",
            "points": [
                [
                    4303,
                    2495
                ],
                [
                    4303,
                    2627
                ]
            ]
        },
        {
            "from": "UUUHFZGGAqAeH12Y",
            "to": "fRawpZGGAqAeH2jK",
            "points": [
                [
                    4364,
                    2670
                ],
                [
                    4387,
                    2670
                ],
                [
                    4387,
                    2428
                ],
                [
                    4137,
                    2428
                ],
                [
                    4137,
                    160
                ],
                [
                    4154,
                    160
                ]
            ]
        },
        {
            "from": "dnmzFZGGAqAeHzos",
            "to": "cTezFZGGAqAeH0Kl",
            "points": [
                [
                    4934,
                    728
                ],
                [
                    5036,
                    728
                ],
                [
                    5036,
                    456
                ]
            ]
        },
        {
            "from": "SvJzFZGGAqAeH0qd",
            "to": "7rcfJZGGAqAeH49L",
            "points": [
                [
                    4945,
                    2135
                ],
                [
                    5167,
                    2135
                ],
                [
                    5167,
                    488
                ],
                [
                    5222,
                    488
                ]
            ]
        },
        {
            "from": "QRxPJZGGAqAeHxBV",
            "to": "7rcfJZGGAqAeH49L",
            "points": [
                [
                    5368,
                    2513
                ],
                [
                    5390,
                    2513
                ],
                [
                    5390,
                    456
                ],
                [
                    5330,
                    456
                ]
            ]
        },
        {
            "from": "O2gTFZGGAqAeH6Ku",
            "to": "FhxPJZGGAqAeHxBP",
            "points": [
                [
                    5252,
                    754
                ],
                [
                    5252,
                    2491
                ]
            ]
        },
        {
            "from": "QRxPJZGGAqAeHxBV",
            "to": "eckR5ZGGAqAeH.JD",
            "points": [
                [
                    5365,
                    2516
                ],
                [
                    5385,
                    2516
                ],
                [
                    5385,
                    2606
                ],
                [
                    5368,
                    2606
                ]
            ]
        },
        {
            "from": "eckR5ZGGAqAeH.JD",
            "to": "n7KnFZGGAqAeH8zg",
            "points": [
                [
                    5370,
                    2628
                ],
                [
                    5420,
                    2628
                ],
                [
                    5420,
                    191
                ],
                [
                    5450,
                    191
                ]
            ]
        },
        {
            "from": "aJ3J5ZGGAqAeHxr3",
            "to": "XxJXFZGGAqAeHzMw",
            "points": [
                [
                    4892,
                    200
                ],
                [
                    4892,
                    304
                ]
            ]
        },
        {
            "from": "XxJXFZGGAqAeHzMw",
            "to": "XwvTFZGGAqAeHwkr",
            "points": [
                [
                    4891,
                    380
                ],
                [
                    4891,
                    397
                ]
            ]
        },
        {
            "from": "Kkl3FZGGAqAeH38k",
            "to": "EUl3FZGGAqAeH380",
            "points": [
                [
                    4875,
                    1514
                ],
                [
                    4875,
                    1540
                ]
            ]
        },
        {
            "from": "EUl3FZGGAqAeH380",
            "to": ".Ul3FZGGAqAeH38_",
            "points": [
                [
                    4885,
                    1580
                ],
                [
                    4885,
                    1620
                ]
            ]
        },
        {
            "from": "PEl3FZGGAqAeH38e",
            "to": "Kkl3FZGGAqAeH38k",
            "points": [
                [
                    4899,
                    1460
                ],
                [
                    4899,
                    1474
                ]
            ]
        },
        {
            "from": "V0l3FZGGAqAeH39s",
            "to": "7Ul3FZGGAqAeH39O",
            "points": [
                [
                    4940,
                    1068
                ],
                [
                    4940,
                    1100
                ]
            ]
        },
        {
            "from": "hMl3FZGGAqAeH3.A",
            "to": "ysl3FZGGAqAeH3.e",
            "points": [
                [
                    4875,
                    1290
                ],
                [
                    4875,
                    1307
                ]
            ]
        },
        {
            "from": "ysl3FZGGAqAeH3.e",
            "to": "PEl3FZGGAqAeH38e",
            "points": [
                [
                    4892,
                    1372
                ],
                [
                    4892,
                    1419
                ]
            ]
        },
        {
            "from": "7Ul3FZGGAqAeH39O",
            "to": "y0l3FZGGAqAeH39d",
            "points": [
                [
                    4942,
                    1153
                ],
                [
                    4942,
                    1165
                ]
            ]
        },
        {
            "from": "y0l3FZGGAqAeH39d",
            "to": "hMl3FZGGAqAeH3.A",
            "points": [
                [
                    4875,
                    1225
                ],
                [
                    4875,
                    1244
                ]
            ]
        },
        {
            "from": ".Ul3FZGGAqAeH38_",
            "to": "rh4LFZGGAqAeH5nn",
            "points": [
                [
                    4926,
                    1660
                ],
                [
                    4926,
                    1720
                ],
                [
                    5146,
                    1720
                ],
                [
                    5146,
                    906
                ],
                [
                    5105,
                    906
                ]
            ]
        },
        {
            "from": "cTezFZGGAqAeH0Kl",
            "to": "i7iPFZGGAqAeH8LY",
            "points": [
                [
                    5089,
                    462
                ],
                [
                    5089,
                    824
                ],
                [
                    4891,
                    824
                ],
                [
                    4891,
                    865
                ]
            ]
        },
        {
            "from": "i7iPFZGGAqAeH8LY",
            "to": "V0l3FZGGAqAeH39s",
            "points": [
                [
                    4891,
                    930
                ],
                [
                    4891,
                    1004
                ]
            ]
        },
        {
            "from": "n7KnFZGGAqAeH8zg",
            "to": "Ij23FZGGAqAeH2FZ",
            "points": [
                [
                    5508,
                    200
                ],
                [
                    5508,
                    304
                ]
            ]
        },
        {
            "from": "8mavFZGGAqAeH5AI",
            "to": "vuavFZGGAqAeH5AX",
            "points": [
                [
                    5489,
                    1498
                ],
                [
                    5489,
                    1524
                ]
            ]
        },
        {
            "from": "vuavFZGGAqAeH5AX",
            "to": "bBavFZGGAqAeH5Ah",
            "points": [
                [
                    5499,
                    1564
                ],
                [
                    5499,
                    1604
                ]
            ]
        },
        {
            "from": "MGavFZGGAqAeH5AD",
            "to": "8mavFZGGAqAeH5AI",
            "points": [
                [
                    5514,
                    1444
                ],
                [
                    5514,
                    1458
                ]
            ]
        },
        {
            "from": "opavFZGGAqAeH5Aw",
            "to": "CRavFZGGAqAeH5Am",
            "points": [
                [
                    5555,
                    1053
                ],
                [
                    5555,
                    1084
                ]
            ]
        },
        {
            "from": "0FavFZGGAqAeH5A6",
            "to": "k1avFZGGAqAeH5BE",
            "points": [
                [
                    5489,
                    1273
                ],
                [
                    5489,
                    1294
                ]
            ]
        },
        {
            "from": "k1avFZGGAqAeH5BE",
            "to": "MGavFZGGAqAeH5AD",
            "points": [
                [
                    5508,
                    1358
                ],
                [
                    5508,
                    1404
                ]
            ]
        },
        {
            "from": "CRavFZGGAqAeH5Am",
            "to": "FxavFZGGAqAeH5Ar",
            "points": [
                [
                    5557,
                    1137
                ],
                [
                    5557,
                    1150
                ]
            ]
        },
        {
            "from": "FxavFZGGAqAeH5Ar",
            "to": "0FavFZGGAqAeH5A6",
            "points": [
                [
                    5489,
                    1210
                ],
                [
                    5489,
                    1227
                ]
            ]
        },
        {
            "from": "bBavFZGGAqAeH5Ah",
            "to": "RKavFZGGAqAeH4_0",
            "points": [
                [
                    5543,
                    1644
                ],
                [
                    5543,
                    1703
                ],
                [
                    5763,
                    1703
                ],
                [
                    5763,
                    890
                ],
                [
                    5795,
                    890
                ]
            ]
        },
        {
            "from": ".NavFZGGAqAeH5BJ",
            "to": "opavFZGGAqAeH5Aw",
            "points": [
                [
                    5505,
                    914
                ],
                [
                    5505,
                    988
                ]
            ]
        },
        {
            "from": "Ij23FZGGAqAeH2FZ",
            "to": ".NavFZGGAqAeH5BJ",
            "points": [
                [
                    5504,
                    379
                ],
                [
                    5504,
                    850
                ]
            ]
        },
        {
            "from": "RKavFZGGAqAeH4_0",
            "to": "yPjvFZGGAqAeH7rC",
            "points": [
                [
                    5795,
                    887
                ],
                [
                    5795,
                    1830
                ],
                [
                    5533,
                    1830
                ],
                [
                    5533,
                    1868
                ]
            ]
        },
        {
            "from": "yPjvFZGGAqAeH7rC",
            "to": "DvRvFZGGAqAeH5v4",
            "points": [
                [
                    5587,
                    1876
                ],
                [
                    5914,
                    1876
                ],
                [
                    5914,
                    402
                ],
                [
                    5945,
                    402
                ]
            ]
        },
        {
            "from": "DvRvFZGGAqAeH5v4",
            "to": "xFpPJZGGAqAeHxF_",
            "points": [
                [
                    5960,
                    434
                ],
                [
                    5960,
                    2442
                ],
                [
                    5814,
                    2442
                ],
                [
                    5814,
                    2499
                ]
            ]
        },
        {
            "from": "wlpPJZGGAqAeHxGF",
            "to": "DvRvFZGGAqAeH5v4",
            "points": [
                [
                    5928,
                    2500
                ],
                [
                    5928,
                    2468
                ],
                [
                    6168,
                    2468
                ],
                [
                    6168,
                    372
                ],
                [
                    6124,
                    372
                ]
            ]
        },
        {
            "from": "ZGtM5ZGGAqAeH4d9",
            "to": "yi025ZGGAqAeH.X6",
            "points": [
                [
                    2137,
                    1910
                ],
                [
                    2137,
                    1918
                ]
            ]
        },
        {
            "from": "g27cAZGGAqACZwma",
            "to": "DHncAZGGAqACZwmr",
            "kind": "data",
            "points": [
                [
                    1200,
                    1441
                ],
                [
                    1231,
                    1441
                ],
                [
                    1231,
                    1511
                ],
                [
                    1324,
                    1701
                ]
            ]
        },
        {
            "from": "7ji8AZGGAqACZwoO",
            "to": "DHncAZGGAqACZwmr",
            "kind": "data",
            "points": [
                [
                    1197,
                    1515
                ],
                [
                    1324,
                    1705
                ]
            ]
        },
        {
            "from": "yMO4JZGGAqAeH0yc",
            "to": "GL.kJZGGAqAeHzhl",
            "kind": "data",
            "points": [
                [
                    206,
                    2016
                ],
                [
                    252,
                    2245
                ]
            ]
        },
        {
            "from": "gtdMJZGGAqAeH8eA",
            "to": "PModAZGGAqACZwnJ",
            "kind": "data",
            "points": [
                [
                    520,
                    657
                ],
                [
                    520,
                    942
                ],
                [
                    742,
                    753
                ]
            ]
        },
        {
            "from": "kJ_MJZGGAqAeH.fP",
            "to": "cI7sJZGGAqAeH0xS",
            "kind": "data",
            "points": [
                [
                    428,
                    1979
                ],
                [
                    450,
                    1979
                ],
                [
                    450,
                    2235
                ],
                [
                    545,
                    2425
                ]
            ]
        },
        {
            "from": "uQiMJZGGAqAeH4xE",
            "to": "cI7sJZGGAqAeH0xS",
            "kind": "data",
            "points": [
                [
                    428,
                    1939
                ],
                [
                    450,
                    1939
                ],
                [
                    450,
                    2235
                ],
                [
                    545,
                    2425
                ]
            ]
        },
        {
            "from": "0iiMJZGGAqAeH4y2",
            "to": "cI7sJZGGAqAeH0xS",
            "kind": "data",
            "points": [
                [
                    428,
                    2055
                ],
                [
                    450,
                    2055
                ],
                [
                    450,
                    2233
                ],
                [
                    545,
                    2423
                ]
            ]
        },
        {
            "from": "b_CMJZGGAqAeH4wT",
            "to": "cI7sJZGGAqAeH0xS",
            "kind": "data",
            "points": [
                [
                    428,
                    2134
                ],
                [
                    450,
                    2134
                ],
                [
                    450,
                    2234
                ],
                [
                    545,
                    2424
                ]
            ]
        },
        {
            "from": "7oiMJZGGAqAeH4xz",
            "to": "cI7sJZGGAqAeH0xS",
            "kind": "data",
            "points": [
                [
                    429,
                    2214
                ],
                [
                    454,
                    2214
                ],
                [
                    454,
                    2234
                ],
                [
                    545,
                    2424
                ]
            ]
        },
        {
            "from": "IzicJZGGAqAeH3IT",
            "to": "gtdMJZGGAqAeH8eA",
            "kind": "data",
            "points": [
                [
                    330,
                    678
                ],
                [
                    366,
                    678
                ],
                [
                    366,
                    438
                ],
                [
                    474,
                    627
                ]
            ]
        },
        {
            "from": "kPCMJZGGAqAeH4vm",
            "to": "ATmcJZGGAqAeH3sk",
            "kind": "data",
            "points": [
                [
                    589,
                    1939
                ],
                [
                    635,
                    2151
                ]
            ]
        },
        {
            "from": "ATmcJZGGAqAeH3sk",
            "to": "_87KJZGGAqAeH7Oa",
            "kind": "data",
            "points": [
                [
                    700,
                    2152
                ],
                [
                    714,
                    2152
                ],
                [
                    668,
                    481
                ]
            ]
        },
        {
            "from": "cI7sJZGGAqAeH0xS",
            "to": "_87KJZGGAqAeH7Oa",
            "kind": "data",
            "points": [
                [
                    607,
                    2405
                ],
                [
                    714,
                    2405
                ],
                [
                    668,
                    481
                ]
            ]
        },
        {
            "from": "xt9yJZGGAqAeH6lh",
            "to": "gtdMJZGGAqAeH8eA",
            "kind": "data",
            "points": [
                [
                    341,
                    545
                ],
                [
                    365,
                    545
                ],
                [
                    365,
                    441
                ],
                [
                    474,
                    630
                ]
            ]
        },
        {
            "from": "ngOKJZGGAqAeH7MS",
            "to": "cI7sJZGGAqAeH0xS",
            "kind": "data",
            "points": [
                [
                    541,
                    2154
                ],
                [
                    587,
                    2376
                ]
            ]
        },
        {
            "from": "rSRKJZGGAqAeH7Ml",
            "to": "ATmcJZGGAqAeH3sk",
            "kind": "data",
            "points": [
                [
                    604,
                    2048
                ],
                [
                    650,
                    2215
                ]
            ]
        },
        {
            "from": "DhGOJZGGAqAeH8dM",
            "to": "gtdMJZGGAqAeH8eA",
            "kind": "data",
            "points": [
                [
                    332,
                    443
                ],
                [
                    368,
                    443
                ],
                [
                    368,
                    438
                ],
                [
                    474,
                    627
                ]
            ]
        },
        {
            "from": "gtdMJZGGAqAeH8eA",
            "to": "_87KJZGGAqAeH7Oa",
            "kind": "data",
            "points": [
                [
                    562,
                    624
                ],
                [
                    539,
                    435
                ]
            ]
        },
        {
            "from": "GL.kJZGGAqAeHzhl",
            "to": "yMO4JZGGAqAeH0yc",
            "kind": "data",
            "points": [
                [
                    230,
                    2245
                ],
                [
                    184,
                    2016
                ]
            ]
        },
        {
            "from": "8WqcpZGGAqAeH18H",
            "to": "VX0cAZGGAqACZwje",
            "kind": "data",
            "points": [
                [
                    1218,
                    1000
                ],
                [
                    1288,
                    1190
                ]
            ]
        },
        {
            "from": "AzUgpZGGAqAeH3ph",
            "to": "p8E8pZGGAqAeH.GP",
            "kind": "data",
            "points": [
                [
                    1222,
                    1084
                ],
                [
                    1285,
                    1274
                ]
            ]
        },
        {
            "from": "ECg8AZGGAqACZwnO",
            "to": "DHncAZGGAqACZwmr",
            "kind": "data",
            "points": [
                [
                    1200,
                    1491
                ],
                [
                    1231,
                    1491
                ],
                [
                    1231,
                    1511
                ],
                [
                    1324,
                    1701
                ]
            ]
        },
        {
            "from": "jDUgpZGGAqAeH3pD",
            "to": "ZTAipZGGAqAeH.QL",
            "kind": "data",
            "points": [
                [
                    1201,
                    1635
                ],
                [
                    1201,
                    1654
                ],
                [
                    1305,
                    1844
                ]
            ]
        },
        {
            "from": "I3UgpZGGAqAeH3rK",
            "to": "qJ7ypZGGAqAeHwZb",
            "kind": "data",
            "points": [
                [
                    1187,
                    399
                ],
                [
                    1279,
                    589
                ]
            ]
        },
        {
            "from": "qw8cpZGGAqAeH1Kb",
            "to": "VX0cAZGGAqACZwje",
            "kind": "data",
            "points": [
                [
                    1217,
                    1149
                ],
                [
                    1222,
                    1149
                ],
                [
                    1222,
                    1002
                ],
                [
                    1288,
                    1192
                ]
            ]
        },
        {
            "from": "VX0cAZGGAqACZwje",
            "to": "2VuVAZGGAqACZ2Jl",
            "kind": "data",
            "points": [
                [
                    1385,
                    1175
                ],
                [
                    1688,
                    1175
                ],
                [
                    1688,
                    877
                ],
                [
                    1661,
                    687
                ]
            ]
        },
        {
            "from": "p8E8pZGGAqAeH.GP",
            "to": "2VuVAZGGAqACZ2Jl",
            "kind": "data",
            "points": [
                [
                    1382,
                    1250
                ],
                [
                    1687,
                    1250
                ],
                [
                    1687,
                    877
                ],
                [
                    1661,
                    687
                ]
            ]
        },
        {
            "from": "ZTAipZGGAqAeH.QL",
            "to": "xoRipZGGAqAeHzcW",
            "kind": "data",
            "points": [
                [
                    1375,
                    1860
                ],
                [
                    1541,
                    1860
                ],
                [
                    1494,
                    875
                ]
            ]
        },
        {
            "from": "ELlVAZGGAqACZ3ep",
            "to": "xoRipZGGAqAeHzcW",
            "kind": "data",
            "points": [
                [
                    1375,
                    1804
                ],
                [
                    1541,
                    1804
                ],
                [
                    1494,
                    875
                ]
            ]
        },
        {
            "from": "ZTAipZGGAqAeH.QL",
            "to": "ky9apZGGAqAeH3aX",
            "kind": "data",
            "points": [
                [
                    1339,
                    1871
                ],
                [
                    1339,
                    2059
                ],
                [
                    1178,
                    1869
                ]
            ]
        },
        {
            "from": "VX0cAZGGAqACZwje",
            "to": "ky9apZGGAqAeH3aX",
            "kind": "data",
            "points": [
                [
                    1385,
                    1221
                ],
                [
                    1428,
                    1221
                ],
                [
                    1428,
                    2059
                ],
                [
                    1178,
                    1869
                ]
            ]
        },
        {
            "from": "qT2GpZGGAqAeH8dF",
            "to": "kLUgpZGGAqAeH3pw",
            "kind": "data",
            "points": [
                [
                    1572,
                    2431
                ],
                [
                    1625,
                    2431
                ],
                [
                    1625,
                    687
                ],
                [
                    1661,
                    497
                ]
            ]
        },
        {
            "from": "stUgpZGGAqAeH3ol",
            "to": "qT2GpZGGAqAeH8dF",
            "kind": "data",
            "points": [
                [
                    1421,
                    1971
                ],
                [
                    1447,
                    1971
                ],
                [
                    1447,
                    2238
                ],
                [
                    1510,
                    2428
                ]
            ]
        },
        {
            "from": "l9UgpZGGAqAeH3o0",
            "to": "qT2GpZGGAqAeH8dF",
            "kind": "data",
            "points": [
                [
                    1418,
                    2068
                ],
                [
                    1446,
                    2068
                ],
                [
                    1446,
                    2236
                ],
                [
                    1510,
                    2426
                ]
            ]
        },
        {
            "from": "mfUgpZGGAqAeH3r3",
            "to": "TPWWpZGGAqAeH8q8",
            "kind": "data",
            "points": [
                [
                    1338,
                    2158
                ],
                [
                    1385,
                    2491
                ]
            ]
        },
        {
            "from": "tHUgpZGGAqAeH3qs",
            "to": "qT2GpZGGAqAeH8dF",
            "kind": "data",
            "points": [
                [
                    1172,
                    1977
                ],
                [
                    1275,
                    1977
                ],
                [
                    1275,
                    2239
                ],
                [
                    1509,
                    2429
                ]
            ]
        },
        {
            "from": "UPUgpZGGAqAeH3rZ",
            "to": "qT2GpZGGAqAeH8dF",
            "kind": "data",
            "points": [
                [
                    1173,
                    2049
                ],
                [
                    1275,
                    2049
                ],
                [
                    1275,
                    2238
                ],
                [
                    1509,
                    2428
                ]
            ]
        },
        {
            "from": "R_UgpZGGAqAeH3sG",
            "to": "qT2GpZGGAqAeH8dF",
            "kind": "data",
            "points": [
                [
                    1179,
                    2137
                ],
                [
                    1274,
                    2137
                ],
                [
                    1274,
                    2239
                ],
                [
                    1510,
                    2429
                ]
            ]
        },
        {
            "from": "rg0gpZGGAqAeH3sk",
            "to": "qT2GpZGGAqAeH8dF",
            "kind": "data",
            "points": [
                [
                    1164,
                    2221
                ],
                [
                    1273,
                    2221
                ],
                [
                    1273,
                    2236
                ],
                [
                    1510,
                    2426
                ]
            ]
        },
        {
            "from": "CvUgpZGGAqAeH3ro",
            "to": "TPWWpZGGAqAeH8q8",
            "kind": "data",
            "points": [
                [
                    1165,
                    2303
                ],
                [
                    1165,
                    2329
                ],
                [
                    1340,
                    2519
                ]
            ]
        },
        {
            "from": "VA0gpZGGAqAeH3sV",
            "to": "TPWWpZGGAqAeH8q8",
            "kind": "data",
            "points": [
                [
                    1168,
                    2348
                ],
                [
                    1168,
                    2330
                ],
                [
                    1339,
                    2520
                ]
            ]
        },
        {
            "from": "TPWWpZGGAqAeH8q8",
            "to": "kLUgpZGGAqAeH3pw",
            "kind": "data",
            "points": [
                [
                    1434,
                    2522
                ],
                [
                    1625,
                    2522
                ],
                [
                    1625,
                    687
                ],
                [
                    1661,
                    497
                ]
            ]
        },
        {
            "from": "qJ7ypZGGAqAeHwZb",
            "to": "2VuVAZGGAqACZ2Jl",
            "kind": "data",
            "points": [
                [
                    1365,
                    591
                ],
                [
                    1686,
                    591
                ],
                [
                    1686,
                    876
                ],
                [
                    1661,
                    686
                ]
            ]
        },
        {
            "from": "tzu2pZGGAqAeH987",
            "to": "qJ7ypZGGAqAeHwZb",
            "kind": "data",
            "points": [
                [
                    1290,
                    508
                ],
                [
                    1337,
                    618
                ]
            ]
        },
        {
            "from": "jDUgpZGGAqAeH3pD",
            "to": "ELlVAZGGAqACZ3ep",
            "kind": "data",
            "points": [
                [
                    1202,
                    1628
                ],
                [
                    1305,
                    1818
                ]
            ]
        },
        {
            "from": "xoRipZGGAqAeHzcW",
            "to": "qJ7ypZGGAqAeHwZb",
            "kind": "data",
            "points": [
                [
                    1452,
                    816
                ],
                [
                    1452,
                    475
                ],
                [
                    1290,
                    475
                ],
                [
                    1337,
                    618
                ]
            ]
        },
        {
            "from": "HnUgpZGGAqAeH3q7",
            "to": "qJ7ypZGGAqAeHwZb",
            "kind": "data",
            "points": [
                [
                    1331,
                    616
                ],
                [
                    1368,
                    616
                ],
                [
                    1368,
                    475
                ],
                [
                    1290,
                    475
                ],
                [
                    1337,
                    618
                ]
            ]
        },
        {
            "from": "X4T45ZGGAqAeH6P3",
            "to": "MIT45ZGGAqAeH6PU",
            "kind": "data",
            "points": [
                [
                    2101,
                    1010
                ],
                [
                    2170,
                    1200
                ]
            ]
        },
        {
            "from": "GoT45ZGGAqAeH6PZ",
            "to": "IkT45ZGGAqAeH6QG",
            "kind": "data",
            "points": [
                [
                    2107,
                    1090
                ],
                [
                    2168,
                    1280
                ]
            ]
        },
        {
            "from": "9YT45ZGGAqAeH6Po",
            "to": "MIT45ZGGAqAeH6PU",
            "kind": "data",
            "points": [
                [
                    2101,
                    1155
                ],
                [
                    2108,
                    1155
                ],
                [
                    2108,
                    1011
                ],
                [
                    2170,
                    1201
                ]
            ]
        },
        {
            "from": "DHncAZGGAqACZwmr",
            "to": "jDUgpZGGAqAeH3pD",
            "kind": "data",
            "points": [
                [
                    1324,
                    1725
                ],
                [
                    1277,
                    1725
                ],
                [
                    1277,
                    1771
                ],
                [
                    1175,
                    1771
                ],
                [
                    1128,
                    1601
                ]
            ]
        },
        {
            "from": "ZoaE5ZGGAqAeHxRo",
            "to": "c4aE5ZGGAqAeHxR0",
            "kind": "data",
            "points": [
                [
                    2101,
                    1439
                ],
                [
                    2131,
                    1439
                ],
                [
                    2131,
                    1521
                ],
                [
                    2225,
                    1711
                ]
            ]
        },
        {
            "from": "QEaE5ZGGAqAeHxR5",
            "to": "c4aE5ZGGAqAeHxR0",
            "kind": "data",
            "points": [
                [
                    2101,
                    1521
                ],
                [
                    2225,
                    1711
                ]
            ]
        },
        {
            "from": "JYaE5ZGGAqAeHxRu",
            "to": "c4aE5ZGGAqAeHxR0",
            "kind": "data",
            "points": [
                [
                    2100,
                    1495
                ],
                [
                    2132,
                    1495
                ],
                [
                    2132,
                    1519
                ],
                [
                    2225,
                    1709
                ]
            ]
        },
        {
            "from": "ZkaE5ZGGAqAeHxSE",
            "to": "HUaE5ZGGAqAeHxST",
            "kind": "data",
            "points": [
                [
                    2105,
                    1642
                ],
                [
                    2105,
                    1668
                ],
                [
                    2205,
                    1858
                ]
            ]
        },
        {
            "from": "ZkaE5ZGGAqAeHxSE",
            "to": "jEaE5ZGGAqAeHxR_",
            "kind": "data",
            "points": [
                [
                    2107,
                    1616
                ],
                [
                    2208,
                    1806
                ]
            ]
        },
        {
            "from": "c4aE5ZGGAqAeHxR0",
            "to": "ZkaE5ZGGAqAeHxSE",
            "kind": "data",
            "points": [
                [
                    2225,
                    1729
                ],
                [
                    2179,
                    1729
                ],
                [
                    2179,
                    1774
                ],
                [
                    2077,
                    1774
                ],
                [
                    2030,
                    1605
                ]
            ]
        },
        {
            "from": "Bm1YpZGGAqAeH9_P",
            "to": "OlNE5ZGGAqAeH0Zt",
            "kind": "data",
            "points": [
                [
                    1977,
                    417
                ],
                [
                    2088,
                    607
                ]
            ]
        },
        {
            "from": "tUY4pZGGAqAeHyhc",
            "to": "OlNE5ZGGAqAeH0Zt",
            "kind": "data",
            "points": [
                [
                    1970,
                    458
                ],
                [
                    1987,
                    458
                ],
                [
                    1987,
                    421
                ],
                [
                    2088,
                    611
                ]
            ]
        },
        {
            "from": "OlNE5ZGGAqAeH0Zt",
            "to": "CSNbJZGGAqAeH6YT",
            "kind": "data",
            "points": [
                [
                    2174,
                    612
                ],
                [
                    2507,
                    612
                ],
                [
                    2507,
                    1062
                ],
                [
                    2501,
                    872
                ]
            ]
        },
        {
            "from": "tdRk5ZGGAqAeHxzR",
            "to": "jIUU5ZGGAqAeH6Xt",
            "kind": "data",
            "points": [
                [
                    1927,
                    1925
                ],
                [
                    1950,
                    1925
                ],
                [
                    1950,
                    1845
                ],
                [
                    2005,
                    2035
                ]
            ]
        },
        {
            "from": "tdRk5ZGGAqAeHxzR",
            "to": "1XUU5ZGGAqAeH6u5",
            "kind": "data",
            "points": [
                [
                    1919,
                    1921
                ],
                [
                    1919,
                    1898
                ],
                [
                    2005,
                    2088
                ]
            ]
        },
        {
            "from": "tdRk5ZGGAqAeHxzR",
            "to": "LRsU5ZGGAqAeH7KG",
            "kind": "data",
            "points": [
                [
                    1928,
                    1954
                ],
                [
                    2005,
                    2144
                ]
            ]
        },
        {
            "from": "LRsU5ZGGAqAeH7KG",
            "to": "ZGtM5ZGGAqAeH4d9",
            "kind": "data",
            "points": [
                [
                    2075,
                    2119
                ],
                [
                    2093,
                    2119
                ],
                [
                    2093,
                    2067
                ],
                [
                    2081,
                    1877
                ]
            ]
        },
        {
            "from": "1XUU5ZGGAqAeH6u5",
            "to": "ZGtM5ZGGAqAeH4d9",
            "kind": "data",
            "points": [
                [
                    2075,
                    2063
                ],
                [
                    2081,
                    1873
                ]
            ]
        },
        {
            "from": "HUaE5ZGGAqAeHxST",
            "to": "ZGtM5ZGGAqAeH4d9",
            "kind": "data",
            "points": [
                [
                    2205,
                    1881
                ],
                [
                    2181,
                    1881
                ],
                [
                    2134,
                    1845
                ]
            ]
        },
        {
            "from": "MIT45ZGGAqAeH6PU",
            "to": "ZGtM5ZGGAqAeH4d9",
            "kind": "data",
            "points": [
                [
                    2266,
                    1232
                ],
                [
                    2306,
                    1232
                ],
                [
                    2306,
                    2020
                ],
                [
                    2183,
                    2020
                ],
                [
                    2136,
                    1845
                ]
            ]
        },
        {
            "from": "Xh1YpZGGAqAeH.A4",
            "to": "OlNE5ZGGAqAeH0Zt",
            "kind": "data",
            "points": [
                [
                    2471,
                    411
                ],
                [
                    2174,
                    601
                ]
            ]
        },
        {
            "from": "jEaE5ZGGAqAeHxR_",
            "to": "me1YpZGGAqAeH.AL",
            "kind": "data",
            "points": [
                [
                    2278,
                    1812
                ],
                [
                    2366,
                    1812
                ],
                [
                    2319,
                    813
                ]
            ]
        },
        {
            "from": "HUaE5ZGGAqAeHxST",
            "to": "me1YpZGGAqAeH.AL",
            "kind": "data",
            "points": [
                [
                    2275,
                    1859
                ],
                [
                    2367,
                    1859
                ],
                [
                    2320,
                    813
                ]
            ]
        },
        {
            "from": "dc125ZGGAqAeH0iF",
            "to": "limO5ZGGAqAeH9aU",
            "kind": "data",
            "points": [
                [
                    2179,
                    2289
                ],
                [
                    2199,
                    2289
                ],
                [
                    2199,
                    2332
                ],
                [
                    2284,
                    2522
                ]
            ]
        },
        {
            "from": "Ys125ZGGAqAeH0h2",
            "to": "limO5ZGGAqAeH9aU",
            "kind": "data",
            "points": [
                [
                    2179,
                    2210
                ],
                [
                    2199,
                    2210
                ],
                [
                    2199,
                    2333
                ],
                [
                    2284,
                    2523
                ]
            ]
        },
        {
            "from": "eVR25ZGGAqAeHy0b",
            "to": "rCmO5ZGGAqAeH9aP",
            "kind": "data",
            "points": [
                [
                    2178,
                    2138
                ],
                [
                    2228,
                    2138
                ],
                [
                    2228,
                    2260
                ],
                [
                    2444,
                    2450
                ]
            ]
        },
        {
            "from": "bS025ZGGAqAeH.YJ",
            "to": "rCmO5ZGGAqAeH9aP",
            "kind": "data",
            "points": [
                [
                    2182,
                    2051
                ],
                [
                    2228,
                    2051
                ],
                [
                    2228,
                    2261
                ],
                [
                    2444,
                    2451
                ]
            ]
        },
        {
            "from": "yi025ZGGAqAeH.X6",
            "to": "rCmO5ZGGAqAeH9aP",
            "kind": "data",
            "points": [
                [
                    2201,
                    1974
                ],
                [
                    2228,
                    1974
                ],
                [
                    2228,
                    2260
                ],
                [
                    2444,
                    2450
                ]
            ]
        },
        {
            "from": "OAoO5ZGGAqAeH4tw",
            "to": "rCmO5ZGGAqAeH9aP",
            "kind": "data",
            "points": [
                [
                    2382,
                    2081
                ],
                [
                    2385,
                    2081
                ],
                [
                    2385,
                    2261
                ],
                [
                    2444,
                    2451
                ]
            ]
        },
        {
            "from": "Veb25ZGGAqAeH2cF",
            "to": "rCmO5ZGGAqAeH9aP",
            "kind": "data",
            "points": [
                [
                    2384,
                    1960
                ],
                [
                    2384,
                    2260
                ],
                [
                    2444,
                    2450
                ]
            ]
        },
        {
            "from": "JK1YpZGGAqAeH9.T",
            "to": "limO5ZGGAqAeH9aU",
            "kind": "data",
            "points": [
                [
                    2307,
                    2230
                ],
                [
                    2354,
                    2491
                ]
            ]
        },
        {
            "from": "rCmO5ZGGAqAeH9aP",
            "to": "Xh1YpZGGAqAeH.A4",
            "kind": "data",
            "points": [
                [
                    2505,
                    2425
                ],
                [
                    2505,
                    623
                ],
                [
                    2471,
                    433
                ]
            ]
        },
        {
            "from": "limO5ZGGAqAeH9aU",
            "to": "Xh1YpZGGAqAeH.A4",
            "kind": "data",
            "points": [
                [
                    2378,
                    2522
                ],
                [
                    2506,
                    2522
                ],
                [
                    2506,
                    622
                ],
                [
                    2471,
                    432
                ]
            ]
        },
        {
            "from": "uQlMpZGGAqAeH1vE",
            "to": "3xoyFZGGAqAeH89N",
            "kind": "data",
            "points": [
                [
                    2800,
                    444
                ],
                [
                    2891,
                    444
                ],
                [
                    2938,
                    566
                ]
            ]
        },
        {
            "from": "dwlMpZGGAqAeH1vT",
            "to": "3xoyFZGGAqAeH89N",
            "kind": "data",
            "points": [
                [
                    2800,
                    644
                ],
                [
                    2891,
                    644
                ],
                [
                    2938,
                    566
                ]
            ]
        },
        {
            "from": "PIlMpZGGAqAeH1vi",
            "to": "3xoyFZGGAqAeH89N",
            "kind": "data",
            "points": [
                [
                    2800,
                    785
                ],
                [
                    2891,
                    785
                ],
                [
                    2938,
                    566
                ]
            ]
        },
        {
            "from": "3xoyFZGGAqAeH89N",
            "to": "XAlMpZGGAqAeH1u1",
            "kind": "data",
            "points": [
                [
                    2975,
                    526
                ],
                [
                    2953,
                    336
                ]
            ]
        },
        {
            "from": "wYlMpZGGAqAeH1vx",
            "to": "g_8yFZGGAqAeHxHR",
            "kind": "data",
            "points": [
                [
                    2779,
                    1875
                ],
                [
                    2868,
                    2065
                ]
            ]
        },
        {
            "from": "RHdMpZGGAqAeH3AD",
            "to": "g_8yFZGGAqAeHxHR",
            "kind": "data",
            "points": [
                [
                    2781,
                    1934
                ],
                [
                    2801,
                    1934
                ],
                [
                    2801,
                    1872
                ],
                [
                    2868,
                    2062
                ]
            ]
        },
        {
            "from": "I7dMpZGGAqAeH2_0",
            "to": "g_8yFZGGAqAeHxHR",
            "kind": "data",
            "points": [
                [
                    2781,
                    2011
                ],
                [
                    2801,
                    2011
                ],
                [
                    2801,
                    1873
                ],
                [
                    2868,
                    2063
                ]
            ]
        },
        {
            "from": "g_8yFZGGAqAeHxHR",
            "to": "XAlMpZGGAqAeH1u1",
            "kind": "data",
            "points": [
                [
                    2868,
                    2034
                ],
                [
                    2868,
                    489
                ],
                [
                    3054,
                    489
                ],
                [
                    3007,
                    305
                ]
            ]
        },
        {
            "from": "NBhMpZGGAqAeH0bj",
            "to": "y2qaFZGGAqAeH4mQ",
            "kind": "data",
            "points": [
                [
                    2789,
                    2244
                ],
                [
                    2894,
                    2434
                ]
            ]
        },
        {
            "from": "tndMpZGGAqAeH3AS",
            "to": "y2qaFZGGAqAeH4mQ",
            "kind": "data",
            "points": [
                [
                    2788,
                    2306
                ],
                [
                    2788,
                    2248
                ],
                [
                    2894,
                    2438
                ]
            ]
        },
        {
            "from": "y2qaFZGGAqAeH4mQ",
            "to": "XAlMpZGGAqAeH1u1",
            "kind": "data",
            "points": [
                [
                    2894,
                    2411
                ],
                [
                    2866,
                    2411
                ],
                [
                    2866,
                    535
                ],
                [
                    2953,
                    345
                ]
            ]
        },
        {
            "from": "ReifJZGGAqAeH5q2",
            "to": "29OWFZGGAqAeH4jG",
            "kind": "data",
            "points": [
                [
                    3482,
                    492
                ],
                [
                    3522,
                    492
                ],
                [
                    3522,
                    352
                ],
                [
                    3807,
                    542
                ]
            ]
        },
        {
            "from": ".ZifJZGGAqAeH5s9",
            "to": "29OWFZGGAqAeH4jG",
            "kind": "data",
            "points": [
                [
                    3485,
                    602
                ],
                [
                    3522,
                    602
                ],
                [
                    3522,
                    352
                ],
                [
                    3805,
                    542
                ]
            ]
        },
        {
            "from": "H.ifJZGGAqAeH5rF",
            "to": "29OWFZGGAqAeH4jG",
            "kind": "data",
            "points": [
                [
                    3482,
                    724
                ],
                [
                    3522,
                    724
                ],
                [
                    3522,
                    352
                ],
                [
                    3807,
                    542
                ]
            ]
        },
        {
            "from": "29OWFZGGAqAeH4jG",
            "to": "TBifJZGGAqAeH5rU",
            "kind": "data",
            "points": [
                [
                    3892,
                    540
                ],
                [
                    3908,
                    350
                ]
            ]
        },
        {
            "from": "psafJZGGAqAeH7J2",
            "to": "29OWFZGGAqAeH4jG",
            "kind": "data",
            "points": [
                [
                    3485,
                    825
                ],
                [
                    3522,
                    825
                ],
                [
                    3522,
                    352
                ],
                [
                    3805,
                    542
                ]
            ]
        },
        {
            "from": "C6CfJZGGAqAeH5bo",
            "to": "29OWFZGGAqAeH4jG",
            "kind": "data",
            "points": [
                [
                    3665,
                    444
                ],
                [
                    3677,
                    444
                ],
                [
                    3677,
                    352
                ],
                [
                    3805,
                    542
                ]
            ]
        },
        {
            "from": "R7cfJZGGAqAeH49p",
            "to": "29OWFZGGAqAeH4jG",
            "kind": "data",
            "points": [
                [
                    3665,
                    550
                ],
                [
                    3677,
                    550
                ],
                [
                    3677,
                    352
                ],
                [
                    3805,
                    542
                ]
            ]
        },
        {
            "from": "jJqfJZGGAqAeH6wr",
            "to": "1pJpFZGGAqAeH40N",
            "kind": "data",
            "points": [
                [
                    3463,
                    1922
                ],
                [
                    3547,
                    2112
                ]
            ]
        },
        {
            "from": "LTKfJZGGAqAeH6cw",
            "to": "KztpFZGGAqAeH5.X",
            "kind": "data",
            "points": [
                [
                    3705,
                    1902
                ],
                [
                    3787,
                    2092
                ]
            ]
        },
        {
            "from": "85PJFZGGAqAeH13G",
            "to": "txzpFZGGAqAeH6aR",
            "kind": "data",
            "points": [
                [
                    3948,
                    1898
                ],
                [
                    4027,
                    2088
                ]
            ]
        },
        {
            "from": "85PJFZGGAqAeH13G",
            "to": "hCXpFZGGAqAeH65T",
            "kind": "data",
            "points": [
                [
                    3943,
                    1957
                ],
                [
                    4037,
                    2147
                ]
            ]
        },
        {
            "from": "txzpFZGGAqAeH6aR",
            "to": "85PJFZGGAqAeH13G",
            "kind": "data",
            "points": [
                [
                    4027,
                    2100
                ],
                [
                    3948,
                    1910
                ]
            ]
        },
        {
            "from": "MCCfJZGGAqAeH5Zw",
            "to": "1pJpFZGGAqAeH40N",
            "kind": "data",
            "points": [
                [
                    3463,
                    1998
                ],
                [
                    3480,
                    1998
                ],
                [
                    3480,
                    1918
                ],
                [
                    3547,
                    2108
                ]
            ]
        },
        {
            "from": "fiCfJZGGAqAeH5aO",
            "to": "29OWFZGGAqAeH4jG",
            "kind": "data",
            "points": [
                [
                    3705,
                    442
                ],
                [
                    3678,
                    442
                ],
                [
                    3678,
                    352
                ],
                [
                    3807,
                    542
                ]
            ]
        },
        {
            "from": "QiCfJZGGAqAeH5Z_",
            "to": "29OWFZGGAqAeH4jG",
            "kind": "data",
            "points": [
                [
                    3665,
                    652
                ],
                [
                    3677,
                    652
                ],
                [
                    3677,
                    352
                ],
                [
                    3805,
                    542
                ]
            ]
        },
        {
            "from": "dyCfJZGGAqAeH5as",
            "to": "29OWFZGGAqAeH4jG",
            "kind": "data",
            "points": [
                [
                    3705,
                    545
                ],
                [
                    3678,
                    545
                ],
                [
                    3678,
                    352
                ],
                [
                    3807,
                    542
                ]
            ]
        },
        {
            "from": "LSCfJZGGAqAeH5ad",
            "to": "29OWFZGGAqAeH4jG",
            "kind": "data",
            "points": [
                [
                    3705,
                    650
                ],
                [
                    3678,
                    650
                ],
                [
                    3678,
                    352
                ],
                [
                    3807,
                    542
                ]
            ]
        },
        {
            "from": "BKCfJZGGAqAeH5a7",
            "to": "29OWFZGGAqAeH4jG",
            "kind": "data",
            "points": [
                [
                    3700,
                    725
                ],
                [
                    3678,
                    725
                ],
                [
                    3678,
                    352
                ],
                [
                    3807,
                    542
                ]
            ]
        },
        {
            "from": "mqCfJZGGAqAeH5bK",
            "to": "29OWFZGGAqAeH4jG",
            "kind": "data",
            "points": [
                [
                    3698,
                    804
                ],
                [
                    3679,
                    804
                ],
                [
                    3679,
                    352
                ],
                [
                    3807,
                    542
                ]
            ]
        },
        {
            "from": "XcCfJZGGAqAeH5Zh",
            "to": "29OWFZGGAqAeH4jG",
            "kind": "data",
            "points": [
                [
                    3659,
                    812
                ],
                [
                    3676,
                    812
                ],
                [
                    3676,
                    352
                ],
                [
                    3805,
                    542
                ]
            ]
        },
        {
            "from": "1pJpFZGGAqAeH40N",
            "to": "TBifJZGGAqAeH5rU",
            "kind": "data",
            "points": [
                [
                    3577,
                    2071
                ],
                [
                    3577,
                    2031
                ],
                [
                    3914,
                    2031
                ],
                [
                    3914,
                    538
                ],
                [
                    3908,
                    348
                ]
            ]
        },
        {
            "from": "KztpFZGGAqAeH5.X",
            "to": "TBifJZGGAqAeH5rU",
            "kind": "data",
            "points": [
                [
                    3827,
                    2067
                ],
                [
                    3827,
                    2031
                ],
                [
                    3914,
                    2031
                ],
                [
                    3914,
                    538
                ],
                [
                    3908,
                    348
                ]
            ]
        },
        {
            "from": "hCXpFZGGAqAeH65T",
            "to": "TBifJZGGAqAeH5rU",
            "kind": "data",
            "points": [
                [
                    4117,
                    2155
                ],
                [
                    4137,
                    2155
                ],
                [
                    4137,
                    2031
                ],
                [
                    3914,
                    2031
                ],
                [
                    3914,
                    538
                ],
                [
                    3910,
                    348
                ]
            ]
        },
        {
            "from": "29OWFZGGAqAeH4jG",
            "to": "2LpFFZGGAqAeH7Km",
            "kind": "data",
            "points": [
                [
                    3892,
                    570
                ],
                [
                    3930,
                    570
                ],
                [
                    3930,
                    687
                ],
                [
                    3908,
                    497
                ]
            ]
        },
        {
            "from": ".9cfJZGGAqAeH47i",
            "to": "q9klFZGGAqAeH9QR",
            "kind": "data",
            "points": [
                [
                    3705,
                    2112
                ],
                [
                    3787,
                    2302
                ]
            ]
        },
        {
            "from": "qaCfJZGGAqAeH5bZ",
            "to": "KztpFZGGAqAeH5.X",
            "kind": "data",
            "points": [
                [
                    3704,
                    1990
                ],
                [
                    3725,
                    1990
                ],
                [
                    3725,
                    1902
                ],
                [
                    3787,
                    2092
                ]
            ]
        },
        {
            "from": "HDcfJZGGAqAeH47x",
            "to": "KztpFZGGAqAeH5.X",
            "kind": "data",
            "points": [
                [
                    3703,
                    2204
                ],
                [
                    3724,
                    2204
                ],
                [
                    3724,
                    1902
                ],
                [
                    3787,
                    2092
                ]
            ]
        },
        {
            "from": "djcfJZGGAqAeH48A",
            "to": "KztpFZGGAqAeH5.X",
            "kind": "data",
            "points": [
                [
                    3704,
                    2300
                ],
                [
                    3725,
                    2300
                ],
                [
                    3725,
                    1902
                ],
                [
                    3787,
                    2092
                ]
            ]
        },
        {
            "from": "lTcfJZGGAqAeH48P",
            "to": "KztpFZGGAqAeH5.X",
            "kind": "data",
            "points": [
                [
                    3707,
                    2374
                ],
                [
                    3724,
                    2374
                ],
                [
                    3724,
                    1902
                ],
                [
                    3787,
                    2092
                ]
            ]
        },
        {
            "from": "S7xjFZGGAqAeH2od",
            "to": "iUNjFZGGAqAeH3pA",
            "kind": "data",
            "points": [
                [
                    4304,
                    1900
                ],
                [
                    4398,
                    2090
                ]
            ]
        },
        {
            "from": "sLcfJZGGAqAeH48t",
            "to": "iUNjFZGGAqAeH3pA",
            "kind": "data",
            "points": [
                [
                    4304,
                    1950
                ],
                [
                    4321,
                    1950
                ],
                [
                    4321,
                    1898
                ],
                [
                    4399,
                    2088
                ]
            ]
        },
        {
            "from": "QrcfJZGGAqAeH488",
            "to": "iUNjFZGGAqAeH3pA",
            "kind": "data",
            "points": [
                [
                    4305,
                    2038
                ],
                [
                    4321,
                    2038
                ],
                [
                    4321,
                    1900
                ],
                [
                    4397,
                    2090
                ]
            ]
        },
        {
            "from": "iUNjFZGGAqAeH3pA",
            "to": "2zcfJZGGAqAeH48e",
            "kind": "data",
            "points": [
                [
                    4479,
                    2064
                ],
                [
                    4500,
                    2064
                ],
                [
                    4500,
                    711
                ],
                [
                    4528,
                    521
                ]
            ]
        },
        {
            "from": "SvJzFZGGAqAeH0qd",
            "to": "._JzFZGGAqAeH0qs",
            "kind": "data",
            "points": [
                [
                    4955,
                    2088
                ],
                [
                    5029,
                    2278
                ]
            ]
        },
        {
            "from": "XwvTFZGGAqAeHwkr",
            "to": "mVyzFZGGAqAeHyYp",
            "kind": "data",
            "points": [
                [
                    4927,
                    401
                ],
                [
                    5019,
                    401
                ],
                [
                    5066,
                    564
                ]
            ]
        },
        {
            "from": "dnQzFZGGAqAeHxZY",
            "to": "mVyzFZGGAqAeHyYp",
            "kind": "data",
            "points": [
                [
                    4927,
                    480
                ],
                [
                    5019,
                    480
                ],
                [
                    5066,
                    564
                ]
            ]
        },
        {
            "from": "9bcfJZGGAqAeH49a",
            "to": "mVyzFZGGAqAeHyYp",
            "kind": "data",
            "points": [
                [
                    4932,
                    565
                ],
                [
                    5019,
                    565
                ],
                [
                    5066,
                    564
                ]
            ]
        },
        {
            "from": "wp8zFZGGAqAeHx8W",
            "to": "mVyzFZGGAqAeHyYp",
            "kind": "data",
            "points": [
                [
                    4932,
                    653
                ],
                [
                    5019,
                    653
                ],
                [
                    5066,
                    564
                ]
            ]
        },
        {
            "from": "dnmzFZGGAqAeHzos",
            "to": "mVyzFZGGAqAeHyYp",
            "kind": "data",
            "points": [
                [
                    4935,
                    731
                ],
                [
                    5018,
                    731
                ],
                [
                    5065,
                    564
                ]
            ]
        },
        {
            "from": "._JzFZGGAqAeH0qs",
            "to": "7rcfJZGGAqAeH49L",
            "kind": "data",
            "points": [
                [
                    5092,
                    2276
                ],
                [
                    5228,
                    2276
                ],
                [
                    5228,
                    678
                ],
                [
                    5222,
                    488
                ]
            ]
        },
        {
            "from": "cTezFZGGAqAeH0Kl",
            "to": "mVyzFZGGAqAeHyYp",
            "kind": "data",
            "points": [
                [
                    5037,
                    401
                ],
                [
                    5019,
                    401
                ],
                [
                    5066,
                    564
                ]
            ]
        },
        {
            "from": "rh4LFZGGAqAeH5nn",
            "to": "mVyzFZGGAqAeHyYp",
            "kind": "data",
            "points": [
                [
                    5019,
                    847
                ],
                [
                    5066,
                    564
                ]
            ]
        },
        {
            "from": "mVyzFZGGAqAeHyYp",
            "to": "7rcfJZGGAqAeH49L",
            "kind": "data",
            "points": [
                [
                    5109,
                    542
                ],
                [
                    5323,
                    542
                ],
                [
                    5276,
                    417
                ]
            ]
        },
        {
            "from": "PEl3FZGGAqAeH38e",
            "to": "3kl3FZGGAqAeH38v",
            "kind": "data",
            "points": [
                [
                    5001,
                    1453
                ],
                [
                    5028,
                    1453
                ],
                [
                    5028,
                    1525
                ],
                [
                    5122,
                    1715
                ]
            ]
        },
        {
            "from": "EUl3FZGGAqAeH380",
            "to": "3kl3FZGGAqAeH38v",
            "kind": "data",
            "points": [
                [
                    4998,
                    1546
                ],
                [
                    5122,
                    1736
                ]
            ]
        },
        {
            "from": "V0l3FZGGAqAeH39s",
            "to": ".kl3FZGGAqAeH38q",
            "kind": "data",
            "points": [
                [
                    5017,
                    1028
                ],
                [
                    5086,
                    1218
                ]
            ]
        },
        {
            "from": "7Ul3FZGGAqAeH39O",
            "to": "YMl3FZGGAqAeH397",
            "kind": "data",
            "points": [
                [
                    5020,
                    1113
                ],
                [
                    5084,
                    1303
                ]
            ]
        },
        {
            "from": "Kkl3FZGGAqAeH38k",
            "to": "3kl3FZGGAqAeH38v",
            "kind": "data",
            "points": [
                [
                    4998,
                    1510
                ],
                [
                    5029,
                    1510
                ],
                [
                    5029,
                    1526
                ],
                [
                    5122,
                    1716
                ]
            ]
        },
        {
            "from": ".Ul3FZGGAqAeH38_",
            "to": "nMl3FZGGAqAeH3.P",
            "kind": "data",
            "points": [
                [
                    5000,
                    1656
                ],
                [
                    5000,
                    1671
                ],
                [
                    5104,
                    1861
                ]
            ]
        },
        {
            "from": "y0l3FZGGAqAeH39d",
            "to": ".kl3FZGGAqAeH38q",
            "kind": "data",
            "points": [
                [
                    5015,
                    1180
                ],
                [
                    5021,
                    1180
                ],
                [
                    5021,
                    1030
                ],
                [
                    5086,
                    1220
                ]
            ]
        },
        {
            "from": ".Ul3FZGGAqAeH38_",
            "to": "yUl3FZGGAqAeH386",
            "kind": "data",
            "points": [
                [
                    5002,
                    1643
                ],
                [
                    5104,
                    1833
                ]
            ]
        },
        {
            "from": "3kl3FZGGAqAeH38v",
            "to": ".Ul3FZGGAqAeH38_",
            "kind": "data",
            "points": [
                [
                    5122,
                    1742
                ],
                [
                    5075,
                    1742
                ],
                [
                    5075,
                    1788
                ],
                [
                    4973,
                    1788
                ],
                [
                    4926,
                    1619
                ]
            ]
        },
        {
            "from": "MGavFZGGAqAeH5AD",
            "to": "COavFZGGAqAeH5AS",
            "kind": "data",
            "points": [
                [
                    5615,
                    1437
                ],
                [
                    5643,
                    1437
                ],
                [
                    5643,
                    1510
                ],
                [
                    5737,
                    1700
                ]
            ]
        },
        {
            "from": "vuavFZGGAqAeH5AX",
            "to": "COavFZGGAqAeH5AS",
            "kind": "data",
            "points": [
                [
                    5613,
                    1530
                ],
                [
                    5737,
                    1720
                ]
            ]
        },
        {
            "from": "opavFZGGAqAeH5Aw",
            "to": "pWavFZGGAqAeH5AN",
            "kind": "data",
            "points": [
                [
                    5631,
                    1012
                ],
                [
                    5701,
                    1202
                ]
            ]
        },
        {
            "from": "CRavFZGGAqAeH5Am",
            "to": ".ZavFZGGAqAeH5A1",
            "kind": "data",
            "points": [
                [
                    5635,
                    1098
                ],
                [
                    5698,
                    1288
                ]
            ]
        },
        {
            "from": "8mavFZGGAqAeH5AI",
            "to": "COavFZGGAqAeH5AS",
            "kind": "data",
            "points": [
                [
                    5613,
                    1494
                ],
                [
                    5645,
                    1494
                ],
                [
                    5645,
                    1510
                ],
                [
                    5737,
                    1700
                ]
            ]
        },
        {
            "from": "bBavFZGGAqAeH5Ah",
            "to": "FlavFZGGAqAeH5A_",
            "kind": "data",
            "points": [
                [
                    5616,
                    1640
                ],
                [
                    5616,
                    1657
                ],
                [
                    5718,
                    1847
                ]
            ]
        },
        {
            "from": "FxavFZGGAqAeH5Ar",
            "to": "pWavFZGGAqAeH5AN",
            "kind": "data",
            "points": [
                [
                    5630,
                    1163
                ],
                [
                    5635,
                    1163
                ],
                [
                    5635,
                    1013
                ],
                [
                    5701,
                    1203
                ]
            ]
        },
        {
            "from": "bBavFZGGAqAeH5Ah",
            "to": "S.avFZGGAqAeH5Ac",
            "kind": "data",
            "points": [
                [
                    5618,
                    1629
                ],
                [
                    5718,
                    1819
                ]
            ]
        },
        {
            "from": "COavFZGGAqAeH5AS",
            "to": "bBavFZGGAqAeH5Ah",
            "kind": "data",
            "points": [
                [
                    5737,
                    1725
                ],
                [
                    5691,
                    1725
                ],
                [
                    5691,
                    1773
                ],
                [
                    5590,
                    1773
                ],
                [
                    5543,
                    1604
                ]
            ]
        },
        {
            "from": "yPjvFZGGAqAeH7rC",
            "to": "U_jvFZGGAqAeH7rR",
            "kind": "data",
            "points": [
                [
                    5587,
                    1920
                ],
                [
                    5697,
                    2110
                ]
            ]
        },
        {
            "from": "U_jvFZGGAqAeH7rR",
            "to": "DvRvFZGGAqAeH5v4",
            "kind": "data",
            "points": [
                [
                    5759,
                    2085
                ],
                [
                    5961,
                    2085
                ],
                [
                    5961,
                    592
                ],
                [
                    5945,
                    402
                ]
            ]
        },
        {
            "from": "pWavFZGGAqAeH5AN",
            "to": "DvRvFZGGAqAeH5v4",
            "kind": "data",
            "points": [
                [
                    5798,
                    1174
                ],
                [
                    5961,
                    1174
                ],
                [
                    5961,
                    592
                ],
                [
                    5945,
                    402
                ]
            ]
        },
        {
            "from": ".ZavFZGGAqAeH5A1",
            "to": "DvRvFZGGAqAeH5v4",
            "kind": "data",
            "points": [
                [
                    5795,
                    1259
                ],
                [
                    5960,
                    1259
                ],
                [
                    5960,
                    592
                ],
                [
                    5945,
                    402
                ]
            ]
        },
        {
            "from": "S.avFZGGAqAeH5Ac",
            "to": "DvRvFZGGAqAeH5v4",
            "kind": "data",
            "points": [
                [
                    5788,
                    1774
                ],
                [
                    5961,
                    1774
                ],
                [
                    5961,
                    592
                ],
                [
                    5945,
                    402
                ]
            ]
        },
        {
            "from": "nMl3FZGGAqAeH3.P",
            "to": "SvJzFZGGAqAeH0qd",
            "kind": "data",
            "points": [
                [
                    5137,
                    1887
                ],
                [
                    5137,
                    1947
                ],
                [
                    4947,
                    1947
                ],
                [
                    4900,
                    2039
                ]
            ]
        },
        {
            "from": "FlavFZGGAqAeH5A_",
            "to": "yPjvFZGGAqAeH7rC",
            "kind": "data",
            "points": [
                [
                    5752,
                    1874
                ],
                [
                    5752,
                    1949
                ],
                [
                    5560,
                    1949
                ],
                [
                    5513,
                    1868
                ]
            ]
        }
    ],
    "lanes": [
        {
            "y": 0,
            "h": 287,
            "label": "Resp. Legal"
        },
        {
            "y": 287,
            "h": 664,
            "label": "Responsável Técnico"
        },
        {
            "y": 950,
            "h": 435,
            "label": "Campo"
        },
        {
            "y": 1385,
            "h": 437,
            "label": "Laboratório"
        },
        {
            "y": 1820,
            "h": 635,
            "label": "Atividades Especializadas"
        },
        {
            "y": 2455,
            "h": 397,
            "label": "Órgãos Públicos"
        }
    ],
    "groups": [
        {
            "x": 86,
            "y": 140,
            "w": 966,
            "h": 2906,
            "label": "Detecção"
        },
        {
            "x": 1068,
            "y": 135,
            "w": 2270,
            "h": 2912,
            "label": "Caracterização"
        },
        {
            "x": 3357,
            "y": 135,
            "w": 1460,
            "h": 2912,
            "label": "Remediação"
        },
        {
            "x": 4826,
            "y": 136,
            "w": 626,
            "h": 2912,
            "label": "Acompanhamento"
        },
        {
            "x": 5452,
            "y": 135,
            "w": 808,
            "h": 2912,
            "label": "Fechamento"
        }
    ],
    "presetId": "m01.gac.flow.dd38",
    "templateId": "gac-dd38-environmental-management",
    "standard": "CETESB DD 038/2017",
    "sourceFile": "01_DadosAnaliticos.vpp",
    "sourceFormat": "visual-paradigm-vpp",
    "sourceCounts": {
        "nodes": 261,
        "edges": 386,
        "tasks": 198,
        "decisions": 15,
        "dataStores": 46,
        "dataStoresWithFilesTarget": 46,
        "edgesWithPoints": 386
    },
    "selectedNodeId": "gac.phase.characterization",
    "selectedVppNodeId": "kLUgpZGGAqAeH3pw"
};

function clean(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function textForTarget(value: unknown): string {
    if (!value || typeof value !== 'object') return String(value || '');
    const record = value as Record<string, unknown>;
    const model = record.model && typeof record.model === 'object'
        ? record.model as Record<string, unknown>
        : null;
    return [
        record.id,
        record.name,
        record.title,
        record.pipelineId,
        record.presetId,
        record.templateId,
        record.nodeId,
        record.target,
        record.hint,
        record.standard,
        record.sourceFile,
        model?.id,
        model?.name,
        model?.title,
        model?.presetId,
        model?.templateId,
        model?.standard,
        model?.sourceFile,
    ].map((part) => String(part || '')).join(' ');
}

function graphForTarget(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.nodes)) return record;
    if (record.model && typeof record.model === 'object') {
        const model = record.model as Record<string, unknown>;
        if (Array.isArray(model.nodes)) return model;
    }
    return null;
}

function hasGacDd38GraphSignature(value: unknown): boolean {
    const graph = graphForTarget(value);
    if (!graph) return false;
    const nodes = Array.isArray(graph.nodes) ? graph.nodes as Record<string, unknown>[] : [];
    const edges = Array.isArray(graph.edges) ? graph.edges as Record<string, unknown>[] : [];
    const sourceCounts = graph.sourceCounts && typeof graph.sourceCounts === 'object'
        ? graph.sourceCounts as Record<string, unknown>
        : {};
    const hasSelectedNode = nodes.some((node) =>
        String(node.nodeId || node.id || '') === GAC_DD38_SELECTED_NODE_ID ||
        String(node.id || '') === GAC_DD38_SELECTED_VPP_NODE_ID
    );
    const dataStores = nodes.filter((node) => String(node.type || '') === 'data_store').length;
    const sourceDataStores = Number(sourceCounts.dataStores || 0);
    const sourceEdges = Number(sourceCounts.edgesWithPoints || 0);
    return hasSelectedNode && (
        (nodes.length >= 250 && edges.length >= 350) ||
        sourceDataStores === 46 ||
        sourceEdges === 386 ||
        dataStores >= 40
    );
}

export function isGacDd38PipelineTarget(value: unknown): boolean {
    const raw = clean(textForTarget(value));
    const text = raw.replace(/[^a-z0-9]+/g, ' ');
    const templateText = GAC_DD38_TEMPLATE_ID.replace(/[^a-z0-9]+/g, ' ');
    return (
        raw === GAC_DD38_PIPELINE_ID ||
        raw === GAC_DD38_SELECTED_NODE_ID ||
        hasGacDd38GraphSignature(value) ||
        text.includes('gac dd38') ||
        text.includes('gac dd 038') ||
        text.includes('dd38') ||
        text.includes('dd 038') ||
        text.includes(templateText)
    );
}

function cloneModel(): GacDd38PipelineModel {
    return JSON.parse(JSON.stringify(GAC_DD38_VPP_MODEL)) as GacDd38PipelineModel;
}

export function buildGacDd38PipelineModel(): GacDd38PipelineModel {
    return cloneModel();
}

export function buildGacDd38PipelineEntry() {
    return {
        id: GAC_DD38_PIPELINE_ID,
        name: GAC_DD38_PIPELINE_NAME,
        presetId: GAC_DD38_PIPELINE_ID,
        templateId: GAC_DD38_TEMPLATE_ID,
        nodeId: GAC_DD38_SELECTED_NODE_ID,
        sourceFile: GAC_DD38_SOURCE_FILE,
        sourceFormat: 'visual-paradigm-vpp',
        xml: '',
        model: buildGacDd38PipelineModel(),
    };
}

function edgeKindForPack(kind: unknown): PipelinePackEdge['kind'] {
    return String(kind || '') === 'data' ? 'data-association' : 'control-flow';
}

function edgePointsForPack(points: unknown): PipelinePackEdge['points'] {
    if (!Array.isArray(points)) return undefined;
    const normalized = points
        .map((point) => {
            if (Array.isArray(point) && point.length >= 2) {
                const x = Number(point[0]);
                const y = Number(point[1]);
                return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
            }
            return null;
        })
        .filter((point): point is { x: number; y: number } => !!point);
    return normalized.length ? normalized : undefined;
}

function moduleTargetForNode(node: Record<string, unknown>): PipelineModuleTarget | null {
    const nodeId = String(node.id || '');
    const label = String(node.contextLabel || node.label || nodeId);
    if (node.targetModule === 'files') {
        return {
            id: `gac-dd38-files-${nodeId}`,
            ownerNodeId: nodeId,
            label,
            moduleId: 'files',
            adapterId: 'files.gac',
            openMode: 'side-panel',
            targetParams: {
                ...(node.moduleInputParams && typeof node.moduleInputParams === 'object'
                    ? (node.moduleInputParams as Record<string, unknown>)
                    : {}),
                source: 'pipeline-pack',
                pipelineId: GAC_DD38_PIPELINE_ID,
            },
            fallback: {
                type: 'message',
                text: `Mostrar evidencia de ${label} no contexto do GAC/DD38.`,
            },
            requiredPermission: 'view',
        };
    }
    if (String(node.type || '') !== 'condition') return null;
    return {
        id: `gac-dd38-decision-${nodeId}`,
        ownerNodeId: nodeId,
        label: `Revisar decisao: ${label}`,
        moduleId: 'pipelines',
        adapterId: 'pipelines.gac-decision',
        openMode: 'side-panel',
        targetParams: {
            source: 'pipeline-pack',
            pipelineId: GAC_DD38_PIPELINE_ID,
            presetId: GAC_DD38_PIPELINE_ID,
            templateId: GAC_DD38_TEMPLATE_ID,
            nodeId,
            standard: 'CETESB DD 038/2017',
            phase: String(node.phase || ''),
            lane: String(node.lane || ''),
            decisionKind: 'conditional-route',
            requiresUserCriteria: true,
        },
        fallback: {
            type: 'message',
            text: `Revisar criterios e caminhos da decisao ${label} no Workbench do GAC/DD38.`,
        },
        requiredPermission: 'view',
    };
}

function nodeForPack(node: Record<string, unknown>): PipelinePackNode {
    const out: PipelinePackNode = {
        id: String(node.id || ''),
        type: String(node.type || 'action'),
        label: String(node.label || node.id || ''),
    };
    for (const key of ['x', 'y', 'w', 'h'] as const) {
        const value = Number(node[key]);
        if (Number.isFinite(value)) out[key] = value;
    }
    for (const key of ['color', 'lane', 'phase', 'contextLabel', 'semanticRole', 'targetModule'] as const) {
        const value = String(node[key] || '').trim();
        if (value) out[key] = value;
    }
    if (node.moduleInputParams && typeof node.moduleInputParams === 'object') {
        out.moduleInputParams = node.moduleInputParams as Record<string, unknown>;
    }
    return out;
}

export function buildGacDd38PipelinePack(): PipelinePack {
    const model = buildGacDd38PipelineModel();
    const moduleTargets = model.nodes
        .map((node) => moduleTargetForNode(node as Record<string, unknown>))
        .filter((target): target is PipelineModuleTarget => !!target);
    return {
        id: `${GAC_DD38_PIPELINE_ID}.pack`,
        title: GAC_DD38_PIPELINE_NAME,
        description: 'Pipeline Pack de referencia para aula e auditoria do fluxo GAC-DD38/CETESB DD 038/2017.',
        schemaVersion: '1.0.0',
        version: '1.0.0',
        source: {
            kind: 'vpp',
            semantics: 'semantic',
            sourceFileName: GAC_DD38_SOURCE_FILE,
        },
        graph: {
            nodes: model.nodes.map((node) => nodeForPack(node as Record<string, unknown>)),
            edges: model.edges.map((edge, index) => {
                const raw = edge as Record<string, unknown>;
                const points = edgePointsForPack(raw.points);
                return {
                    id: String(raw.id || `gac-dd38-edge-${index + 1}`),
                    source: String(raw.from || raw.source || ''),
                    target: String(raw.to || raw.target || ''),
                    kind: edgeKindForPack(raw.kind),
                    ...(String(raw.label || '').trim() ? { label: String(raw.label) } : {}),
                    ...(points ? { points } : {}),
                };
            }),
            lanes: model.lanes.map((lane, index) => ({
                id: `gac-dd38-lane-${index + 1}`,
                label: String(lane.label || `Raia ${index + 1}`),
                y: Number(lane.y) || 0,
                h: Number(lane.h) || 0,
            })),
            groups: model.groups.map((group, index) => ({
                id: `gac-dd38-group-${index + 1}`,
                label: String(group.label || `Fase ${index + 1}`),
                x: Number(group.x) || 0,
                y: Number(group.y) || 0,
                w: Number(group.w) || 0,
                h: Number(group.h) || 0,
            })),
            startNodeIds: [model.startNodeId],
            endNodeIds: model.nodes.filter((node) => node.type === 'end').map((node) => String(node.id)),
        },
        layout: {
            renderTheme: 'reference-light',
            hasReferenceOverlay: true,
        },
        semantics: {
            domain: 'gac-dd38',
            glossary: {
                GAC: 'Gerenciamento de Areas Contaminadas',
                'DD-38': 'Decisao de Diretoria CETESB 038/2017',
            },
            entries: model.nodes.map((node) => ({
                nodeId: String(node.id),
                label: String(node.contextLabel || node.label || node.id),
                meaning: String(node.contextLabel || node.label || node.id),
                domainTags: [
                    'gac',
                    String(node.phase || '').toLowerCase().replace(/\s+/g, '-'),
                    String(node.lane || '').toLowerCase().replace(/\s+/g, '-'),
                ].filter(Boolean),
                confidence: 'imported',
            })),
        },
        moduleTargets,
        variants: [
            {
                id: 'gac-dd38-present',
                label: 'Apresentar GAC/DD38',
                mode: 'present',
                description: 'Versao limpa para aula e reuniao.',
            },
            {
                id: 'gac-dd38-audit',
                label: 'Auditar GAC/DD38',
                mode: 'audit',
                description: 'Versao com score, referencia e quadrantes.',
            },
        ],
        validationProfile: {
            scoreModel: 'unified-0-1000',
            scope: 'pipeline-gac-dd38',
            minScore: 980,
            visualForegroundMin: 95,
            requiredChecks: ['graph', 'connectors', 'lanes', 'groups', 'files-bridge', 'visual-foreground'],
            quadrantPolicy: {
                grid: '4x4',
                reportWorstBlocks: 4,
            },
        },
        assets: [
            {
                id: 'gac-dd38-source-vpp',
                label: 'Fonte Visual Paradigm',
                kind: 'document',
                status: 'local-only',
                fileName: GAC_DD38_SOURCE_FILE,
                linkedNodeIds: [],
            },
            {
                id: 'gac-dd38-reference-pdf',
                label: 'Referencia visual PDF',
                kind: 'reference',
                status: 'local-only',
                fileName: 'Aula 3_Diagrama_GAC-DD38_v01.pdf',
                linkedNodeIds: [],
            },
        ],
        permissions: {
            defaultPermission: 'view',
            allowedRoles: ['teacher', 'student', 'owner'],
        },
        audit: {
            lastScore: 1000,
            foregroundVisual: 95.49,
            notes: [
                'Preset VPP real com 261 nos e 386 conectores.',
                '46/46 depositos de dados possuem ponte para Files.',
                'Foreground visual 95.49 no comparador por quadrantes 4x4 com subquadrantes 2x2.',
            ],
        },
    };
}
