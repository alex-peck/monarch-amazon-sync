import { Order, OrderTransaction } from './amazonApi';
import { Transaction } from './monarchApi';

export type MatchedTransaction = {
  monarch: Transaction;
  amazon: OrderTransaction;
};

const DAYS_7 = 1000 * 60 * 60 * 24 * 7;

export function matchTransactions(
  transactions: Transaction[],
  orders: Order[],
  override: boolean,
): MatchedTransaction[] {
  const orderTransactions = orders.flatMap(order => {
    return order.transactions.map(transaction => {
      return {
        items: transaction.items,
        refund: transaction.refund,
        amount: transaction.refund ? transaction.amount : transaction.amount * -1,
        date: transaction.date,
        used: false,
        id: order.id,
      };
    });
  });

  // find monarch transactions that match amazon orders. don't allow duplicates
  const monarchAmazonTransactions = [];
  for (const monarchTransaction of transactions) {
    const monarchDate = new Date(monarchTransaction.date);
    let closestAmazon = null;
    let closestDistance = null;
    for (const amazonTransaction of orderTransactions) {
      // we already matched this transaction
      if (amazonTransaction.used) continue;

      const orderDate = new Date(amazonTransaction.date);
      if (isNaN(orderDate.getTime())) continue;

      // look for Monarch transactions that are within 7 days of the Amazon transaction
      const lower = orderDate.getTime() - DAYS_7;
      const upper = orderDate.getTime() + DAYS_7;
      const matchesDate = monarchDate.getTime() >= lower && monarchDate.getTime() <= upper;

      // get the closest transaction
      const distance = Math.abs(monarchDate.getTime() - orderDate.getTime());
      if (
        monarchTransaction.amount === amazonTransaction.amount &&
        matchesDate &&
        (closestDistance === null || distance < closestDistance)
      ) {
        closestAmazon = amazonTransaction;
        closestDistance = distance;
      }
    }

    if (closestAmazon) {
      // Only match if the transaction doesn't have notes
      if (override || !monarchTransaction.notes) {
        monarchAmazonTransactions.push({
          monarch: monarchTransaction,
          amazon: closestAmazon,
        });
      }
      closestAmazon.used = true;
    }
  }

  return monarchAmazonTransactions
    .map(transaction => {
      return {
        amazon: transaction.amazon,
        monarch: transaction.monarch,
      };
    })
    .sort((a, b) => a.monarch.id.localeCompare(b.monarch.id));
}
