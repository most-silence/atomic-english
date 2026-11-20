export type Tab = 'challenge' | 'streak' | 'review';

const ITEMS: { key: Tab; emoji: string; label: string }[] = [
  { key: 'challenge', emoji: '🚀', label: '每日挑战' },
  { key: 'streak', emoji: '🔥', label: '连续天数' },
  { key: 'review', emoji: '📝', label: '复习' },
];

export default function BottomNav({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <nav className="bottom-nav">
      {ITEMS.map((item) => (
        <button
          type="button"
          key={item.key}
          className={`tab ${active === item.key ? 'active' : ''}`}
          onClick={() => onChange(item.key)}
        >
          <span className="emoji" aria-hidden>{item.emoji}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
