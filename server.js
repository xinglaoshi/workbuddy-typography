/**
 * WorkBuddy 排版插件 · 本地设置服务
 *
 * 为 settings.html 提供后端：
 *   GET  /            -> settings.html
 *   GET  /api/fonts   -> 本机字体列表
 *   POST /api/rescan  -> 重新扫描字体
 *   GET  /api/config  -> 当前配置
 *   POST /api/apply   -> 写配置 + 立即注入
 *   GET  /api/verify  -> 查 WorkBuddy 实际生效情况
 *   GET  /api/path    -> 配置文件路径
 *
 * 安全：只监听 127.0.0.1，不联网，不接触凭证。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadConfig, buildCss, buildTagScript } = require('./build-css.js');

const PLUGIN_DIR = __dirname;
const CONFIG_PATH = path.join(PLUGIN_DIR, 'config.json');
const FONT_LIST = path.join(PLUGIN_DIR, 'font-list.json');
const HTML = path.join(PLUGIN_DIR, 'settings.html');
const CDP_PORT = parseInt(process.env.TYPO_CDP_PORT || '9222', 10);
const PORT = parseInt(process.env.TYPO_UI_PORT || '8787', 10);

const log = (...a) => console.log('[ui]', ...a);

function readFonts() {
  try { return JSON.parse(fs.readFileSync(FONT_LIST, 'utf8')); }
  catch { return { count: 0, fonts: [] }; }
}

function rescanFonts() {
  log('重新扫描字体…');
  try {
    execFileSync(process.execPath, [path.join(PLUGIN_DIR, 'scan-fonts.js')],
      { stdio: 'pipe', timeout: 60000 });
  } catch (e) { log('扫描失败: ' + String(e.stderr || e.message).slice(0, 200)); }
  return readFonts();
}

function saveConfig(patch) {
  const cur = loadConfig(CONFIG_PATH);
  const next = {
    enabled: patch.enabled !== undefined ? !!patch.enabled : cur.enabled,
    overrideSize: patch.overrideSize !== undefined ? !!patch.overrideSize : cur.overrideSize,
    font: Object.assign({}, cur.font, patch.font || {}),
    size: Object.assign({}, cur.size, patch.size || {}),
    scope: Object.assign({}, cur.scope, patch.scope || {}),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

// ---- CDP ----------------------------------------------------------------
function httpGetJSON(p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: CDP_PORT, path: p, timeout: 2500 }, (res) => {
      let d = ''; res.on('data', (c) => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map();
    ws.addEventListener('message', (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id && this.p.has(m.id)) { this.p.get(m.id)(m); this.p.delete(m.id); } }); }
  send(method, params = {}) { const i = ++this.id;
    return new Promise((res, rej) => { this.p.set(i, (m) => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result));
      this.ws.send(JSON.stringify({ id: i, method, params })); }); }
  close() { try { this.ws.close(); } catch {} }
}

function buildInjectExpr(css) {
  return `(function(){
  var ID = 'wb-typography';
  var css = ${JSON.stringify(css)};
  var old = document.getElementById(ID);
  if (old) { if (old.textContent === css) return 'same'; old.remove(); }
  var s = document.createElement('style');
  s.id = ID; s.type = 'text/css'; s.textContent = css;
  (document.head || document.documentElement).appendChild(s);
  return css.length;
})()`;
}

async function injectNow(cfg) {
  const css = buildCss(cfg);
  const tagScript = buildTagScript(cfg);
  const targets = await httpGetJSON('/json/list');
  const pages = targets.filter((t) => t.webSocketDebuggerUrl &&
    ['page', 'webview', 'iframe'].includes(t.type));
  let ok = 0;
  for (const t of pages) {
    let cdp;
    try {
      cdp = await new CDP(await new Promise((resolve, reject) => {
        const ws = new WebSocket(t.webSocketDebuggerUrl);
        const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('ws 超时')); }, 8000);
        ws.addEventListener('open', () => { clearTimeout(timer); resolve(ws); });
        ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('ws 错误')); });
      }));
      await cdp.send('Page.enable').catch(() => {});
      const expr = buildInjectExpr(css);
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: expr }).catch(() => {});
      await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (tagScript) {
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: tagScript }).catch(() => {});
        await cdp.send('Runtime.evaluate', { expression: tagScript, returnByValue: true }).catch(() => {});
      }
      ok++;
    } catch (e) {
      log('注入失败 ' + (t.url || '').slice(0, 50) + ': ' + e.message);
    } finally { if (cdp) cdp.close(); }
  }
  return ok;
}

async function verifyNow() {
  const expr = `(function(){
    var st = document.getElementById('wb-typography');
    var sels = ['.cr-markdown', '.cb-markdown', '.cr-self-bubble', '._userMessageBubble_', 'body'];
    var samples = [];
    for (var i=0;i<sels.length;i++){
      var el = document.querySelector(sels[i]);
      if (!el) continue;
      var cs = getComputedStyle(el);
      samples.push({ sel: sels[i], fontFamily: cs.fontFamily, fontSize: cs.fontSize, lineHeight: cs.lineHeight });
    }
    return JSON.stringify({ styleInjected: !!st, samples: samples });
  })()`;
  const targets = await httpGetJSON('/json/list');
  const pages = targets.filter((t) => t.webSocketDebuggerUrl && ['page', 'webview', 'iframe'].includes(t.type));
  if (!pages.length) return { reachable: false, styleInjected: false, samples: [] };
  let cdp;
  try {
    cdp = await new CDP(await new Promise((resolve, reject) => {
      const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
      const timer = setTimeout(() => reject(new Error('ws 超时')), 8000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(ws); });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('ws 错误')); });
    }));
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return Object.assign({ reachable: true }, JSON.parse(r.result.value));
  } catch (e) {
    return { reachable: false, styleInjected: false, samples: [], error: e.message };
  } finally { if (cdp) cdp.close(); }
}

// ---- HTTP ---------------------------------------------------------------
function sendJSON(res, obj, code) {
  const body = JSON.stringify(obj);
  res.writeHead(code || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const p = u.pathname;

  if (p === '/' || p === '/index.html') {
    try {
      const html = fs.readFileSync(HTML, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    } catch (e) { sendJSON(res, { error: String(e.message) }, 500); }
    return;
  }

  if (p === '/api/path') { sendJSON(res, { configPath: CONFIG_PATH }); return; }

  if (p === '/api/fonts') { sendJSON(res, readFonts()); return; }

  if (p === '/api/rescan') { sendJSON(res, rescanFonts()); return; }

  if (p === '/api/config') { sendJSON(res, loadConfig(CONFIG_PATH)); return; }

  if (p === '/api/apply' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1e6) { req.destroy(); }
    });
    req.on('end', async () => {
      let patch;
      try { patch = JSON.parse(body || '{}'); }
      catch (e) { sendJSON(res, { ok: false, message: 'JSON 解析失败' }, 400); return; }
      const cfg = saveConfig(patch);
      log('配置已更新：字体=' + cfg.font.fontFamily +
          ' | overrideSize=' + cfg.overrideSize);
      try {
        const n = await injectNow(cfg);
        sendJSON(res, { ok: true, injectedTargets: n, mode: cfg.overrideSize ? 'font+size' : 'font-only' });
      } catch (e) {
        sendJSON(res, { ok: false, message: e.message }, 200);
      }
    });
    return;
  }

  if (p === '/api/verify') {
    verifyNow().then((r) => sendJSON(res, r)).catch((e) => sendJSON(res, { error: e.message }, 500));
    return;
  }

  sendJSON(res, { error: 'not found' }, 404);
});

server.listen(PORT, '127.0.0.1', () => {
  log('设置界面已启动： http://127.0.0.1:' + PORT);
  log('配置： ' + CONFIG_PATH);
  log('按 Ctrl+C 关闭');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    log('端口 ' + PORT + ' 已被占用 —— 可能设置界面已经在运行。');
    log('直接打开 http://127.0.0.1:' + PORT);
  } else {
    log('服务错误: ' + e.message);
  }
  process.exit(1);
});
