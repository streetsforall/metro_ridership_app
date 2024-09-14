'use client';

import { useState, useEffect } from 'react';
import { type Line } from '../common/types';
import { Button, Flex, Separator, TextField } from '@radix-ui/themes';
import { MagnifyingGlassIcon } from '@radix-ui/react-icons';

interface FiltersProps {
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  searchText: string;
  setSearchText: React.Dispatch<React.SetStateAction<string>>;
}

type ButtonColor = 'indigo' | undefined;

const getButtonColor = (visible: boolean): ButtonColor => {
  return visible ? 'indigo' : undefined;
};

export default function Filters({
  setLines,
  searchText,
  setSearchText,
}: FiltersProps) {
  const [trainsVisible, setTrainsVisible] = useState<boolean>(true);
  const [busesVisible, setBusesVisible] = useState<boolean>(true);

  const clearVisibility = (): void => {
    setTrainsVisible(false);
    setBusesVisible(false);
  };

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
      <Flex id="visibility-buttons" gap="3" align="center">
        <Button
          color={getButtonColor(trainsVisible)}
          onClick={(): void => {
            setTrainsVisible((visible) => !visible);
          }}
          size="3"
          variant="solid"
        >
          Trains
        </Button>
        <Button
          color={getButtonColor(busesVisible)}
          size="3"
          variant="solid"
          onClick={(): void => {
            setBusesVisible((visible) => !visible);
          }}
        >
          Buses
        </Button>
        <Separator orientation="vertical"></Separator>
        <Button onClick={resetVisibility} size="3" variant="solid">
          Reset
        </Button>
        <Button onClick={clearVisibility} size="3" variant="solid">
          Clear
        </Button>
      </Flex>
      <Flex id="search-wrapper" align="center">
        <TextField.Root
          placeholder="Search lines"
          value={searchText}
          onChange={(event): void => {
            setSearchText(event.target.value);
          }}
        >
          <TextField.Slot>
            <MagnifyingGlassIcon height="16" width="16" />
          </TextField.Slot>
        </TextField.Root>
      </Flex>
    </div>
  );
}
