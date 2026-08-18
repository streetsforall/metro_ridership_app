import * as Checkbox from '@radix-ui/react-checkbox';
import checkIcon from '../assets/check.svg';
import magnifyingGlassIcon from '../assets/magnifying-glass.svg';

/**
 * The stop table's chrome — search, then the two selection actions.
 *
 * A sibling of `LineFilters` on purpose. The two ranked tables in this dashboard offer the
 * same four controls, and the whole point of this component is that they offer them the
 * same way: the search in a row of its own closed by a rule, then `Select All` and
 * `Clear All` under it with the aggregate toggle at the far right of that same row.
 * Inlining that arrangement in `StopPanel` would have been a second copy of a layout
 * `LineFilters` already states, and the two would drift.
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
  /** Whether the figure draws the Stop Aggregate Series. Lives in the URL as `stopagg=`. */
  isAggregateVisible: boolean;
  toggleIsAggregateVisible: () => void;
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
  isAggregateVisible,
  toggleIsAggregateVisible,
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
      {/* The two actions at the left, the aggregate toggle at the far right of the same
          row — `LineFilters`' arrangement, down to the growing wrapper that pushes them
          apart. The checkbox belongs on this row rather than beside the Stop Measure in
          the panel header, because it acts on the selection these two buttons build. */}
      <div className="mt-2 flex gap-4">
        <div className="flex flex-grow gap-4">
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

        <label
          className="flex items-center gap-2 cursor-pointer text-xs"
          htmlFor="stop-aggregate"
        >
          <Checkbox.Root
            id="stop-aggregate"
            data-qa="stop-aggregate"
            onClick={toggleIsAggregateVisible}
            checked={isAggregateVisible}
            className="flex items-center justify-center bg-white data-[state=checked]:bg-[#033056] rounded p-0 h-5 w-5"
          >
            <Checkbox.Indicator>
              <img
                src={checkIcon}
                height={20}
                width={20}
                alt="Check"
                className="recolor-white"
              />
            </Checkbox.Indicator>
          </Checkbox.Root>
          Aggregate
        </label>
      </div>
    </>
  );
}
