/*
 * <AppIcon> —— 程序坞里的一个 App 图标（只是样子，点了只会暗一下，什么也不做）
 *
 * 图标是 Boxi 从 Figma 社区文件（iOS App icons vector）里自己挑的现成矢量图标，
 * 第三方作品，原样使用（src/assets/dock/*.svg，120×120，每张自带 iOS 圆角底板）：
 *   · 不再加玻璃、描边、高光，也不再裁圆角（图本身就是圆角方块，再裁会削掉边）
 *   · 用 <img> 显示：每张 SVG 在自己的小世界里，里面的渐变 / 裁切 id 不会和别的图标撞名
 *   · import 进来的路径由 Vite 处理（打包时改成带哈希的文件名，或直接内联），不用自己写路径
 * 按下时变暗：.app:active（style.css），和 iOS 一样。
 */
import phone from '../assets/dock/phone.svg';
import messages from '../assets/dock/messages.svg';
import camera from '../assets/dock/camera.svg';
import gmail from '../assets/dock/gmail.svg';

// data.js 的 DOCK_APPS 里 app 写什么名字，这里就按名字找图
const ICONS = { phone, messages, camera, gmail };

/** app：用哪张图（上面 ICONS 里的名字）；name：App 名（不显示，只给读屏软件念） */
export default function AppIcon({ app, name }) {
  return (
    <div className="app" role="img" aria-label={name}>
      {/* alt 留空：名字已经写在外层的 aria-label 上；draggable=false 防止长按时被拖出图片 */}
      <img className="app__icon" src={ICONS[app]} alt="" draggable={false} />
    </div>
  );
}
