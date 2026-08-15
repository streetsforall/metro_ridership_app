/**
 * The size half of Panel Settings: three named steps per panel, plus the share
 * of the summary|map row the summary takes.
 *
 * Named steps rather than a free number, and a codec rather than the raw string,
 * because ADR-0008 turns on both properties at once: an enumerated value is what
 * makes a size expressible as a fixed Tailwind class — the e2e `ResizeObserver`
 * stub means anything measured in JavaScript is inert under Playwright — and it
 * is also what makes it nameable in a query string, which is how it gets shared.
 *
 * `standard` is what the app rendered before these controls existed, so it is
 * the default, it writes no param, and its classes are the ones already in the
 * committed baselines. Only the two other steps are new pixels.
 *
 * Each panel spells out what its own steps *mean* — see the class lookups in
 * `RidershipChart`, `ContextLogPanel` and `OutputArea`. This module only knows
 * the vocabulary and the URL contract.
 */
export type PanelSize = 'small' | 'standard' | 'large';

/**
 * The summary's percentage share of the row it shares with the map, from `lg`
 * up. The number is the whole meaning, so it is the type as well as the param
 * value; there is no second vocabulary to keep in step with it.
 */
export type SummarySplit = 50 | 40 | 30;

export const defaultPanelSize: PanelSize = 'standard';
export const defaultSummarySplit: SummarySplit = 40;

const paramToPanelSize: Record<string, PanelSize> = {
  s: 'small',
  l: 'large',
};

/**
 * `standard` has no param — it is the default, and the sync effect writes
 * nothing for a default. `null` is that absence, not an unrecognised value.
 */
const panelSizeToParamValue: Record<PanelSize, string | null> = {
  small: 's',
  standard: null,
  large: 'l',
};

/** Anything unrecognised falls back to the default rather than throwing, like every other param. */
export function parsePanelSize(value: string | null): PanelSize {
  if (value === null) return defaultPanelSize;
  return paramToPanelSize[value] ?? defaultPanelSize;
}

/** The param value for a size, or `null` when it is the default and none is written. */
export function panelSizeToParam(size: PanelSize): string | null {
  return panelSizeToParamValue[size];
}

const summarySplits: SummarySplit[] = [50, 40, 30];

export function parseSummarySplit(value: string | null): SummarySplit {
  if (value === null) return defaultSummarySplit;
  const parsed = Number(value) as SummarySplit;
  return summarySplits.includes(parsed) ? parsed : defaultSummarySplit;
}

export function summarySplitToParam(split: SummarySplit): string | null {
  return split === defaultSummarySplit ? null : String(split);
}
