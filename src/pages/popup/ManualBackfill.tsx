import useStorage from '@root/src/shared/hooks/useStorage';
import appStorage, { AuthStatus, Page } from '@root/src/shared/storages/appStorage';
import progressStorage, { ProgressPhase } from '@root/src/shared/storages/progressStorage';
import { Button, ToggleSwitch } from 'flowbite-react';
import { useCallback, useMemo, useState } from 'react';
import YearSelector from './components/YearSelector';
import { Action } from '@root/src/shared/types';

export function ManualBackfill() {
  const appData = useStorage(appStorage);
  const progress = useStorage(progressStorage);

  const [year, setYear] = useState<string | undefined>(undefined);
  const [dryRun, setDryRun] = useState<boolean>(false);

  const actionOngoing = useMemo(
    () => progress.phase !== ProgressPhase.Complete && progress.phase !== ProgressPhase.Idle,
    [progress],
  );
  const ready =
    appData.amazonStatus === AuthStatus.Success && appData.monarchStatus === AuthStatus.Success && !actionOngoing;

  const runBackfill = useCallback(async () => {
    if (!ready) return;

    await appStorage.patch({ page: Page.Default });
    await chrome.runtime.sendMessage({ action: dryRun ? Action.DryRun : Action.FullSync, payload: { year: year } });
  }, [ready, dryRun, year]);

  return (
    <div className="m-3 flex flex-col flex-grow">
      <div className="flex-grow">
        <YearSelector oldestYear={appData.oldestAmazonYear} onSelect={year => setYear(year)} />

        <div className="flex flex-col mt-3">
          <ToggleSwitch
            checked={dryRun}
            label="Dry run"
            onChange={value => {
              setDryRun(value);
            }}
          />
          <span className="mt-1 text-gray-500 text-xs font-normal">
            If you want to see what transactions would be synced without actually syncing them, you can turn on dry run.
          </span>
        </div>
      </div>

      <Button color="cyan" disabled={!ready} onClick={runBackfill}>
        Run backfill
      </Button>
    </div>
  );
}

export default ManualBackfill;
