/*
 * 备忘录（Notes，只有中号）
 *   上面一条黄色的头：文件夹图标 + 「备忘录」
 *   一排小圆点隔开（像撕下来的便签纸的边）
 *   下面三条备忘录的标题，中间用极细的线隔开
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
  return (
    <div className="notes">
      <div className="notes__head">
        <FolderIcon />
        <span>备忘录</span>
      </div>
      <ul className="notes__list">
        {notes.slice(0, 3).map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
