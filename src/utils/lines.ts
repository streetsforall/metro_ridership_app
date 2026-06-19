import type { Line } from '../@types/lines.types';
import type { ConsolidatedRidership } from '../@types/metrics.types';

const definedLines = [
  {
    number: 801,
    letter: 'A',
    former: 'Blue',
    color: '#0072bc',
  },
  {
    number: 802,
    letter: 'B',
    former: 'Red',
    color: '#eb131b',
  },
  {
    number: 803,
    letter: 'C',
    former: 'Green',
    color: '#58a738',
  },
  {
    number: 804,
    letter: 'E',
    former: 'Expo',
    color: '#fdb913',
  },
  {
    number: 805,
    letter: 'D',
    former: 'Purple',
    color: '#a05da5',
  },
  {
    number: 806,
    letter: 'L',
    former: 'Gold',
    color: '#f9a825',
  },
  {
    number: 807,
    letter: 'K',
    color: '#e56db1',
  },
  {
    number: 901,
    letter: 'G',
    color: '#fc4c02',
  },
  {
    number: 910,
    letter: 'J',
    former: 'Silver',
    color: '#adB8bf',
  },
];

// Deterministic hue spread via the golden angle so each bus line always
// gets the same color and it matches what the map renders.
function busLineColor(lineId: number): string {
  const hue = Math.round((lineId * 137.508) % 360);
  return `hsl(${hue}, 75%, 45%)`;
}

export function getLineColor(number: number): string {
  return definedLines.find((line) => line.number === number)?.color ?? busLineColor(number);
}

export function getLineNames(number: number) {
  const line = definedLines.find((line) => line.number === number);

  return {
    current: line ? `${line.letter} Line` : `Line ${number}`,
    ...(line && line.former && { former: `${line.former} Line` }),
  };
}

export const lineNameSortFunction = (a: Line, b: Line) => {
  const nameA = a.name;
  const nameB = b.name;

  // Lettered lines should come first
  if (nameA.startsWith('Line') && !nameB.startsWith('Line')) {
    return 1;
  }
  if (!nameA.startsWith('Line') && nameB.startsWith('Line')) {
    return -1;
  }

  // Numbered lines should be in numerical order (e.g., 2 before 10)
  if (nameA.startsWith('Line') && nameB.startsWith('Line')) {
    return a.id - b.id;
  }

  // Lettered lines should be in alphabetical order
  if (nameA < nameB) {
    return -1;
  }
  if (nameA > nameB) {
    return 1;
  }

  // Names must be equal
  return 0;
};

/**
 * From https://stackoverflow.com/a/14966131.
 *
 * Warning: Looks like it doesn't work for large dataset.
 * May return a NETWORK_INVALID_REQUEST.
 * Will need to have CSV export logic in a backend when that happens.
 */
export const generateCSV = (ridershipByLine: ConsolidatedRidership): string => {
  let csvContent = 'data:text/csv;charset=utf-8,';

  // Add headers to CSV.
  const headers =
    'line_name,year,month,est_wkday_ridership,est_sat_ridership,est_sun_ridership\r\n';
  csvContent += headers;

  // Get selected lines
  const ridershipBySelectedLine = Object.values(ridershipByLine).filter(
    (line) => line.selected,
  );

  // For each line, get all line metric and add to CSV
  ridershipBySelectedLine.forEach((consolidatedRecord) => {
    consolidatedRecord.ridershipRecords.forEach((record) => {
      const {
        year,
        month,
        line_name,
        est_wkday_ridership,
        est_sat_ridership,
        est_sun_ridership,
      } = record;

      const friendly_line_name = getLineNames(Number(line_name)).current;

      const row: string = `${friendly_line_name},${year},${month},${est_wkday_ridership},${est_sat_ridership},${est_sun_ridership}`;
      csvContent += row + '\r\n';
    });
  });

  const encodedUri: string = encodeURI(csvContent);

  return encodedUri;
};
