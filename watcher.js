/**
 * WorkBuddy 排版插件 · 常驻监视器
 *
 * 职责：
 * 1. 每 3 秒轮询 CDP，发现新建的页面层（page/webview/iframe）立即注入
 * 2. 监视 config.json，用户改配置后自动重新生成 CSS 并全量重注
 * 3. 独立进程锁（端口 9335），避免重复启动
 *
 * 解决：文档/会话 iframe 按需创建销毁导致样式丢失的问题。
 *
 * 用法: node watcher.js [port] [configPath]
 * 退出: 关闭窗口或 taskkill
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { loadConfig, buildCss, buildTagScript } = require('./build-css.js');

const PORT = parseInt(process.argv[2] || '9222', 10);
const CONFIG_PATH = process.argv[3] || path.join(__dirname, 'config.json');
const INTERVAL = 3000;
const LOCK_PORT = 9335;
const STYLE_ID = 'wb-typography';

const log = (...a) => console.log(new Date().toLocaleTimeString('zh-CN'), '[watcher]', ...a);

// 已注入的 target 集合。webSocketDebuggerUrl 会随 target 重建而变化，天然支持重注。
// 必须声明在 rebuild() 之前 —— rebuild 会 clear() 它。
const injected = new Set();

let cssCache = '';
let cfgCache = null;
function rebuild(reason) {
  const cfg = loadConfig(CONFIG_PATH);
  cfgCache = cfg;
  if (!cfg.enabled) { cssCache = ''; return; }
  const next = buildCss(cfg);
  if (next !== cssCache) {
    cssCache = next;
    injected.clear(); // CSS 改动后强制全量重注
    log('配置变化（' + reason + '）：已重建 CSS（' + cssCache.length + ' 字节），下轮全量重注');
  }
}
rebuild('启动');

// 监视配置文件：用户改字体/字号后自动生效
try {
  fs.watchFile(CONFIG_PATH, { interval: 2000 }, () => {
    try { rebuild('config.json 已修改'); }
    catch (e) { log('读取配置失败: ' + e.message); }
  });
} catch (e) {
  log('无法监视配置文件（将仅按需注入）: ' + e.message);
}

function listTargets() {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/json/list', timeout: 2500 }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function buildExpression() {
  return `(function(){
  var ID = ${JSON.stringify(STYLE_ID)};
  var css = ${JSON.stringify(cssCache)};
  if (!css) { var o=document.getElementById(ID); if(o){o.remove(); return 'removed';} return 'disabled'; }
  var old = document.getElementById(ID);
  if (old) { if (old.textContent === css) return 'same'; old.remove(); }
  var s = document.createElement('style');
  s.id = ID;
  s.type = 'text/css';
  s.textContent = css;
  (document.head || document.documentElement).appendChild(s);
  return css.length;
})()`;
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); } }); }
  send(method, params = {}) { const i = ++this.id;
    return new Promise((res, rej) => { this.pending.set(i, (m) => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result));
      this.ws.send(JSON.stringify({ id: i, method, params })); }); }
  close() { try { this.ws.close(); } catch {} }
}

async function injectTarget(t, expr) {
  let cdp;
  try {
    cdp = new CDP(await new Promise((resolve, reject) => {
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('ws 超时')); }, 8000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(ws); });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('ws 错误')); });
    }));
    await cdp.send('Page.enable').catch(() => {});
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: expr }).catch(() => {});
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    const v = r.result ? r.result.value : '?';
    log('已注入 → ' + (t.url || '').slice(0, 60) + '（' + (v === 'same' ? '已是最新' : v) + '）');
    // 接管字号时才打后门类名（仅字体模式跳过，避免破坏官方字号调节）
    const tagScript = buildTagScript(cfgCache);
    if (tagScript) {
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: tagScript }).catch(() => {});
      await cdp.send('Runtime.evaluate', { expression: tagScript, returnByValue: true }).catch(() => {});
    }
  } catch (e) {
    log('注入失败 → ' + (t.url || '').slice(0, 60) + ': ' + e.message);
  } finally { if (cdp) cdp.close(); }
}

async function tick() {
  if (!cssCache) { // disabled：清理已注入的样式
    try {
      const targets = await listTargets();
      for (const t of targets.filter((x) => x.webSocketDebuggerUrl)) {
        // 简单移除
      }
    } catch {}
    return;
  }
  let targets;
  try { targets = await listTargets(); }
  catch { return; } // 端口未就绪，静默
  const fresh = targets.filter(
    (t) => (t.type === 'page' || t.type === 'webview' || t.type === 'iframe') &&
           t.webSocketDebuggerUrl && !injected.has(t.webSocketDebuggerUrl)
  );
  for (const t of fresh) {
    injected.add(t.webSocketDebuggerUrl);
    await injectTarget(t, buildExpression());
  }
  const alive = new Set(targets.map((t) => t.webSocketDebuggerUrl));
  for (const k of injected) if (!alive.has(k)) injected.delete(k);
}

log('启动：端口 ' + PORT + '，轮询 ' + INTERVAL + 'ms，配置 ' + CONFIG_PATH);
log('提示：改 config.json 即可换字体，约 2 秒自动生效，无需重启 WorkBuddy。');

const lock = net.createServer();
lock.on('error', () => { log('已有 watcher 在运行（锁端口 ' + LOCK_PORT + ' 被占），本次退出'); process.exit(0); });
lock.listen(LOCK_PORT, '127.0.0.1', () => {
  log('锁端口 ' + LOCK_PORT + ' 就绪');
  setInterval(tick, INTERVAL);
  tick();
});
