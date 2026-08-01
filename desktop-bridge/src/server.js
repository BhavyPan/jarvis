'use strict';

/**
 * Jarvis Desktop Bridge
 * Runs only on the local Windows PC and exposes a small, authenticated,
 * allow-listed API for n8n. It deliberately has no arbitrary shell endpoint.
 */
const http = require('node:http');
const { spawn } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const configPath = process.env.JARVIS_BRIDGE_CONFIG || join(__dirname, '..', 'config.json');
const fromFile = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
const config = {
  host: fromFile.host || '127.0.0.1',
  port: Number(process.env.PORT || fromFile.port || 3100),
  allowedApps: fromFile.allowedApps || { notepad: 'notepad.exe', calculator: 'calc.exe' },
  allowedHotkeys: fromFile.allowedHotkeys || ['ALT+TAB', 'CTRL+L', 'CTRL+C', 'CTRL+V', 'WIN+D'],
  speakNotifications: fromFile.speakNotifications !== false,
};
const bridgeKey = process.env.JARVIS_BRIDGE_KEY;
if (!bridgeKey) {
  throw new Error('Set JARVIS_BRIDGE_KEY before starting the desktop bridge.');
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
function isAuthorized(req) {
  return req.headers['x-jarvis-bridge-key'] === bridgeKey;
}
function psQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}
function runPowerShell(script) {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.unref();
}
function speak(text) {
  const safe = String(text).replace(/[\r\n]+/g, ' ').slice(0, 800);
  runPowerShell(
    "Add-Type -AssemblyName System.Speech; " +
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
    "$s.Rate = 0; $s.Speak(" + psQuote(safe) + ");"
  );
}
function escapeSendKeys(text) {
  return String(text).slice(0, 1000)
    .replace(/\r?\n/g, '{ENTER}')
    .replace(/([+^%~()\[\]{}])/g, '{$1}');
}
function hotkeyToSendKeys(hotkey) {
  return {
    'ALT+TAB': '%{TAB}',
    'CTRL+L': '^l',
    'CTRL+C': '^c',
    'CTRL+V': '^v',
    'WIN+D': '^{ESC}',
  }[hotkey];
}
function validateHttpsUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname) ? url : null;
  } catch { return null; }
}
function openUrl(url) {
  runPowerShell('Start-Process -FilePath ' + psQuote(url));
}
function takeScreenshot() {
  const path = join(process.env.TEMP || 'C:\\Temp', 'jarvis-' + Date.now() + '.png');
  const script =
    'Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; ' +
    '$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ' +
    '$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; ' +
    '$g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); ' +
    '$bmp.Save(' + psQuote(path) + ',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose();';
  runPowerShell(script);
  return path;
}
function handleAction(body) {
  const action = String(body.action || '').toLowerCase();
  const args = body.args && typeof body.args === 'object' ? body.args : {};
  if (action === 'open_app') {
    const appName = String(args.app || '').toLowerCase();
    const executable = config.allowedApps[appName];
    if (!executable) throw new Error('App is not in the local allow-list.');
    const child = spawn(executable, Array.isArray(args.arguments) ? args.arguments.map(String).slice(0, 10) : [], {
      detached: true, stdio: 'ignore', windowsHide: false, shell: false,
    });
    child.unref();
    return { action, opened: appName };
  }
  if (action === 'open_url') {
    const url = validateHttpsUrl(args.url);
    if (!url) throw new Error('Only public HTTPS URLs are allowed.');
    openUrl(url.href);
    return { action, opened: url.href };
  }
  if (action === 'take_screenshot') return { action, savedTo: takeScreenshot() };
  if (action === 'type_text') {
    if (typeof args.text !== 'string' || !args.text.trim()) throw new Error('Text is required.');
    runPowerShell('Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(' + psQuote(escapeSendKeys(args.text)) + ');');
    return { action, typedCharacters: args.text.length };
  }
  if (action === 'hotkey') {
    const hotkey = String(args.hotkey || '').toUpperCase();
    if (!config.allowedHotkeys.includes(hotkey) || !hotkeyToSendKeys(hotkey)) throw new Error('Hotkey is not in the local allow-list.');
    runPowerShell('Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(' + psQuote(hotkeyToSendKeys(hotkey)) + ');');
    return { action, hotkey };
  }
  if (action === 'speak') {
    speak(args.text || '');
    return { action, spoken: true };
  }
  throw new Error('Unsupported desktop action.');
}
function requestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('Request too large.'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON.')); }
    });
    req.on('error', reject);
  });
}
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, actions: ['open_app', 'open_url', 'take_screenshot', 'type_text', 'hotkey', 'speak'] });
  if (req.method !== 'POST') return send(res, 404, { ok: false, error: 'Not found' });
  if (!isAuthorized(req)) return send(res, 401, { ok: false, error: 'Unauthorized' });
  try {
    const body = await requestBody(req);
    if (req.url === '/notify') {
      const title = String(body.title || 'Jarvis');
      const message = String(body.message || '').slice(0, 800);
      if (config.speakNotifications) speak(title + '. ' + message);
      return send(res, 200, { ok: true });
    }
    if (req.url === '/speak') {
      speak(body.text || '');
      return send(res, 200, { ok: true });
    }
    if (req.url === '/actions') return send(res, 200, { ok: true, requestId: body.requestId, result: handleAction(body) });
    if (req.url === '/research') {
      const mode = String(body.mode || 'search');
      if (mode === 'search') {
        const query = String(body.query || '').trim().slice(0, 500);
        if (!query) throw new Error('Search query is required.');
        const url = 'https://www.google.com/search?q=' + encodeURIComponent(query);
        openUrl(url);
        return send(res, 200, { ok: true, opened: url });
      }
      const url = validateHttpsUrl(body.url);
      if (!url) throw new Error('Only public HTTPS URLs are allowed.');
      openUrl(url.href);
      return send(res, 200, { ok: true, opened: url.href });
    }
    return send(res, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    return send(res, 400, { ok: false, error: error.message });
  }
});
server.listen(config.port, config.host, () => {
  console.log('Jarvis Desktop Bridge listening on http://' + config.host + ':' + config.port);
});