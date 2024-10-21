import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, ToggleSwitch } from 'flowbite-react';
import progressStorage, { ProgressPhase } from '@root/src/shared/storages/progressStorage';
import useStorage from '@root/src/shared/hooks/useStorage';
import { checkAuth } from '@root/src/shared/api/amazonApi';
import appStorage, { AuthStatus } from '@root/src/shared/storages/appStorage';
import ProgressIndicator from './components/ProgressIndicator';
import withErrorBoundary from '@root/src/shared/hoc/withErrorBoundary';
import withSuspense from '@root/src/shared/hoc/withSuspense';
import ConnectionInfo, { ConnectionStatus } from './components/ConnectionInfo';
import { useAlarm } from '@root/src/shared/hooks/useAlarm';
import { Action } from '@root/src/shared/types';

const Main = () => {
  const progress = useStorage(progressStorage);
  const appData = useStorage(appStorage);
  const syncAlarm = useAlarm('sync-alarm');

  const actionOngoing = useMemo(
    () => progress.phase !== ProgressPhase.Complete && progress.phase !== ProgressPhase.Idle,
    [progress],
  );

  // If the action is ongoing for more than 15 seconds, we assume it's stuck and mark it as complete
  useEffect(() => {
    if (actionOngoing) {
      const originalComplete = progress.complete;
      const originalPhase = progress.phase;
      const timeoutId = setTimeout(async () => {
        const { complete, phase } = await progressStorage.get();
        if (complete === originalComplete && phase == originalPhase) {
          await progressStorage.patch({
            phase: ProgressPhase.Complete,
          });
        }
      }, 15_000);

      return () => clearTimeout(timeoutId);
    }
  }, [actionOngoing, progress.complete, progress.phase]);

  const [checkedAmazon, setCheckedAmazon] = useState(false);

  // Check if we need to re-authenticate with Amazon
  useEffect(() => {
    if (
      (appData.amazonStatus === AuthStatus.Success &&
        new Date(appData.lastAmazonAuth).getTime() > Date.now() - 1000 * 60 * 60 * 24) ||
      checkedAmazon
    ) {
      return;
    }
    setCheckedAmazon(true);
    appStorage.patch({ amazonStatus: AuthStatus.Pending }).then(() => {
      checkAuth().then(amazon => {
        if (amazon.status === AuthStatus.Success) {
          appStorage.patch({
            amazonStatus: AuthStatus.Success,
            lastAmazonAuth: Date.now(),
            oldestAmazonYear: amazon.startingYear,
          });
        } else {
          appStorage.patch({ amazonStatus: amazon.status });
        }
      });
    });
  }, [appData.amazonStatus, appData.lastAmazonAuth, checkedAmazon]);

  const ready =
    appData.amazonStatus === AuthStatus.Success && appData.monarchStatus === AuthStatus.Success && !actionOngoing;

  const forceSync = useCallback(async () => {
    if (!ready) return;

    await chrome.runtime.sendMessage({ action: Action.FullSync });
  }, [ready]);

  return (
    <div className="flex flex-col flex-grow">
      <div className="ml-2">
        <ConnectionInfo
          name="Amazon connection"
          lastUpdated={appData.lastAmazonAuth}
          status={
            appData.amazonStatus === AuthStatus.Pending
              ? ConnectionStatus.Loading
              : appData.amazonStatus === AuthStatus.Success
                ? ConnectionStatus.Success
                : ConnectionStatus.Error
          }
          message={
            appData.amazonStatus === AuthStatus.NotLoggedIn
              ? 'Log in to Amazon and try again.'
              : appData.amazonStatus === AuthStatus.Failure
                ? 'Failed to connect to Amazon. Ensure the extension has been granted access.'
                : undefined
          }
        />
        <ConnectionInfo
          name="Monarch connection"
          lastUpdated={appData.lastMonarchAuth}
          status={appData.monarchStatus === AuthStatus.Success ? ConnectionStatus.Success : ConnectionStatus.Error}
          message={
            appData.monarchStatus === AuthStatus.NotLoggedIn
              ? 'Open Monarch and log in to enable syncing.'
              : appData.monarchStatus === AuthStatus.Failure
                ? 'Log in to Monarch and try again.'
                : undefined
          }
        />
      </div>

      <div className="flex flex-col flex-grow items-center justify-center">
        <ProgressIndicator progress={progress} />
      </div>

      <div className="flex flex-row m-3 items-center">
        <div className="flex flex-col">
          <ToggleSwitch
            checked={appData.options.syncEnabled}
            label="Sync enabled"
            onChange={value => {
              appStorage.patch({ options: { ...appData.options, syncEnabled: value } });
            }}
          />
          <span className="text-gray-500 text-xs font-normal">
            When enabled, sync will run automatically every 24 hours.
          </span>
          {appData.options.syncEnabled && (
            <span className="text-xs font-normal">
              Next sync: {syncAlarm ? new Date(syncAlarm.scheduledTime).toLocaleTimeString() : '...'}
            </span>
          )}
        </div>
        <Button color="cyan" disabled={!ready} onClick={forceSync}>
          Force sync
        </Button>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Main, <div> Loading ... </div>), <div> Error Occur </div>);
