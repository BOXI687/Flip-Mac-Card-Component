# 从零做一个「翻角切换」小组件原型 —— 完整教程

> 读者：第一次做交互原型、用 Windows 电脑、想最后在 iPhone 上玩到的你。
> 每一步都会讲 **做了什么 → 为什么这么做 → 你可以动手试什么**。

<p align="center"><img src="images/peek.png" width="300"> <img src="images/flip.png" width="300"></p>

---

## 目录

0. [先想清楚：我们到底在做什么](#0-先想清楚我们到底在做什么)
1. [准备 Windows 上的工具](#1-准备-windows-上的工具)
2. [项目结构：每个文件管什么](#2-项目结构每个文件管什么)
3. [第一步：还原两个小组件的外观](#3-第一步还原两个小组件的外观)
4. [第二步：把两张卡叠起来](#4-第二步把两张卡叠起来)
5. [第三步：让网页「接管」手指](#5-第三步让网页接管手指)
6. [第四步：翻角的数学（最核心）](#6-第四步翻角的数学最核心)
7. [第五步：光影 —— 让「折」看起来像「卷」](#7-第五步光影--让折看起来像卷)
8. [第六步：松手之后 —— 物理手感](#8-第六步松手之后--物理手感)
9. [第七步：放到 iPhone 上玩](#9-第七步放到-iphone-上玩)
10. [动手改一改：参数速查表](#10-动手改一改参数速查表)
11. [下一步可以做什么](#11-下一步可以做什么)
12. [常见问题](#12-常见问题)

---

## 0. 先想清楚：我们到底在做什么

### 交互拆解

作为交互设计师，动手前先把交互拆成**状态**和**转换**：

```
            按住某个角                松手（没过一半）
  [静止] ──────────────▶ [拖动中] ─────────────────▶ [弹回] ──▶ [静止]
                          │  角跟着手指走                 ▲
                          │  能偷看下面那张                │ 弹回途中可以再抓住
                          │                               │
                          └── 松手（过了一半 / 快速一甩）──▶ [翻走] ──▶ [静止，两张卡换了顺序]
```

这张图就是 `js/peel.js` 里的**状态机**：`idle → dragging → returning / flipping → idle`。
代码的整体结构就是照着这张图写的。

### 为什么做成「网页原型」，而不是真的 iOS 小组件？

| 方案 | 问题 |
| --- | --- |
| 真正的 iOS 小组件（WidgetKit） | ❌ iOS 小组件**不支持拖拽手势**，只能响应点击按钮；❌ 必须用 Mac + Xcode 开发，Windows 做不了 |
| Figma / ProtoPie 原型 | 能做出大概样子，但很难做出「角跟着手指、折痕实时计算」这种连续的物理手感 |
| **网页原型（本项目）** | ✅ Windows 就能写；✅ iPhone Safari 里「添加到主屏幕」后全屏打开，和 App 几乎一样；✅ 手感可以做到很细 |

> 💡 这也是业界常见做法：先用网页原型验证「这个交互好不好玩」，再决定要不要投入原生开发。

---

## 1. 准备 Windows 上的工具

只需要三样，全部免费：

1. **Chrome 浏览器**：预览和调试。
2. **VS Code**（https://code.visualstudio.com）：写代码。装好后建议加一个中文语言包插件。
3. **Git for Windows**（https://git-scm.com/download/win）：把 GitHub 上的代码拿到电脑上。

把代码下载到电脑：

```bash
# 在 VS Code 里按 Ctrl + ` 打开终端，然后：
git clone https://github.com/BOXI687/Flip-Mac-Card-Component.git
cd Flip-Mac-Card-Component
git checkout claude/github-cleanup-ux-prototype-541sop
```

> 不想用命令行？在 GitHub 仓库页面点绿色 **Code → Download ZIP**，解压即可。

### 在电脑上预览

- **最简单**：双击 `index.html`，用 Chrome 打开。（我们特意没用任何构建工具，所以双击就能跑。）
- **模拟手机**：在 Chrome 里按 `F12` 打开开发者工具，再按 `Ctrl + Shift + M` 切到「设备模式」，顶部选 *iPhone 14 Pro* 之类的机型。这时鼠标会被当成手指。
- 改完代码后按 `F5` 刷新就能看到效果。

---

## 2. 项目结构：每个文件管什么

```
index.html          页面骨架：一个 .stack 容器里放两张 .card
css/style.css       外观：小组件样式 + 翻角用到的各个图层
js/geometry.js      数学：折痕、裁剪、镜像（纯函数，不碰页面）
js/widgets.js       内容：电池圆环、世界时钟怎么画
js/peel.js          交互：手势 → 计算 → 渲染 → 动画
js/main.js          组装：填数据、启动交互、调试开关
```

**设计原则：把「数学」「长相」「交互」分开。**
这样你想换小组件内容时只动 `widgets.js`，想调手感时只动 `peel.js`，互不影响。

四个 JS 文件在 `index.html` 最底部按顺序加载，后面的文件可以用前面文件定义的东西：

```html
<script src="js/geometry.js"></script>   <!-- 定义 window.Geometry -->
<script src="js/widgets.js"></script>    <!-- 定义 window.Widgets -->
<script src="js/peel.js"></script>       <!-- 定义 window.PeelStack，内部用到 Geometry -->
<script src="js/main.js"></script>       <!-- 把上面三个组装起来 -->
```

---

## 3. 第一步：还原两个小组件的外观

### 3.1 尺寸：从 iOS 的设计规范出发

iPhone 中号小组件的设计尺寸是 **338 × 158**，圆角大约 **22**。
但不同 iPhone 屏幕宽度不同，所以我们定义了一个「设计单位」`--u`（`css/style.css` 开头）：

```css
--widget-w: min(338px, calc(100vw - 56px)); /* 最宽 338，屏幕窄就缩 */
--u: calc(var(--widget-w) / 338);            /* 1 个设计单位有多大 */
--widget-h: calc(var(--u) * 158);
--radius: calc(var(--u) * 22);
```

之后所有尺寸都写成 `calc(var(--u) * 数字)`，这里的数字就是设计稿上的数值。整个组件会**等比缩放**，不会变形。

### 3.2 卡片为什么必须「不透明」

真的 iOS 小组件是毛玻璃（半透明）的。但我们的两张卡是**叠在一起**的：如果上面那张半透明，下面那张就会透出来。
所以 `.card` 用的是**不透明的渐变色**，只是颜色调得接近截图里的样子。这是原型里常见的取舍。

### 3.3 电池圆环：SVG + 虚线技巧

圆环进度条的原理很巧妙（`js/widgets.js` 里的 `batteryItemHTML`）：

```
把一个圆的描边设成「虚线」，虚线的每一段长度 = 圆的周长
→ 整个圆只有一段实线，看起来就是完整的圆环

再把这段虚线往回挪（stroke-dashoffset）「没电的那部分长度」
→ 圆环就只剩下「有电的那部分」
```

```js
const RING_C = 2 * Math.PI * RING_R;             // 周长
const offset = RING_C * (1 - d.level / 100);      // 41% 电量 → 挪走 59%
```

SVG 的圆默认从 3 点钟方向开始画，所以 CSS 里把它 `rotate(-90deg)`，让它从 12 点开始。

**动手试试**：打开 `js/main.js`，把 `level: 41` 改成 `level: 15`，刷新，圆环会变短、变红。

### 3.4 世界时钟：时区计算

每个城市的时间用浏览器自带的 `Intl.DateTimeFormat` 计算，传入 `timeZone: 'Asia/Shanghai'` 就能拿到北京时间，不用自己管夏令时。

指针角度的计算方法（表盘一圈 360°）：

| 指针 | 公式 | 解释 |
| --- | --- | --- |
| 时针 | `(小时 % 12 + 分钟/60) × 30` | 12 小时走一圈，每小时 30° |
| 分针 | `(分钟 + 秒/60) × 6` | 60 分钟走一圈，每分钟 6° |
| 秒针 | `秒 × 6` | 同上 |

「明天」「+15 小时」这些文字，是拿**那个城市的时间**和**你手机的本地时间**比较得出来的。所以换一个时区打开，显示的数字会不一样。

**动手试试**：在 `js/main.js` 的 `CITIES` 里把伦敦换成 `{ name: '纽约', tz: 'America/New_York' }`。

---

## 4. 第二步：把两张卡叠起来

```html
<div class="stack" id="stack">
  <section class="card card--battery"></section>   <!-- 第一张 = 最上面 -->
  <section class="card card--clock"></section>
</div>
```

- `.stack` 是 `position: relative` 的容器。
- 每张 `.card` 都是 `position: absolute; inset: 0`，所以完全重叠。
- 谁在上面由 `z-index` 决定。在 `peel.js` 里我们用一个**数组** `this.cards` 记录顺序，`cards[0]` 就是最上面那张（见 `layoutZ()`）。

翻页成功后只要把数组第一个挪到最后，再重新设置 z-index 就完成了切换：

```js
this.cards.push(this.cards.shift());
this.layoutZ();
```

右侧的小圆点（`.dots`）模仿 iOS 智能叠放的页码，通过 `onChange` 回调更新。

---

## 5. 第三步：让网页「接管」手指

### 5.1 `touch-action: none` —— 最容易忘、也最关键的一行

```css
.stack { touch-action: none; }
```

手机浏览器默认会把手指滑动当作「滚动页面」或「缩放」。这一行告诉浏览器：**在这块区域里，手指的移动交给我的 JS 处理。**
少了它，你在 iPhone 上一拖，整个页面就跟着滚了。

另外 `body` 上还有几行，也是为了让网页更像 App：

```css
overscroll-behavior: none;            /* 禁止 iOS 橡皮筋回弹 */
-webkit-user-select: none;            /* 禁止长按选中文字 */
-webkit-touch-callout: none;          /* 禁止长按弹出菜单 */
-webkit-tap-highlight-color: transparent; /* 去掉点击时的灰色闪烁 */
```

### 5.2 Pointer Events：一套代码同时支持鼠标和手指

我们监听的是 `pointerdown / pointermove / pointerup`，而不是 `touchstart` 或 `mousedown`。
Pointer Events 把鼠标、手指、触控笔统一成一种事件，**电脑上用鼠标调试，手机上用手指玩，代码完全一样**。

```js
el.addEventListener('pointerdown', (e) => this.onDown(e));
el.addEventListener('pointermove', (e) => this.onMove(e));
el.addEventListener('pointerup',   (e) => this.onUp(e));
el.addEventListener('pointercancel', (e) => this.onUp(e)); // 比如来电打断
```

### 5.3 只有按在「角」上才开始

`hitCorner(p)` 会检查手指离四个角有多远。只有在**热区半径**（卡片高度 × 0.45）以内，才算抓住了这个角。
按在卡片中间不会有任何反应，这是为了**不和其它手势冲突**（比如以后你可能想加「点击打开」）。

### 5.4 两个让手感变好的细节

**① `setPointerCapture`**：手指拖出卡片范围后，照样能收到移动事件，翻页不会「断掉」。

**② `grabOffset`（抓取偏移）**：手指很难正好按在角尖上。如果直接让角「跳」到手指位置，一按下就会突然掀起一块，很突兀。
所以我们记下「角尖 − 手指」的差值，之后始终让 **角尖 = 手指 + 这个差值**。你按在哪里都行，角尖会平滑地跟着走。

```js
this.grabOffset = G.sub(corner, p);        // 按下时记住差值
this.P = G.add(p, this.grabOffset);        // 移动时：角尖位置 = 手指 + 差值
```

---

## 6. 第四步：翻角的数学（最核心）

打开页面，点底部的 **「显示几何辅助线」**，再拖一个角，你会看到：

<p align="center"><img src="images/debug.png" width="420"></p>

- 🟠 **C 角**：你抓住的那个角（按下后就固定不动）
- 🔵 **P 手指**：角尖现在被拖到的位置
- 🔴 **M 中点**：C 和 P 的中点
- 🔴 **红色虚线 = 折痕**
- 🟩 绿框：还平躺着的部分；🟧 橙框：被掀起来的部分

### 6.1 关键洞察：折痕 = CP 的垂直平分线

拿一张纸，把右下角折到某个位置 P，然后把纸展开，看折痕在哪。你会发现：
**折痕上的每个点到 C 和到 P 的距离都相等**，也就是说，它就是线段 CP 的**垂直平分线**。

所以折痕只需要两样东西：
- 经过的点：**M = (C + P) / 2**
- 方向：垂直于 CP。我们用法向量 **n = (P − C) 的单位向量** 来表示它

（代码：`js/geometry.js` 的 `fold(C, P)`）

### 6.2 判断一个点在折痕哪一边：有符号距离

```js
dist(X) = (X − M) · n      // 「·」是点积：x1*x2 + y1*y2
```

- `dist > 0`：点在远离 C 的那一侧 → 纸还**平躺着**
- `dist < 0`：点在 C 那一侧 → 纸被**掀起来了**

这一个公式后面会反复用到。

### 6.3 把卡片切成两块：多边形裁剪

卡片是一个矩形（4 个点）。用折痕切它，得到两个多边形：

```js
const kept   = G.clipHalfPlane(rect, (X) =>  f.dist(X)); // 平躺的部分
const lifted = G.clipHalfPlane(rect, (X) => -f.dist(X)); // 掀起的部分
```

`clipHalfPlane` 用的是经典的 **Sutherland–Hodgman 裁剪算法**，思路很朴素：
沿着多边形的每条边走一遍，
- 起点在保留的一侧 → 留下这个点
- 这条边跨过了折痕 → 算出交点，也留下

### 6.4 把形状交给 CSS：`clip-path`

CSS 的 `clip-path: polygon(...)` 可以把一个元素裁成任意多边形，**只显示多边形内部**。

```js
topCard.style.clipPath = 'polygon(0px 0px, 338px 0px, 338px 90px, 250px 158px, 0px 158px)';
```

上面那张卡只显示 `kept` 的部分，被裁掉的地方就露出了下面那张卡。**「偷看」效果到这里就完成了一半。**

### 6.5 翻过来的那一角：镜像

被掀起的那部分纸去哪了？它**绕着折痕翻了过去**。在二维平面里看，这就是**沿折痕做镜像（轴对称）**。

我们把上面那张卡**克隆一份**，放进 `.peel-flap` 元素里。然后做两件事：
1. 用 `clip-path` 只保留 `lifted` 那部分
2. 用 CSS `transform: matrix(...)` 把它沿折痕镜像过去

镜像公式和对应的矩阵（`reflectionMatrix`）：

```
X' = X − 2·((X − M)·n)·n

CSS matrix(a, b, c, d, e, f)：
  a = 1 − 2·nx²     c = −2·nx·ny     e = 2·(M·n)·nx
  b = −2·nx·ny      d = 1 − 2·ny²    f = 2·(M·n)·ny
```

**验证一下**：把角 C 代进去，`(C − M)·n = −|CP|/2`，所以 `C' = C + |CP|·n = P`。
角尖正好落在手指上 ✔️

> 🎁 **一个意外的好处**：镜像会让内容**左右反过来**。翻页上的「100%」变成了反字，看起来就像**透过纸背看到了正面的字**，和你参考图里的效果一模一样，而且完全不需要额外处理。

**动手验证**：在 Chrome 按 `F12` 打开控制台，输入：

```js
const C = {x: 338, y: 158}, P = {x: 200, y: 60};
Geometry.reflectPoint(C, Geometry.fold(C, P));   // → {x: 200, y: 60}，正好等于 P
```

### ⚠️ 两个坑

- `transform-origin: 0 0`：CSS 默认以元素**中心**为原点做变换，而我们的矩阵是以**左上角**为原点算的，所以必须改成 `0 0`。
- `clip-path` 是在**变换之前**的坐标里生效的，所以翻页的裁剪用的是「还没翻过去时」的形状 `lifted`，这样刚好对上。

---

## 7. 第五步：光影 —— 让「折」看起来像「卷」

到上一步为止，看起来像是**纸被压出了一道硬折痕**。真实的纸在翻起时是**弯曲的（卷曲）**。
真的 3D 卷曲需要 WebGL，太复杂。我们用 **4 个光影小技巧**来骗过眼睛：

| 图层 | 做法 | 模拟什么 |
| --- | --- | --- |
| **纸背** `.peel-flap__paper` | 在克隆内容上盖一层 84% 不透明的白色 | 纸的背面 |
| **模糊** `.peel-flap__front` | 克隆内容 `filter: blur(1.2px)` | 透过纸看到的字是朦胧的 |
| **高光** `.peel-grad`（在翻页上） | 沿折痕方向的线性渐变：暗 → 亮 → 淡 | 纸卷起来的弧面，中间受光、两边暗 |
| **投影 1** `.peel-flap-wrap` | `filter: drop-shadow(...)` | 翻起的纸浮在上面投下影子 |
| **投影 2** `.peel-under` | 在下面那张卡上，从折痕开始的黑色渐变 | 翻起的纸在下面那张卡上投的阴影 |

### 渐变怎么「对齐」折痕？

`linear-gradient` 只能写方向，不能指定「从某条斜线开始」。所以我们换个思路：
做一个很大的长方形 `.peel-grad`，**把它移到 M 点、旋转到和折痕垂直的方向**，然后在它上面写一个普通的「从左到右」渐变：

```js
const shadeTransform = `translate(${M.x}px, ${M.y}px) rotate(${angle}deg) translate(0, -50%)`;
```

这样渐变的起点就正好贴着折痕，朝角尖的方向延伸。渐变的长度按 `|CP| / 2` 缩放，所以翻得越大，高光带越宽。

### 为什么投影要加在「外面一层」？

`filter: drop-shadow()` 会按照元素**实际画出来的形状**投影。
如果把它和 `clip-path` 写在同一个元素上，会先投影再裁剪，影子就被一起裁掉了。
所以 `.peel-flap-wrap`（投影）包着 `.peel-flap`（裁剪 + 镜像），**先裁剪，再对裁剪后的形状投影**。

---

## 8. 第六步：松手之后 —— 物理手感

这部分决定了原型「好不好玩」，是交互设计师最该花时间调的地方。

### 8.1 翻页还是弹回？

`onUp()` 里的判断：

```js
翻页 = 折痕越过了卡片中心（已经翻过一半）
    或 手指速度在拖动方向上 > 500 px/s（快速一甩）
但如果手指是往回甩的（速度 < −300），就不翻 —— 用户反悔了
```

**「甩」**很重要：用户不需要真的拖过一半，轻轻快速一划就能翻页，符合 iOS 用户的肌肉记忆。

速度是怎么来的？`onMove` 里一直记录**最近 100 毫秒**的手指位置，松手时用「位移 ÷ 时间」算出速度（`releaseVelocity()`）。

### 8.2 弹簧动画，而不是固定时长的动画

iOS 几乎所有动画都是**弹簧**。它和 CSS 的 `transition: 0.3s ease` 有两个本质区别：

1. **接得上手指的速度**：松手时角尖还在以某个速度运动，弹簧会从这个速度开始减速，然后回弹，**没有「断一下」的感觉**。
2. **可以被打断**：弹回途中你可以再次抓住它（见 `onDown` 里 `state === 'returning'` 的分支），它会从当前位置继续跟手。

弹簧的物理公式（`stepSpring`）：

```
加速度 = k × (目标位置 − 当前位置) − c × 当前速度
         └─── 弹簧的拉力 ───┘      └── 阻力 ──┘
```

`k` 和 `c` 不直观，所以我们用 iOS / SwiftUI 的方式来定义弹簧：

```js
spring(response, damping)
// response：大约多久完成一次来回（秒），越小越快
// damping ：1 = 刚好不回弹；小于 1 会晃一下
const SPRING_RETURN = spring(0.38, 0.82); // 弹回：带一点纸的弹性
const SPRING_FLIP   = spring(0.55, 1.0);  // 翻走：干脆
```

### 8.3 翻走的过程

1. 把目标设在拖动方向上很远的地方，让折痕**完全越过整张卡**（`flipAway`）
2. 当 `kept` 变成空（上面那张卡已经完全被掀走），立刻**交换顺序**（`swapCards`）
3. 翻页继续飞出去，同时渐渐变透明，最后清理掉

### 8.4 几个「可发现性」小设计

- **首次提示**：页面打开 0.9 秒后，右下角会自动掀一下再落回（`main.js` 里的 `peel.peek('br')`）。用户一看就知道「角可以拖」。
- **点一下角**：不拖、只点，也会掀一下给反馈。
- **电脑上的光标**：鼠标移到角上变成「抓手」。

---

## 9. 第七步：放到 iPhone 上玩

### 方式 A：GitHub Pages（推荐，一次设置，永久可用）

GitHub 可以免费把仓库变成一个网站。

1. 打开 https://github.com/BOXI687/Flip-Mac-Card-Component
2. 点 **Settings** → 左侧 **Pages**
3. **Build and deployment → Source** 选 **Deploy from a branch**
4. **Branch** 选 `claude/github-cleanup-ux-prototype-541sop`，文件夹选 `/ (root)`，点 **Save**
5. 等 1～2 分钟，页面顶部会出现网址，一般是：
   **https://boxi687.github.io/Flip-Mac-Card-Component/**

> 以后把代码合并到 `main` 分支的话，记得把这里的 Branch 也改成 `main`。
> 注意：仓库是公开的，这个网址任何人都能打开。

**在 iPhone 上：**

1. 用 **Safari** 打开上面的网址（必须是 Safari，其它浏览器不能「添加到主屏幕」为全屏 App）
2. 点底部的 **分享按钮**（方框加向上箭头）
3. 往下找 **「添加到主屏幕」** → 添加
4. 回到桌面，点那个图标：**全屏打开，没有地址栏**，就像一个真 App

这背后是 `index.html` 里的这几行和 `manifest.webmanifest` 在起作用：

```html
<meta name="apple-mobile-web-app-capable" content="yes">          <!-- 全屏打开 -->
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"> <!-- 状态栏透明 -->
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">   <!-- 桌面图标 -->
<meta name="viewport" content="... viewport-fit=cover ...">       <!-- 铺满刘海屏 -->
```

### 方式 B：本地局域网（改代码时实时看效果）

每次改完都推到 GitHub 再等 Pages 更新会比较慢。调细节时可以让 iPhone 直接访问你的电脑：

1. 电脑和 iPhone 连**同一个 Wi-Fi**
2. 在项目文件夹里开一个本地服务器，以下任选一个：
   ```bash
   py -m http.server 8000          # 装了 Python 的话
   npx serve -l 8000               # 装了 Node.js 的话
   ```
   Windows 防火墙弹窗时，勾选「专用网络」并允许。
3. 查电脑的局域网 IP：终端输入 `ipconfig`，找 **IPv4 地址**，比如 `192.168.1.23`
4. iPhone Safari 打开 `http://192.168.1.23:8000`

### 在 iPhone 上看报错

Windows 没法用 Safari 的远程调试（那个需要 Mac）。所以我们准备了一个办法：
**在网址后面加 `?eruda`**，比如 `https://boxi687.github.io/Flip-Mac-Card-Component/?eruda`，
页面右下角会出现一个齿轮按钮，点开就是手机版的控制台。

---

## 10. 动手改一改：参数速查表

调手感是最好的学习方式。改一个参数，刷新，感受区别：

| 想改什么 | 文件 | 找这一行 | 试试改成 |
| --- | --- | --- | --- |
| 角落热区大小 | `js/peel.js` | `cornerHit: 0.45` | `0.8`（更容易抓到） |
| 甩动多快算翻页 | `js/peel.js` | `flickVelocity: 500` | `300`（轻轻一划就翻） |
| 弹回的弹性 | `js/peel.js` | `spring(0.38, 0.82)` | `spring(0.5, 0.5)`（晃得很明显） |
| 翻走的速度 | `js/peel.js` | `spring(0.55, 1.0)` | `spring(0.3, 1.0)` |
| 纸背的颜色 | `css/style.css` | `.peel-flap__paper` 的 `background` | `rgba(30, 30, 32, 0.85)`（黑色纸背） |
| 纸背透字的程度 | `css/style.css` | 同上，改最后的透明度 | `0.6`（字更清楚） |
| 翻页投影 | `css/style.css` | `.peel-flap-wrap` 的 `drop-shadow` | 把 `0.38` 改成 `0.7` |
| 首次提示 | `js/main.js` | `peel.peek('br')` | `peel.peek('tl')`（改成左上角） |
| 小组件数据 | `js/main.js` | `DEVICES` / `CITIES` | 随便改 |

---

## 11. 下一步可以做什么

- **加第三张卡**：在 `index.html` 的 `.stack` 里再放一个 `<section class="card ...">`，右侧再加一个圆点。`peel.js` 已经支持任意张数。
- **做出真正的 3D 卷曲**：用 WebGL 把卡片当成网格，按「卷在一个圆柱上」来计算每个顶点的位置。这能做到参考图里那种真实的卷筒感，但需要学一些着色器（shader）知识。
- **声音反馈**：在 `swapCards()` 里播放一个很短的「翻纸」音效（Web Audio API）。
  （注：iOS Safari 不支持 `navigator.vibrate`，网页没法做震动反馈。）
- **做成原生 App**：如果以后有 Mac，可以用 SwiftUI 重写：`DragGesture` 对应我们的 Pointer Events，`.mask()` 对应 `clip-path`，`.spring()` 动画对应我们的弹簧。数学部分（`geometry.js`）可以原样翻译过去。

---

## 12. 常见问题

**Q：在 iPhone 上拖的时候整个页面在动？**
检查 `.stack` 上是否有 `touch-action: none`。另外用「添加到主屏幕」的方式打开，会比在 Safari 里直接打开稳定得多。

**Q：改了代码，iPhone 上没变化？**
GitHub Pages 更新有 1～2 分钟延迟，而且 Safari 有缓存。可以在网址后面加 `?v=2`（每次换个数字）强制刷新。已经添加到主屏幕的，可以删掉图标重新添加。

**Q：翻页上的字为什么是反的？**
这是故意的，见 6.5：翻过来的是纸的背面，所以透出来的字是反的。

**Q：为什么不用 React / Vue？**
这个原型的核心是「一个元素 + 每帧算几何」，框架帮不上什么忙，反而会增加学习成本和构建步骤。先把原理弄懂，以后换什么框架都能用上。
