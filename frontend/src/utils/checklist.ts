// Itens do checklist de entrada do aparelho. As chaves são as gravadas em checklist_entrada pela Nova OS.
// Quais itens aparecem na Nova OS é definido em Configurações › Operacional (checklistItensAtivos).
export const ITENS_CHECKLIST: { chave: string; rotulo: string }[] = [
  { chave: 'ligando', rotulo: 'Ligando' },
  { chave: 'touchScreen', rotulo: 'Touch screen' },
  { chave: 'display', rotulo: 'Display' },
  { chave: 'cameraTraseira', rotulo: 'Câmera traseira' },
  { chave: 'cameraFrontal', rotulo: 'Câmera frontal' },
  { chave: 'microfone', rotulo: 'Microfone' },
  { chave: 'altoFalante', rotulo: 'Alto-falante' },
  { chave: 'conectorCarga', rotulo: 'Conector de carga' },
  { chave: 'bateria', rotulo: 'Bateria' },
  { chave: 'wifi', rotulo: 'Wi-Fi' },
  { chave: 'bluetooth', rotulo: 'Bluetooth' },
  { chave: 'botoesLaterais', rotulo: 'Botões laterais' },
  { chave: 'faceId', rotulo: 'Face ID / Biometria' },
  { chave: 'carcaca', rotulo: 'Carcaça / Aros' },
];

/** Itens do catálogo ativos na conta (sem nenhum ativo, usa todos para não ficar sem checklist). */
export const itensChecklistAtivos = (ativos?: string[]) => {
  const lista = ITENS_CHECKLIST.filter((i) => !ativos || ativos.includes(i.chave));
  return lista.length > 0 ? lista : ITENS_CHECKLIST;
};

/** Checklist novo com os itens ativos marcados como OK. */
export const criarChecklistPadrao = (ativos?: string[]): Record<string, string> =>
  Object.fromEntries(itensChecklistAtivos(ativos).map((i) => [i.chave, 'OK']));

/** Rótulo legível do item (chaves antigas sem rótulo viram "camel Case" separado). */
export const rotuloItemChecklist = (chave: string): string =>
  ITENS_CHECKLIST.find((i) => i.chave === chave)?.rotulo || chave.replace(/([A-Z])/g, ' $1');

/**
 * Apenas os itens do checklist, sem os metadados internos com prefixo "__"
 * (pagamentos, garantia, desconto), que não podem ser exibidos como texto.
 */
export const itensVisiveisChecklist = (checklist?: Record<string, any> | null): [string, string][] =>
  Object.entries(checklist || {})
    .filter(([chave, valor]) => !chave.startsWith('__') && typeof valor === 'string')
    .map(([chave, valor]) => [chave, valor as string]);

/** Situações possíveis de cada item (mesmos valores gravados pela Nova OS). */
export const OPCOES_CHECKLIST = ['OK', 'DEFEITO', 'Com observação', 'NÃO TESTADO'];
