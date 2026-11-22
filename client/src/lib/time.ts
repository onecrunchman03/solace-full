// Message timestamps (Josh, Aug 2026: "make sure that date and time stamps
// are on messages"). Today's messages show just the clock — the day
// separators already carry the date — but anything older wears its date
// inline, with the year joining once it differs. Every stamp also carries
// the full date+time as a hover title.

export function messageStamp(at: number): { text: string; full: string } {
  const d = new Date(at);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const full = d.toLocaleString([], {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  if (d.toDateString() === now.toDateString()) return { text: time, full };
  const date = d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  });
  return { text: `${date}, ${time}`, full };
}
