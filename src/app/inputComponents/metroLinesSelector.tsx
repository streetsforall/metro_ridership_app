import * as Checkbox from '@radix-ui/react-checkbox';
import * as lines from '../data/metro_line_metadata_current.json';

interface Line {
  line: number;
  mode: 'Bus' | 'Rail';
  provider: 'DO' | 'PT';
}

interface LineSelectorProps {
  selectedLines: string[];
  setSelectedLines: React.Dispatch<React.SetStateAction<Array<string>>>;
}

const railLetters = new Map([
  [801, 'A'],
  [802, 'B'],
  [803, 'C'],
  [804, 'E'],
  [805, 'D'],
  [806, 'L'],
  [807, 'K'],
]);

export default function LineSelector({
  selectedLines,
  setSelectedLines,
}: LineSelectorProps) {
  return (
    <div className="bg-white p-4 rounded-xl">
      <div className="flex gap-4 items-center mb-8">
        <span className="text-sm uppercase">Line Selector</span>
        <button className="text-neutral-400 text-sm">Expand</button>
      </div>

      <ul className="max-h-screen overflow-y-auto">
        {(lines as Line[]).map((line, index) => {
          return (
            <li
              key={index}
              className="flex gap-2 items-center px-2 odd:bg-neutral-50 text-sm"
            >
              <Checkbox.Root
                id={line.line.toString()}
                onClick={() => {
                  const selectedLinesCopy = [...selectedLines];

                  // Update checkbox value
                  if (selectedLinesCopy.includes(line.line.toString())) {
                    const pos = selectedLinesCopy.indexOf(line.line.toString());

                    selectedLinesCopy.splice(pos, 1);
                  } else {
                    selectedLinesCopy.push(line.line.toString());
                  }

                  // Update local state
                  setSelectedLines(selectedLinesCopy);
                }}
                checked={selectedLines.includes(line.line.toString())}
                className="flex items-center justify-center bg-white data-[state=checked]:bg-neutral-500 border border-neutral-500 rounded-lg h-5 w-5 overflow-hidden"
              >
                <Checkbox.Indicator className="bg-neutral-500 rounded-lg h-full w-full" />
              </Checkbox.Root>

              <label
                htmlFor={String(line.line)}
                className="flex-1 cursor-pointer py-2"
              >
                {line.mode === 'Bus'
                  ? `Line ${line.line}`
                  : line.mode === 'Rail'
                    ? `${railLetters.get(line.line)} Line`
                    : ''}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
