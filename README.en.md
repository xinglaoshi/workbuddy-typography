# WB-Typography · WorkBuddy Font Plugin

> Change the interface font of WorkBuddy. **Font only — colors, sizes and line height are untouched.**
> Pick a font in a web page; takes effect immediately, no restart needed.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[中文说明](README.md) · [Release notes](https://github.com/xinglaoshi/workbuddy-typography/releases/tag/v1.0.0)

---

## 这是什么

一个给 **WorkBuddy 桌面端（Windows）** 换字体的工具。

- 网页界面选字体 → 点应用 → 立刻生效
- 字体列表从**你自己电脑**里扫出来，不会填错名字
- 字号和行距**完全交给 WorkBuddy 官方设置**，插件不去抢
- 不修改 `app.asar`、不碰安装目录、不破坏应用签名
- 全部操作在本机完成（`127.0.0.1`），不联网、不收集任何信息

---

## 快速开始

### 需要什么

- Windows 10 / 11
- **Node.js 18 或更高**（[下载](https://nodejs.org/)）——唯一依赖
- 已装 WorkBuddy 桌面端

### 三步走

**1. 启动 WorkBuddy（带调试端口）**

双击 `setup-cdp.bat` 生成启动器 `Start WorkBuddy.cmd`，然后用它启动 WorkBuddy。

> ⚠️ **必须用这个启动器**：本工具通过 Chrome DevTools Protocol 注入 CSS，
> 而调试端口只有在启动时加了 `--remote-debugging-port` 参数才会开启。
> 普通方式启动的 WorkBuddy 没有该端口，工具无法工作。

**2. 打开设置界面**

双击 `settings.bat`，浏览器会自动打开设置页。

**3. 选字体，点应用**

从下拉框挑一个字体（可实时预览），点「**应用设置**」。约 2 秒后界面生效。

---

## 目录放哪里都行

整个目录可以**随便搬移、随便改名**，所有脚本都从自身位置推导路径，不含任何硬编码。

推荐放在一个固定位置，例如：

```
C:\Users\Public\WB-Typography\     （所有用户可用）
```

或者只给自己用：

```
%USERPROFILE%\.workbuddy-typography\
```

---

## 日常使用

| 场景 | 操作 |
|------|------|
| 换字体 | 双击 `settings.bat` → 选 → 应用 |
| 刚装了新字体，想让它出现在列表里 | 设置页点「重新扫描字体」，或命令行 `node scan-fonts.js` |
| 想知道是否真的生效 | 设置页点「检查是否生效」 |
| 完全关闭插件 | 双击 `remove.bat` |

### 什么时候需要重新应用？

- **完全退出并重启 WorkBuddy 后** —— 样式只存在于内存，重启即失效。
  重新用 `Start WorkBuddy.cmd` 启动，再跑一次 `settings.bat` 点应用。
- 日常只是切窗口、开会话、开关文档 —— **不需要**，`watcher.js` 会自动处理。

---

## 关于字号和行距

**默认不管，这是刻意的设计。**

WorkBuddy 自带界面字号缩放，插件强行覆盖会与之冲突：
你在软件里调一次字号就被插件打回，徒增困扰。

所以**想调字号行距，直接在 WorkBuddy 里调**即可。

设置页有个「接管字号与行距」开关，默认关闭。开启后插件会固定字号，
但代价是 **WorkBuddy 自带的字号调节对正文失效**。一般不建议开。

---

## 它怎么工作

```
settings.bat  ->  server.js  ->  写 config.json  ->  CDP 注入 CSS  ->  界面生效
                   ^                                    ^
              settings.html                      运行中的 WorkBuddy
             （你在网页上操作）                    （样式只存在于内存）
```

- 字体名从 TTF/OTF 文件的 `name` 表读取 —— 这是**字体内部家族名**，
  不是 Windows 注册表里的中文显示名。两者常常不同：
  注册表显示「霞鹜文楷」，CSS 里要写 `LXGW WenKai`。填错了不报错但**不生效**。
- 样式用 `<style id="wb-typography">` 注入，不碰官方任何文件。
- `watcher.js` 每 3 秒检查一次，新建页面/iframe 自动补注入。
  配置文件改动约 2 秒自动生效。

---

## 文件说明

| 文件 | 作用 |
|------|------|
| `settings.bat` | ★ 日常入口，打开网页设置界面 |
| `settings.html` | 网页界面（选字体 / 实时预览 / 应用） |
| `server.js` | 本地服务，为网页提供 API（`127.0.0.1:8787`） |
| `config.json` | 配置文件，网页和手改都支持 |
| `scan-fonts.js` | 扫描本机字体 -> `font-list.json` |
| `build-css.js` | CSS 生成器（读 config -> 生成 typography.css） |
| `inject.js` | 一次性注入 |
| `watcher.js` | 常驻监视器（处理 iframe 重建 + 配置热更新） |
| `verify.js` | 命令行验证是否生效 |
| `setup-cdp.bat` | 生成带调试端口的启动器 |
| `apply.bat` | 命令行方式应用（网页之外的备选） |
| `remove.bat` | 卸载（官方外观完全不受影响） |

---

## 常见问题

**Q：设置页打不开 / 提示连不上服务？**
双击 `settings.bat` 而不是直接双击 `settings.html`。直接开 HTML 文件会因为浏览器的
同源策略连不上本地 API。

**Q：WorkBuddy 装在非默认位置？**
```
setup-cdp.bat "C:\你的路径\WorkBuddy.exe"
```

**Q：改了没反应？**
依次检查：① WorkBuddy 是不是用 `Start WorkBuddy.cmd` 启动的；
② 点一下设置页的「检查是否生效」看实际样式；
③ 看命令行窗口有没有报错。

**Q：会不会和官方换肤/主题功能冲突？**
不会。插件用独立的 style id，也不设置 `data-skin` 等官方属性，
与官方外观功能和其他皮肤插件互不干扰，可并存。

**Q：安全吗？**
只与本机 `127.0.0.1` 上的 WorkBuddy 通信；不联网、不读任何用户文件或凭证；
不修改 `app.asar`、安装目录或数字签名。所有脚本是可读源码，可自行审阅。

---

## 已知限制

1. 必须用带调试端口的启动器启动 WorkBuddy（见「快速开始」）。
2. 完全重启 WorkBuddy 后样式失效，需重新应用。这是 CDP 方案的固有限制。
3. 调试端口仅绑定本机回环。工具运行期间，避免运行来源不明的本机程序。
4. WorkBuddy 更新后 DOM 结构可能变化，个别区域可能覆盖不到。
   可用 `config.json` 里的 `scope` 开关逐项排查。
5. 仅支持 Windows。

---

## License

[MIT](LICENSE) © 2026 邢不疯
