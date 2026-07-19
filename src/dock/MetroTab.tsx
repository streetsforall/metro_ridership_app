import { useEffect, useState, type FunctionComponent } from 'react';
import { DockviewDefaultTab, type IDockviewPanelHeaderProps } from 'dockview-react';
import { useDockLayout } from './DockLayoutContext';

/**
 * Tab renderer for every dock panel (registered once as `defaultTabComponent`).
 *
 * The dashboard's design has no panel chrome: no title, no close button. But
 * dockview attaches its drag source to the tab element, so the strip cannot
 * simply be removed or panels could never be rearranged. Instead a lone panel
 * renders a blank grip that the CSS collapses to a sliver and reveals on hover.
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

  if (isEditMode || panelsInGroup > 1) {
    return <DockviewDefaultTab {...props} hideClose />;
  }

  /* Blank on purpose — dockview makes the tab itself the drag handle, and the
     grip bar is painted by dockTheme.css via ::before. */
  return <span data-metro-grip aria-hidden="true" />;
};

export default MetroTab;
