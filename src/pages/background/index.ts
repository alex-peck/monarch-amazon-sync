import { Order, fetchOrders } from '@root/src/shared/api/amazonApi';
import reloadOnUpdate from 'virtual:reload-on-update-in-background-script';
import 'webextension-polyfill';
import { Transaction, getTransactions, updateMonarchTransaction } from '@root/src/shared/api/monarchApi';
import progressStorage, { ProgressPhase } from '@root/src/shared/storages/progressStorage';
import transactionStorage, { TransactionStatus } from '@root/src/shared/storages/transactionStorage';
import { matchTransactions } from '@root/src/shared/api/matchUtil';
import appStorage, { AuthStatus, FailureReason, LastSync } from '@root/src/shared/storages/appStorage';
import { Action } from '@root/src/shared/types';

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
          if (key) {
            await appStorage.patch({ monarchKey: key, lastMonarchAuth: Date.now(), monarchStatus: AuthStatus.Success });
          } else {
            await appStorage.patch({ monarchStatus: AuthStatus.NotLoggedIn });
          }
        } catch (ex) {
          await appStorage.patch({ monarchStatus: AuthStatus.Failure });
        }
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
  const appData = await appStorage.get();
  const year = yearString ? parseInt(yearString) : undefined;

  if (!appData.monarchKey) {
    await logSyncComplete({ success: false, failureReason: FailureReason.NoMonarchAuth });
    return false;
  }

  await progressStorage.set({ phase: ProgressPhase.AmazonPageScan, total: 0, complete: 0 });

  let orders: Order[];
  try {
    orders = await fetchOrders(year, async progress => {
      await progressStorage.patch(progress);
    });
  } catch {
    await logSyncComplete({ success: false, failureReason: FailureReason.NoAmazonAuth });
    return false;
  }

  if (!orders || orders.length === 0) {
    await logSyncComplete({ success: false, failureReason: FailureReason.NoAmazonOrders });
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

  let monarchTransactions: Transaction[];
  try {
    monarchTransactions = await getTransactions(appData.monarchKey, appData.options.amazonMerchant, startDate, endDate);
    if (!monarchTransactions || monarchTransactions.length === 0) {
      await logSyncComplete({ success: false, failureReason: FailureReason.NoMonarchTransactions });
      return false;
    }
  } catch (ex) {
    console.log(ex);
    await logSyncComplete({ success: false, failureReason: FailureReason.MonarchError });
    return false;
  }

  await transactionStorage.patch({
    result: TransactionStatus.Success,
    transactions: monarchTransactions,
  });

  if (dryRun) {
    const matches = matchTransactions(monarchTransactions, orders, appData.options.overrideTransactions);
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

  const matches = matchTransactions(
    transactions.transactions,
    transactions.orders,
    appData.options.overrideTransactions,
  );

  for (const data of matches) {
    const itemString = data.amazon.items
      .map(item => {
        return item.title + ' - $' + item.price;
      })
      .join('\n\n')
      .trim();
    if (itemString.length === 0) continue;
    if (data.monarch.notes === itemString) continue;

    updateMonarchTransaction(appData.monarchKey, data.monarch.id, itemString);
    console.log('Updated transaction ' + data.monarch.id + ' with note ' + itemString);
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
