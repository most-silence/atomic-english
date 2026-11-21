/**
 * 品牌头部。
 *
 * 原先有一个 🇺🇸 English 语言选择器，但产品只有英文听写一种模式，
 * 点了没有任何效果——是纯摆设。与其留个假控件，不如移除。
 */
export default function Header() {
  return (
    <header className="header">
      <div className="brand-logo" aria-label="logo">∞∞</div>
      <h1 className="brand-title">Atomic English</h1>
    </header>
  );
}
