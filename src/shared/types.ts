import { AuthStatus } from './storages/appStorage';

export enum Action {
  DryRun = 'DRY_RUN',
  FullSync = 'FULL_SYNC',
}

export type ProviderInfo = {
  status: AuthStatus;
  startingYear?: number;
};

export enum Provider {
  Amazon = 'amazon',
  Walmart = 'walmart',
}

export type Order = {
  provider: Provider;
  id: string;
  date: string;
  transactions?: OrderTransaction[];
  walmartStorePurchase?: boolean;
};

export type Item = {
  provider: Provider;
  orderId: string;
  title: string;
  price: number;
  refunded: boolean;
};

export type OrderTransaction = {
  provider: Provider;
  id: string;
  amount: number;
  date: string;
  refund: boolean;
  items: Item[];
};
