// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
import { registerFamilyModule } from '../../familyModuleRegistry.js';
registerFamilyModule({
    familyId: 'remediation',
    moduleId: 'remediation-operational-pipeline',
    nameKey: 'familyModule.remediationPipeline',
    icon: 'git-branch',
    description: 'Operational pipeline linkage and runtime status for remediation systems',
    capabilities: ['pipeline-link', 'pipeline-run', 'runtime-status'],
    loader: () => import('./RemediationPipelineModule.js' as string),
});
