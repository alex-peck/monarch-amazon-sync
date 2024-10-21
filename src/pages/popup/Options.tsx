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

  const resetCostcoStatus = useCallback(async () => {
    await appStorage.patch({ costcoStatus: AuthStatus.NotLoggedIn, costcoToken: undefined });
  }, []);

  const resetWalmartStatus = useCallback(async () => {
    await appStorage.patch({ walmartStatus: AuthStatus.NotLoggedIn });
  }, []);

  useEffect(() => {
    if (!options) {
      appStorage.patch({
        options: {
          overrideTransactions: false,
          syncEnabled: false,
          amazonMerchant: 'Amazon',
          costcoMerchant: 'Costco',
          walmartMerchant: 'Walmart',
          transactionMatchingWindowInDays: 7,
          maxPages: Infinity,
        },
      });
    }
  }, [options]);

  if (!options) {
    return null;
  }

  return (
    <div className="m-3">
      <div className="flex flex-col mb-2">
        <div className="mb-1 block">
          <Label htmlFor="amazonMerchant" value="What merchant is Amazon in Monarch?" />
        </div>
        <TextInput
          defaultValue={options?.amazonMerchant}
          className="pb-3"
          type="text"
          id="amazonMerchant"
          placeholder="Amazon merchant"
          onChange={element => {
            appStorage.patch({ options: { ...options, amazonMerchant: element.target.value } });
          }}
        />
      </div>
      <div className="flex flex-col mb-2">
        <div className="mb-1 block">
          <Label htmlFor="costcoMerchant" value="What merchant is Costco in Monarch?" />
        </div>
        <TextInput
          defaultValue={options?.walmartMerchant}
          className="pb-3"
          type="text"
          id="costcoMerchant"
          placeholder="Costco merchant"
          onChange={element => {
            appStorage.patch({ options: { ...options, costcoMerchant: element.target.value } });
          }}
        />
      </div>
      <div className="flex flex-col mb-2">
        <div className="mb-1 block">
          <Label htmlFor="walmartMerchant" value="What merchant is Walmart in Monarch?" />
        </div>
        <TextInput
          defaultValue={options?.walmartMerchant}
          className="pb-3"
          type="text"
          id="walmartMerchant"
          placeholder="Walmart merchant"
          onChange={element => {
            appStorage.patch({ options: { ...options, walmartMerchant: element.target.value } });
          }}
        />
      </div>
      <div className="flex flex-col mb-3">
        <div className="mb-1 block">
          <Label htmlFor="transactionMatchingWindowInDays" value="Transaction matching window in days" />
        </div>
        <TextInput
          defaultValue={options?.transactionMatchingWindowInDays}
          className="pb-3"
          type="number"
          id="transactionMatchingWindowInDays"
          placeholder="Transaction matching window in days"
          onChange={element => {
            appStorage.patch({
              options: { ...options, transactionMatchingWindowInDays: parseInt(element.target.value) },
            });
          }}
        />
        <span className="mt-1 text-gray-500 text-xs font-normal">
          This is the number of days around the transaction date to look for a matching transaction in Monarch. Increase
          if you have an issue with matching Subscribe & Save transactions.
        </span>
      </div>
      <div className="flex flex-col mb-3">
        <div className="mb-1 block">
          <Label htmlFor="maxPages" value="Maximum number of order pages" />
        </div>
        <TextInput
          defaultValue={
            options?.maxPages && isFinite(options.maxPages) ? (options.maxPages === 0 ? '' : options.maxPages) : ''
          }
          className="pb-3"
          type="text"
          pattern="^\d*$"
          id="maxPages"
          placeholder="No limit"
          onChange={element => {
            const value = element.target.value;
            let newValue;
            if (value === '') {
              newValue = 0;
            } else {
              newValue = parseInt(value);
              if (isNaN(newValue)) {
                newValue = options.maxPages;
              }
            }
            appStorage.patch({ options: { ...options, maxPages: newValue } });
          }}
        />
        <span className="mt-1 text-gray-500 text-xs font-normal">
          This is the maximum number of order pages to look through. Useful for troubleshooting the time it takes to go
          through the entire sync cycle. Leave empty for no limit.
        </span>
      </div>
      <div className="flex flex-col mb-3">
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
          Reset Monarch connection status and token
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
      <div className="mt-2">
        <button className="btn btn-primary" onClick={resetCostcoStatus}>
          Reset Costco connection status and token
        </button>
      </div>
      <div className="mt-2">
        <button className="btn btn-primary" onClick={resetWalmartStatus}>
          Reset Walmart connection status
        </button>
      </div>
    </div>
  );
}

export default Options;
