import magnifyingGlassIcon from '../assets/magnifying-glass.svg';

/**
 * The stop table's chrome — search, then the two selection actions.
 *
 * A sibling of `LineFilters` on purpose. The two ranked tables in this dashboard offer the
 * same three controls, and the whole point of this component is that they offer them the
 * same way: the search in a row of its own closed by a rule, then `Select All` and
 * `Clear All` under it. Inlining that arrangement in `StopPanel` would have been a second
 * copy of a layout `LineFilters` already states, and the two would drift.
 *
 * It renders below the figure and above the table, because it acts on the table.
 *
 * Presentational and stateless: the search text and the Stop Selection are URL-synced
 * dashboard state, and `useUserDashboardInput` is the one place that reads and writes the
 * URL. Everything here arrives as a prop.
 */

export interface StopFiltersProps {
  searchText: string;
  onSearchTextChange: (text: string) => void;
  /**
   * Every stop the table is currently listing, deduplicated — what `Select All` adds.
   *
   * Passed in rather than derived here, because "which rows are listed" is the same
   * question the table itself answers and deriving it twice is how the button and the
   * table start disagreeing about what "all" means.
   */
  listedStopKeys: string[];
  onSelectAllStops: (stopKeys: string[]) => void;
  onClearStops: () => void;
}

/**
 * `bg-transparent border-none p-0` is load-bearing on both buttons: without it the global
 * `button` rule in `index.css` paints each a filled navy pill. `type="button"` because a
 * bare `<button>` defaults to submit. Same teal, weight and size as the line filter's pair,
 * which are the dashboard's existing selection actions.
 *
 * One constant rather than the string twice, so the two buttons cannot drift apart — the
 * failure this class list has already had once, in the control it replaced.
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
