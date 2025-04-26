'use client';

import { type Line } from '../common/types';
import { Label } from '@radix-ui/react-label';
import React from 'react';

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


    const recentRidership = visibleAndSelectedLines
    .map((line) => line.endingRidership ?? 0)
    .reduce(
      (totalRecentRidership, currRecentRidership) =>
        totalRecentRidership + currRecentRidership,
      0,
    );


  return (
    <div
      id="summary-data"
    >
      <div id="summary-data-title">
        <span className="date_header">
          Summary Data
        </span>
      </div>

      <div id="selected-and-visible-lines" style={{ margin: '8px 0' }}>
        <Label>Selected: </Label>
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
            <Label>Current Ridership: </Label>
            <span>{Math.round(recentRidership).toLocaleString()}</span>
          </div>
          <div>
          <Label>Change in Ridership: </Label>
          <span>
            {
            (changeInRidership < 0 ? (
              <td className="changeDown">
                {changeInRidership.toLocaleString()}
              </td>
            ) : (
              <td className="changeUp">
                {'+' + changeInRidership.toLocaleString()}
              </td>
            ))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
