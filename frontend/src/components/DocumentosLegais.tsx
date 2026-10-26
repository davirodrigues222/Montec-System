import React, { useEffect, useState } from 'react';

// Termos de Uso e Política de Privacidade do Montec System (LGPD, arts. 6º, 9º e 18; Marco Civil da Internet, art. 7º).
// Identificação do responsável pelo sistema: a LGPD (art. 9º, III) exige nome e contato do controlador.
// Preencha os campos vazios; o documento mostra só os que estiverem preenchidos.
const RESPONSAVEL = {
  nome: 'Montec System',
  razaoSocial: '',
  cnpj: '',
  emailPrivacidade: '',
};
export const ATUALIZADO_EM = '25/10/2026';

export type DocumentoLegal = 'termos' | 'privacidade';

const Secao: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <section className="space-y-1.5">
    <h3 className="text-sm font-bold text-white">{titulo}</h3>
    <div className="space-y-1.5 text-xs leading-relaxed text-zinc-300">{children}</div>
  </section>
);

const identificacao = [RESPONSAVEL.razaoSocial, RESPONSAVEL.cnpj && `CNPJ ${RESPONSAVEL.cnpj}`].filter(Boolean).join(', ');
const contatoPrivacidade = RESPONSAVEL.emailPrivacidade
  ? `pelo e-mail ${RESPONSAVEL.emailPrivacidade}`
  : 'pelos canais de atendimento do Montec System';

export const TermosDeUso = () => (
  <>
    <Secao titulo="1. O serviço">
      <p>
        O {RESPONSAVEL.nome}
        {identificacao ? ` (${identificacao})` : ''} é um sistema de gestão para assistências técnicas: ordens de serviço,
        clientes, orçamentos, pagamentos, garantias e relatórios.
      </p>
    </Secao>
    <Secao titulo="2. Conta e acessos">
      <p>
        Quem cria a conta responde pela senha da conta e pelos acessos que cadastrar para os funcionários. Senhas novas
        precisam ter pelo menos 8 caracteres, com letras e números.
      </p>
    </Secao>
    <Secao titulo="3. Dados dos clientes da sua loja">
      <p>
        Os dados que a loja cadastra sobre os próprios clientes (nome, contato, CPF/CNPJ, aparelhos e ordens de serviço)
        pertencem à loja, que é a controladora desses dados (LGPD, art. 5º, VI). O {RESPONSAVEL.nome} atua como operador
        (art. 5º, VII): guarda e processa esses dados só para prestar o serviço, conforme as instruções da loja.
      </p>
      <p>
        A loja deve informar os clientes sobre o uso dos dados (o comprovante da OS já traz esse aviso) e atender os
        pedidos deles. Em Cadastros › Clientes é possível exportar os dados de um cliente e apagar os dados pessoais dele.
      </p>
    </Secao>
    <Secao titulo="4. Obrigações com o consumidor">
      <p>
        O sistema aplica regras do Código de Defesa do Consumidor: garantia legal mínima de 90 dias (arts. 24 e 26),
        orçamento prévio com aprovação do cliente (arts. 39, VI, e 40), autorização para peças não originais (arts. 21 e
        70) e termo de garantia (art. 50). Cumprir essas obrigações continua sendo responsabilidade da loja.
      </p>
    </Secao>
    <Secao titulo="5. Seus dados e o fim da conta">
      <p>
        Você pode exportar uma cópia dos dados da conta a qualquer momento em Configurações › Conta. Ao encerrar a
        conta, os dados são apagados, exceto os que a lei obrigar a guardar.
      </p>
    </Secao>
  </>
);

export const PoliticaPrivacidade = () => (
  <>
    <Secao titulo="Quem trata os dados">
      <p>
        {RESPONSAVEL.nome}
        {identificacao ? ` (${identificacao})` : ''}. Pedidos sobre seus dados: {contatoPrivacidade}.
      </p>
    </Secao>
    <Secao titulo="Quais dados e para quê">
      <p>
        <strong>Dados da conta:</strong> nome do responsável, e-mail, nome da loja, telefone, CPF/CNPJ e configurações.
        Usados para criar e manter a conta e prestar o serviço contratado (LGPD, art. 7º, V).
      </p>
      <p>
        <strong>Dados que a loja cadastra:</strong> clientes, aparelhos e ordens de serviço. Tratados só por conta da loja,
        que é a controladora (veja os Termos de Uso).
      </p>
      <p>
        <strong>Registros de acesso:</strong> data, hora e endereço IP dos acessos, guardados pelo prazo do Marco Civil da
        Internet (art. 15) e usados para segurança e para cumprir a lei (LGPD, art. 7º, II).
      </p>
    </Secao>
    <Secao titulo="Com quem compartilhamos">
      <p>
        Banco de dados e login ficam no Supabase, contratado como infraestrutura. Na busca de endereço, só o CEP é enviado
        ao ViaCEP. Mensagens de WhatsApp são abertas no aplicativo do próprio usuário. Não vendemos dados.
      </p>
    </Secao>
    <Secao titulo="Como protegemos">
      <p>
        Cada conta só acessa os próprios dados. Senhas são guardadas apenas como hash. A senha de desbloqueio do aparelho
        não é impressa e é apagada quando a OS é entregue ou cancelada (LGPD, arts. 6º, III, e 46).
      </p>
    </Secao>
    <Secao titulo="Armazenamento no navegador">
      <p>
        O sistema guarda no navegador apenas a sessão de login e as configurações da loja. Não usamos cookies de
        publicidade nem de rastreamento.
      </p>
    </Secao>
    <Secao titulo="Seus direitos (LGPD, art. 18)">
      <p>
        Confirmar se tratamos seus dados, acessar, corrigir, receber uma cópia, pedir a eliminação, saber com quem foram
        compartilhados e revogar consentimento. Peça {contatoPrivacidade}. Você também pode reclamar à Autoridade
        Nacional de Proteção de Dados (ANPD).
      </p>
    </Secao>
    <Secao titulo="Por quanto tempo">
      <p>
        Enquanto a conta estiver ativa. Depois do encerramento, os dados são apagados, exceto os que a lei obrigar a
        guardar (LGPD, art. 16).
      </p>
    </Secao>
  </>
);

/** Termos de Uso e Política de Privacidade em uma janela, com abas. */
export const DocumentosLegais: React.FC<{ inicial: DocumentoLegal; onFechar: () => void }> = ({ inicial, onFechar }) => {
  const [aba, setAba] = useState<DocumentoLegal>(inicial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#0c101a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="absolute right-3 top-3 rounded-lg p-2 text-zinc-500 hover:bg-zinc-800/60 hover:text-white transition"
        >
          ✕
        </button>
        <div className="flex gap-1 border-b border-zinc-800/60 p-3 pr-12">
          {(
            [
              ['termos', 'Termos de Uso'],
              ['privacidade', 'Política de Privacidade'],
            ] as const
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              type="button"
              onClick={() => setAba(chave)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                aba === chave ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
          {aba === 'termos' ? <TermosDeUso /> : <PoliticaPrivacidade />}
          <p className="text-[11px] text-zinc-500">Atualizado em {ATUALIZADO_EM}.</p>
        </div>
      </div>
    </div>
  );
};
