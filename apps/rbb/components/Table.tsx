import type { ReactNode } from 'react';

/**
 * A wide stat table on a phone.
 *
 * The table scrolls horizontally inside its own container while the first column
 * stays pinned, so a manager's name is always visible next to whichever numbers
 * you have scrolled to. The page body never scrolls sideways.
 */
export function ScrollTable({
  head,
  children,
  hint = 'Swipe the table sideways for more columns',
}: {
  head: ReactNode;
  children: ReactNode;
  hint?: string | false;
}): React.ReactElement {
  return (
    <div className="card table-card">
      {hint === false ? null : <p className="scroll-hint">{hint}</p>}
      <div className="scroller">
        <table>
          <thead>{head}</thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}
