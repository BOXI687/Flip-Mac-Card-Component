# Peel Widget Stack · 翻角切换小组件原型

一个 iOS 桌面小组件的交互原型：两张叠在一起的小组件（电池 / 世界时钟），
**按住任意一个角拖动**，就能像掀纸一样偷看下面那张；**拖过一半或快速一甩**，就翻到下一张。

<p align="center">
  <img src="docs/images/peek.png" width="260" alt="偷看一角">
  <img src="docs/images/flip.png" width="260" alt="翻到一半">
  <img src="docs/images/debug.png" width="260" alt="几何辅助线">
</p>

- 纯 HTML / CSS / JavaScript，**没有任何依赖、不需要构建**
- 在 iPhone Safari 里打开 → 「添加到主屏幕」，就能全屏把玩
- 页面底部有「显示几何辅助线」按钮，可以看到翻角背后的数学

## 快速开始

| 想做什么 | 怎么做 |
| --- | --- |
| 在电脑上看 | 直接双击 `index.html`，用 Chrome 打开 |
| 模拟手机 | Chrome 里按 `F12` → `Ctrl + Shift + M`，选一个 iPhone 机型 |
| 在 iPhone 上玩 | 开启 GitHub Pages（见教程第 8 步），用 Safari 打开网址 → 分享 → 添加到主屏幕 |

## 👉 一步一步的教程

**[docs/TUTORIAL.md](docs/TUTORIAL.md)**：从零讲清楚每一步在做什么、为什么这么做。

## 文件结构

```
index.html            页面骨架 + 「添加到主屏幕」相关设置
css/style.css         所有样式（小组件外观 + 翻角图层）
js/geometry.js        翻角的全部数学（纯函数，不碰 DOM）
js/widgets.js         两个小组件的渲染（电池圆环、世界时钟）
js/peel.js            翻角交互引擎（手势、裁剪、镜像、光影、弹簧动画）
js/main.js            把上面这些组装起来
manifest.webmanifest  PWA 清单（主屏幕图标、全屏打开）
icons/                主屏幕图标
docs/                 教程和配图
```
