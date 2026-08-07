// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Well Family - Descriptor Registration
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   WELL FAMILY MODULE — Registro do descriptor.

   Este arquivo e importado no boot da aplicacao. Registra apenas
   metadata leve e uma funcao loader. O codigo real do modulo
   (WellProfileModule.js, renderer.js, etc.) so e carregado via
   import() dinamico quando o usuario seleciona um elemento 'well'.

   Custo no boot: ~0.5 KB transferido, zero execucao pesada.
   ================================================================ */
import { registerFamilyModule } from '../../familyModuleRegistry.js';
registerFamilyModule({
    familyId: 'well',
    moduleId: 'well-profile',
    nameKey: 'familyModule.wellProfile',
    icon: 'layers',
    description: 'Constructive + lithologic well profile with SVG rendering',
    capabilities: ['profile', 'svg-export', 'validation', 'editor'],
    loader: () => import('./WellProfileModule.js' as string),
});
registerFamilyModule({
    familyId: 'well',
    moduleId: 'directional-survey',
    nameKey: 'familyModule.directionalSurvey',
    icon: 'navigation',
    description: 'Directional well survey import (LAS 2.0/3.0 + CSV) and trajectory visualization',
    capabilities: ['las-import', 'csv-import', 'trajectory', 'intersection-source'],
    loader: () => import('./DirectionalSurveyModule.js' as string),
});
