import { StorageType, createStorage } from '@src/shared/storages/base';

export enum Page {
  Default = 'default',
  Options = 'options',
  ManualBackfill = 'manualBackfill',
}

export enum AuthStatus {
  Pending = 'pending',
  NotLoggedIn = 'notLoggedIn',
  Success = 'success',
  Failure = 'failure',
}

export enum FailureReason {
  Unknown = 'unknown',
  NoProviderOrders = 'noAmazonOrders',
  NoProviderAuth = 'noProviderAuth',
  ProviderError = 'amazonError',
  NoMonarchAuth = 'noMonarchAuth',
  MonarchError = 'monarchError',
  NoMonarchTransactions = 'noMonarchTransactions',
}

export const mapFailureReasonToMessage = (reason: FailureReason | undefined): string => {
  switch (reason) {
    case FailureReason.NoProviderOrders:
      return 'No Amazon orders found';
    case FailureReason.NoProviderAuth:
      return 'Amazon authorization failed';
    case FailureReason.ProviderError:
      return 'An error occurred while fetching Amazon orders';
    case FailureReason.NoMonarchAuth:
      return 'Monarch authorization failed';
    case FailureReason.MonarchError:
      return 'An error occurred while fetching Monarch transactions';
    case FailureReason.NoMonarchTransactions:
      return 'No Monarch transactions found';
    default:
      return 'Unknown';
  }
};

export type LastSync = {
  time: number;
  success: boolean;
  amazonOrders: number;
  monarchTransactions: number;
  transactionsUpdated: number;
  failureReason?: FailureReason | undefined;
  dryRun?: boolean;
};

export type Options = {
  overrideTransactions: boolean;
  amazonMerchant: string;
  walmartMerchant: string;
  syncEnabled: boolean;
  transactionMatchingWindowInDays: number;
  maxPages: number | undefined;
};

type State = {
  page: Page;
  oldestAmazonYear: number | undefined;
  amazonStatus: AuthStatus;
  lastAmazonAuth: number;
  monarchKey?: string;
  monarchStatus: AuthStatus;
  lastMonarchAuth: number;
  lastSync: LastSync | undefined;
  options: Options;
};

const appStorage = createStorage<State>(
  'page',
  {
    page: Page.Default,
    oldestAmazonYear: undefined,
    amazonStatus: AuthStatus.NotLoggedIn,
    lastAmazonAuth: 0,
    monarchKey: undefined,
    monarchStatus: AuthStatus.NotLoggedIn,
    lastMonarchAuth: 0,
    lastSync: undefined,
    options: {
      overrideTransactions: false,
      amazonMerchant: 'Amazon',
      walmartMerchant: 'Walmart',
      syncEnabled: false,
      transactionMatchingWindowInDays: 7,
      maxPages: Infinity,
    },
  },
  {
    storageType: StorageType.Local,
    liveUpdate: true,
  },
);

export default appStorage;
