// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   LOADING TIPS — First-journey usage hints
   Dicas rotativas exibidas no subtitulo do loading.
   ================================================================ */

export const LOADING_TIPS_MIN_COUNT = 100;

const BASE_TIPS_PT_BR = [
    'Comece pelo modo Aleatorio para explorar a interface rapidamente.',
    'Use Abrir quando quiser importar um modelo pronto.',
    'Use Importar EDD para planilhas de dados ambientais.',
    'Use DXF/CAD para plantas e arquivos espaciais.',
    'Salve antes de trocar de aba em tarefas criticas.',
    'Se algo sumir, use Restaurar layout padrao.',
    'No 3D, use Fit para centralizar todos os elementos.',
    'O painel Elementos mostra o que realmente esta no modelo.',
    'Campanhas organizam suas observacoes por periodo.',
    'Adicione parametros antes de preencher leituras em lote.',
    'Use Desfazer e Refazer para testar sem medo.',
    'A visualizacao Topo ajuda na conferencia de coordenadas.',
    'A visualizacao Frente ajuda a revisar profundidades.',
    'Use Marcador para destacar pontos de interesse.',
    'Nao encontrou um botao? Verifique o menu Mais.',
    'No mobile, prefira fluxo curto: gerar, editar, salvar.',
    'Se travar no tutorial, feche e retome depois.',
    'A importacao de dados pede revisao humana no wizard.',
    'Revise unidades antes de concluir a importacao.',
    'No merge, preserve dados locais quando houver duvida.',
    'Use o status da barra inferior para confirmar o estado.',
    'Ao editar coordenadas, salve para persistir a mudanca.',
    'Use Campanha para separar coletas de meses diferentes.',
    'A tela de arquivos ajuda a rastrear uploads recentes.',
    'Sempre valide leituras fora da faixa esperada.',
    'Use notas claras em elementos para facilitar auditoria.',
    'Se um import falhar, tente primeiro um arquivo menor.',
    'Prefira nomes curtos e consistentes para elementos.',
    'Para comparacao rapida, use cenas salvas da camera.',
    'A aba de dados acelera edicao em massa.',
    'Ajuste o zoom antes de selecionar vertices pequenos.',
    'Elementos selecionados aparecem com destaque no 3D.',
    'Se houver conflito entre abas, escolha uma fonte oficial.',
    'Use um padrao de nome para campanhas e locais.',
    'Evite abrir muitos modais ao mesmo tempo no mobile.',
    'No inicio, foque em um fluxo simples de ponta a ponta.',
    'Importar, revisar, salvar e recarregar e o ciclo minimo.',
    'Verifique o idioma antes de iniciar um treinamento guiado.',
    'Salvamento local protege seu progresso entre recargas.',
    'Use o painel de ajuda para revisar funcionalidades.',
    'No georreferenciamento, confira latitude e longitude.',
    'Ajustes pequenos e frequentes evitam perda de contexto.',
    'Use o filtro de familias para reduzir ruido visual.',
    'No onboarding, avance passo a passo sem pular contexto.',
    'Se um botao estiver desabilitado, confira requisito previo.',
    'Apos importar, revise elementos criados automaticamente.',
    'Para dados tabulares, valide cabecalhos antes do envio.',
    'Se possivel, mantenha uma aba por tarefa principal.',
    'Evite editar o mesmo modelo em duas abas ao mesmo tempo.',
    'No erro de rede, tente novamente antes de recarregar tudo.',
    'Use snapshots para comparar estado antes e depois.',
    'Revisar status de salvamento evita retrabalho.',
    'Ajuste o layout para deixar a area 3D mais limpa.',
    'Se a tela parecer vazia, use Fit All.',
    'Observe toasts: eles mostram sucesso e falhas relevantes.',
    'Campos obrigatorios geralmente aparecem primeiro no formulario.',
    'Use nomes sem caracteres estranhos em importacoes.',
    'No merge, leia o resumo antes de confirmar.',
    'No primeiro uso, prefira datasets pequenos.',
    'Dados bem nomeados facilitam busca futura.',
    'No painel direito, revise propriedades do item selecionado.',
    'Use cenas para registrar viewpoints importantes.',
    'No import, escolha o fluxo correto antes de anexar arquivo.',
    'Para planilhas complexas, use mapeamento assistido por IA.',
    'Quando possivel, mantenha unidades consistentes.',
    'No mobile, role menos usando os atalhos do ribbon.',
    'Se algo nao salvar, tente novamente e verifique status.',
    'Use o historico para voltar mudancas nao desejadas.',
    'No inicio, use poucos elementos para aprender o fluxo.',
    'Elementos demais no inicio podem confundir a navegacao.',
    'Prefira uma campanha por janela temporal clara.',
    'Dados sem unidade reduzem confiabilidade do resultado.',
    'No tutorial, leia o titulo e o objetivo de cada etapa.',
    'Nao force avancar sem concluir a acao da etapa.',
    'Use o painel de arquivos para reaproveitar materiais.',
    'No import espacial, valide projecao e origem.',
    'Use o status de autenticacao antes de salvar na nuvem.',
    'Salvar local e nuvem tem comportamentos diferentes.',
    'Se estiver em duvida, salve local primeiro.',
    'No loading, as dicas mostram atalhos de produtividade.',
    'Ajustar o layout cedo melhora foco na tarefa.',
    'Use filtros para encontrar elementos mais rapido.',
    'No 3D, clique em um item e confira detalhes no painel.',
    'Para iniciar rapido, gere um modelo e depois refine.',
    'No merge, conflitos exigem decisao consciente.',
    'Nao ignore avisos de coordenadas distantes.',
    'Padronize nomes de arquivos antes de importar.',
    'Para treinamento, use um caso simples e repetivel.',
    'Evite multitarefa no primeiro contato com o sistema.',
    'Confirme que a campanha correta esta ativa.',
    'Antes de exportar, valide se tudo esta salvo.',
    'No erro de permissao, verifique seu login.',
    'No erro de formato, revise cabecalhos da planilha.',
    'Use variaveis de campo para padronizar entradas.',
    'Se o painel sumiu, recupere pelo comando de layout.',
    'No mobile, prefira orientacao paisagem para edicao densa.',
    'Use labels com parcimonia para reduzir poluicao visual.',
    'A cada etapa concluida, verifique o estado salvo.',
    'O fluxo ideal e simples: importar, validar, salvar.',
    'Se algo parecer duplicado, revise merge e campanha.',
    'Antes de deletar, confirme o elemento selecionado.',
    'Use undo logo apos uma exclusao acidental.',
    'No import, trate avisos como sinais de qualidade.',
    'Ao editar lotes, salve em intervalos curtos.',
    'Quando possivel, evite nomes iguais para elementos.',
    'No inicio, escolha um unico objetivo por sessao.',
    'Use o menu de ajuda para reaprender atalhos.',
    'Para performance, feche paineis que nao esta usando.',
    'Carregamento lento? Aguarde os modulos essenciais primeiro.',
    'No merge complexo, trabalhe em partes menores.',
    'Se perder contexto, retorne a Home e recomeca o fluxo.',
    'No upload, prefira arquivos limpos e sem colunas vazias.',
    'Para rastreabilidade, mantenha data e unidade nas leituras.',
    'A cada importacao, confira contagem de elementos criados.',
    'Com dados sensiveis, revise acesso e permissao.',
    'Se o passo nao fez efeito, confirme o item selecionado.',
    'Antes de fechar, aguarde o estado Salvo.',
    'Use o workflow guiado para reduzir erros de primeira jornada.',
    'Quando em duvida, simplifique o fluxo e valide incrementalmente.',
];

const BASE_TIPS_EN_US = [
    'Start with Random mode to explore the interface quickly.',
    'Use Open when you need to import an existing model.',
    'Use Data Import for spreadsheet-based environmental datasets.',
    'Use DXF/CAD for spatial blueprint files.',
    'Save before switching tabs on critical tasks.',
    'If panels disappear, use Restore default layout.',
    'In 3D view, use Fit to center all elements.',
    'The Elements panel shows what is truly in the model.',
    'Campaigns group observations by time window.',
    'Add parameters before bulk editing readings.',
    'Use Undo and Redo to experiment safely.',
    'Top view is best for coordinate checks.',
    'Front view is best for depth checks.',
    'Use Marker to highlight key locations.',
    'Cannot find a button? Check the More menu.',
    'On mobile, prefer short flows: generate, edit, save.',
    'If a tutorial stalls, close and resume later.',
    'Data import requires human review in the wizard.',
    'Review units before finalizing import.',
    'During merge, preserve local data when unsure.',
];

function _buildTips(locale: any): string[] {
    if (locale === 'pt-BR') return BASE_TIPS_PT_BR;
    return BASE_TIPS_EN_US;
}

/**
 * Get tips for a locale.
 * pt-BR is primary; en-US fallback is guaranteed.
 */
export function getLoadingTips(locale: string = 'pt-BR'): string[] {
    const normalized = locale && locale.toLowerCase() === 'pt-br' ? 'pt-BR' : 'en-US';
    const tips = _buildTips(normalized);
    if (tips.length >= LOADING_TIPS_MIN_COUNT || normalized === 'pt-BR') return tips;
    return BASE_TIPS_PT_BR;
}

/**
 * Create a tip picker that avoids immediate repetition.
 */
export function createLoadingTipPicker(tips: string[], recentWindow: number = 8): () => string {
    const history: any[] = [];
    const safeTips = Array.isArray(tips) ? tips.filter(Boolean) : [];
    return function pickNextTip() {
        if (!safeTips.length) return '';
        const blocked = new Set(history.slice(-recentWindow));
        const candidates = safeTips.filter((tip) => !blocked.has(tip));
        const pool = candidates.length ? candidates : safeTips;
        const chosen = pool[Math.floor(Math.random() * pool.length)] as string;
        history.push(chosen);
        if (history.length > 128) history.shift();
        return chosen;
    };
}
