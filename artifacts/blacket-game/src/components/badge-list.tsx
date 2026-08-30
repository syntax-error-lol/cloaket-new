/**
 * Player badge icons, used next to usernames everywhere (chat, profiles,
 * leaderboard, stats).
 *
 * Rules (per design request):
 * - Up to 6 badges: one row at the normal size.
 * - More than 6: they wrap onto a second row, left-aligned, and every icon
 *   shrinks so the two rows together take the same height as one normal row
 *   would (2 * smallSize + gap ≈ the surrounding line height) — extra badges
 *   never make the name line taller.
 */
export function BadgeList({
  badges,
  size,
  smallSize,
  gap = 4,
  className = "",
}: {
  badges?: { name: string; image: string; description: string }[] | null;
  /** Icon size in px when there are 6 or fewer badges. */
  size: number;
  /** Icon size in px when there are more than 6 (two rows). */
  smallSize: number;
  /** Gap in px between icons and between the two rows. */
  gap?: number;
  className?: string;
}) {
  if (!badges || badges.length === 0) return null;
  const many = badges.length > 6;
  const px = many ? smallSize : size;
  // Cap the width at exactly 6 icons per row so the 7th starts row two.
  const maxWidth = px * 6 + gap * 5;
  return (
    <span
      className={`inline-flex flex-wrap items-center justify-start ${className}`}
      style={{ gap, maxWidth }}
    >
      {badges.map((b) => (
        <img
          key={b.name}
          src={b.image}
          alt={b.name}
          title={`${b.name} — ${b.description}`}
          className="object-contain"
          style={{ width: px, height: px }}
        />
      ))}
    </span>
  );
}
