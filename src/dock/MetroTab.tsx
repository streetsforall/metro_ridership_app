import { useEffect, useState, type FunctionComponent } from 'react';
import { DockviewDefaultTab, type IDockviewPanelHeaderProps } from 'dockview-react';
import { useDockLayout } from './DockLayoutContext';

/**
 * Tab renderer for every dock panel (registered once as `defaultTabComponent`).
 *
 * The dashboard's design has no panel chrome: no title, no close button, and no
 * drag affordance. A lone panel renders a blank tab that the CSS collapses to
 * zero height, so the panel's padding is its only inset. The element still has
 * to be rendered — see the `data-metro-panel` note below — but it takes up no
 * space and shows nothing.
 *
 * Dockview attaches its drag source to the tab element, so collapsing it also
 * means a lone panel cannot be dragged. That is deliberate: Panels ▸ Edit
 * layout is the one discoverable way to rearrange panels, and a second, nearly
 * invisible path was not worth the asymmetric padding it cost every panel.
 *
 * Titles come back in the two cases where they carry information:
 *  - the group holds more than one panel, where blank tabs would be
 *    indistinguishable from each other;
 *  - edit mode, where the user is deliberately rearranging things.
 *
 * The close button never comes back: the header's Panels dropdown already owns
 * panel visibility, and one way to close a panel beats two.
 */
const MetroTab: FunctionComponent<IDockviewPanelHeaderProps> = (props) => {
  const { api, containerApi } = props;
  const { isEditMode } = useDockLayout();

  /*
   * A panel *joining* this panel's group fires no event on this panel's own
   * api, so the count has to be re-read from the container's layout changes.
   */
  const [panelsInGroup, setPanelsInGroup] = useState(
    () => api.group.panels.length,
  );

  useEffect(() => {
    const listener = containerApi.onDidLayoutChange(() => {
      setPanelsInGroup(api.group.panels.length);
    });
    return () => listener.dispose();
  }, [api, containerApi]);

  /*
   * `data-metro-panel` is how dockTheme.css reaches a *group* for per-panel
   * styling. Panel CONTENT is not usable as the hook: with
   * `defaultRenderer="always"` dockview renders it into `.dv-render-overlay`,
   * which is anchored to the shell element and only positioned over the group —
   * so `.dv-groupview:has(<content>)` never matches. The tab is one of the few
   * things that really does live inside the group.
   */
  if (isEditMode || panelsInGroup > 1) {
    /* `contents` keeps the wrapper out of layout so the tab styles unchanged. */
    return (
      <span className="contents" data-metro-panel={api.id}>
        <DockviewDefaultTab {...props} hideClose />
      </span>
    );
  }

  /* Blank on purpose — kept in the DOM only as the `data-metro-panel` hook;
     dockTheme.css collapses the strip around it to zero height. */
  return (
    <span data-metro-blank-tab data-metro-panel={api.id} aria-hidden="true" />
  );
};

export default MetroTab;
