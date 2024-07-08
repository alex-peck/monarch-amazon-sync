import { createStorage, StorageType } from '@src/shared/storages/base';
import { Order } from '../types';
import { Transaction } from '../api/monarchApi';

export enum TransactionStatus {
  Pending = 'pending',
  Success = 'success',
  Error = 'error',
}

type State = {
  result: TransactionStatus;
  orders: Order[];
  transactions: Transaction[];
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
