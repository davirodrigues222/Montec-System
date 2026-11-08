// Mês no formato AAAA-MM (telas de Despesas e Comissões)

/** AAAA-MM de uma data AAAA-MM-DD */
export const mesDe = (data: string) => data.slice(0, 7);

export const somarMes = (mes: string, n: number) => {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** "Novembro de 2026" */
export const nomeMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  const t = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Último dia do mês, AAAA-MM-DD */
export const ultimoDiaDoMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
};

/** AAAA-MM-DD -> DD/MM/AAAA */
export const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
