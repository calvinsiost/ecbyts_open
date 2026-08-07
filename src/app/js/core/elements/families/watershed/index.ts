// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   WATERSHED FAMILY MODULE — Registro do descriptor (WATERSHED-FAMILY-001).

   Registra o WatershedModule para elementos da família 'watershed' (bacia
   hidrográfica). Carregamento lazy: o código real (WatershedModule.js) só é
   importado quando o usuário abre o módulo. A lógica de cálculo vive em
   _watershedBindingPure.ts (amarra família ↔ algoritmo D8 de core/hydrology).
   ================================================================ */

import { registerFamilyModule } from '../../familyModuleRegistry.js';

registerFamilyModule({
    familyId: 'watershed',
    moduleId: 'watershed-delineator',
    nameKey: 'familyModule.watershedDelineator',
    icon: 'droplet',
    description: 'Delineação de bacia hidrográfica (D8 + Priority-Flood) a partir do terreno',
    capabilities: ['delineation', 'flow-path', 'accumulation'],
    loader: () => import('./WatershedModule.js' as string),
});
