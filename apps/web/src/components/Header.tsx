export default function Header() {
  return (
    <header className="header">
      <div className="brand-logo" aria-label="logo">∞∞</div>
      <h1 className="brand-title">Atomic Learning</h1>
      <button className="lang-picker" type="button">
        <span className="lang-flag">🇺🇸</span>
        <span>English</span>
        <span className="caret">⌄</span>
      </button>
    </header>
  );
}
