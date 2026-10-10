// Electron shell: a transparent, click-through, always-on-top window covering
// the screen, so the creature can walk over whatever you're doing.
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  protocol,
  screen,
  session,
  systemPreferences,
} = require('electron');
const { mimeFor, resolveInside } = require('./scripts/mime');

const ROOT = __dirname;

// Linux compositors need this for real transparency.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');
// MediaPipe needs WebGL even on its CPU path. Without a usable GPU (VMs, remote
// desktops) let Chromium fall back to software WebGL; we only run our own code.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

// Serve the app from app:// rather than file:// so ES modules, fetch() and
// MediaPipe's wasm loading all behave like they would on a web server.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let tray = null;
let paused = false;
let status = 'starting';

function serveAppProtocol() {
  protocol.handle('app', async (request) => {
    const file = resolveInside(ROOT, new URL(request.url).pathname);
    if (!file) return new Response('forbidden', { status: 403 });
    try {
      const body = await fs.readFile(file);
      return new Response(body, { headers: { 'content-type': mimeFor(file) } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

/** Pass `npm start -- --threshold=0.2` style flags through to the renderer. */
function rendererQuery() {
  const query = new URLSearchParams();
  for (const arg of process.argv.slice(1)) {
    const match = /^--(\w+)=(.+)$/.exec(arg);
    if (match) query.set(match[1], match[2]);
  }
  return query.toString();
}

function fitToScreen() {
  // workArea keeps the creature above the taskbar / dock.
  win?.setBounds(screen.getPrimaryDisplay().workArea);
}

function createWindow() {
  win = new BrowserWindow({
    ...screen.getPrimaryDisplay().workArea,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true); // clicks go straight through to your apps
  win.loadURL(`app://frownie/renderer/index.html?${rendererQuery()}`);
  win.on('closed', () => (win = null));

  screen.on('display-metrics-changed', fitToScreen);
  screen.on('display-added', fitToScreen);
  screen.on('display-removed', fitToScreen);
}

function send(command) {
  win?.webContents.send('frownie:command', command);
}

function buildTray() {
  tray ??= new Tray(path.join(ROOT, 'assets', 'tray.png'));
  tray.setToolTip(`frownie — ${status}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `frownie: ${status}`, enabled: false },
      { type: 'separator' },
      { label: 'Summon / dismiss creature', click: () => send('summon') },
      { label: 'Recalibrate neutral face', click: () => send('recalibrate') },
      {
        label: 'Pause (turn camera off)',
        type: 'checkbox',
        checked: paused,
        click: (item) => {
          paused = item.checked;
          send(paused ? 'pause' : 'resume');
        },
      },
      { label: 'Show debug panel', click: () => send('debug') },
      { label: 'Open dev tools', click: () => win?.webContents.openDevTools({ mode: 'detach' }) },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
    ]),
  );
}

app.whenReady().then(async () => {
  const allowCamera = (permission) => permission === 'media';
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(allowCamera(permission)),
  );
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowCamera(permission));

  if (process.platform === 'darwin') {
    app.dock?.hide();
    await systemPreferences.askForMediaAccess('camera');
  }

  serveAppProtocol();
  ipcMain.on('frownie:status', (_event, value) => {
    status = value;
    buildTray();
  });
  buildTray();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
