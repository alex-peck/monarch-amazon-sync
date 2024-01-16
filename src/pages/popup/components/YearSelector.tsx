import { Label, Select } from 'flowbite-react';
import { useMemo } from 'react';

type YearSelectorProps = {
  oldestYear: number | undefined;
  onSelect: (year: string) => void;
};

export default function YearSelector({ oldestYear, onSelect }: YearSelectorProps) {
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    if (oldestYear === undefined) return [`${currentYear}`];

    const years: string[] = [];
    for (let i = currentYear; i >= oldestYear; i--) {
      years.push(`${i}`);
    }
    return years;
  }, [oldestYear]);

  return (
    <>
      <div className="mb-2 block">
        <Label htmlFor="years" value="Select date range to import" />
      </div>
      <Select
        onChange={e => {
          onSelect(e.target.value);
        }}>
        <option>3 months</option>
        {years.map(year => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </Select>
    </>
  );
}
