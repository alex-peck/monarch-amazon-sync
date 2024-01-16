export type Transaction = {
  id: string;
  amount: number;
  date: string;
  notes: string;
};

export async function updateMonarchTransaction(authKey: string, id: string, note: string) {
  const body = {
    operationName: 'Web_TransactionDrawerUpdateTransaction',
    variables: {
      input: {
        id: id,
        notes: note,
      },
    },
    query: `
      mutation Web_TransactionDrawerUpdateTransaction($input: UpdateTransactionMutationInput!) {
        updateTransaction(input: $input) {
          transaction {
            id
            amount
            pending
            date
          }
          errors {
            fieldErrors {
              field
              messages
            }
            message
            code
          }
        }
      }
    `,
  };

  await graphQLRequest(authKey, body);
}

export async function getTransactions(
  authKey: string,
  merchant: string,
  startDate?: Date,
  endDate?: Date,
): Promise<Transaction[]> {
  const body = {
    operationName: 'Web_GetTransactionsList',
    variables: {
      orderBy: 'date',
      limit: 1000,
      filters: {
        search: merchant,
        categories: [],
        accounts: [],
        startDate: startDate?.toISOString().split('T')[0] ?? undefined,
        endDate: endDate?.toISOString().split('T')[0] ?? undefined,
        tags: [],
      },
    },
    query: `
      query Web_GetTransactionsList($offset: Int, $limit: Int, $filters: TransactionFilterInput, $orderBy: TransactionOrdering) {
        allTransactions(filters: $filters) {
          totalCount
          results(offset: $offset, limit: $limit, orderBy: $orderBy) {
            id
            amount
            pending
            date
            notes
          }
        }
      }
    `,
  };

  const result = await graphQLRequest(authKey, body);
  return result.data.allTransactions.results;
}

async function graphQLRequest(authKey: string, body: unknown) {
  const result = await fetch('https://api.monarchmoney.com/graphql', {
    headers: {
      authorization: 'Token ' + authKey,
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    method: 'POST',
  });
  return await result.json();
}
