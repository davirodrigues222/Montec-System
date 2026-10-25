// Sugestões de modelo de aparelho na Nova OS.
// Lista base de modelos comuns em assistências + os modelos já cadastrados nas OS da loja.

export const MODELOS_POPULARES = [
  // Apple
  'iPhone 7', 'iPhone 7 Plus', 'iPhone 8', 'iPhone 8 Plus', 'iPhone SE (2020)', 'iPhone SE (2022)',
  'iPhone X', 'iPhone XR', 'iPhone XS', 'iPhone XS Max',
  'iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max',
  'iPhone 12', 'iPhone 12 Mini', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
  'iPhone 13', 'iPhone 13 Mini', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
  'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
  'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
  'iPhone 16', 'iPhone 16e', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max',
  'iPhone 17', 'iPhone Air', 'iPhone 17 Pro', 'iPhone 17 Pro Max',
  // Samsung
  'Samsung Galaxy A03', 'Samsung Galaxy A04', 'Samsung Galaxy A05', 'Samsung Galaxy A06',
  'Samsung Galaxy A12', 'Samsung Galaxy A13', 'Samsung Galaxy A14', 'Samsung Galaxy A15', 'Samsung Galaxy A16',
  'Samsung Galaxy A22', 'Samsung Galaxy A23', 'Samsung Galaxy A24', 'Samsung Galaxy A25', 'Samsung Galaxy A26',
  'Samsung Galaxy A32', 'Samsung Galaxy A33', 'Samsung Galaxy A34', 'Samsung Galaxy A35', 'Samsung Galaxy A36',
  'Samsung Galaxy A52', 'Samsung Galaxy A53', 'Samsung Galaxy A54', 'Samsung Galaxy A55', 'Samsung Galaxy A56',
  'Samsung Galaxy M14', 'Samsung Galaxy M15', 'Samsung Galaxy M34', 'Samsung Galaxy M54',
  'Samsung Galaxy S20', 'Samsung Galaxy S20 FE', 'Samsung Galaxy S21', 'Samsung Galaxy S21 FE', 'Samsung Galaxy S22',
  'Samsung Galaxy S22 Ultra', 'Samsung Galaxy S23', 'Samsung Galaxy S23 FE', 'Samsung Galaxy S23 Ultra',
  'Samsung Galaxy S24', 'Samsung Galaxy S24 FE', 'Samsung Galaxy S24 Ultra', 'Samsung Galaxy S25', 'Samsung Galaxy S25 Ultra',
  // Xiaomi / Redmi / POCO
  'Redmi 9A', 'Redmi 9C', 'Redmi 10', 'Redmi 10C', 'Redmi 12', 'Redmi 12C', 'Redmi 13', 'Redmi 13C', 'Redmi 14C',
  'Redmi Note 10', 'Redmi Note 11', 'Redmi Note 12', 'Redmi Note 13', 'Redmi Note 13 Pro', 'Redmi Note 14', 'Redmi Note 14 Pro',
  'POCO X5', 'POCO X5 Pro', 'POCO X6', 'POCO X6 Pro', 'POCO X7', 'POCO M6 Pro', 'POCO F5',
  // Motorola
  'Moto E13', 'Moto E22', 'Moto E32', 'Moto G04', 'Moto G05', 'Moto G13', 'Moto G14', 'Moto G15', 'Moto G22', 'Moto G23',
  'Moto G24', 'Moto G32', 'Moto G34', 'Moto G35', 'Moto G42', 'Moto G52', 'Moto G53', 'Moto G54', 'Moto G55', 'Moto G62',
  'Moto G73', 'Moto G84', 'Moto G85', 'Moto Edge 30', 'Moto Edge 40', 'Moto Edge 50',
  // Outros
  'Realme C51', 'Realme C53', 'Realme C55', 'Realme C61', 'Realme 11', 'Realme 12',
  'Infinix Hot 30', 'Infinix Hot 40', 'Infinix Smart 8', 'LG K41S', 'LG K62', 'Asus Zenfone 9',
];

/** Minúsculas e sem acento, para comparar "galaxy" com "Galaxy" ou "moto g" com "Moto G". */
const normalizar = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Sugestões para o texto digitado: todas as palavras precisam aparecer no modelo
 * ("15 pro" encontra "iPhone 15 Pro"). Modelos que começam com o texto vêm primeiro,
 * e os já cadastrados na loja vêm antes da lista base.
 */
export function sugerirModelos(texto: string, modelosDaLoja: string[], limite = 8): { modelo: string; daLoja: boolean }[] {
  const busca = normalizar(texto);
  if (!busca) return [];
  const palavras = busca.split(/\s+/);

  const vistos = new Set<string>();
  const candidatos: { modelo: string; daLoja: boolean }[] = [];
  const adicionar = (modelo: string, daLoja: boolean) => {
    const chave = normalizar(modelo);
    if (!chave || vistos.has(chave)) return;
    vistos.add(chave);
    candidatos.push({ modelo: modelo.trim(), daLoja });
  };
  modelosDaLoja.forEach((m) => adicionar(m, true));
  MODELOS_POPULARES.forEach((m) => adicionar(m, false));

  return candidatos
    .filter(({ modelo }) => {
      const alvo = normalizar(modelo);
      return palavras.every((p) => alvo.includes(p));
    })
    .sort((a, b) => {
      const ia = normalizar(a.modelo).startsWith(busca) ? 0 : 1;
      const ib = normalizar(b.modelo).startsWith(busca) ? 0 : 1;
      if (ia !== ib) return ia - ib;
      if (a.daLoja !== b.daLoja) return a.daLoja ? -1 : 1;
      return a.modelo.length - b.modelo.length;
    })
    .filter(({ modelo }) => normalizar(modelo) !== busca) // já digitado por completo: não sugere de novo
    .slice(0, limite);
}
