import { ProgressPhase, ProgressState } from '../storages/progressStorage';
import * as Throttle from 'promise-parallel-throttle';
import { debugLog } from '../storages/debugStorage';
import appStorage, { AuthStatus } from '../storages/appStorage';
import { Item, Order, OrderTransaction, Provider, ProviderInfo } from '../types';

// let ORDER_PAGES_URL = '';
const GRAPHQL_URL = 'https://ecom-api.costco.com/ebusiness/order/v1/orders/graphql';

export async function checkAuth(): Promise<ProviderInfo> {
  await debugLog('Costco auth success');
  return {
    status: AuthStatus.Success,
    startingYear: 2024,
  };

  // try {
  //   // await fetchOrdersURL();
  //   debugLog('Checking Costco auth');
  //   const res = await fetch(ORDER_PAGES_URL);
  //   await debugLog('Got Costco auth response ' + res.status);
  //   const text = await res.text();
  //   const $ = load(text);

  //   const signIn = $('h1:contains("Sign in")');

  //   if (signIn.length > 0) {
  //     await debugLog('Costco auth failed');
  //     return {
  //       status: AuthStatus.NotLoggedIn,
  //     };
  //   }

  //   const yearOptions: string[] = [];
  //   $('#time-filter')
  //     .find('option')
  //     .each((_, el) => {
  //       if ($(el).attr('value')?.includes('year')) {
  //         yearOptions.push(el.attribs.value?.trim().replace('year-', ''));
  //       }
  //     });
  //   // find the lowest year
  //   const lowestYear = Math.min(...yearOptions.map(x => parseInt(x)));

  //   await debugLog('Costco auth success');
  //   return {
  //     status: AuthStatus.Success,
  //     startingYear: lowestYear,
  //   };
  // } catch (e) {
  //   await debugLog('Costco auth failed with error: ' + e);
  //   return {
  //     status: AuthStatus.Failure,
  //   };
  // }
}

// async function fetchOrdersURL(): Promise<void> {
//   const res = await fetch(ACCOUNT_URL, { credentials: 'omit' });
//   const text = await res.text();
//   const $ = load(text);

//   const orderPagesUrl = $('a#header_order_and_returns').attr('href');
//   if (!orderPagesUrl) {
//     throw new Error('Unable to find orders URL');
//   }
//   ORDER_PAGES_URL = orderPagesUrl;
// }

function headers(token: string | undefined) {
  return {
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9,pl;q=0.8,de;q=0.7,es;q=0.6',
    'client-identifier': '481b1aec-aa3b-454b-b81b-48187e28f205',
    'Content-Type': 'application/json-patch+json',
    'costco-x-authorization': `Bearer ${token}`,
    'costco-x-wcs-clientId': '4900eb1f-0c10-4bd9-99c3-c59e6c1ecebf',
    'costco.env': 'ecom',
    'costco.service': 'restOrders',
    'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
  };
}

export async function fetchOrders(
  year: number | undefined,
  maxPages: number | undefined,
  onProgress: (progress: ProgressState) => void,
): Promise<Order[]> {
  // await fetchOrdersURL(); // Ensure the ORDER_PAGES_URL is set

  onProgress({ phase: ProgressPhase.CostcoPageScan, total: 1, complete: 0 });

  year = year || new Date().getFullYear();

  const appData = await appStorage.get();
  const token = appData.costcoToken;
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    credentials: 'omit',
    headers: headers(token),
    referrer: 'https://www.costco.com/',
    referrerPolicy: 'strict-origin-when-cross-origin',
    body: JSON.stringify({
      query: `
        query getOnlineOrders($startDate:String!, $endDate:String!, $pageNumber:Int , $pageSize:Int, $warehouseNumber:String!) {
          getOnlineOrders(startDate:$startDate, endDate:$endDate, pageNumber:$pageNumber, pageSize:$pageSize, warehouseNumber:$warehouseNumber) {
            pageNumber
            pageSize
            totalNumberOfRecords
            bcOrders {
              orderHeaderId
              orderPlacedDate : orderedDate
              orderNumber : sourceOrderNumber
              orderTotal
              warehouseNumber
              status
              emailAddress
              orderCancelAllowed
              orderPaymentFailed : orderPaymentEditAllowed
              orderReturnAllowed
              orderLineItems {
                orderLineItemCancelAllowed
                orderLineItemId
                orderReturnAllowed
                itemId
                itemNumber
                itemTypeId
                lineNumber
                itemDescription
                deliveryDate
                warehouseNumber
                status
                orderStatus
                parentOrderLineItemId
                isFSAEligible
                shippingType
                shippingTimeFrame
                isShipToWarehouse
                carrierItemCategory
                carrierContactPhone
                programTypeId
                isBuyAgainEligible
                scheduledDeliveryDate
                scheduledDeliveryDateEnd
                configuredItemData
                shipment {
                  shipmentId
                  orderHeaderId
                  orderShipToId
                  lineNumber
                  orderNumber
                  shippingType
                  shippingTimeFrame
                  shippedDate
                  packageNumber
                  trackingNumber
                  trackingSiteUrl
                  carrierName
                  estimatedArrivalDate
                  deliveredDate
                  isDeliveryDelayed
                  isEstimatedArrivalDateEligible
                  statusTypeId
                  status
                  pickUpReadyDate
                  pickUpCompletedDate
                  reasonCode
                  trackingEvent {
                    event
                    carrierName
                    eventDate
                    estimatedDeliveryDate
                    scheduledDeliveryDate
                    trackingNumber
                  }
                }
              }
            }
          }
        }
      `,
      variables: {
        pageNumber: 1,
        pageSize: 1,
        startDate: `${year}-2-01`,
        endDate: `${year}-7-31`,
        warehouseNumber: '847',
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch orders: ${res.statusText}`);
  }

  const data = await res.json();
  console.log(data);

  onProgress({ phase: ProgressPhase.AmazonPageScan, total: 1, complete: 1 });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const orders: Order[] = data.data.getOnlineOrders
    .flatMap((orderGroup: any) => orderGroup.bcOrders)
    .map((orderJson: any) => ({
      provider: Provider.Costco,
      id: orderJson.orderNumber,
      date: orderJson.orderPlacedDate,
    }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

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

    onProgress({ phase: ProgressPhase.CostcoOrderDownload, total: orders.length, complete: allOrders.length });
  };

  await Throttle.all(orders.map(order => () => processOrder(order)));

  return allOrders;
}

async function fetchOrderTransactions(order: Order): Promise<Order> {
  const transactions: OrderTransaction[] = [];
  const appData = await appStorage.get();
  const token = appData.costcoToken;

  const orderDetailsQuery = JSON.stringify({
    query: `
      query getOrderDetails($orderNumbers: [String]) {
        getOrderDetails(orderNumbers: $orderNumbers) {
          orderNumber : sourceOrderNumber
          orderPlacedDate : orderedDate
          orderPayment {
            paymentType
            totalCharged
            cardNumber
          }
          shipToAddress : orderShipTos {
            orderLineItems {
              itemDescription : sourceItemDescription
              price : unitPrice
              quantity : orderedTotalQuantity
              merchandiseTotalAmount
              returnableQuantity
              totalReturnedQuantity
            }
          }
        }
      }
    `,
    variables: {
      orderNumbers: [order.id],
    },
  });

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: headers(token),
    referrer: 'https://www.costco.com/',
    referrerPolicy: 'strict-origin-when-cross-origin',
    body: orderDetailsQuery,
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch order details: ${res.statusText}`);
  }

  const data = await res.json();
  await debugLog('Fetched Costco order details:');
  console.log(data);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const orderDetails = data.data.getOrderDetails;
  const items: Item[] = orderDetails.shipToAddress.flatMap((address: any) =>
    address.orderLineItems.map((item: any) => ({
      provider: Provider.Costco,
      orderId: orderDetails.orderNumber,
      title: item.itemDescription,
      price: parseFloat(item.price),
      refunded: item.totalReturnedQuantity > 0, // Inaccurate, could be 2 items, 1 refunded. Should check returnableQuantity also.
    })),
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orderDetails.orderPayment.forEach((payment: any) => {
    if (payment.paymentType === 'Coupon') {
      debugLog(`Skipping $${payment.totalCharged} coupon transaction for order ${orderDetails.orderNumber}`);
      return;
    }

    const transaction = {
      id: orderDetails.orderNumber,
      provider: Provider.Costco,
      date: orderDetails.orderPlacedDate,
      amount: parseFloat(payment.totalCharged),
      refund: false,
      items: items,
    };
    transactions.push(transaction);
    console.log(transaction);
  });

  return {
    ...order,
    transactions,
  };
}
