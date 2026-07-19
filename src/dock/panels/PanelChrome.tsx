import type { ReactNode } from 'react';

/**
 * Content chrome for a dock panel: the dockview theme paints the `.pane`
 * background/radius on the group, so the wrapper only supplies the `.pane`
 * content padding (p-8) and overflow behavior.
 */
export default function PanelChrome({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <div className={`h-full p-8 ${scroll ? 'overflow-auto' : 'overflow-hidden'}`}>
      {children}
    </div>
  );
}
