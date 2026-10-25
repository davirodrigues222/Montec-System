/** Baixa um conteúdo gerado no navegador como arquivo (backup, exportação de dados). */
export const baixarArquivo = (conteudo: string, nome: string, tipo: string) => {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
