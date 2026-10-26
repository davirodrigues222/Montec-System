// Enter num campo de preenchimento pula para o próximo campo (sem precisar do mouse ou do Tab).
// No último campo de um formulário o Enter segue o padrão do navegador (envia o formulário).
// Fica de fora: textarea (Enter quebra linha), campos de busca, botões e campos que já tratam o
// Enter por conta própria (chamam preventDefault, ex.: sugestões de modelo e autorização).
// Para um campo específico não pular, use o atributo data-enter-nao-avanca.

const TIPOS_SEM_AVANCO = new Set(['button', 'submit', 'reset', 'file', 'image', 'hidden', 'search']);

const CAMPOS = 'input, select, textarea';

const ehCampoQueAvanca = (el: Element | null): el is HTMLInputElement | HTMLSelectElement => {
  if (el instanceof HTMLSelectElement) return !el.hasAttribute('data-enter-nao-avanca');
  if (!(el instanceof HTMLInputElement)) return false;
  return !TIPOS_SEM_AVANCO.has(el.type) && !el.hasAttribute('data-enter-nao-avanca');
};

const podeReceberFoco = (el: Element): el is HTMLElement => {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) {
    return false;
  }
  if (el.disabled || el.tabIndex < 0) return false;
  if (el instanceof HTMLInputElement && (el.type === 'hidden' || el.readOnly || TIPOS_SEM_AVANCO.has(el.type))) {
    return false;
  }
  if (el instanceof HTMLTextAreaElement && el.readOnly) return false;
  return el.getClientRects().length > 0; // visível na tela
};

const aoTeclar = (e: KeyboardEvent) => {
  if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
  const atual = e.target as Element | null;
  if (!ehCampoQueAvanca(atual)) return;

  // Próximo campo dentro do mesmo formulário / janela / área de conteúdo
  const area = atual.closest('form, [role="dialog"], main') ?? document.body;
  const campos = Array.from(area.querySelectorAll(CAMPOS)).filter(podeReceberFoco);
  const proximo = campos[campos.indexOf(atual) + 1];
  if (!proximo) return; // último campo: comportamento padrão

  e.preventDefault();
  proximo.focus();
  if (proximo instanceof HTMLInputElement && ['text', 'email', 'tel', 'number', 'password', 'url'].includes(proximo.type)) {
    try {
      proximo.select();
    } catch {
      /* tipo sem seleção de texto */
    }
  }
};

/** Liga o "Enter pula para o próximo campo" em todo o sistema (chamado uma vez ao iniciar). */
export function ativarEnterAvancaCampo() {
  document.addEventListener('keydown', aoTeclar);
}
