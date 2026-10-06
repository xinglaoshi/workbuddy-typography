/**
 * 扫描本机已安装字体，输出 CSS font-family 名称列表。
 * 写入 font-list.json，供 settings.html 下拉框使用。
 *
 * 关键：必须读 TTF/OTF 的 name 表拿 family(1)，不能用注册表显示名
 * （注册表是中文名，CSS 里无效）。已用此法确认：
 *   霞鹜文楷 -> "LXGW WenKai"（不是"霞鹜文楷"）
 *   锤子T黑 -> "Smartisan Compact CNS"
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const FONT_DIRS = [
  'C:/Windows/Fonts',
  path.join(os.homedir(), 'AppData/Local/Microsoft/Windows/Fonts'),
];

const EXT = new Set(['.ttf', '.otf', '.ttc', '.otc']);

// 解析 sfnt name 表，取 nameID=1(family) / 2(subfamily) / 16(typoFamily)
function readNames(file) {
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch { return null; }
  try {
    const size = fs.fstatSync(fd).size;
    if (size < 12) return null;
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const tag = head.toString('ascii', 0, 4);
    let numTables, off;
    if (tag === 'ttcf') {
      numTables = head.readUInt16BE(8);
      // ttcc 偏移表本身较大，改用随机读
      const offBuf = Buffer.alloc(4);
      fs.readSync(fd, offBuf, 0, 4, 12);
      off = offBuf.readUInt32BE(0);
    } else {
      numTables = head.readUInt16BE(4);
      off = 12;
    }
    let nameOff = -1;
    const rec = Buffer.alloc(16);
    for (let i = 0; i < numTables; i++) {
      if (off + i * 16 + 16 > size) break;
      fs.readSync(fd, rec, 0, 16, off + i * 16);
      if (rec.toString('ascii', 0, 4) === 'name') {
        nameOff = rec.readUInt32BE(8);
        break;
      }
    }
    if (nameOff < 0 || nameOff + 6 > size) return null;
    const hdr = Buffer.alloc(6);
    fs.readSync(fd, hdr, 0, 6, nameOff);
    const count = hdr.readUInt16BE(2);
    const strOff = nameOff + hdr.readUInt16BE(4);
    const rBuf = Buffer.alloc(12);
    const out = {};
    for (let i = 0; i < count; i++) {
      const rp = nameOff + 6 + i * 12;
      if (rp + 12 > size) break;
      fs.readSync(fd, rBuf, 0, 12, rp);
      const platformID = rBuf.readUInt16BE(0);
      const nameID = rBuf.readUInt16BE(6);
      if (nameID !== 1 && nameID !== 2 && nameID !== 16) continue;
      const len = rBuf.readUInt16BE(8);
      const o = rBuf.readUInt16BE(10);
      const abs = strOff + o;
      if (abs + len > size) continue;
      const raw = Buffer.alloc(len);
      fs.readSync(fd, raw, 0, len, abs);
      let val;
      if (platformID === 3) val = Buffer.from(raw).swap16().toString('utf16le');
      else val = raw.toString('latin1');
      val = val.replace(/\0/g, '').trim();
      if (val && out[nameID] === undefined) out[nameID] = val;
    }
    return out;
  } catch { return null; }
  finally { try { fs.closeSync(fd); } catch {} }
}

const families = new Map(); // family -> {family, styles:Set, files:[]}

for (const dir of FONT_DIRS) {
  if (!fs.existsSync(dir)) continue;
  let entries;
  try { entries = fs.readdirSync(dir); } catch { continue; }
  for (const name of entries) {
    const ext = path.extname(name).toLowerCase();
    if (!EXT.has(ext)) continue;
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile() || st.size < 4096) continue;
    const n = readNames(full);
    if (!n) continue;
    const fam = n[1];
    if (!fam || fam.length > 80) continue;
    // 过滤明显不适合做正文的图标字体/极小字体
    if (/^(icon|icons|marlett|symbol|webding|wingdings|holomdl)/i.test(fam)) continue;
    if (!families.has(fam)) families.set(fam, { family: fam, styles: new Set(), files: [] });
    const rec = families.get(fam);
    rec.styles.add(n[2] || 'Regular');
    if (rec.files.length < 3) rec.files.push(name);
  }
}

const list = [...families.values()]
  .map((r) => ({ family: r.family, styles: [...r.styles].sort(), files: r.files }))
  .sort((a, b) => a.family.localeCompare(b.family, 'zh-CN'));

const outPath = path.join(__dirname, 'font-list.json');
fs.writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), count: list.length, fonts: list }, null, 0), 'utf8');
console.log('[typography] 扫描完成：' + list.length + ' 个字体家族');
console.log('[typography] 已写入 ' + outPath);

// 输出常见中文字体，方便核对
const cn = list.filter((f) => /[\u4e00-\u9fa5]|PingFang|Han|Kai|Song|Hei|Ming|CJK|SC|SimSun|SimHei|YaHei/i.test(f.family));
console.log('[typography] 其中可能适合中文正文的：');
cn.slice(0, 25).forEach((f) => console.log('   ' + f.family + '  [' + f.styles.join(', ') + ']'));
