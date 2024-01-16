import { ProgressPhase, ProgressState } from '../storages/progressStorage';
import { load } from 'cheerio';
import * as Throttle from 'promise-parallel-throttle';

const ORDER_PAGES_URL = 'https://www.amazon.com/gp/css/order-history';
const ORDER_DETAILS_URL = 'https://www.amazon.com/gp/your-account/order-details';

export type AmazonInfo = {
  success: boolean;
  startingYear?: number;
};

export type Order = {
  items: string[];
  used?: boolean;
  transactions: OrderTransaction[];
};

export type OrderTransaction = {
  id: string;
  amount: number;
  date: string;
  refund: boolean;
  items: string[];
};

export async function checkAmazonAuth(): Promise<AmazonInfo> {
  try {
    const res = await fetch(ORDER_PAGES_URL);
    const text = await res.text();
    const $ = load(text);

    const signIn = $('#signInSubmit');

    if (signIn.length > 0) {
      return {
        success: false,
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

    return {
      success: true,
      startingYear: lowestYear,
    };
  } catch {
    return {
      success: false,
    };
  }
}

export async function fetchOrders(
  year: number | undefined,
  onProgress: (progress: ProgressState) => void,
): Promise<Order[]> {
  let url = ORDER_PAGES_URL;
  if (year) {
    url += `?timeFilter=year-${year}`;
  }
  const res = await fetch(url);
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

  onProgress({ phase: ProgressPhase.AmazonPageScan, total: endPage, complete: 0 });

  let orders: string[] = [];
  $('.order-card').each((_, el) => {
    const order = $(el).find('.yohtmlc-order-id')?.text().trim().replace('\n', '').split('#')[1].trim();
    if (order) {
      orders.push(order);
    }
  });

  onProgress({ phase: ProgressPhase.AmazonPageScan, total: endPage, complete: 1 });

  for (let i = 2; i <= endPage; i++) {
    const ordersPage = await processOrders(year, i);
    orders = orders.concat(ordersPage);
    onProgress({ phase: ProgressPhase.AmazonPageScan, total: endPage, complete: i });
  }

  const allOrders: Order[] = [];

  const processOrder = async (order: string) => {
    const orderData = await fetchOrderNew(order);
    if (orderData) {
      allOrders.push(orderData);
    }
    onProgress({ phase: ProgressPhase.AmazonOrderDownload, total: orders.length, complete: allOrders.length });
    return 'test';
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
  const res = await fetch(url);
  const text = await res.text();
  const $ = load(text);

  const orders: string[] = [];
  $('.order-card').each((_, el) => {
    const order = $(el).find('.yohtmlc-order-id')?.text().trim().replace('\n', '').split('#')[1].trim();
    if (order) {
      orders.push(order);
    }
  });

  return orders;
}

async function fetchOrderNew(order: string): Promise<Order> {
  const res = await fetch(ORDER_DETAILS_URL + '?orderID=' + order);
  const text = await res.text();
  const $ = load(text);

  const items: string[] = [];
  $('.yohtmlc-item').each((_, el) => {
    const item = $(el).find('.a-link-normal').first()?.text()?.trim();
    if (item) {
      items.push(item);
    }
  });

  const transactions: OrderTransaction[] = [];

  const fullDetails = $('.a-expander-inline-content ').first();
  $(fullDetails)
    .find('.a-row')
    .each((_, el) => {
      const line = $(el).text().trim().replaceAll('\n', '');
      if (line.includes('Items shipped')) {
        const dateAndAmount = line.split('shipped:')[1].trim();
        const date = dateAndAmount.split('-')[0].trim();
        const amount = parseFloat(dateAndAmount.split('-')[1].split('$')[1].trim());
        transactions.push({
          id: order,
          date,
          amount,
          refund: false,
          items,
        });
      } else if (line.includes('Refund: Completed')) {
        const dateAndAmount = line.split(': Completed')[1].trim();
        const date = dateAndAmount.split('-')[0].trim();
        const amount = parseFloat(dateAndAmount.split('-')[1].split('$')[1].trim());
        transactions.push({
          id: order,
          date,
          amount,
          refund: true,
          items,
        });
      }
    });

  return {
    transactions,
    items,
  };
}
