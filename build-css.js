/**
 * WorkBuddy 排版插件 · CSS 生成器
 *
 * 核心职责（v2）：**只改字体**。
 * 字号 / 行距默认交回软件官方设置 —— WorkBuddy 自带界面字号缩放
 * （受 --cb-font-size-offset 控制），插件强行覆盖会与之打架，
 * 且用户调一次字号就被插件打回，徒增困扰。
 *
 * 绝不碰 color / background / border —— 这是与换肤插件的根本区别。
 *
 * 由 config.json 驱动，用户改配置即可调参，无需改代码。
 */

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  enabled: true,

  // 只改字体（推荐）。设为 true 才会接管字号/行距。
  overrideSize: false,

  font: {
    fontFamily: 'LXGW WenKai',
    fontFamilyMono: 'Consolas',
    fontWeight: 400,
    fontWeightBold: 700,
  },

  // 以下仅在 overrideSize = true 时生效
  size: {
    bodyPx: 17,
    lineHeight: 1.9,
    letterSpacingEm: 0.01,
    headingScale: 1.28,
  },

  scope: {
    markdown: true,
    userBubble: true,
    codeBlock: true,
    inlineCode: true,
    heading: true,
    quote: true,
    table: true,
    inputBox: true,
    uiLabel: false,
  },
};

function deepMerge(base, over) {
  if (over === null || over === undefined) return base;
  if (typeof base !== 'object' || base === null) return over;
  if (typeof over !== 'object') return over;
  const out = Object.assign({}, base);
  for (const k of Object.keys(over)) {
    if (k.startsWith('_')) continue; // 跳过注释字段
    out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

function loadConfig(configPath) {
  let cfg = DEFAULTS;
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      cfg = deepMerge(DEFAULTS, JSON.parse(raw));
    }
  } catch (e) {
    console.error('[typography] config.json 解析失败，使用默认值：' + e.message);
  }
  return cfg;
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildCss(cfg) {
  const f = cfg.font;
  const s = cfg.size;
  const sc = cfg.scope;
  const family = esc(f.fontFamily);
  const mono = esc(f.fontFamilyMono || 'Consolas');
  const w = f.fontWeight;
  const wb = f.fontWeightBold;
  const px = s.bodyPx;
  const lh = s.lineHeight;
  const ls = String(s.letterSpacingEm);
  // 用户可能填 "0.01" 这种裸数字，补上 em 单位（letter-spacing 裸数字无单位不生效）
  const lsUnit = /[a-z%]+$/i.test(ls) ? ls : ls + 'em';
  const hs = s.headingScale;

  const L = [];
  const SIZE = !!cfg.overrideSize;   // 是否接管字号/行距

  L.push('/* WorkBuddy 排版插件 —— 只改字体，不含任何配色 */');
  L.push('/* 字体: ' + f.fontFamily + ' */');
  L.push('/* 模式: ' + (SIZE ? '字体 + 字号行距' : '仅字体（字号/行距交回官方）') + ' */');
  L.push('');

  // ---- 字体栈（始终生效）----
  L.push(':root {');
  L.push('  --wb-typo-family: ' + family + ' !important;');
  L.push('  --wb-typo-mono: ' + mono + ' !important;');
  L.push('  --wb-typo-weight: ' + w + ' !important;');
  L.push('  --wb-typo-weight-bold: ' + wb + ' !important;');
  L.push('}');
  L.push('');

  // 全局兜底：所有文本继承新字体。
  // 注意这里只写 font-family / font-weight，绝不碰 font-size / line-height。
  L.push('html, body, #root, * {');
  L.push('  font-family: ' + family + ' !important;');
  L.push('}');
  L.push('');

  // 统一的规则体发射器：仅在 SIZE 模式才追加尺寸相关声明。
  // 这样"只改字体"模式下，CSS 里不会出现任何 font-size / line-height。
  function body(extra) {
    const b = [];
    if (extra && extra.family) b.push('  font-family: ' + family + ' !important;');
    else b.push('  font-family: ' + family + ' !important;');
    if (extra && extra.weight) b.push('  font-weight: ' + extra.weight + ' !important;');
    if (SIZE && extra && extra.size) b.push('  font-size: ' + extra.size + ' !important;');
    if (SIZE && extra && extra.lh) b.push('  line-height: ' + extra.lh + ' !important;');
    if (extra && extra.ls !== undefined) b.push('  letter-spacing: ' + extra.ls + ' !important;');
    return b;
  }

  if (sc.markdown) {
    L.push('.cr-markdown, .cb-markdown, .markdown-body, .prose {');
    body({ weight: w, size: px + 'px', lh: lh, ls: lsUnit }).forEach((x) => L.push(x));
    L.push('  word-break: break-word;');
    L.push('}');
    L.push('');
    if (SIZE) {
      L.push('.cr-markdown p, .cr-markdown li, .cr-markdown div,');
      L.push('.cb-markdown p, .cb-markdown li, .cb-markdown div {');
      L.push('  line-height: ' + lh + ' !important;');
      L.push('}');
      L.push('');
    }
  }

  if (sc.heading) {
    const hx = (n) => (px * Math.pow(hs, n)).toFixed(2);
    L.push('.cr-markdown h1, .cr-markdown h2, .cr-markdown h3,');
    L.push('.cr-markdown h4, .cr-markdown h5, .cr-markdown h6,');
    L.push('.cb-markdown h1, .cb-markdown h2, .cb-markdown h3,');
    L.push('.cb-markdown h4, .cb-markdown h5, .cb-markdown h6 {');
    L.push('  font-family: ' + family + ' !important;');
    L.push('  font-weight: ' + wb + ' !important;');
    if (SIZE) L.push('  line-height: 1.45 !important;');
    L.push('}');
    if (SIZE) {
      L.push('.cr-markdown h1, .cb-markdown h1 { font-size: ' + hx(2) + 'px !important; }');
      L.push('.cr-markdown h2, .cb-markdown h2 { font-size: ' + hx(1.6) + 'px !important; }');
      L.push('.cr-markdown h3, .cb-markdown h3 { font-size: ' + hx(1.3) + 'px !important; }');
      L.push('.cr-markdown h4, .cb-markdown h4 { font-size: ' + hx(1.1) + 'px !important; }');
      L.push('.cr-markdown h5, .cr-markdown h5,');
      L.push('.cr-markdown h6, .cb-markdown h6 { font-size: ' + px + 'px !important; }');
    }
    L.push('');
    L.push('.cr-markdown strong, .cr-markdown b, .cb-markdown strong, .cb-markdown b {');
    L.push('  font-weight: ' + wb + ' !important;');
    L.push('}');
    L.push('');
  }

  if (sc.userBubble) {
    L.push('.cr-self-bubble.cr-self-bubble, ._userMessageBubble_._userMessageBubble_,');
    L.push('.userMessageBubble_.userMessageBubble_,');
    L.push('.cb-user-message.cb-user-message, .user-message-bubble.user-message-bubble {');
    body({ weight: w, size: px + 'px', lh: lh, ls: lsUnit }).forEach((x) => L.push(x));
    L.push('}');
    L.push('');
    L.push('.cr-self-bubble *, ._userMessageBubble_ *, .userMessageBubble_ * {');
    L.push('  font-family: ' + family + ' !important;');
    if (SIZE) L.push('  line-height: ' + lh + ' !important;');
    L.push('}');
    L.push('');
  }

  if (sc.codeBlock) {
    L.push('.cr-markdown pre, .cb-markdown pre, pre,');
    L.push('.cm-content, .monaco-editor, .CodeMirror {');
    L.push('  font-family: var(--wb-typo-mono) !important;');
    if (SIZE) {
      L.push('  font-size: ' + (px - 3.5).toFixed(2) + 'px !important;');
      L.push('  line-height: 1.65 !important;');
    }
    L.push('  letter-spacing: 0 !important;');
    L.push('}');
    L.push('');
  }

  if (sc.inlineCode) {
    L.push('.cr-markdown code:not(pre code), .cb-markdown code:not(pre code),');
    L.push('code:not(pre code) {');
    L.push('  font-family: var(--wb-typo-mono) !important;');
    if (SIZE) L.push('  font-size: 0.92em !important;');
    L.push('  letter-spacing: 0 !important;');
    L.push('}');
    L.push('');
  }

  if (sc.quote) {
    L.push('.cr-markdown blockquote, .cb-markdown blockquote, blockquote {');
    body({ size: px + 'px', lh: lh, ls: lsUnit }).forEach((x) => L.push(x));
    L.push('}');
    L.push('');
  }

  if (sc.table) {
    L.push('.cr-markdown table, .cb-markdown table, table {');
    body({ size: (px - 0.5).toFixed(2) + 'px', lh: '1.7', ls: lsUnit }).forEach((x) => L.push(x));
    L.push('}');
    L.push('');
  }

  if (sc.inputBox) {
    L.push('.cr-input-container textarea, .cr-input-container [contenteditable],');
    L.push('._mainArea_, textarea, [contenteditable="true"] {');
    body({ size: px + 'px', lh: lh, ls: lsUnit }).forEach((x) => L.push(x));
    L.push('}');
    L.push('');
  }

  if (sc.uiLabel) {
    L.push('button, .btn, [role="button"], [role="tab"], [role="menuitem"],');
    L.push('label, .tab, .nav-item, .menu-item {');
    L.push('  font-family: ' + family + ' !important;');
    L.push('  letter-spacing: ' + lsUnit + ' !important;');
    L.push('}');
    L.push('');
  }

  return L.join('\n');
}

// 官方留的后门类名。加上它，官方那条 !important 字号规则
//   XXX:not(.cb-font-size-fixed):not(.cb-font-size-fixed *)
// 就不会匹配到我们的目标，插件字号才能真正生效。
// 官方自己也在用这个类名做"固定字号"模式，属于受支持的行为。
//
// 注意：官方这条规则同时覆盖了正文(.cr-markdown)和气泡(.cr-self-bubble)，
// 所以两类都要打标记，否则字号会被官方的 calc(基准 + --cb-font-size-offset) 压过。
const FONT_SIZE_FIXED_CLASS = 'cb-font-size-fixed';

// 仅在接管字号时才需要打后门类名。
// overrideSize = false（默认，只改字体）时返回空脚本 —— 此时绝不能打这个标记，
// 否则会破坏 WorkBuddy 自带的界面字号调节（用户拖字号滑块将失效）。
function buildTagScript(cfg) {
  if (!cfg || !cfg.overrideSize) return '';
  return `(function(){
  var CLS = ${JSON.stringify(FONT_SIZE_FIXED_CLASS)};
  var SELS = '.cr-markdown, .cb-markdown, .cr-self-bubble, ._userMessageBubble_, .userMessageBubble_';
  function mark() {
    var n = document.querySelectorAll(SELS);
    for (var i = 0; i < n.length; i++) {
      n[i].classList.add(CLS);
    }
    return n.length;
  }
  var marked = mark();
  if (window.MutationObserver && !window.__wbTypoObserver) {
    var mo = new MutationObserver(function() { mark(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    window.__wbTypoObserver = mo;
  }
  return marked;
})()`;
}

module.exports = { loadConfig, buildCss, buildTagScript, FONT_SIZE_FIXED_CLASS, DEFAULTS };

if (require.main === module) {
  const cfgPath = process.argv[2] || path.join(__dirname, 'config.json');
  const cfg = loadConfig(cfgPath);
  const css = buildCss(cfg);
  const out = process.argv[3] || path.join(__dirname, 'typography.css');
  fs.writeFileSync(out, css, 'utf8');
  console.log('[typography] 已生成 ' + out + '（' + css.length + ' 字节）');
  console.log('[typography] 字体=' + cfg.font.fontFamily + ' 正文=' + cfg.size.bodyPx + 'px/' + cfg.size.lineHeight);
}
