export interface Line {
  id: number;
  name: string;
  mode: 'Bus' | 'Rail';
  provider: 'DO' | 'PT';
  selected?: boolean;
  averageRidership?: number;
  changeInRidership?: number;
  ridershipOverTime?: number;
  division?: number;
  viewMap?: string;
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
