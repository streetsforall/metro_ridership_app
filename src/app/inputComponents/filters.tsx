'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { type Line } from '../common/types';

interface FiltersProps {
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  searchText: string;
  setSearchText: React.Dispatch<React.SetStateAction<string>>;
  clearSelections: () => void;
  selectAllVisibleLines: () => void;
}

export default function Filters({
  setLines,
  searchText,
  setSearchText,
  clearSelections,
  selectAllVisibleLines,
}: FiltersProps) {
  const [modes, setModes] = useState<string[]>(['bus', 'train']);

  const resetVisibility = (): void => {
    setModes(['bus', 'train']);
  };

  useEffect(() => {
    // Convert modes array into separate booleans
    const busVis = modes.includes('bus');
    const trainVis = modes.includes('train');

    setLines((prevLines) => {
      return prevLines.map((prevLine) => {
        // Set visibility for each line based on corresponding boolean
        let visible;

        if (prevLine.mode === 'Bus') {
          visible = busVis;
        } else if (prevLine.mode === 'Rail') {
          visible = trainVis;
        } else {
          visible = false;
        }

        return { ...prevLine, visible };
      });
    });
  }, [setLines, modes]);

  return (
    <>
      <div className="flex gap-2 border-b border-stone-300 pb-4">
        <input
          placeholder="Search lines"
          className="bg-[url('/magnifying-glass.svg')] bg-[0.5rem_center] bg-no-repeat pl-8 w-full"
          value={searchText}
          onChange={(event): void => {
            setSearchText(event.target.value);
          }}
        />

        <ToggleGroup.Root
          className="toggle-group"
          type="multiple"
          aria-label="Filter by mode"
          value={modes}
          onValueChange={(updatedModes) => {
            setModes(updatedModes);
          }}
        >
          <ToggleGroup.Item
            className="toggle-group-item"
            value="bus"
            aria-label="Bus"
          >
            <Image
              src="/bus.svg"
              height={16}
              width={16}
              alt="Bus"
              title="Bus"
              unoptimized
            />
          </ToggleGroup.Item>
          <ToggleGroup.Item
            className="toggle-group-item"
            value="train"
            aria-label="Train"
          >
            <Image
              src="/train.svg"
              height={16}
              width={16}
              alt="Train"
              title="Train"
              unoptimized
            />
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>

      <div className="flex gap-4">
        <button
          onClick={selectAllVisibleLines}
          className="bg-transparent border-none p-0 font-bold text-xs text-[#0fada8]"
        >
          Select All
        </button>

        <button
          onClick={clearSelections}
          className="bg-transparent border-none p-0 font-bold text-xs text-[#0fada8]"
        >
          Clear All
        </button>
      </div>

      {/* not needed untill we have more toggles */}
      {/* <button className="" onClick={resetVisibility}>
        Reset
      </button> */}
    </>
  );
}
