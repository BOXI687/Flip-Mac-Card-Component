/*
 * Vite 的设置（Vite = 开发时的本地服务器 + 上线前的打包工具）
 *
 * base: './'：打包出来的文件互相用「相对路径」引用。网站挂在
 * https://boxi687.github.io/Flip-Mac-Card-Component/ 这种子路径下面也能找到文件。
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
});
