import { Spinner } from 'flowbite-react';
import { FaTimesCircle } from 'react-icons/fa';
import { RiCheckboxCircleFill } from 'react-icons/ri';

export enum ConnectionStatus {
  Loading,
  Success,
  Error,
}

export type ConnectionInfoProps = {
  status: ConnectionStatus;
  name: string;
  message?: string | undefined;
  lastUpdated: number;
};

function ConnectionInfo({ status, name, message, lastUpdated }: ConnectionInfoProps) {
  const lastUpdatedDate = new Date(lastUpdated);
  return (
    <>
      <div className="flex flex-row items-center">
        {status === ConnectionStatus.Loading ? (
          <Spinner className="h-5 w-5" />
        ) : status === ConnectionStatus.Success ? (
          <RiCheckboxCircleFill className="text-green-300" size={20} />
        ) : (
          <FaTimesCircle className="text-red-300" size={20} />
        )}
        <span className="ml-2 text-base">{name}</span>
      </div>
      <span className="pl-2 self-center text-slate-500 text-xs">
        {status === ConnectionStatus.Loading
          ? 'Loading...'
          : status === ConnectionStatus.Success
            ? `Last updated: ${lastUpdatedDate.toLocaleString()}`
            : 'Not connected'}
      </span>
      {message && <span className="pl-2 self-center text-red-500 text-xs">{message}</span>}
    </>
  );
}

export default ConnectionInfo;
