/*
 * main.jsx —— 入口：把 <App> 画进 index.html 里的 <div id="root">
 *
 * 文件名是 .jsx：JavaScript 里可以直接写 <App /> 这种「像 HTML 的标签」（JSX），
 * Vite 在打包时把它翻译成浏览器认识的普通 JavaScript。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import * as Geometry from './engine/geometry.js';
import { PeelStack } from './engine/peel.js';
import { Tuner } from './engine/tuner.js';
import './styles/style.css';
import './styles/widgets.css';

// 挂到 window 上：方便在浏览器控制台里玩，测试脚本也靠它们检查内部状态
Object.assign(window, { Geometry, PeelStack, Tuner });

// StrictMode：开发时 React 会故意多「装一次、拆一次」组件，帮忙检查有没有收拾干净（上线的版本不会）
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// 在 iPhone 上看 console：网址后面加 ?eruda 会加载一个手机端调试面板
if (/[?&]eruda\b/.test(location.search)) {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/eruda@3';
  s.onload = () => window.eruda.init();
  document.head.appendChild(s);
}
