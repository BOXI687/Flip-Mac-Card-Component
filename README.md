# Peel Widget Stack · 翻角切换小组件原型

一个 iOS 桌面小组件的交互原型：两张叠在一起的小组件（电池 / 世界时钟），
**按住任意一个角拖动**，就能像掀纸一样偷看下面那张；**松手后纸角自动盖回**，上面那张不会换。

<p align="center">
  <img src="docs/images/peek.png" width="260" alt="偷看一角">
  <img src="docs/images/flip.png" width="260" alt="掀得更大">
  <img src="docs/images/debug.png" width="260" alt="几何辅助线">
</p>

- 纯 HTML / CSS / JavaScript，**没有任何依赖、不需要构建**
- 在 iPhone Safari 里打开 → 「添加到主屏幕」，就能全屏把玩
- 页面底部有「调参」按钮：不用写代码就能调手感和外观，还能打开几何辅助线看翻角背后的数学

## 怎么调效果（不用写代码）

1. 在手机上打开页面（网址见下面「快速开始」）
2. 点页面底部的 **「调参」**，面板从下面滑上来，卡片还露在上面
3. **一边拖卡片的角，一边拖面板里的滑块**，改动马上生效。每个滑块下面有一句话说明它管什么；滑块上的小竖线是默认值的位置，改过的数字会变成蓝色
4. 满意了，点 **「复制参数」**，把复制出来的那一小段文字**直接粘贴发给 Claude**，说「把这些设成默认值」就行

> 调过的值会记在这台手机上，下次打开还在；点「恢复默认」可以回到原样。

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
js/peel.js            翻角交互引擎（手势、裁剪、镜像、光影、弹簧动画；可调参数的默认值在顶部）
js/tuner.js           页面上的「调参」面板
js/main.js            把上面这些组装起来
manifest.webmanifest  PWA 清单（主屏幕图标、全屏打开）
icons/                主屏幕图标
docs/                 教程和配图
```
