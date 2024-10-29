import { ProgressPhase, updateProgress } from '../storages/progressStorage';
import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import * as Throttle from 'promise-parallel-throttle';
import { debugLog } from '../storages/debugStorage';
import { AuthStatus } from '../storages/appStorage';

const ORDER_PAGES_URL = 'https://www.amazon.com/gp/css/order-history?disableCsd=no-js';
const ORDER_RETURNS_URL = 'https://www.amazon.com/spr/returns/cart';

const ORDER_INVOICE_URL = 'https://www.amazon.com/gp/css/summary/print.html';

export type AmazonInfo = {
  status: AuthStatus;
  startingYear?: number;
};

// Orders are placed on a single date, but can be paid for with multiple transactions
export type Order = {
  id: string;
  date: string;
  items: Item[];
  transactions: OrderTransaction[];
};

export type Item = {
  quantity: number;
  title: string;
  price: number;
};

export type OrderTransaction = {
  id: string;
  amount: number;
  date: string;
  refund: boolean;
};

export async function checkAmazonAuth(): Promise<AmazonInfo> {
  try {
    debugLog('Checking Amazon auth');
    const res = await fetch(ORDER_PAGES_URL);
    await debugLog('Got Amazon auth response' + res.status);
    const text = await res.text();
    const $ = load(text);

    const signIn = $('h1:contains("Sign in")');

    if (signIn.length > 0) {
      await debugLog('Amazon auth failed');
      return {
        status: AuthStatus.NotLoggedIn,
      };
    }

    const yearOptions: string[] = [];
    $('#time-filter')
      .find('option')
      .each((_, el) => {
        if ($(el).attr('value')?.includes('year')) {
          yearOptions.push(el.attribs.value?.trim().replace('year-', ''));
        }
      });
    // find the lowest year
    const lowestYear = Math.min(...yearOptions.map(x => parseInt(x)));

    await debugLog('Amazon auth success');
    return {
      status: AuthStatus.Success,
      startingYear: lowestYear,
    };
  } catch (e) {
    await debugLog('Amazon auth failed with error: ' + e);
    return {
      status: AuthStatus.Failure,
    };
  }
}

export async function fetchOrders(year: number | undefined): Promise<Order[]> {
  let url = ORDER_PAGES_URL;
  if (year) {
    url += `&timeFilter=year-${year}`;
  }
  await debugLog('Fetching orders from ' + url);
  const res = await fetch(url);
  await debugLog('Got orders response ' + res.status);
  const text = await res.text();
  const $ = load(text);

  let endPage = 1;
  $('.a-pagination li').each((_, el) => {
    const page = $(el).text().trim();
    if (!Number.isNaN(page)) {
      const numPage = parseInt(page);
      if (numPage > endPage) {
        endPage = numPage;
      }
    }
  });

  await updateProgress(ProgressPhase.AmazonPageScan, endPage, 0);

  let orderCards = orderCardsFromPage($);
  await debugLog('Found ' + orderCards.length + ' orders');

  await updateProgress(ProgressPhase.AmazonPageScan, endPage, 1);

  for (let i = 2; i <= endPage; i++) {
    const ordersPage = await processOrders(year, i);
    orderCards = orderCards.concat(ordersPage);
    await updateProgress(ProgressPhase.AmazonPageScan, endPage, i);
  }

  const allOrders: Order[] = [];

  const processOrder = async (orderCard: OrderCard) => {
    try {
      const orderData = await fetchOrderDataFromInvoice(orderCard.id);
      if (orderCard.hasRefund) {
        const refundData = await fetchRefundTransactions(orderCard.id);
        if (refundData) {
          orderData.transactions = orderData.transactions.concat(refundData);
        }
      }
      if (orderData) {
        allOrders.push(orderData);
      }
    } catch (e: unknown) {
      await debugLog(e);
    }

    await updateProgress(ProgressPhase.AmazonOrderDownload, orderCards.length, allOrders.length);
  };

  await Throttle.all(orderCards.map(orderCard => () => processOrder(orderCard)));

  console.log(allOrders);

  return allOrders;
}

async function processOrders(year: number | undefined, page: number) {
  const index = (page - 1) * 10;
  let url = ORDER_PAGES_URL + '&startIndex=' + index;
  if (year) {
    url += `&timeFilter=year-${year}`;
  }
  await debugLog('Fetching orders from ' + url);
  const res = await fetch(url);
  await debugLog('Got orders response ' + res.status + ' for page ' + page);
  const text = await res.text();
  const $ = load(text);
  return orderCardsFromPage($);
}

type OrderCard = {
  id: string;
  hasRefund: boolean;
};

// Returns a list of order IDs on the page and whether the order contains a refund
function orderCardsFromPage($: CheerioAPI): OrderCard[] {
  const orders: OrderCard[] = [];
  $('.js-order-card').each((_, el) => {
    try {
      const id = $(el)
        .find('a[href*="orderID="]')
        ?.attr('href')
        ?.replace(/.*orderID=([^&#]+).*/, '$1');
      if (id) {
        const hasRefund = $(el).find('span:contains("Return complete"), span:contains("Refunded")').length > 0;
        orders.push({ id, hasRefund });
      }
    } catch (e: unknown) {
      debugLog(e);
    }
  });
  return orders;
}

async function fetchRefundTransactions(orderId: string): Promise<OrderTransaction[]> {
  await debugLog('Fetching order details ' + orderId);
  const res = await fetch(ORDER_RETURNS_URL + '?orderID=' + orderId);
  await debugLog('Got order invoice response ' + res.status + ' for order ' + orderId);
  const text = await res.text();
  const $ = load(text);

  // TODO: We can parse out individual refunded items here
  const transactions: OrderTransaction[] = [];
  $('span.a-color-secondary:contains("refund issued on")').each((_, el) => {
    const refundLine = $(el).text();
    const refundAmount = refundLine.split('refund')[0].trim();
    const refundDate = refundLine.split('on')[1].replace('.', '').trim();
    transactions.push({
      id: orderId,
      date: refundDate,
      amount: moneyToNumber(refundAmount),
      refund: true,
    });
  });

  return transactions;
}

async function fetchOrderDataFromInvoice(orderId: string): Promise<Order> {
  await debugLog('Fetching order invoice ' + orderId);
  const res = await fetch(ORDER_INVOICE_URL + '?orderID=' + orderId);
  await debugLog('Got order invoice response ' + res.status + ' for order ' + orderId);
  const text = await res.text();
  const $ = load(text);

  const date = $('td b:contains("Order Placed:")')
    .parent()
    .contents()
    .filter(function () {
      return this.type === 'text';
    })
    .text()
    .trim();

  const order = {
    id: orderId,
    date: date,
  };
  console.log(order);

  const items: Item[] = [];
  const transactions: OrderTransaction[] = [];

  // Find the items ordered section and parse the items
  // Orders can span multiple tables by order date
  $('#pos_view_section:contains("Items Ordered")')
    .find('table')
    .find('table')
    .find('table')
    .find('table')
    .each((i, table) => {
      $(table)
        .find('tbody tr')
        .each((j, tr) => {
          // Ignore first line as it's the header
          if (j === 0) {
            return;
          }

          const quantity = $(tr)
            .find('td')
            .eq(0)
            .contents()
            .filter(function () {
              return this.type === 'text';
            })
            .text()
            .replace('of:', '')
            .trim();
          const item = $(tr).find('td').eq(0).find('i').text().trim();
          const price = $(tr).find('td').eq(1).text().trim();
          if (item && price) {
            items.push({
              quantity: parseInt(quantity),
              title: item,
              price: moneyToNumber(price),
            });
          }
        });
    });

  // Find any gift card transactions
  const giftCardAmount = moneyToNumber($('td:contains("Gift Card Amount")').siblings().last().text());
  if (giftCardAmount) {
    transactions.push({
      id: orderId,
      date: order.date,
      amount: giftCardAmount * -1,
      refund: false,
    });
  }

  // Find the transaction total - a single order can span multiple transactions
  $("div:contains('Credit Card transactions')")
    .parent()
    .siblings()
    .last()
    .find('tr')
    .each((i, tr) => {
      const transactionDate = $(tr).find('td:first').text().trim().split(':')[1].replace(':', '').trim();
      const total = $(tr).find('td:last').text().trim();
      transactions.push({
        id: orderId,
        amount: moneyToNumber(total),
        date: transactionDate,
        refund: false,
      });
    });

  return {
    ...order,
    transactions,
    items,
  };
}

export function moneyToNumber(money: string, absoluteValue = true) {
  return parseFloat(money?.replace(absoluteValue ? /[$\s-]/g : /[$\s]/g, ''));
}
