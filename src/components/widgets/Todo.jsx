/*
 * 待办小组件（Todo，只有小号）
 *   上面：黄色的清单小图标 + 「待办」
 *   中间：3 条待办，每条前面一个空心的圆（还没做），第一条最紧急，字更粗、圆是黄色的
 *   最下面：放不下的条数，写「还有 1 项」（灰色小字）
 *
 * 待办内容来自 story.js 的 TODOS（把备忘录里的清单合并进来了）。第一条「会前改完首页稿」
 * 是最紧急的，因为设计站会就在下一个整点 / 半点。
 */
import { useStory } from '../../story.js';

const VISIBLE = 3; // 小号放得下 3 条

/** 清单小图标：三行「点 + 线」，用文字颜色（黄色）画 */
function ListGlyph() {
  return (
    <svg className="todo__glyph" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <circle cx="2.4" cy="3.4" r="1.6" />
      <circle cx="2.4" cy="8" r="1.6" />
      <circle cx="2.4" cy="12.6" r="1.6" />
      <rect x="6" y="2.4" width="9.6" height="2" rx="1" />
      <rect x="6" y="7" width="9.6" height="2" rx="1" />
      <rect x="6" y="11.6" width="9.6" height="2" rx="1" />
    </svg>
  );
}

export default function Todo() {
  const { todos } = useStory();
  const shown = todos.slice(0, VISIBLE);
  const more = todos.length - shown.length;
  return (
    <div className="todo">
      <div className="todo__head">
        <ListGlyph />
        <span>待办</span>
      </div>
      <ul className="todo__list">
        {shown.map((t, i) => (
          <li key={t} className={i === 0 ? 'todo__item todo__item--first' : 'todo__item'}>
            <i className="todo__box" />
            <span className="todo__text">{t}</span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="todo__more">还有 {more} 项</p>}
    </div>
  );
}
