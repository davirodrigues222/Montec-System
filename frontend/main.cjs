const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: "Davi.Tec - Sistema de Gestão",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

  // Intercepta o evento de atalho Ctrl+P ou chamadas de impressão
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key.toLowerCase() === 'p') {
      mainWindow.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        if (!success) console.log('Erro na impressão: ', failureReason);
      });
      event.preventDefault();
    }
  });

  // Listener IPC caso queiras disparar impressão diretamente de botões no React
  ipcMain.handle('print-to-pdf-or-printer', async () => {
    mainWindow.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
      if (!success) console.log('Falha ao imprimir: ', failureReason);
    });
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});