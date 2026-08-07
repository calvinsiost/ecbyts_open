// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Edital Tab handler — expoe renderEditalTab no window.* para que o composer
 * do workbench (ou qualquer integracao/teste) invoque a aba "Edital" sem
 * depender de import estatico (mesmo padrao dos demais handlers do registry).
 * O botao "re-executar conformidade" da aba dispatcha o custom event
 * EDITAL_RERUN_EVENT; o listener de backend e responsabilidade de quem integra.
 */

import { renderEditalTab, EDITAL_RERUN_EVENT } from '../ui/editalTab.js';
import type { EditalData } from '../ui/editalTab.js';

export function handleRenderEditalTab(container: HTMLElement | null | undefined, editalData: EditalData | null | undefined): void {
    renderEditalTab(container, editalData);
}

export const editalTabHandlers = { handleRenderEditalTab, renderEditalTab, EDITAL_RERUN_EVENT };
