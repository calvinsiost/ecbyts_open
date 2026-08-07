// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   FAULT FAMILY MODULE — Registro do descriptor.

   Registra o FaultInspectorModule (P1-8 P6) para elementos da família 'fault'.
   Carregamento lazy: código real (FaultInspectorModule.js) só importado
   quando o usuário abre o módulo pela primeira vez.
   ================================================================ */
import { registerFamilyModule } from '../../familyModuleRegistry.js';
registerFamilyModule({
    familyId: 'fault',
    moduleId: 'fault-inspector',
    nameKey: 'familyModule.faultInspector',
    icon: 'activity',
    description: 'Strike/dip structural editor + directional well intersection viewer',
    capabilities: ['editor', 'intersection-report'],
    loader: () => import('./FaultInspectorModule.js' as string),
});
