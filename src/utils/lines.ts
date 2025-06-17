import randomColor from 'randomcolor';
import lineMeta from '../data/metro_line_metadata_current.json';

/**
 * Refers to mode of transit like bus, rail, etc.
 */
export type Mode = 'Bus' | 'Rail';

export interface Line {
  id: number;
  name: string;
  former?: string;
  mode: Mode;
  provider: 'DO' | 'PT';
  selected: boolean;
  visible: boolean;
  averageRidership?: number;
  changeInRidership?: number;
  ridershipOverTime?: number;
  startingRidership?: number;
  endingRidership?: number;
  division?: number;
  viewMap?: string;
}

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

// Random colors need to be fixed so that lines colors are constant as state changes
const randomColors = lineMeta.map((line) => ({
  number: line.line,
  color: randomColor({ luminosity: 'bright' }),
}));

export function getLineColor(number: number) {
  const line =
    definedLines.find((line) => line.number === number) ||
    randomColors.find((line) => line.number === number);

  return line?.color;
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
