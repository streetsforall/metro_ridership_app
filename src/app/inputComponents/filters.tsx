'use client';

import { useState, useEffect } from 'react';
import { type Line } from '../common/types';
import * as Checkbox from '@radix-ui/react-checkbox';
import { Button, Flex, Separator, TextField } from '@radix-ui/themes';
import { MagnifyingGlassIcon, CheckIcon } from '@radix-ui/react-icons';
import { Spacing } from '../common/spacing';

interface FiltersProps {
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  searchText: string;
  setSearchText: React.Dispatch<React.SetStateAction<string>>;
  clearSelections: () => void;
  selectAllVisibleLines: () => void;
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
  selectAllVisibleLines,
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

        <div className="filter_controls">
          <div>
          <div>
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
            <label className="Label" htmlFor="trainsVisible">
              Train
            </label>
          </div>

          <div>
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
            <label className="Label" htmlFor="busesVisible">
              Buses
            </label>
          </div>
          </div>

          {/* <Separator orientation="vertical"></Separator> */}

          <button
            className=""
            onClick={selectAllVisibleLines}
            style={{ marginRight: Spacing.Small }}
          >
            Select All
          </button>

          <button className="clearButton" onClick={clearSelections}>
            Clear All
          </button>
        </div>
      </div>

      <button className="" onClick={resetVisibility}>
        Reset
      </button>
    </div>
  );
}
