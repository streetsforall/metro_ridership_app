import type { ReactNode } from 'react';

/**
 * Content chrome for a dock panel: the dockview theme paints the card itself
 * (fill, border, radius) on the group — see src/dock/dockTheme.css — so the
 * wrapper only supplies the `.pane` content padding (p-8) and overflow
 * behavior.
 *
 * `data-dock-body` marks content as living inside the dock, where the panel
 * supplies a definite height. Panel components are shared with the stacked
 * mobile fallback, whose containers are auto-height, so the few rules that
 * differ between the two key off this attribute rather than duplicating the
 * `lg` breakpoint that useIsDesktop() already owns.
 */
export default function PanelChrome({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <div
      data-dock-body
      className={`h-full p-8 ${scroll ? 'overflow-auto' : 'overflow-hidden'}`}
    >
      {children}
    </div>
  );
}
