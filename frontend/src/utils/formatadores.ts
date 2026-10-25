// Máscaras e validações de documentos/contatos brasileiros usadas nos cadastros

export const somenteDigitos = (v: string) => (v || '').replace(/\D/g, '');

export function mascaraTelefone(v: string): string {
  const d = somenteDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function mascaraCpf(v: string): string {
  const d = somenteDigitos(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function mascaraCnpj(v: string): string {
  const d = somenteDigitos(v).slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** Até 11 dígitos formata como CPF; acima disso, como CNPJ. */
export function mascaraCpfCnpj(v: string): string {
  return somenteDigitos(v).length <= 11 ? mascaraCpf(v) : mascaraCnpj(v);
}

export function mascaraCep(v: string): string {
  const d = somenteDigitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function validarCpf(v: string): boolean {
  const d = somenteDigitos(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function validarCnpj(v: string): boolean {
  const d = somenteDigitos(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function validarCpfCnpj(v: string): boolean {
  const d = somenteDigitos(v);
  return d.length === 11 ? validarCpf(d) : d.length === 14 ? validarCnpj(d) : false;
}

export function validarEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v || '').trim());
}

/** Telefone fixo (10) ou celular (11 dígitos) com DDD. */
export function validarTelefone(v: string): boolean {
  const n = somenteDigitos(v).length;
  return n === 10 || n === 11;
}

export const formatarMoeda = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Número com 2 casas no padrão brasileiro, sem o símbolo (ex.: 1.234,50). */
export const formatarValor = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatarPercentual =(v: number) =>
  `${(Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}%`;

export function formatarDataHora(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Busca de endereço por CEP (ViaCEP). Retorna null se o CEP não existir ou a consulta falhar. */
export async function buscarEnderecoPorCep(
  cep: string
): Promise<{ logradouro: string; bairro: string; cidade: string; uf: string } | null> {
  const d = somenteDigitos(cep);
  if (d.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.erro) return null;
    return { logradouro: json.logradouro || '', bairro: json.bairro || '', cidade: json.localidade || '', uf: json.uf || '' };
  } catch {
    return null;
  }
}
