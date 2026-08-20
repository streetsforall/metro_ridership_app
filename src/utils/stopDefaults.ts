/**
 * The empty selection, as one reference. A default of `[]` at each call site is a new
 * array every render, so a panel with nothing selected would look changed to every memo
 * downstream. Both components that default this prop share the constant.
 */
export const NO_SELECTED_STOPS: readonly string[] = [];
