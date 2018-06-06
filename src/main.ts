import { app, BrowserWindow, screen } from 'electron';
import { ipcMain } from 'electron';
import * as path from 'path';
import * as url from 'url';
// import { IpcM } from './ipcMR';
import { Model } from './model';

function startApp() {
  let mainWindow: Electron.BrowserWindow;
  const args = process.argv.slice(1);
  const serve = args.some(val => val === '--serve');
  const debug = args.some(val => val === '--console');
  const model = new Model();

  if (serve) require('electron-reload')(__dirname);

  const createWindow = async () => {
    const displays = screen.getAllDisplays();

    // Create the browser window.
    mainWindow = new BrowserWindow();
    mainWindow.setBounds(displays[displays.length - 1].bounds);
    mainWindow.maximize();

    // and load the index.html of the app.
    mainWindow.loadURL(url.format({
      pathname: path.join(__dirname, './index.html'),
      protocol: 'file:',
      slashes: true,
    }));

    // Open the DevTools.
    if (debug) mainWindow.webContents.openDevTools();

    // Emitted when the window is closed.
    mainWindow.on('closed', () => {
      model.Stop();
      // Dereference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.
      mainWindow = null;
    });
  };

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.on('ready', () => createWindow());

  // Quit when all windows are closed.
  app.on('window-all-closed', () => {

    model.Stop();
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
      createWindow();
    }
  });

  ipcMain.on('main-start-model', (e: any, modelName: string, labelMap: string, threshold: string) => {
    model.Run(modelName, labelMap, threshold);
  });

  ipcMain.on('main-stop-model', () => {
    console.log('main-stop-model');
    model.Stop();
  });

}

startApp();
