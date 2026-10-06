// 验证排版 CSS 是否真正生效：查计算样式 + 字体是否可用
const http = require('http');
const PORT = 9222;

function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path, timeout: 3000 }, (res) => {
      let d = ''; res.on('data', (c) => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
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

async function evalIn(target, expr) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const cdp = new CDP(ws);
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  cdp.close();
  return r.result ? r.result.value : null;
}

(async () => {
  const targets = await httpGet('/json/list');
  const pages = targets.filter((t) => t.webSocketDebuggerUrl && ['page', 'webview', 'iframe'].includes(t.type));
  if (!pages.length) { console.log('no pages'); return; }

  for (const t of pages) {
    const out = await evalIn(t, `(function(){
      var res = {};
      // 1) style 标签是否在
      var st = document.getElementById('wb-typography');
      res.styleInjected = !!st;
      res.styleLen = st ? st.textContent.length : 0;

      // 2) 字体是否真被系统识别
      try {
        res.fontLXGW = document.fonts.check('16px "LXGW WenKai"');
        res.fontSmartisan = document.fonts.check('16px "Smartisan Compact CNS"');
        res.fontMono = document.fonts.check('16px Consolas');
      } catch(e) { res.fontCheckErr = String(e); }

      // 3) 抽正文元素看计算样式
      var cands = ['.cr-markdown','.cb-markdown','._userMessageBubble_','.cr-self-bubble','body'];
      res.samples = [];
      for (var i=0;i<cands.length;i++){
        var el = document.querySelector(cands[i]);
        if (!el) continue;
        var cs = getComputedStyle(el);
        res.samples.push({
          sel: cands[i],
          fontFamily: cs.fontFamily.slice(0,70),
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          fontWeight: cs.fontWeight
        });
      }
      // 4) 找任意有文本的元素看实际字体渲染
      var probe = document.querySelector('.cr-markdown p, .cb-markdown p, ._userMessageBubble_');
      if (probe) {
        var p = getComputedStyle(probe);
        res.probeText = (probe.textContent||'').slice(0,25);
        res.probeFamily = p.fontFamily.slice(0,90);
        res.probeSize = p.fontSize;
        res.probeLH = p.lineHeight;
        // 宽度差异检测：同一段文字在不同字体下宽度不同
        try {
          var cv = document.createElement('canvas').getContext('2d');
          cv.font = p.fontSize + ' ' + p.fontFamily;
          res.probeWidthLXGW = Math.round(cv.measureText('中文测试汉字宽度').width);
          cv.font = p.fontSize + ' "LXGW WenKai"';
          res.probeWidthExplicit = Math.round(cv.measureText('中文测试汉字宽度').width);
          cv.font = p.fontSize + ' "Smartisan Compact CNS"';
          res.probeWidthSmartisan = Math.round(cv.measureText('中文测试汉字宽度').width);
        } catch(e){}
      }
      return JSON.stringify(res);
    })()`);
    console.log('=== ' + (t.url || '').slice(0, 60) + ' ===');
    if (out) { try { console.log(JSON.stringify(JSON.parse(out), null, 2)); } catch { console.log(out); } }
    else console.log('(no result)');
  }
})().catch((e) => console.error('ERR', e.message));
