// Esta aba foi aberta pelo sistema: fecha e o cliente volta para a aba original.
// Se o navegador não deixar fechar (aba aberta de outro jeito), abre o sistema aqui mesmo.
// Fica num arquivo próprio (e não num <script> dentro do HTML) para a Content-Security-Policy do vercel.json.
document.getElementById('voltar').addEventListener('click', function () {
  window.close();
  setTimeout(function () {
    window.location.href = '/';
  }, 300);
});
