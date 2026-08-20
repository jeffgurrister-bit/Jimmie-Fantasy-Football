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
  variant,
}: {
  /** Pass null for a table that needs no header row, such as a list of scores. */
  head?: ReactNode;
  children: ReactNode;
  hint?: string | false;
  /** Extra class on the card, for tables that need a shared width. */
  variant?: string;
}): React.ReactElement {
  return (
    <div className={variant ? `card table-card ${variant}` : 'card table-card'}>
      {hint === false ? null : <p className="scroll-hint">{hint}</p>}
      <div className="scroller">
        <table>
          {head ? <thead>{head}</thead> : null}
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}
