/**
 * The empty Stop Selection, as one reference.
 *
 * A default of `[]` written at each call site is a new array every render, so a panel
 * nobody has selected a stop in would look changed to every memo downstream. The two
 * components that default this prop share the constant so the identity argument actually
 * holds across the hop between them.
 */
export const NO_SELECTED_STOPS: readonly string[] = [];
