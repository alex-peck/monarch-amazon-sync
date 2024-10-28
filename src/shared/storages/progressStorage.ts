import { createStorage, StorageType } from '@src/shared/storages/base';

export enum ProgressPhase {
  Idle = 'idle',
  AmazonPageScan = 'amazon_page_scan',
  AmazonOrderDownload = 'amazon_order_download',
  CostcoPageScan = 'costco_page_scan',
  CostcoOrderDownload = 'costco_order_download',
  WalmartPageScan = 'walmart_page_scan',
  WalmartOrderDownload = 'walmart_order_download',
  MonarchDownload = 'monarch_download',
  MonarchUpload = 'monarch_upload',
  Complete = 'complete',
}

export type ProgressState = {
  phase: ProgressPhase;
  total: number;
  complete: number;
};

const progressStorage = createStorage<ProgressState>(
  'progress',
  {
    phase: ProgressPhase.Idle,
    total: 0,
    complete: 0,
  },
  {
    storageType: StorageType.Local,
    liveUpdate: true,
  },
);

export default progressStorage;
