/*
 * 备忘录（Notes，只有中号）
 *   上面一条黄色的头：文件夹图标 + 「备忘录」
 *   一排小圆点隔开（像撕下来的便签纸的边）
 *   下面三条备忘录的标题，中间用极细的线隔开（最上面一条是最新的）
 */

function FolderIcon() {
  return (
    <svg className="notes__folder" viewBox="0 0 18 13" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M1.2 3.1V10.4A1.9 1.9 0 0 0 3.1 12.3H14.9A1.9 1.9 0 0 0 16.8 10.4V4.6A1.9 1.9 0 0 0 14.9 2.7H8.4L6.9 1.2A1.4 1.4 0 0 0 5.9 0.8H3.1A1.9 1.9 0 0 0 1.2 2.7Z" />
      <path d="M1.2 4.9H16.8" />
    </svg>
  );
}

export default function Notes({ notes }) {
  // 偷看时要动的元素带 data-peek（说明见文件最后的 Notes.peek）：三条标题 n0 / n1 / n2，
  // 偷看时才出现的黄色小标签 head；黄色的头和细线只负责变淡（"rest"）
  return (
    <div className="notes">
      <div className="notes__head" data-peek="rest">
        <FolderIcon />
        <span>备忘录</span>
      </div>
      <ul className="notes__list">
        {notes.slice(0, 3).map((n, i) => (
          <li key={n}>
            {i > 0 && <i className="notes__rule" data-peek="rest" />}
            <span data-peek={`n${i}`}>{n}</span>
          </li>
        ))}
      </ul>
      {/* 只在偷看时出现：黄色的小标签（文件夹 + 备忘录），从黄色的头那里「浮」出来 */}
      <div className="notes__chip" data-peek="head" data-peek-only aria-hidden="true">
        <FolderIcon />
        <span>备忘录</span>
      </div>
    </div>
  );
}

/*
 * 掀开就聚拢（见 engine/reveal.js、CLAUDE.md）：偷看备忘录，最想知道的是「最新那条写的是什么」。
 *   口子小 → 只有最新一条的标题 → 三条标题一条接一条滑进来（出发间隔）→ 最上面再加一个黄色的「备忘录」小标签
 */
Notes.peek = {
  medium: {
    layouts: [
      'n0',
      { col: ['n0', 'n1', 'n2'] },
      { col: ['head', 'n0', 'n1', 'n2'] },
    ],
  },
};
