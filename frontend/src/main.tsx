import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css' // <-- CERTIFIQUE-SE DE QUE ESSA LINHA EXISTE
import { ativarEnterAvancaCampo } from './utils/enterAvancaCampo'

ativarEnterAvancaCampo()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)