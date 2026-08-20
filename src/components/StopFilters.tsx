import magnifyingGlassIcon from '../assets/magnifying-glass.svg';

/** The stop table's chrome — search and the two selection actions, mirroring `LineFilters`. */

export interface StopFiltersProps {
  searchText: string;
  onSearchTextChange: (text: string) => void;
  /** What `Select All` adds, passed in so the button and the table can't disagree. */
  listedStopKeys: string[];
  onSelectAllStops: (stopKeys: string[]) => void;
  onClearStops: () => void;
}

/** `bg-transparent border-none p-0` is load-bearing, or `index.css` paints a navy pill. */
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
        {/* The magnifier is a background image, the same trio `#search-lines` uses.
            `aria-label` is the one deliberate difference, because a placeholder — all
            `#search-lines` has — disappears the moment someone types. */}
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
          leaves the search text alone. The line filter's asymmetry, copied deliberately. */}
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
