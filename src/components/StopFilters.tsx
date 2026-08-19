import magnifyingGlassIcon from '../assets/magnifying-glass.svg';

/**
 * The stop table's chrome — search, then the two selection actions.
 *
 * A sibling of `LineFilters` on purpose: the dashboard's two ranked tables offer the same
 * three controls and must offer them the same way — search in a row of its own closed by
 * a rule, then `Select All` and `Clear All` beneath. It renders above the table because
 * it acts on the table.
 *
 * Presentational and stateless. The search text and the Stop Selection are URL-synced
 * state, and `useUserDashboardInput` is the one place that reads and writes the URL.
 */

export interface StopFiltersProps {
  searchText: string;
  onSearchTextChange: (text: string) => void;
  /**
   * Every stop the table is listing, deduplicated — what `Select All` adds.
   *
   * Passed in rather than derived here: deriving "which rows are listed" twice is how the
   * button and the table start disagreeing about what "all" means.
   */
  listedStopKeys: string[];
  onSelectAllStops: (stopKeys: string[]) => void;
  onClearStops: () => void;
}

/**
 * `bg-transparent border-none p-0` is load-bearing: without it the global `button` rule in
 * `index.css` paints each button a filled navy pill. Same teal, weight and size as the
 * line filter's pair. One constant rather than the string twice, because these two have
 * drifted apart once already.
 */
const ACTION_CLASS =
  'bg-transparent border-none p-0 font-bold text-xs text-[#0fada8]';

export default function StopFilters({
  searchText,
  onSearchTextChange,
  listedStopKeys,
  onSelectAllStops,
  onClearStops,
}: StopFiltersProps) {
  return (
    <>
      <div className="mt-3 flex gap-2 border-b border-stone-300 pb-4">
        {/* The magnifier is a background image on the input, the same trio `#search-lines`
            uses — position, no-repeat, and left padding to clear it. `aria-label` is the
            one deliberate difference: `#search-lines` has only its placeholder to name it,
            and a placeholder disappears the moment someone types. */}
        <input
          id="search-stops"
          aria-label="Search stops"
          placeholder="Search stops"
          className="bg-[0.5rem_center] bg-no-repeat pl-8 w-full"
          style={{ backgroundImage: `url("${magnifyingGlassIcon}")` }}
          value={searchText}
          onChange={(event): void => {
            onSearchTextChange(event.target.value);
          }}
        />
      </div>

      {/* `Select All` is scoped to the listed rows and adds; `Clear All` is global and
          leaves the search text alone. That asymmetry is the line filter's, copied
          deliberately — see `useUserDashboardInput`. */}
      <div className="mt-2 flex gap-4">
        <button
          type="button"
          id="select-all-stops"
          data-qa="stop-select-all"
          className={ACTION_CLASS}
          onClick={(): void => onSelectAllStops(listedStopKeys)}
        >
          Select All
        </button>

        <button
          type="button"
          id="clear-all-stops"
          data-qa="stop-clear-all"
          className={ACTION_CLASS}
          onClick={onClearStops}
        >
          Clear All
        </button>
      </div>
    </>
  );
}
