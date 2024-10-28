import { createStorage, StorageType } from '@src/shared/storages/base';
import { Order, MonarchTransaction } from '../types';

export enum TransactionStatus {
  Pending = 'pending',
  Success = 'success',
  Error = 'error',
}

type State = {
  result: TransactionStatus;
  orders: Order[];
  transactions: MonarchTransaction[];
};

const transactionStorage = createStorage<State>(
  'transactions',
  {
    orders: [],
    transactions: [],
    result: TransactionStatus.Pending,
  },
  {
    storageType: StorageType.Local,
    liveUpdate: true,
  },
);

export default transactionStorage;
