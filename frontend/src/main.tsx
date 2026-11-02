import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css' // <-- CERTIFIQUE-SE DE QUE ESSA LINHA EXISTE
import { ativarEnterAvancaCampo } from './utils/enterAvancaCampo'
import { AcompanhamentoPublico } from './pages/AcompanhamentoPublico'
import { codigoNaUrl } from './services/acompanhamento'

ativarEnterAvancaCampo()

// Link de acompanhamento do cliente (/acompanhar/<código>): página pública, sem login e sem o sistema
const codigoAcompanhamento = codigoNaUrl()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {codigoAcompanhamento ? <AcompanhamentoPublico codigo={codigoAcompanhamento} /> : <App />}
  </React.StrictMode>,
)
