import { createStorage, StorageType } from '@src/shared/storages/base';

type State = {
  logs: string[];
};

const debugStorage = createStorage<State>(
  'debug',
  {
    logs: [],
  },
  {
    storageType: StorageType.Local,
    liveUpdate: true,
  },
);

export async function debugLog(val: unknown) {
  console.log(val);
  let stringValue: string;
  if (typeof val === 'object') {
    stringValue = (val as Error).stack ?? JSON.stringify(val);
  } else if (typeof val === 'string') {
    stringValue = val;
  } else {
    stringValue = val?.toString() || '';
  }
  await debugStorage.set(state => ({
    logs: (state?.logs ?? []).concat([stringValue]),
  }));
}

export default debugStorage;
