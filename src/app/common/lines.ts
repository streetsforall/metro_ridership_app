import randomColor from 'randomcolor';
import * as lineMeta from '../data/metro_line_metadata_current.json';

const definedLines = [
  {
    number: 801,
    letter: 'A',
    color: '#0072bc',
  },
  {
    number: 802,
    letter: 'B',
    color: '#eb131b',
  },
  {
    number: 803,
    letter: 'C',
    color: '#58a738',
  },
  {
    number: 804,
    letter: 'E',
    color: '#fdb913',
  },
  {
    number: 805,
    letter: 'D',
    color: '#a05da5',
  },
  {
    number: 806,
    letter: 'L',
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
    color: '#adB8bf',
  },
];

// Random colors need to be fixed so that lines colors are constant as state changes
const randomColors = lineMeta.map((line) => ({
  number: line.line,
  color: randomColor({ luminosity: 'vivid' }),
}));

export function getLineColor(number: number) {
  const line =
    definedLines.find((line) => line.number === number) ||
    randomColors.find((line) => line.number === number);

  return line?.color;
}

export function getLineName(number: number) {
  const line = definedLines.find((line) => line.number === number);

  return line ? `${line.letter} Line` : `Line ${number}`;
}
