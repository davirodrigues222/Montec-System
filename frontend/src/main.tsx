import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { ativarEnterAvancaCampo } from './utils/enterAvancaCampo'
import { codigoNaUrl } from './services/acompanhamento'
import { codigoOrcamentoNaUrl } from './services/orcamentos'

// Sistema e página pública em arquivos separados: o cliente que abre o link de acompanhamento no
// celular não baixa o sistema inteiro
const App = lazy(() => import('./App.tsx'))
const AcompanhamentoPublico = lazy(() =>
  import('./pages/AcompanhamentoPublico').then((m) => ({ default: m.AcompanhamentoPublico }))
)
const OrcamentoPublico = lazy(() => import('./pages/OrcamentoPublico').then((m) => ({ default: m.OrcamentoPublico })))

// Depois de um deploy novo, os arquivos das telas da versão antiga deixam de existir: quem estava com a
// aba aberta recarrega uma vez (em vez de ver erro ao abrir uma tela). A marca evita recarregar em loop.
window.addEventListener('vite:preloadError', (evento) => {
  try {
    const ultima = Number(sessionStorage.getItem('bancadaos_recarregou_versao') || 0)
    if (Date.now() - ultima < 30_000) return
    sessionStorage.setItem('bancadaos_recarregou_versao', String(Date.now()))
  } catch {
    /* sem armazenamento: recarrega mesmo assim */
  }
  evento.preventDefault()
  window.location.reload()
})

ativarEnterAvancaCampo()

// Link de acompanhamento do cliente (/acompanhar/<código>): página pública, sem login e sem o sistema
const codigoAcompanhamento = codigoNaUrl()
// Orçamento enviado pelo WhatsApp (/orcamento/<código>): o cliente autoriza ou não o serviço, sem login
const codigoOrcamento = codigoOrcamentoNaUrl()

const CarregandoInicio = () => (
  <div className="min-h-dvh bg-[#080c14] flex items-center justify-center">
    <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
  </div>
)

/** Erro inesperado numa tela: mostra um aviso com "Recarregar" em vez de deixar a página em branco. */
class LimiteDeErro extends React.Component<{ children: React.ReactNode }, { erro: boolean }> {
  state = { erro: false }
  static getDerivedStateFromError() {
    return { erro: true }
  }
  componentDidCatch(erro: unknown) {
    console.error('Erro inesperado na tela:', erro)
  }
  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="min-h-dvh bg-[#080c14] text-zinc-100 flex items-center justify-center p-6">
        <div role="alert" className="max-w-sm text-center space-y-3">
          <h1 className="text-lg font-bold text-white">Algo deu errado ao abrir esta tela</h1>
          <p className="text-sm text-zinc-400">
            O que já foi salvo continua no sistema. Recarregue a página; se o problema continuar, verifique a internet.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition"
          >
            Recarregar
          </button>
        </div>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LimiteDeErro>
      <Suspense fallback={<CarregandoInicio />}>
        {codigoAcompanhamento ? (
          <AcompanhamentoPublico codigo={codigoAcompanhamento} />
        ) : codigoOrcamento ? (
          <OrcamentoPublico codigo={codigoOrcamento} />
        ) : (
          <App />
        )}
      </Suspense>
    </LimiteDeErro>
  </React.StrictMode>,
)
