export function EmojiFallback({ emoji, label, size = 84 }: { emoji: string | null; label: string; size?: number }) {
  if (!emoji) return null;
  return (
    <span role="img" aria-label={label} className="select-none leading-none" style={{ fontSize: size }}>
      {emoji}
    </span>
  );
}
