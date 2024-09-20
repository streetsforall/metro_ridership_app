'use client';

import { useState, useEffect } from 'react';
import { type Line } from '../common/types';
import * as Checkbox from '@radix-ui/react-checkbox';
import { Button, Flex, Separator, TextField } from '@radix-ui/themes';
import { MagnifyingGlassIcon, CheckIcon } from '@radix-ui/react-icons';

interface FiltersProps {
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  searchText: string;
  setSearchText: React.Dispatch<React.SetStateAction<string>>;
  clearSelections: () => void;
}

type ButtonColor = 'indigo' | undefined;

const getButtonColor = (visible: boolean): ButtonColor => {
  return visible ? 'indigo' : undefined;
};

export default function Filters({
  setLines,
  searchText,
  setSearchText,
  clearSelections,
}: FiltersProps) {
  const [trainsVisible, setTrainsVisible] = useState<boolean>(true);
  const [busesVisible, setBusesVisible] = useState<boolean>(true);

  const resetVisibility = (): void => {
    setTrainsVisible(true);
    setBusesVisible(true);
  };

  useEffect(() => {
    setLines((prevLines) => {
      return prevLines.map((prevLine) => {
        if (prevLine.mode !== 'Rail') {
          return prevLine;
        }

        return { ...prevLine, visible: trainsVisible };
      });
    });
  }, [setLines, trainsVisible]);

  useEffect(() => {
    setLines((prevLines) => {
      return prevLines.map((prevLine) => {
        if (prevLine.mode !== 'Bus') {
          return prevLine;
        }

        return { ...prevLine, visible: busesVisible };
      });
    });
  }, [setLines, busesVisible]);

  return (
    <div id="filters">
      <p className="text-gray-500	 text-sm">Filters</p>

      <div id="line_filters">
        <div id="line_search">
          <MagnifyingGlassIcon height="20" className="mr-2" width="20" />

          <TextField.Root
            placeholder="Search lines"
            className="search_bar"
            value={searchText}
            onChange={(event): void => {
              setSearchText(event.target.value);
            }}
          ></TextField.Root>
        </div>

        <div className="flex">
          <Checkbox.Root
            id="trainsVisible"
            className="CheckboxRoot"
            onCheckedChange={(): void => {
              setTrainsVisible((visible) => !visible);
            }}
            checked={trainsVisible}
          >
            <Checkbox.Indicator className="CheckboxIndicator">
              <CheckIcon />
            </Checkbox.Indicator>
          </Checkbox.Root>
          <label className="Label text-sm" htmlFor="trainsVisible">
            Train
          </label>

          <Checkbox.Root
            id="busesVisible"
            className="CheckboxRoot"
            checked={busesVisible}
            onCheckedChange={(): void => {
              setBusesVisible((visible) => !visible);
            }}
          >
            <Checkbox.Indicator className="CheckboxIndicator">
              <CheckIcon />
            </Checkbox.Indicator>
          </Checkbox.Root>
          <label className="Label text-sm" htmlFor="busesVisible">
            Buses
          </label>

          {/* <Separator orientation="vertical"></Separator> */}

          <button className="text-sm" onClick={resetVisibility}>
            Reset
          </button>
        </div>
      </div>

      <button className="clearButton text-sm" onClick={clearSelections}>
        Clear Selections
      </button>
    </div>
  );
}
