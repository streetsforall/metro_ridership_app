import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useDockLayout } from '../dock/DockLayoutContext';
import { PANEL_IDS, PANEL_DEFS } from '../dock/DockShell';
import checkIcon from '../assets/check.svg';
import sfaLogo from '../assets/sfa-logo.png';

export default function Header() {
  const { visibility, togglePanel, resetLayout } = useDockLayout();

  return (
    <header className="flex items-center justify-between font-bold py-4 uppercase">
      <span className="ml-2">LA Metro Ridership App</span>

      <div className="flex items-center gap-4">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="bg-transparent border-none p-0 font-bold text-xs uppercase text-[#0fada8]">
            Panels
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="flex flex-col gap-1 bg-[#f8f6f1] rounded-lg p-4 font-bold text-xs uppercase shadow-lg z-50"
            >
              {PANEL_IDS.map((id) => (
                <DropdownMenu.CheckboxItem
                  key={id}
                  checked={visibility[id]}
                  onCheckedChange={() => {
                    togglePanel(id);
                  }}
                  onSelect={(event) => {
                    // Keep the menu open so several panels can be toggled in
                    // one visit.
                    event.preventDefault();
                  }}
                  className="group flex items-center gap-2 cursor-pointer select-none rounded px-2 py-1 outline-none data-[highlighted]:bg-stone-200"
                >
                  {/* Radix sets data-state on the item, so the box styles via group-data. */}
                  <span className="flex items-center justify-center bg-white group-data-[state=checked]:bg-[#033056] rounded h-5 w-5">
                    <DropdownMenu.ItemIndicator>
                      <img
                        src={checkIcon}
                        height={20}
                        width={20}
                        alt=""
                        className="recolor-white"
                      />
                    </DropdownMenu.ItemIndicator>
                  </span>
                  {PANEL_DEFS[id].title}
                </DropdownMenu.CheckboxItem>
              ))}

              <DropdownMenu.Separator className="h-px bg-stone-300 my-1" />

              <DropdownMenu.Item
                onSelect={() => {
                  resetLayout();
                }}
                className="cursor-pointer select-none rounded px-2 py-1 outline-none text-[#0fada8] data-[highlighted]:bg-stone-200"
              >
                Reset layout
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <a href="https://www.streetsforall.org">
          <img src={sfaLogo} height={48} width={48} alt="Streets for All logo" />
        </a>
      </div>
    </header>
  );
}
