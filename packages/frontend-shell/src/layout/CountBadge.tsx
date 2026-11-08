import React from 'react';

// The figure of a menu entry (unread alerts, open items): any entry may have one, and every placement of the third level shows it
// the same way. 0 is shown too: an entry that says "0" is an answer; an entry without a figure has none to give.
export function CountBadge({ count, current = false }: { count: number | undefined; current?: boolean }): React.ReactElement | null {
  if (count === undefined) {
    return null;
  }
  return (
    <span className={`ml-1.5 rounded-full px-1.5 text-xs ${current ? 'bg-primary-light text-primary' : 'bg-muted-bg text-muted'}`}>
      {/* Read aloud as "Alerts, 3", not "Alerts3". */}
      <span className="sr-only">, </span>
      {count}
    </span>
  );
}
