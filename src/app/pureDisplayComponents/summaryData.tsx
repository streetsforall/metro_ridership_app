'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { type Line } from '../common/types';
import { Label } from '@radix-ui/react-label';
import React from 'react';
import { ChevronDownIcon } from '@radix-ui/themes';

interface SummaryDataProps {
  visibleLines: Line[];
}

export default function SummaryData(props: SummaryDataProps) {
  const { visibleLines } = props;

  const visibleAndSelectedLines = visibleLines.filter(
    (visibleLine: Line) => visibleLine.selected,
  );

  const changeInRidership = visibleAndSelectedLines
    .map((line) => line.changeInRidership ?? 0)
    .reduce(
      (totalChangeInRidership, currLineChangeInRidership) =>
        totalChangeInRidership + currLineChangeInRidership,
      0,
    );

  const averageDailyRidership = visibleAndSelectedLines
    .map((line) => line.averageRidership ?? 0)
    .reduce(
      (totalAvgRidership, currLineAvgRidership) =>
        totalAvgRidership + currLineAvgRidership,
      0,
    );

  return (
    <div
      id="summary-data"
      className="container_card bg-white p-4 rounded-xl flex flex-col"
    >
      <div id="summary-data-title">
        <span className="text-sm uppercase whitespace-nowrap">
          Summary Data
        </span>
      </div>

      <div id="selected-and-visible-lines" style={{ margin: '8px 0' }}>
        <Label>Selected and Visible Lines: </Label>
        {visibleAndSelectedLines.length > 0 && (
          <span>
            {visibleAndSelectedLines.map((visibleLine: Line, index: number) => {
              const { name, id } = visibleLine;
              return (
                <span key={id}>
                  <span>{name}</span>

                  {index !== visibleAndSelectedLines.length - 1 && (
                    <span>{', '}</span>
                  )}
                </span>
              );
            })}
          </span>
        )}
      </div>

      {visibleAndSelectedLines.length > 0 && (
        <div id="aggregate-data">
          <div>
            <Label>Average Ridership: </Label>
            <span>{Math.round(averageDailyRidership).toLocaleString()}</span>
          </div>
          <div>
            <Label>Change in Ridership: </Label>
            <span>{Math.round(changeInRidership).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
