// SheetJS via global (convenção do app — reportBuilder/ecbtAuditTrailExporter):
// sem bundler, bare specifier 'xlsx' não resolve no browser (gate
// import-resolution). Node (testes) injeta globalThis.XLSX antes de chamar.
function _xlsx(): any {
  const x = (globalThis as any).XLSX;
  if (!x) throw new Error('[budgetExport] SheetJS (XLSX) não carregado — window.XLSX ausente');
  return x;
}

export interface BudgetRubrica {
  id: string;
  nome: string;
  categoria: 'capex' | 'opex';
  valor: number;
}

export interface Budget {
  rubricas: BudgetRubrica[];
  contrapartida?: number;
  envelopeTotal?: number;
}

export function exportBudgetText(budget: Budget, maxWords: number): string {
  const total = budget.rubricas.reduce((s, r) => s + r.valor, 0);
  const capex = budget.rubricas.filter((r) => r.categoria === 'capex').reduce((s, r) => s + r.valor, 0);
  const opex = total - capex;

  const lines: string[] = [];
  lines.push('ORCAMENTO COTADO');
  lines.push('');
  lines.push(`Total: ${fmtBRL(total)}`);
  lines.push(`CAPEX: ${fmtBRL(capex)}`);
  lines.push(`OPEX: ${fmtBRL(opex)}`);
  if (budget.contrapartida != null) {
    lines.push(`Contrapartida: ${fmtBRL(budget.contrapartida)}`);
  }
  if (budget.envelopeTotal != null) {
    lines.push(`Envelope: ${fmtBRL(budget.envelopeTotal)}`);
  }
  lines.push('');
  lines.push('RUBRICAS:');
  for (const r of budget.rubricas) {
    lines.push(`  [${r.categoria.toUpperCase()}] ${r.nome} (${r.id}): ${fmtBRL(r.valor)}`);
  }

  return truncateWords(lines.join('\n'), maxWords);
}

export function exportBudgetXlsx(budget: Budget): ArrayBuffer {
  const XLSX = _xlsx();
  const wb = XLSX.utils.book_new();

  const total = budget.rubricas.reduce((s, r) => s + r.valor, 0);
  const capex = budget.rubricas.filter((r) => r.categoria === 'capex').reduce((s, r) => s + r.valor, 0);
  const opex = total - capex;

  const resumoRows: Record<string, string | number>[] = [
    { Campo: 'Total', Valor: total },
    { Campo: 'CAPEX', Valor: capex },
    { Campo: 'OPEX', Valor: opex },
  ];
  if (budget.contrapartida != null) {
    resumoRows.push({ Campo: 'Contrapartida', Valor: budget.contrapartida });
  }
  if (budget.envelopeTotal != null) {
    resumoRows.push({ Campo: 'Envelope', Valor: budget.envelopeTotal });
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoRows), 'Resumo');

  const rubricaRows = budget.rubricas.map((r) => ({
    ID: r.id,
    Nome: r.nome,
    Categoria: r.categoria,
    Valor: r.valor,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rubricaRows), 'Rubricas');

  const capexRows = budget.rubricas
    .filter((r) => r.categoria === 'capex')
    .map((r) => ({ ID: r.id, Nome: r.nome, Valor: r.valor }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(capexRows.length > 0 ? capexRows : [{ ID: '-', Nome: '(sem CAPEX)', Valor: 0 }]),
    'CAPEX',
  );

  const opexRows = budget.rubricas
    .filter((r) => r.categoria === 'opex')
    .map((r) => ({ ID: r.id, Nome: r.nome, Valor: r.valor }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(opexRows.length > 0 ? opexRows : [{ ID: '-', Nome: '(sem OPEX)', Valor: 0 }]),
    'OPEX',
  );

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

function truncateWords(text: string, maxWords: number): string {
  if (maxWords <= 0) return '';
  const matches = [...text.matchAll(/\S+/g)];
  if (matches.length <= maxWords) return text;
  const last = matches[maxWords - 1];
  if (!last) return text; // invariante: matches.length > maxWords aqui (guard acima)
  return text.slice(0, last.index! + last[0].length) + '...';
}

function fmtBRL(v: number): string {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
