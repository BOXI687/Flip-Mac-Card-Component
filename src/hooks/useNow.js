/*
 * useNow —— 「现在几点」，每秒更新一次
 *
 * hook（钩子）是 React 里以 use 开头的函数，组件调用它就能「订阅」某样会变的东西。
 * 这里订阅的是时间：每过一秒，用到 useNow() 的组件（时钟、日历、天气的逐小时预报）
 * 会自动重新画一遍 —— 就像参数化建模里改了一个尺寸，模型自动重建。
 *
 * 所有组件共用同一个计时器，并且对齐到整秒，秒针才和系统时间同步。
 */
import { useSyncExternalStore } from 'react';

let now = Date.now();
const listeners = new Set();
let timer = 0;

function tick() {
  now = Date.now();
  listeners.forEach((fn) => fn());
  timer = setTimeout(tick, 1000 - (Date.now() % 1000)); // 下一个整秒
}

function subscribe(fn) {
  listeners.add(fn);
  if (!timer) timer = setTimeout(tick, 1000 - (Date.now() % 1000));
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      clearTimeout(timer);
      timer = 0;
    }
  };
}

export function useNow() {
  const t = useSyncExternalStore(subscribe, () => now);
  return new Date(t);
}
