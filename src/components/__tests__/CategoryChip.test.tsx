import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import colors from 'tailwindcss/colors';
import CategoryChip from '../CategoryChip';
import type { EventCategory } from '../../@types/events.types';

/** jsdom serializes inline colors its own way; normalize both sides the same. */
const asColor = (value: string) => {
  const el = document.createElement('div');
  el.style.color = value;
  return el.style.color;
};

const ALL_CATEGORIES: EventCategory[] = [
  'opening',
  'extension',
  'closure',
  'disruption',
  'headway_change',
  'hours_change',
  'route_change',
  'fare_change',
  'service_change',
];

describe('CategoryChip', () => {
  /**
   * The whole point of a chip over a bare colour: nine categories are more than
   * hue can carry, so the name is what a reader who cannot separate red from
   * rose actually reads.
   */
  it('writes the category name in the chip', () => {
    render(<CategoryChip category="headway_change" surface="light" />);
    expect(screen.getByText('Headway change')).toBeTruthy();
  });

  it('names every category, on either surface', () => {
    for (const surface of ['light', 'dark'] as const) {
      const { container, unmount } = render(
        <>
          {ALL_CATEGORIES.map((category) => (
            <CategoryChip key={category} category={category} surface={surface} />
          ))}
        </>,
      );
      const labels = Array.from(container.querySelectorAll('span')).map(
        (chip) => chip.textContent,
      );
      expect(labels).toEqual([
        'Opening',
        'Extension',
        'Closure',
        'Disruption',
        'Headway change',
        'Hours change',
        'Route change',
        'Fare change',
        'Service change',
      ]);
      unmount();
    }
  });

  /**
   * `100`/`800` on light, mirrored to `900`/`200` on dark — the pairs whose
   * contrast ratios are recorded beside the table in `categoryColors.ts`.
   */
  it('tints the chip from the category hue for the light surface', () => {
    render(<CategoryChip category="opening" surface="light" />);
    const chip = screen.getByText('Opening');
    expect(chip.style.backgroundColor).toBe(asColor(colors.emerald['100']));
    expect(chip.style.color).toBe(asColor(colors.emerald['800']));
  });

  it('tints the chip from the same hue for the dark surface', () => {
    render(<CategoryChip category="opening" surface="dark" />);
    const chip = screen.getByText('Opening');
    expect(chip.style.backgroundColor).toBe(asColor(colors.emerald['900']));
    expect(chip.style.color).toBe(asColor(colors.emerald['200']));
  });

  it('gives every category its own pair on each surface', () => {
    for (const surface of ['light', 'dark'] as const) {
      const { container, unmount } = render(
        <>
          {ALL_CATEGORIES.map((category) => (
            <CategoryChip key={category} category={category} surface={surface} />
          ))}
        </>,
      );
      const fills = Array.from(container.querySelectorAll('span')).map(
        (chip) => (chip as HTMLElement).style.backgroundColor,
      );
      expect(new Set(fills).size).toBe(ALL_CATEGORIES.length);
      unmount();
    }
  });

  /**
   * Events are fetched data, so a category the union doesn't cover can reach
   * here at runtime. It renders, in the fallback hue, rather than vanishing.
   */
  it('renders an unrecognised category in the fallback hue', () => {
    render(
      <CategoryChip
        category={'not_a_real_category' as EventCategory}
        surface="light"
      />,
    );
    const chip = screen.getByText('Not a real category');
    expect(chip.style.backgroundColor).toBe(asColor(colors.slate['100']));
    expect(chip.style.color).toBe(asColor(colors.slate['800']));
  });

  it('renders an event with no category at all as a service change', () => {
    render(<CategoryChip category={undefined} surface="dark" />);
    const chip = screen.getByText('Service change');
    expect(chip.style.backgroundColor).toBe(asColor(colors.slate['900']));
  });
});
