import useStorage from '@root/src/shared/hooks/useStorage';
import appStorage from '@root/src/shared/storages/appStorage';
import { Label, TextInput, ToggleSwitch } from 'flowbite-react';
import { useEffect } from 'react';

export function Options() {
  const { options } = useStorage(appStorage);

  useEffect(() => {
    if (!options) {
      appStorage.patch({ options: { overrideTransactions: false, syncEnabled: false, amazonMerchant: 'Amazon' } });
    }
  }, [options]);

  if (!options) {
    return null;
  }

  return (
    <div className="m-3">
      <div className="mb-2 block">
        <Label htmlFor="countries" value="What merchant is Amazon in Monarch?" />
      </div>
      <TextInput
        defaultValue={options?.amazonMerchant}
        className="pb-3"
        type="text"
        id="merchant"
        placeholder="Amazon merchant"
        onChange={element => {
          appStorage.patch({ options: { ...options, amazonMerchant: element.target.value } });
        }}
      />
      <div className="flex flex-col">
        <ToggleSwitch
          checked={options.overrideTransactions}
          label="Override existing notes"
          onChange={value => {
            appStorage.patch({ options: { ...options, overrideTransactions: value } });
          }}
        />
        <span className="mt-1 text-gray-500 text-xs font-normal">
          If you have already added notes to your Amazon transactions, you can choose to override them with the the item
          name if it does not already match.
        </span>
      </div>
    </div>
  );
}

export default Options;
