import { ProgressPhase, ProgressState } from '../storages/progressStorage';
import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import * as Throttle from 'promise-parallel-throttle';
import { debugLog } from '../storages/debugStorage';
import { AuthStatus } from '../storages/appStorage';
import { Order, Item, OrderTransaction } from './amazonApi';
import { Provider } from '@root/src/pages/background';

const ORDER_PAGES_URL = 'https://www.walmart.com/orders';
const ORDER_DETAILS_URL = 'https://www.walmart.com/orders/{orderID}?storePurchase={storePurchase}';

export type WalmartInfo = {
  status: AuthStatus;
  startingYear?: number;
};

export async function checkWalmartAuth(): Promise<WalmartInfo> {
  try {
    debugLog('Checking Walmart auth');
    const res = await fetch(ORDER_PAGES_URL);
    await debugLog('Got Walmart auth response' + res.status);
    const text = await res.text();
    const $ = load(text);

    const signIn = $('.mw3:contains("Sign In")');

    if (signIn.length > 0) {
      await debugLog('Walmart auth failed');
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

    await debugLog('Walmart auth success');
    return {
      status: AuthStatus.Success,
      startingYear: lowestYear,
    };
  } catch (e) {
    await debugLog('Walmart auth failed with error: ' + e);
    return {
      status: AuthStatus.Failure,
    };
  }
}

export async function fetchOrders(
  year: number | undefined,
  maxPages: number | undefined,
  onProgress: (progress: ProgressState) => void,
): Promise<Order[]> {
  let url = ORDER_PAGES_URL;
  if (year) {
    url += `?timeFilter=year-${year}`;
  }
  await debugLog('Fetching orders from ' + url);
  const res = await fetch(url);
  await debugLog('Got orders response ' + res.status);
  const text = await res.text();
  const $ = load(text);

  // Walmart doesn't have a paginator, so we can't determine the number of pages. We're limited to 5 orders on the first page.
  // We could try obtaining a cursor and fetching orders that way.
  let endPage = 1;

  if (maxPages && maxPages < endPage) {
    endPage = maxPages;
  }

  onProgress({ phase: ProgressPhase.WalmartPageScan, total: endPage, complete: 0 });

  let orders = orderListFromPage($);
  await debugLog('Found ' + orders.length + ' orders');

  onProgress({ phase: ProgressPhase.WalmartPageScan, total: endPage, complete: 1 });

  for (let i = 2; i <= endPage; i++) {
    const ordersPage = await processOrders(year, i);
    orders = orders.concat(ordersPage);
    onProgress({ phase: ProgressPhase.WalmartPageScan, total: endPage, complete: i });
  }

  const allOrders: Order[] = [];

  const processOrder = async (order: Order) => {
    try {
      const orderData = await fetchOrderTransactions(order);
      if (orderData) {
        allOrders.push(orderData);
      }
    } catch (e: unknown) {
      await debugLog(e);
    }

    onProgress({ phase: ProgressPhase.WalmartOrderDownload, total: orders.length, complete: allOrders.length });
  };

  await Throttle.all(orders.map(order => () => processOrder(order)));

  return allOrders;
}

async function processOrders(year: number | undefined, page: number) {
  const index = (page - 1) * 10;
  let url = ORDER_PAGES_URL + '?startIndex=' + index;
  if (year) {
    url += `&timeFilter=year-${year}`;
  }
  await debugLog('Fetching orders from ' + url);
  const res = await fetch(url);
  await debugLog('Got orders response ' + res.status + ' for page ' + page);
  const text = await res.text();
  const $ = load(text);
  return orderListFromPage($);
}

function orderListFromPage($: CheerioAPI): Order[] {
  const orders: Order[] = [];

  $('[data-testid^="orderGroup-"]').each((_, el) => {
    try {
      const returnLink = $(el).find('a[link-identifier="Start a return"]')?.attr('href');
      const id = returnLink?.replace(/.*orders\/([^/]+)\/.*/, '$1');
      const walmartStorePurchase = returnLink?.includes('orderSource=STORE');

      if (!id) {
        debugLog('No order ID found in orderGroup-* element');
        return;
      }

      const dateText = $(el).find('h3').text().trim();
      const dateMatch = dateText.match(/(\w+ \d{2}, \d{4}) purchase/);
      const date = dateMatch ? dateMatch[1] : '';

      orders.push({
        id,
        date,
        provider: Provider.Walmart,
        walmartStorePurchase,
      });
    } catch (e: unknown) {
      debugLog(e);
    }
  });

  // Add a dummy order with a refund for testing
  // orders.push({
  //   id: '200010009468360',
  //   date: 'Jun 29, 2022',  // Use the appropriate date
  //   type: OrderType.Walmart,
  //   walmartStorePurchase: false,  // Since it's a non-store purchase
  // });

  return orders;
}

async function fetchOrderTransactions(order: Order): Promise<Order> {
  const orderUrl = ORDER_DETAILS_URL.replace('{orderID}', order.id).replace(
    '{storePurchase}',
    order.walmartStorePurchase ? 'true' : 'false',
  );

  await debugLog('Fetching order ' + order.id + ' from ' + orderUrl);
  const res = await fetch(orderUrl);
  await debugLog('Got order response ' + res.status + ' for order ' + order.id);
  const text = await res.text();
  const $ = load(text);

  const items: Item[] = [];

  // Parse items in all sections
  $('[data-testid="itemtile-stack"]').each((_, el) => {
    const itemTitle = $(el).find('[data-testid="productName"]').first()?.text()?.trim();
    const itemPriceText = $(el).find('.column3 .f5.b.black.tr').first()?.text()?.trim();
    const itemPrice = itemPriceText ? parseFloat(itemPriceText.replace(/[^0-9.-]+/g, '')) : 0;
    const isRefunded = $(el)
      .closest('[data-testid^="category-accordion"]')
      .find('[data-testid="category-label"]')
      .text()
      .includes('Refunded');

    if (itemTitle) {
      items.push({
        provider: Provider.Walmart,
        orderId: order.id,
        title: itemTitle,
        price: itemPrice,
        refunded: isRefunded,
      });
    }

    debugLog(`Found ${isRefunded ? 'refunded' : 'fulfilled'} item for order ${order.id}: ${itemTitle} - $${itemPrice}`);
  });

  debugLog(`Found ${items.length} items for order ${order.id}`);

  const transactions: OrderTransaction[] = [];

  // Parse order transactions
  $('[data-testid^="orderGroup-"], .print-bill-body').each((_, el) => {
    const dateText = $(el).find('h1.print-bill-date').text().trim();
    const dateMatch = dateText.match(/(\w+ \d{2}, \d{4}) (order|purchase)/);
    const date = dateMatch ? dateMatch[1] : '';

    const amountText = $(el).find('.bill-order-total-payment h2').last().text().trim();
    const amount = amountText ? parseFloat(amountText.replace(/[^0-9.-]+/g, '')) : 0;

    const refund = $(el).find('[data-testid="category-label"]').text().includes('Refunded');

    transactions.push({
      id: order.id,
      provider: Provider.Walmart,
      date,
      amount,
      refund,
      items: items.filter(item => item.refunded === refund),
    });

    debugLog(
      `Found transaction for order ${order.id} with date ${date}, amount ${amount}, refund ${refund}, and ${items.length} items`,
    );
  });

  debugLog('Found ' + transactions.length + ' transactions for order ' + order.id);

  return {
    ...order,
    transactions,
  };
}
