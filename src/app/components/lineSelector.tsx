import { useState } from 'react';
import { useController, type Control } from 'react-hook-form';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as lines from '../data/metro_line_metadata_current.json';

interface Line {
  line: number;
  mode: 'Bus' | 'Rail';
  provider: 'DO' | 'PT';
}

interface LineSelectorProps {
  control: Control;
  name: string;
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

export default function LineSelector({ control, name }: LineSelectorProps) {
  const { field } = useController({
    control,
    name,
  });
  const [value, setValue] = useState(field.value || []);

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
                name={name}
                value={line.line.toString()}
                onClick={(e) => {
                  const valueCopy = [...value];

                  // Update checkbox value
                  if (valueCopy.includes(line.line.toString())) {
                    const pos = valueCopy.indexOf(line.line.toString());

                    valueCopy.splice(pos, 1);
                  } else {
                    valueCopy.push(line.line.toString());
                  }

                  // Send data to react hook form
                  field.onChange(valueCopy);

                  // Update local state
                  setValue(valueCopy);
                }}
                checked={value.includes(line.line.toString())}
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
