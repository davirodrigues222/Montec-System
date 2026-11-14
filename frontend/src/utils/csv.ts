import { baixarArquivo } from './arquivo';

// Exportações em CSV no padrão do Excel em português: separador ";", vírgula decimal e BOM (sem o BOM
// o Excel lê o arquivo como ANSI e os acentos viram "Ã§"; com "," como separador abre tudo numa coluna).

/** Célula de texto; o que começa com = + - @ ganha apóstrofo para o Excel não executar como fórmula. */
export const celulaCsv = (v: unknown) => {
  const texto = String(v ?? '');
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
};

/** Valor em reais/percentual com 2 casas e vírgula decimal (o Excel em português lê como número). */
export const numeroCsv = (v: number) => (Number.isFinite(v) ? v : 0).toFixed(2).replace('.', ',');

/** Monta e baixa o CSV: números viram numeroCsv; o resto, celulaCsv. */
export const baixarCsv = (nome: string, cabecalho: string[], linhas: unknown[][]) => {
  const celula = (v: unknown) => (typeof v === 'number' ? numeroCsv(v) : celulaCsv(v));
  const conteudo = [cabecalho, ...linhas].map((linha) => linha.map(celula).join(';')).join('\r\n');
  baixarArquivo('﻿' + conteudo, nome, 'text/csv;charset=utf-8');
};
