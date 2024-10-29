import useStorage from '@root/src/shared/hooks/useStorage';
import appStorage, { AuthStatus } from '@root/src/shared/storages/appStorage';
import debugStorage from '@root/src/shared/storages/debugStorage';
import { Label, TextInput, ToggleSwitch } from 'flowbite-react';
import { useCallback, useEffect } from 'react';

export function Options() {
  const { options } = useStorage(appStorage);
  const { logs } = useStorage(debugStorage);

  const downloadDebugLog = useCallback(() => {
    const errorString = logs.join('\n');
    const blob = new Blob([errorString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: url,
      filename: 'error-dump.txt',
    });
  }, [logs]);

  const resetMonarchStatus = useCallback(async () => {
    await appStorage.patch({
      monarchKey: undefined,
      lastMonarchAuth: undefined,
      monarchStatus: AuthStatus.NotLoggedIn,
    });
  }, []);

  const resetAmazonStatus = useCallback(async () => {
    await appStorage.patch({ amazonStatus: AuthStatus.NotLoggedIn });
  }, []);

  useEffect(() => {
    if (!options) {
      appStorage.patch({ options: { overrideTransactions: false, syncEnabled: false, amazonMerchant: 'Amazon' } });
    }
  }, [options]);

  if (!options) {
    return null;
  }

  return (
    <div className="m-3">
      <div className="mb-2 block">
        <Label htmlFor="countries" value="What merchant is Amazon in Monarch?" />
      </div>
      <TextInput
        defaultValue={options?.amazonMerchant}
        className="pb-3"
        type="text"
        id="merchant"
        placeholder="Amazon merchant"
        onChange={element => {
          appStorage.patch({ options: { ...options, amazonMerchant: element.target.value } });
        }}
      />
      <div className="flex flex-col">
        <ToggleSwitch
          checked={options.overrideTransactions}
          label="Override existing notes"
          onChange={value => {
            appStorage.patch({ options: { ...options, overrideTransactions: value } });
          }}
        />
        <span className="mt-1 text-gray-500 text-xs font-normal">
          If you have already added notes to your Amazon transactions, you can choose to override them with the the item
          name if it does not already match.
        </span>
      </div>

      {logs && logs.length > 0 && (
        <div className="mt-2">
          <button className="btn btn-primary" onClick={downloadDebugLog}>
            Download debug logs
          </button>
        </div>
      )}

      <div className="mt-2">
        <button className="btn btn-primary" onClick={resetMonarchStatus}>
          Reset Monarch connection status
        </button>
        <span className="mt-1 text-gray-500 text-xs font-normal">
          If GraphQL requests to Monarch API fail, the extension cached an expired token. You must log out from Monarch,
          reset the connection status using this button, and log in again.
        </span>
      </div>
      <div className="mt-2">
        <button className="btn btn-primary" onClick={resetAmazonStatus}>
          Reset Amazon connection status
        </button>
      </div>
    </div>
  );
}

export default Options;
