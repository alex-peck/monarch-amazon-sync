import * as amazonApi from '@root/src/shared/api/amazonApi';
import * as costcoApi from '@root/src/shared/api/costcoApi'; // eslint-disable-line @typescript-eslint/no-unused-vars
import * as walmartApi from '@root/src/shared/api/walmartApi'; // eslint-disable-line @typescript-eslint/no-unused-vars
import reloadOnUpdate from 'virtual:reload-on-update-in-background-script';
import 'webextension-polyfill';
import { getTransactions, updateMonarchTransaction } from '@root/src/shared/api/monarchApi';
import progressStorage, { ProgressPhase, ProgressState } from '@root/src/shared/storages/progressStorage';
import transactionStorage, { TransactionStatus } from '@root/src/shared/storages/transactionStorage';
import { matchTransactions } from '@root/src/shared/api/matchUtil';
import appStorage, { AuthStatus, FailureReason, LastSync } from '@root/src/shared/storages/appStorage';
import { Action, Order, Provider, MonarchTransaction } from '@root/src/shared/types';
import debugStorage, { debugLog } from '@root/src/shared/storages/debugStorage';

reloadOnUpdate('pages/background');

async function checkAlarm() {
  const alarm = await chrome.alarms.get('sync-alarm');

  if (!alarm) {
    const { lastSync } = await appStorage.get();
    const lastTime = new Date(lastSync?.time || 0);
    const sinceLastSync = Date.now() - lastTime.getTime() / (1000 * 60);
    const delayInMinutes = Math.max(0, 24 * 60 - sinceLastSync);

    await chrome.alarms.create('sync-alarm', {
      delayInMinutes: delayInMinutes,
      periodInMinutes: 24 * 60,
    });
  }
}

// Setup alarms for syncing
checkAlarm();
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'sync-alarm') {
    const { amazonStatus, monarchStatus, options } = await appStorage.get();
    if (options.syncEnabled && amazonStatus === AuthStatus.Success && monarchStatus === AuthStatus.Success) {
      await handleFullSync(undefined, () => {});
    }
  }
});

// Repopulate Monarch key when the tab is visited and the user is logged in
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab?.url?.startsWith('chrome://')) {
    return true;
  }
  if (changeInfo.url) {
    const url = new URL(changeInfo.url);
    await debugLog(`Tab updated: ${url.hostname}`);

    if (url.hostname === 'app.monarchmoney.com') {
      const appData = await appStorage.get();
      const lastAuth = new Date(appData.lastMonarchAuth);
      if (
        !appData.monarchKey ||
        appData.monarchStatus !== AuthStatus.Success ||
        lastAuth < new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
      ) {
        // Execute script in the current tab
        const result = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => localStorage['persist:root'],
        });
        try {
          const key = JSON.parse(JSON.parse(result[0].result).user).token;
          await debugLog(`Monarch token: ${key}`);
          if (key) {
            await appStorage.patch({ monarchKey: key, lastMonarchAuth: Date.now(), monarchStatus: AuthStatus.Success });
          } else {
            await appStorage.patch({ monarchStatus: AuthStatus.NotLoggedIn });
          }
        } catch (ex) {
          await appStorage.patch({ monarchStatus: AuthStatus.Failure });
          await debugLog(ex);
        }
      }
    } else if (url.hostname == 'www.costco.com') {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => localStorage['idToken'],
      });
      try {
        const token = result[0].result;
        await debugLog(`Costco token: ${token}`);

        if (token) {
          await appStorage.patch({ costcoToken: token, costcoStatus: AuthStatus.Success });
        } else {
          await appStorage.patch({ costcoToken: undefined, costcoStatus: AuthStatus.NotLoggedIn });
        }
      } catch (ex) {
        await appStorage.patch({ costcoStatus: AuthStatus.Failure });
        await debugLog(ex);
      }
    }
  }
});

type Payload = {
  year?: string;
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.tab?.url?.startsWith('chrome://')) {
    return true;
  }

  if (message.action === Action.DryRun) {
    handleDryRun(message.payload, sendResponse);
  } else if (message.action === Action.FullSync) {
    handleFullSync(message.payload, sendResponse);
  } else {
    console.warn(`Unknown action: ${message.action}`);
  }

  return true; // indicates we will send a response asynchronously
});

async function inProgress() {
  const progress = await progressStorage.get();
  return progress.phase !== ProgressPhase.Complete && progress.phase !== ProgressPhase.Idle;
}

async function handleDryRun(payload: Payload | undefined, sendResponse: (args: unknown) => void) {
  if (await inProgress()) {
    sendResponse({ success: false });
    return;
  }
  if (await downloadAndStoreTransactions(payload?.year, true)) {
    sendResponse({ success: true });
    return;
  }
  sendResponse({ success: false });
}

async function handleFullSync(payload: Payload | undefined, sendResponse: (args: unknown) => void) {
  if (await inProgress()) {
    sendResponse({ success: false });
    return;
  }
  if (await downloadAndStoreTransactions(payload?.year, false)) {
    if (await updateMonarchTransactions()) {
      sendResponse({ success: true });
      return;
    }
  }
  sendResponse({ success: false });
}

async function logSyncComplete(payload: Partial<LastSync>) {
  await debugLog('Sync complete');
  await progressStorage.patch({ phase: ProgressPhase.Complete });
  await appStorage.patch({
    lastSync: {
      time: Date.now(),
      amazonOrders: payload.amazonOrders ?? 0,
      monarchTransactions: payload.monarchTransactions ?? 0,
      transactionsUpdated: payload.transactionsUpdated ?? 0,
      success: payload.success ?? false,
      failureReason: payload.failureReason,
      dryRun: payload.dryRun ?? false,
    },
  });
}

async function downloadAndStoreTransactions(yearString?: string, dryRun: boolean = false) {
  await debugStorage.set({ logs: [] });

  const appData = await appStorage.get();
  const year = yearString ? parseInt(yearString) : undefined;

  if (!appData.monarchKey) {
    await logSyncComplete({ success: false, failureReason: FailureReason.NoMonarchAuth });
    return false;
  }

  // START: support for multiple providers
  await progressStorage.set({ phase: ProgressPhase.AmazonPageScan, total: 0, complete: 0 });

  let orders: Order[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiMapping: { [key in Provider]: any } = {
    [Provider.Costco]: null,
    [Provider.Walmart]: null,
    [Provider.Amazon]: amazonApi,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merchantMapping: { [key in Provider]: any } = {
    [Provider.Costco]: null,
    [Provider.Walmart]: null,
    [Provider.Amazon]: appData.options.amazonMerchant,
  };

  for (const orderType in apiMapping) {
    const providerApi = apiMapping[orderType as Provider];
    if (providerApi === null) {
      continue;
    }

    try {
      await debugLog(`Fetching ${orderType} orders`);

      const providerOrders: Order[] = await providerApi.fetchOrders(
        year,
        appData.options.maxPages,
        async (progress: Partial<ProgressState>) => {
          await progressStorage.patch(progress);
        },
      );
      await debugLog(`Fetched ${providerOrders.length} orders for ${orderType}`);
      console.log(providerOrders);

      if (providerOrders && providerOrders.length > 0) {
        orders = orders.concat(providerOrders);
      }
    } catch (e) {
      await debugLog(e);
      await logSyncComplete({ success: false, failureReason: FailureReason.ProviderError });
      return false;
    }
  }
  // END: support for multiple providers

  if (!orders || orders.length === 0) {
    await debugLog('No orders found');
    await logSyncComplete({ success: false, failureReason: FailureReason.NoProviderOrders });
    return false;
  }
  await transactionStorage.patch({
    orders: orders,
  });

  await progressStorage.patch({ phase: ProgressPhase.MonarchDownload, total: 1, complete: 0 });

  let startDate: Date;
  let endDate: Date;
  if (year) {
    startDate = new Date(year - 1, 11, 23);
    endDate = new Date(year + 1, 0, 8);
  } else {
    startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);
    startDate.setDate(startDate.getDate() - 8);
    endDate = new Date();
    endDate.setDate(startDate.getDate() + 8);
  }

  // START: support for multiple providers
  let monarchTransactions: MonarchTransaction[] = [];

  for (const orderType in merchantMapping) {
    const merchant = merchantMapping[orderType as Provider];
    if (merchant === null) {
      continue;
    }

    try {
      await debugLog(`Fetching Monarch transactions for ${orderType}`);

      const providerTransactions: MonarchTransaction[] = await getTransactions(
        appData.monarchKey,
        merchant,
        startDate,
        endDate,
      );

      if (providerTransactions && providerTransactions.length > 0) {
        monarchTransactions = monarchTransactions.concat(providerTransactions);
      }

      await debugLog(`Found ${providerTransactions.length} transactions for ${orderType}`);
      console.log(providerTransactions);
    } catch (ex) {
      await debugLog(ex);
      await logSyncComplete({ success: false, failureReason: FailureReason.MonarchError });
      return false;
    }
  }
  // END: support for multiple providers

  await debugLog(`Found ${monarchTransactions.length} transactions`);

  if (!monarchTransactions || monarchTransactions.length === 0) {
    await logSyncComplete({ success: false, failureReason: FailureReason.NoMonarchTransactions });
    return false;
  }

  await transactionStorage.patch({
    result: TransactionStatus.Success,
    transactions: monarchTransactions,
  });

  if (dryRun) {
    const matches = matchTransactions(monarchTransactions, orders, appData.options);
    await logSyncComplete({
      success: true,
      dryRun: true,
      amazonOrders: orders.length,
      monarchTransactions: monarchTransactions.length,
      transactionsUpdated: matches.length,
    });
    return true;
  }

  return true;
}

async function updateMonarchTransactions() {
  await progressStorage.patch({ phase: ProgressPhase.MonarchUpload, total: 0, complete: 0 });

  const transactions = await transactionStorage.get();
  const appData = await appStorage.get();

  if (!appData.monarchKey) {
    await logSyncComplete({
      success: false,
      failureReason: FailureReason.NoMonarchAuth,
      amazonOrders: transactions.orders.length,
      monarchTransactions: transactions.transactions.length,
    });
    return false;
  }

  const matches = matchTransactions(transactions.transactions, transactions.orders, appData.options);

  for (const data of matches) {
    const itemString = data.amazon.items
      .map(item => {
        return `$${item.price.toFixed(2)} - ${item.orderId} - ${item.title}`;
      })
      .join('\n\n')
      .trim();
    if (itemString.length === 0) {
      await debugLog('No items found for transaction ' + data.monarch.id);
      continue;
    }
    if (data.monarch.notes === itemString) {
      await debugLog('Transaction ' + data.monarch.id + ' already has correct note');
      continue;
    }

    updateMonarchTransaction(appData.monarchKey, data.monarch.id, itemString);
    await debugLog('Updated transaction ' + data.monarch.id + ' with note ' + itemString);
    await progressStorage.patch({
      total: matches.length,
      complete: matches.indexOf(data) + 1,
    });
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  await logSyncComplete({
    success: true,
    amazonOrders: transactions.orders.length,
    monarchTransactions: transactions.transactions.length,
    transactionsUpdated: matches.length,
  });
  await progressStorage.patch({ phase: ProgressPhase.Complete });

  return true;
}
