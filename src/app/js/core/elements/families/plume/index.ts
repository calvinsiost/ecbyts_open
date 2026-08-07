// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
import { registerFamilyModule } from '../../familyModuleRegistry.js';
registerFamilyModule({
    familyId: 'plume',
    moduleId: 'plume-submodules',
    nameKey: 'familyModule.plumeSubmodules',
    icon: 'droplets',
    description: 'Controles de matriz e forma da pluma com aplicacao explicita',
    capabilities: ['matrix', 'shape', 'validation', 'autosave'],
    loader: () => import('./PlumeSubmodulesModule.js' as string),
});
