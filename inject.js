/**
 * WorkBuddy 排版插件 · 注入器（零依赖）
 *
 * 通过 CDP 把 typography.css 注入运行中的 WorkBuddy。
 * - 不修改 app.asar，不触碰安装目录，不破坏应用签名
 * - 使用独立 style id（wb-typography），不与任何其他皮肤/主题插件冲突
 * - 不设置 data-skin 等官方属性，完全不与其他插件或官方主题互动
 *
 * 用法：
 *   node inject.js [port] [configPath]
 *   node inject.js 9222
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadConfig, buildCss, buildTagScript } = require('./build-css.js');

const PORT = parseInt(process.argv[2] || '9222', 10);
const CONFIG_PATH = process.argv[3] || path.join(__dirname, 'config.json');
const READY_TIMEOUT = 90000;
const STYLE_ID = 'wb-typography';

const log = (...a) => console.log('[typography]', ...a);

function httpGetJSON(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port: PORT, path: urlPath, timeout: 3000 },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('响应不是 JSON: ' + data.slice(0, 120))); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
  });
}

async function waitForPort(timeoutMs) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeoutMs) {
    try {
      const v = await httpGetJSON('/json/version');
      log('CDP 就绪：' + (v.Browser || 'WorkBuddy') + '（端口 ' + PORT + '）');
      return true;
    } catch (e) {
      last = e.message;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  log('等待 CDP 端口超时，最后一次错误：' + last);
  return false;
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) =>
        m.error ? reject(new Error(method + ' → ' + JSON.stringify(m.error))) : resolve(m.result)
      );
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket 连接超时')), 10000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket 错误')); });
  });
  return new CDP(ws);
}

// 注入表达式：幂等 —— 内容相同则不重建 DOM，避免闪烁
function buildExpression(css) {
  return `(function(){
  var ID = ${JSON.stringify(STYLE_ID)};
  var css = ${JSON.stringify(css)};
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

async function main() {
  const cfg = loadConfig(CONFIG_PATH);
  if (!cfg.enabled) {
    log('配置中 enabled=false，不注入。');
    process.exit(0);
  }
  const css = buildCss(cfg);
  log('配置：字体=' + cfg.font.fontFamily + ' 正文=' + cfg.size.bodyPx + 'px/' + cfg.size.lineHeight);
  log('CSS 长度：' + css.length + ' 字节');

  if (!(await waitForPort(READY_TIMEOUT))) process.exit(1);

  let targets;
  try { targets = await httpGetJSON('/json/list'); }
  catch (e) { console.error('[typography] 获取 target 列表失败：' + e.message); process.exit(1); }

  const pages = targets.filter(
    (t) => (t.type === 'page' || t.type === 'webview' || t.type === 'iframe') && t.webSocketDebuggerUrl
  );
  if (pages.length === 0) {
    console.error('[typography] 没有找到可注入的页面。target 列表：');
    targets.forEach((t) => console.error('   -', t.type, t.url));
    process.exit(1);
  }

  log('发现 ' + pages.length + ' 个页面，开始注入');
  const expr = buildExpression(css);
  let ok = 0;

  for (const t of pages) {
    const label = (t.url || '').slice(0, 70);
    let cdp;
    try {
      cdp = await connect(t.webSocketDebuggerUrl);
      await cdp.send('Page.enable').catch(() => {});
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: expr }).catch(() => {});
      const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      log('  已注入 ' + (r.result ? r.result.value : '?') + ' 字节 → ' + label);
      // 给正文容器打官方后门类名，确保字号规则不被官方 !important 压过
      const tagScript = buildTagScript(cfg);
      if (tagScript) {
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: tagScript }).catch(() => {});
        const tr = await cdp.send('Runtime.evaluate', { expression: tagScript, returnByValue: true });
        log('  已标记 ' + (tr.result ? tr.result.value : 0) + ' 个正文容器（接管字号模式）');
      } else {
        log('  仅字体模式：字号交回官方，不干预官方字号规则');
      }
      ok++;
    } catch (e) {
      console.error('  注入失败 → ' + label + '\n     ' + e.message);
    } finally { if (cdp) cdp.close(); }
  }

  if (ok === 0) { console.error('[typography] 全部页面注入失败'); process.exit(1); }
  log('完成：' + ok + '/' + pages.length + ' 个页面已应用排版');
}

main().catch((e) => { console.error('[typography] 未预期的错误：', e); process.exit(1); });
