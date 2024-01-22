import { createStorage, StorageType } from '@src/shared/storages/base';

type State = {
  errors: string[];
};

const exceptionStorage = createStorage<State>(
  'exceptions',
  {
    errors: [],
  },
  {
    storageType: StorageType.Local,
  },
);

export function logException(e: Error) {
  const stack = e.stack;
  if (!stack) {
    return;
  }
  exceptionStorage.set(existing => {
    if (!existing) {
      return {
        errors: [stack],
      };
    }
    const existingErrors = existing.errors ?? [];
    if (existingErrors.length > 9) {
      return {
        errors: [...existingErrors.slice(existingErrors.length - 9, existingErrors.length), stack],
      };
    } else {
      return {
        errors: [...existingErrors, stack],
      };
    }
  });
}

export default exceptionStorage;
