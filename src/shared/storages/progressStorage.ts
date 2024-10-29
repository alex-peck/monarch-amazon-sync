import { createStorage, StorageType } from '@src/shared/storages/base';

export enum ProgressPhase {
  Idle = 'idle',
  AmazonPageScan = 'amazon_page_scan',
  AmazonOrderDownload = 'amazon_order_download',
  MonarchDownload = 'monarch_download',
  MonarchUpload = 'monarch_upload',
  Complete = 'complete',
}

export type ProgressState = {
  phase: ProgressPhase;
  total: number;
  complete: number;
  lastUpdated?: number;
};

export async function updateProgress(phase: ProgressPhase, total: number, complete: number) {
  await progressStorage.set({
    phase,
    total,
    complete,
    lastUpdated: Date.now(),
  });
}

const progressStorage = createStorage<ProgressState>(
  'progress',
  {
    phase: ProgressPhase.Idle,
    total: 0,
    complete: 0,
    lastUpdated: 0,
  },
  {
    storageType: StorageType.Local,
    liveUpdate: true,
  },
);

export default progressStorage;
