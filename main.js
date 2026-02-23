const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 720,
        minWidth: 800,
        minHeight: 500,
        title: 'Deslop',
        backgroundColor: '#0d0f17',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'icon.png'),
    });

    win.loadFile('index.html');

    // Open external links in the system browser, not inside the app
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
