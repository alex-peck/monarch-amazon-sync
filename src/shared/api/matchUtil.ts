import { Options } from '../storages/appStorage';
import { debugLog } from '../storages/debugStorage';
import { Order, OrderTransaction } from './amazonApi';
import { Transaction } from './monarchApi';

export type MatchedTransaction = {
  monarch: Transaction;
  amazon: OrderTransaction;
};

export function matchTransactions(
  transactions: Transaction[],
  orders: Order[],
  options: Options,
): MatchedTransaction[] {
  const orderTransactions = orders.flatMap(order => {
    return (
      order.transactions?.map(transaction => {
        return {
          provider: order.provider,
          items: transaction.items,
          refund: transaction.refund,
          amount: transaction.refund ? transaction.amount : transaction.amount * -1,
          date: transaction.date,
          used: false,
          id: order.id,
        };
      }) ?? []
    );
  });

  const days = options.transactionMatchingWindowInDays * 24 * 60 * 60 * 1000;
  debugLog(`Matching transactions within ${options.transactionMatchingWindowInDays} days`);

  // find monarch transactions that match provider orders. don't allow duplicates
  const monarchProviderTransactions = [];
  for (const monarchTransaction of transactions) {
    const monarchDate = new Date(monarchTransaction.date);
    let closestProvider = null;
    let closestDistance = null;
    for (const orderTransaction of orderTransactions) {
      // we already matched this transaction
      if (orderTransaction.used) continue;

      const orderDate = new Date(orderTransaction.date);
      if (isNaN(orderDate.getTime())) continue;

      // look for Monarch transactions that are within X days of the provider transaction
      const lower = orderDate.getTime() - days;
      const upper = orderDate.getTime() + days;
      const matchesDate = monarchDate.getTime() >= lower && monarchDate.getTime() <= upper;

      // get the closest transaction
      const distance = Math.abs(monarchDate.getTime() - orderDate.getTime());
      if (
        monarchTransaction.amount === orderTransaction.amount &&
        matchesDate &&
        (closestDistance === null || distance < closestDistance)
      ) {
        closestProvider = orderTransaction;
        closestDistance = distance;
      }
    }

    if (closestProvider) {
      // Only match if the transaction doesn't have notes
      if (options.overrideTransactions || !monarchTransaction.notes) {
        monarchProviderTransactions.push({
          monarch: monarchTransaction,
          amazon: closestProvider,
        });
      }
      closestProvider.used = true;
    }
  }

  return monarchProviderTransactions
    .map(transaction => {
      return {
        amazon: transaction.amazon,
        monarch: transaction.monarch,
      };
    })
    .sort((a, b) => a.monarch.id.localeCompare(b.monarch.id));
}
