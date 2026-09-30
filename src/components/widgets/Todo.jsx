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
  // 偷看时要动的元素带 data-peek（说明见文件最后的 Todo.peek）：每条待办的字（t1 t2 t3）、「还有 1 项」、标题行。
  // 标的是字（span），不是整行 li：行里的空心圆、行之间的细线留在原地，圆只负责变淡（"rest"）
  return (
    <div className="todo">
      <div className="todo__head" data-peek="head">
        <ListGlyph />
        <span>待办</span>
      </div>
      <ul className="todo__list">
        {shown.map((t, i) => (
          <li key={t} className={i === 0 ? 'todo__item todo__item--first' : 'todo__item'}>
            <i className="todo__box" data-peek="rest" />
            <span className="todo__text" data-peek={`t${i + 1}`}>{t}</span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="todo__more" data-peek="more">还有 {more} 项</p>}
    </div>
  );
}

/*
 * 掀开就聚拢（见 engine/reveal.js、CLAUDE.md）：日历在上面时偷看待办，最想知道的是「会前还要做完什么」。
 *   口子小 → 只有最紧急的第一条「会前改完首页稿」
 *         → 再加第二条（小一点：0.85）
 *         → 前三条（后两条 0.8）
 *   小号的口子很小（最多掀 65%），三条字已经是极限：「还有 1 项」和标题行「待办」放不下，和空心圆一起只负责变淡
 */
Todo.peek = {
  small: {
    hero: 't1',
    layouts: [
      't1',
      { col: ['t1', { key: 't2', scale: 0.85 }], gap: 0.3 },
      { col: ['t1', { key: 't2', scale: 0.8 }, { key: 't3', scale: 0.8 }], gap: 0.3 },
    ],
  },
};
