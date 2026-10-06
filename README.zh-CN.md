# WorkBuddy 排版插件（WB-Typography）

> 只改字体、字号、行距、字距。**不碰任何配色**（颜色/背景/边框一律不动）。
> 完全独立插件，不与官方"外观"功能、锤子便签主题或任何其他皮肤互动。

---

## 一、这是什么

一个通过 Chrome DevTools Protocol（CDP）向运行中的 WorkBuddy 注入排版 CSS 的工具。
**不修改** `app.asar`、不触碰安装目录、不破坏应用签名。

核心特点：**配置驱动**。改字体不用碰代码，改 `config.json` 即可，约 2 秒自动生效。

---

## 二、目录结构

```
WB-Typography\                 ← 整个目录可搬移（路径自动推导）
├── settings.bat        ★ 日常入口：打开网页设置界面
├── settings.html       网页界面（下拉选字体 + 实时预览 + 应用）
├── server.js           本地服务，为网页提供 API（127.0.0.1:8787）
├── scan-fonts.js       扫描本机字体 → font-list.json
├── font-list.json      字体列表产物
├── config.json         配置文件（网页和手改都支持）
├── build-css.js        CSS 生成器（读 config → 生成 typography.css）
├── typography.css      生成产物（勿手改，会被覆盖）
├── inject.js           一次性注入
├── watcher.js          常驻监视器（处理 iframe 重建 + 配置热更新）
├── verify.js           命令行验证是否生效
├── make-launcher.js    创建启动器（setup-cdp.bat 调用）
├── Start WorkBuddy.cmd 启动器（生成物，作用同"带调试端口启动 WorkBuddy"）
├── setup-cdp.bat       首次配置：生成启动器
├── apply.bat           命令行方式应用（网页之外的备选）
├── remove.bat          卸载插件
└── README.md           本文件
```

---

## 三、怎么用

### 日常使用：网页设置界面（推荐）

双击 **`settings.bat`** → 浏览器自动打开设置页。

- 下拉选字体 → **实时预览** → 点「**应用设置**」→ 约 2 秒生效
- 想确认是否真的生效 → 点「**检查是否生效**」，会显示当前实际计算样式
- 刚装了新字体 → 点「**重新扫描字体**」

页面做的事：读本机字体列表 → 你选 → 写 `config.json` → 通过 CDP 立即注入。
全部在本机完成（`127.0.0.1`），不联网。

### 首次使用（每个 Windows 账号只需做一次）

1. 双击 **`setup-cdp.bat`** — 生成启动器 `Start WorkBuddy.cmd`（在本插件目录内）。
   若你的 WorkBuddy 不在默认位置，可指定路径：
   ```
   setup-cdp.bat "C:\path\to\WorkBuddy.exe"
   ```
2. **完全关闭** WorkBuddy（所有窗口 + 托盘图标）。
3. 双击 `Start WorkBuddy.cmd` 启动。
4. 双击 **`settings.bat`** 打开设置页，开始设置。

**关于快捷方式**：启动器本体就在插件目录里，**桌面不放任何文件也不会有问题**。
想放在桌面方便点击，可以右键 `Start WorkBuddy.cmd` →
「发送到」→「桌面快捷方式」。快捷方式删了也不影响，随时能重建。

> **为什么必须这样启动**：插件通过 Chrome DevTools Protocol 注入 CSS，
> 而 CDP 端口只有在启动时加了 `--remote-debugging-port` 参数才会开启。
> 普通方式启动的 WorkBuddy 没有该端口，插件无法工作。
>
> **可迁移**：所有脚本都从自身位置推导路径（`%~dp0`），
> 整个目录可以复制到任何位置、任何用户名下运行，无需修改任何文件。
>
> 不用启动器也行，手动命令行启动：
> `"D:\Programs\WorkBuddy\WorkBuddy.exe" --remote-debugging-port=9222`

### 卸载

双击 `remove.bat`。官方外观完全不受影响（插件从未修改任何官方文件）。

---

## 四、字号与行距（默认不管，建议别开）

**默认状态下，插件只改字体，字号和行距完全交给 WorkBuddy 官方设置。**

这是刻意的设计：WorkBuddy 自带界面字号缩放（内部变量 `--cb-font-size-offset`），
插件强行覆盖会与之打架，且你在软件里调一次字号就被插件打回，徒增困扰。

所以**想调字号行距，直接在 WorkBuddy 里调**即可（软件设置里有关字号/缩放的选项）。

如果确实想让插件接管（需要更细的控制，如标题缩放比例），在设置页打开
「接管字号与行距」开关。开启后需注意：

- 插件会给正文容器打上 `cb-font-size-fixed` 类名，用于压过官方的 `!important` 规则
- 这会让 WorkBuddy 自带的字号调节按钮对正文失效
- 字号会固定成你设置的值

**建议**：先只用字体。真需要调字号，用软件自带的。

---

## 五、config.json 完整配置说明

```jsonc
{
  "enabled": true,

  // ★ 默认 false = 只改字体，字号/行距交回官方（推荐）
  "overrideSize": false,

  "font": {
    "fontFamily": "LXGW WenKai",   // 正文字体（用设置页下拉选，别手填）
    "fontFamilyMono": "Consolas",  // 代码块等宽字体
    "fontWeight": 400,
    "fontWeightBold": 700
  },

  // 以下仅 overrideSize=true 时生效
  "size": {
    "bodyPx": 17,
    "lineHeight": 1.9,
    "letterSpacingEm": 0.01,
    "headingScale": 1.28
  },

  "scope": {                   // 各区域开关，关掉则该区域保持官方默认
    "markdown": true,          // AI 回答正文
    "userBubble": true,        // 你的消息气泡
    "codeBlock": true,         // 代码块
    "inlineCode": true,        // 行内代码
    "heading": true,           // 各级标题
    "quote": true,             // 引用块
    "table": true,             // 表格
    "inputBox": true,          // 输入框
    "uiLabel": false           // 界面标签（按钮/菜单）—— 默认关闭
  }
}
```

**本机已确认可用的字体**（`scan-fonts.js` 扫出 235 个家族，以下是正文字体候选）：

| 字体 | CSS font-family | 字重 |
|------|----------------|------|
| 霞鹜文楷 | `LXGW WenKai` | Regular, Bold |
| 锤子T黑 | `Smartisan Compact CNS` | Light, Regular, Medium, Bold |
| 思源黑体 | `Source Han Sans SC` | Regular, Bold |
| 思源宋体 | `Noto Serif SC` | Regular |
| 苹方 | `PingFang SC` | — |
| MiSans | `MiSans` | Regular, Medium, DemiBold |

> 字体名必须与字体**内部 family 名**一致，不是 Windows 注册表里的中文显示名。
> 填错了不报错，但**不生效**。用设置页下拉框选就不会出错。

改完保存，约 2 秒自动生效。字号/行高是纯数值，直接调即可。

---

## 六、已知限制（重要，请先读）

1. **必须用带调试端口的方式启动 WorkBuddy。**
   CDP 方案的技术前提。普通启动的 WorkBuddy 没有调试端口，插件无法注入。
   → 用 `setup-cdp.bat` 创建的启动器，或手动加 `--remote-debugging-port=9222` 参数。

2. **手动完全重启 WorkBuddy 后，插件失效。**
   CDP 注入只存在于内存中。重启后重跑 `apply.bat` 即可恢复。
   （`watcher.js` 常驻运行时会自动处理新建页面，但**完全重启**仍需重跑 apply）

3. **调试端口仅绑定本机回环 `127.0.0.1`。**
   插件运行期间，避免运行来源不明的本机程序。这是所有 CDP 方案的共同风险。

4. **WorkBuddy 更新后可能需要重新验证 CSS。**
   若更新改变了 DOM 类名，个别区域可能覆盖不到。用 `scope` 开关逐项排查。

---

## 七、安全说明

- **仅本机操作**：只与 `127.0.0.1` 上的 WorkBuddy 通信，无任何网络外连、无遥测。
- **不读取凭证**：不接触密码、Token 或任何用户文件。
- **不修改官方文件**：`app.asar`、安装目录、数字签名全部保持原样。
- **不与其他插件互动**：使用独立 style id `wb-typography`，不设置 `data-skin`
  等官方属性，与官方"外观"功能及任何其他皮肤/主题插件互不干扰，可并存。
- **可审计**：所有脚本均为可读源码，`apply.bat` / `remove.bat` 内容一目了然。

---

*插件版本 1.0 · 纯 ASCII 批处理（规避 cmd 编码问题）· 零第三方依赖*
