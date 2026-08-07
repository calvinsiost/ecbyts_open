// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Core Technical References - ECBT Canonical Seed
 * 8 referências canônicas do produto: normas, regulamentos, guidelines e acadêmicas.
 */

import { createReference, REFERENCE_TYPES } from './referencesSchema.js';

export const CORE_REFERENCES = [
    createReference({
        id: 'ref-conama-420',
        type: REFERENCE_TYPES.REGULATION,
        title: 'Qualidade do Solo e Prevenção da Poluição',
        code: 'CONAMA 420/2009',
        moduleTags: ['validation', 'eis'],
    }),
    createReference({
        id: 'ref-cetesb-dd256',
        type: REFERENCE_TYPES.GUIDELINE,
        title: 'Valores Orientadores para Solo e Água Subterrânea',
        code: 'CETESB DD-256/2016',
        moduleTags: ['validation', 'eis'],
    }),
    createReference({
        id: 'ref-abnt-15515-1',
        type: REFERENCE_TYPES.STANDARD,
        title: 'Passivo Ambiental em Solo e Água Subterrânea — Parte 1',
        code: 'ABNT NBR 15515-1',
        moduleTags: ['assessment'],
    }),
    createReference({
        id: 'ref-abnt-15515-3',
        type: REFERENCE_TYPES.STANDARD,
        title: 'Passivo Ambiental em Solo e Água Subterrânea — Parte 3',
        code: 'ABNT NBR 15515-3',
        moduleTags: ['assessment'],
    }),
    createReference({
        id: 'ref-rw-2006',
        type: REFERENCE_TYPES.ACADEMIC,
        title: 'Gaussian Processes for Machine Learning',
        code: 'Rasmussen & Williams 2006',
        doi: '10.7551/mitpress/3206.001.0001',
        moduleTags: ['geoml'],
    }),
    createReference({
        id: 'ref-isaaks-1989',
        type: REFERENCE_TYPES.ACADEMIC,
        title: 'An Introduction to Applied Geostatistics',
        code: 'Isaaks & Srivastava 1989',
        moduleTags: ['interpolation'],
    }),
    createReference({
        id: 'ref-usepa-rags',
        type: REFERENCE_TYPES.GUIDELINE,
        title: 'Risk Assessment Guidance for Superfund',
        code: 'USEPA RAGS Part A',
        moduleTags: ['analytics', 'eis'],
    }),
    createReference({
        id: 'ref-gum-2008',
        type: REFERENCE_TYPES.STANDARD,
        title: 'Evaluation of Measurement Data — Guide to Expression of Uncertainty',
        code: 'GUM JCGM 100:2008',
        moduleTags: ['uncertainty'],
    }),
];
