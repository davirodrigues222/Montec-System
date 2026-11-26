// Logo da animação do Painel (Configurações › Aparência): só PNG, tratada antes de salvar.

const LIMITE_BYTES = 2 * 1024 * 1024;
const LADO_MAXIMO = 400;

/** Confere tipo e extensão: a animação usa PNG (transparência, sem fundo quadrado em volta). */
export function validarArquivoLogoAnimacao(arquivo: File): string | null {
  const ehPng = arquivo.type === 'image/png' && /\.png$/i.test(arquivo.name);
  if (!ehPng) return 'Envie a logo em PNG (de preferência com fundo transparente).';
  if (arquivo.size > LIMITE_BYTES) return 'A imagem passa de 2 MB. Envie um PNG menor.';
  return null;
}

/** Retângulo com pixels visíveis (alfa > 8); null se a imagem for toda transparente. */
function areaVisivel(ctx: CanvasRenderingContext2D, largura: number, altura: number) {
  const { data } = ctx.getImageData(0, 0, largura, altura);
  let minX = largura;
  let minY = altura;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (data[(y * largura + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, largura: maxX - minX + 1, altura: maxY - minY + 1 };
}

function carregarImagem(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a imagem. Confira se o arquivo é um PNG válido.'));
    };
    img.src = url;
  });
}

/**
 * Prepara a logo para a animação: corta as bordas transparentes (a logo fica do tamanho certo na
 * tela) e reduz para no máximo 400 px. Devolve o PNG em base64 para salvar nas configurações.
 */
export async function prepararLogoAnimacao(arquivo: File): Promise<string> {
  const erro = validarArquivoLogoAnimacao(arquivo);
  if (erro) throw new Error(erro);
  const img = await carregarImagem(arquivo);

  // 1. Desenha no tamanho original (limitado) para achar a área visível
  const escalaLeitura = Math.min(1, 1600 / Math.max(img.width, img.height));
  const largura = Math.max(1, Math.round(img.width * escalaLeitura));
  const altura = Math.max(1, Math.round(img.height * escalaLeitura));
  const leitura = document.createElement('canvas');
  leitura.width = largura;
  leitura.height = altura;
  const ctxLeitura = leitura.getContext('2d', { willReadFrequently: true });
  if (!ctxLeitura) throw new Error('Seu navegador não conseguiu processar a imagem.');
  ctxLeitura.drawImage(img, 0, 0, largura, altura);
  const area = areaVisivel(ctxLeitura, largura, altura);
  if (!area) throw new Error('A imagem está toda transparente. Envie outro PNG.');

  // 2. Recorta a área visível e reduz para no máximo 400 px no maior lado
  const escala = Math.min(1, LADO_MAXIMO / Math.max(area.largura, area.altura));
  const final = document.createElement('canvas');
  final.width = Math.max(1, Math.round(area.largura * escala));
  final.height = Math.max(1, Math.round(area.altura * escala));
  const ctx = final.getContext('2d');
  if (!ctx) throw new Error('Seu navegador não conseguiu processar a imagem.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(leitura, area.x, area.y, area.largura, area.altura, 0, 0, final.width, final.height);
  return final.toDataURL('image/png');
}
