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

export async function debugLog(val: string) {
  await debugStorage.set(state => ({
    logs: (state?.logs ?? []).concat([val]),
  }));
}

export default debugStorage;
