# Peel Widget Stack · 翻角切换小组件原型

一个 iOS 主屏幕「智能叠放」（Smart Stack）的交互原型：上面一个中号叠放、下面两个小号叠放，每一叠里有好几张小组件。

- **上下滑**卡片中间：换一张（往上 = 下一张，往下 = 上一张），首尾相连、可以一直滑。右边的小圆点和下面的名字跟着变
- **按住任意一个角拖动**：像掀纸一样偷看「下一张」；**松手自动盖回**，不会换卡
- **掀开就聚拢**：掀开一角时，下面那张卡最重要的信息（天气的温度、电量最低的设备、第一个城市的时间）
  会跟着手指挪进露出来的口子里，手指停它就停，盖回去它就倒着走回原位。两种动法在「调参」里切换：
  **A 换座位**（口子越大坐进来的信息越多，一个接一个入座）/ **B 磁铁**（越重要吸得越近，会轻轻晃）；
  另外可以打开「数字滚动」（数字像里程表一样滚到真实数值）。目前天气、电池、世界时钟支持
- 中号叠放（6 张）：电池、世界时钟、天气、播客·待播清单、健身·活动、备忘录
- 小号叠放（各 4 张）：电池 / 天气 / 日历 / 时钟，两叠的顺序不一样

小组件的尺寸、圆角、材质照着 Apple 的 iOS 27 设计稿；天气、日历、播客、健身、备忘录的排版量自真机截图。
里面的内容（城市、节目、备忘录标题……）都是编的，日期、时间、农历是真的。

> 这一版改用了 **React + Vite**（以前是不用安装任何东西的纯 HTML）。上下滑切换、新的小组件和「掀开就聚拢」**还没在真 iPhone 上测过**。

<p align="center">
  <img src="docs/images/peek.png" width="260" alt="偷看一角">
  <img src="docs/images/flip.png" width="260" alt="掀得更大">
  <img src="docs/images/debug.png" width="260" alt="几何辅助线">
</p>
<p align="center"><sub>（这三张截图是改版之前的，只有两种小组件）</sub></p>

在线版：[主线](https://boxi687.github.io/Flip-Mac-Card-Component/) ·
[版本 A（旧）](https://boxi687.github.io/Flip-Mac-Card-Component/a/) ·
[版本 B（旧）](https://boxi687.github.io/Flip-Mac-Card-Component/b/)

## 怎么调效果（不用写代码）

1. 打开页面，点底部的 **「调参」**。手机上面板从下面滑上来，停在小组件下方；
   **电脑上（窗口够宽时）**是右边的侧边栏，一打开页面就开着，卡片自动挪到左边，不会被挡住
2. **一边拖卡片，一边拖面板里的滑块**，改动马上生效，三叠一起变。滑块上的小竖线是默认值，改过的数字会变成蓝色
3. 满意了，点 **「复制参数」**，把复制出来的那一小段文字**直接发给 Claude**，说「把这些设成默认值」

> 调过的值会记在这台设备上，下次打开还在；点「恢复默认」可以回到原样。

## 快速开始

第一次要先装 [Node.js](https://nodejs.org/)（选 LTS 版本），然后在项目文件夹里打开终端：

| 想做什么 | 命令 | 说明 |
| --- | --- | --- |
| 装依赖（只要一次） | `npm install` | 按 `package-lock.json` 下载 React、Vite，放进 `node_modules/` |
| 在电脑上边改边看 | `npm run dev` | 终端会给一个网址（通常是 http://localhost:5173），改了代码浏览器自动刷新 |
| 打包成网站 | `npm run build` | 结果在 `dist/` 里，上线用的就是它 |
| 看打包后的样子 | `npm run preview` | 在本地打开 `dist/` |

> 不能再双击 `index.html` 打开了：React 的代码要经过 Vite 翻译，浏览器才认识。

## 在 iPhone 上看

- **看在线版**：用 Safari 打开 https://boxi687.github.io/Flip-Mac-Card-Component/ → 分享 → 「添加到主屏幕」，就能全屏把玩。
  每次推送到主线分支，GitHub 会自动打包、发布（见 `.github/workflows/pages.yml`），一两分钟后生效
- **看电脑上正在改的版本**（手机和电脑连同一个 Wi-Fi）：运行 `npm run dev -- --host`，
  终端里 `Network:` 那一行的网址，用 iPhone 的 Safari 打开
- 如果看到的还是旧版本：多半是浏览器缓存，先用无痕标签页打开试试

## 文件结构

```
index.html                   页面骨架 + 「添加到主屏幕」相关设置（React 画在 <div id="root"> 里）
src/main.jsx                 入口：把 <App> 画到页面上
src/App.jsx                  整个主屏幕：一个中号叠放 + 两个小号叠放，调参面板、壁纸对齐
src/data.js                  小组件的内容，和每一叠里放哪几张（改内容、换顺序改这里）
src/components/PeelStack.jsx 一叠小组件：画卡片、小圆点、名字，把下面两个引擎装上去
src/components/widgets/      每个小组件一个文件：Battery、WorldClock、Weather、Calendar、Podcasts、Fitness、Notes
src/hooks/useNow.js          「现在几点」，每秒更新（时钟、日历、天气用）
src/engine/geometry.js       翻角的全部数学（纯函数，不碰页面）
src/engine/peel.js           翻角引擎（手势、裁剪、镜像、光影、弹簧；可调参数的默认值在顶部）
src/engine/swipe.js          上下滑切换引擎（跟手、弹簧、橡皮筋、循环）
src/engine/reveal.js         掀开就聚拢：掀角时让下面那张卡的信息挪进口子里（A 换座位 / B 磁铁 / 数字滚动）
src/engine/tuner.js          「调参」面板
src/styles/style.css         页面、卡片、翻角图层、调参面板的样式
src/styles/widgets.css       每个小组件的样式（数值出处写在注释里）
public/                      原样复制的文件：主屏幕图标、PWA 清单
tests/                       自动测试（Playwright）
docs/TUTORIAL.md             新手教程（讲的是改用 React 之前的版本）
```

## 自动测试

```bash
npm run build
(cd dist && python3 -m http.server 8780) &
PORT=8780 node tests/verify-phone.js      # 手机尺寸、触摸：翻角、上下滑、调参面板
PORT=8780 node tests/verify-desktop.js    # 电脑尺寸、侧边栏、窄窗口
PORT=8780 node tests/verify-gestures.js   # 松手的各种情况：慢拖、快甩、停住再松、半路抓住
PORT=8780 node tests/verify-reveal.js     # 掀开就聚拢：三种小组件 × A / B × 四个角
```

需要全局装好的 Playwright（Chromium）。截图默认存到系统临时文件夹下的 `peel-shots/`。
