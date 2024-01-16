import useStorage from '@root/src/shared/hooks/useStorage';
import appStorage, { mapFailureReasonToMessage } from '@root/src/shared/storages/appStorage';
import { ProgressPhase, ProgressState } from '@root/src/shared/storages/progressStorage';
import { Button, Progress, Spinner } from 'flowbite-react';
import { useCallback } from 'react';
import { FaTimesCircle } from 'react-icons/fa';
import { LuCircleSlash } from 'react-icons/lu';
import { RiCheckboxCircleFill } from 'react-icons/ri';
import { stringify } from 'csv-stringify/browser/esm/sync';
import transactionStorage from '@root/src/shared/storages/transactionStorage';
import { matchTransactions } from '@root/src/shared/api/matchUtil';

export function ProgressIndicator({ progress }: { progress: ProgressState }) {
  const { lastSync } = useStorage(appStorage);

  const lastSyncTime = lastSync ? new Date(lastSync.time).toLocaleString() : 'Never';

  const dryRunDownload = useCallback(async () => {
    const appData = await appStorage.get();
    const transactions = await transactionStorage.get();

    if (!lastSync || !transactions || !lastSync?.dryRun) {
      return;
    }

    const matches = matchTransactions(
      transactions.transactions,
      transactions.orders,
      appData.options.overrideTransactions,
    );
    const contents = matches.map(match => {
      return {
        amazonOrderId: match.amazon.id,
        monarchDate: match.monarch.date,
        amazonDate: match.amazon.date,
        monarchAmount: match.monarch.amount,
        amazonAmount: match.amazon.amount,
        refund: match.amazon.refund,
        items: match.amazon.items,
      };
    });

    const csvData = stringify(contents, { header: true, escape_formulas: true });
    const blob = new Blob([csvData], { type: 'text/csv' });

    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: url,
      filename: 'monarch-amazon-matches.csv',
    });
  }, [lastSync]);

  const inProgress = progress.phase !== ProgressPhase.Complete && progress.phase !== ProgressPhase.Idle;
  return (
    <>
      {inProgress ? (
        <ProgressSpinner progress={progress} />
      ) : lastSync?.success && lastSync?.transactionsUpdated > 0 ? (
        <div className="flex flex-col items-center">
          <RiCheckboxCircleFill className="text-green-300" size={48} />
          <span className="text-small">Last sync: {lastSyncTime}</span>
          <span className="text-small">Amazon orders: {lastSync.amazonOrders}</span>
          <span className="text-small">Monarch transactions: {lastSync.monarchTransactions}</span>
          {lastSync.dryRun ? (
            <div className="flex flex-col">
              <span className="text-small">Would have updated transactions: {lastSync.transactionsUpdated}</span>
              <Button size="xs" outline color="green" onClick={dryRunDownload}>
                Download CSV
              </Button>
            </div>
          ) : (
            <span className="text-small">Updated Transactions: {lastSync.transactionsUpdated}</span>
          )}
        </div>
      ) : lastSync?.success && lastSync?.transactionsUpdated == 0 ? (
        <div className="flex flex-col items-center">
          <LuCircleSlash className="text-green-200" size={48} />
          <span className="text-small">Last sync: {lastSyncTime}</span>
          <span className="text-small">Amazon orders: {lastSync.amazonOrders}</span>
          <span className="text-small">Monarch transactions: {lastSync.monarchTransactions}</span>
          <span className="text-small">No transactions to update</span>
        </div>
      ) : lastSync?.success === false ? (
        <div className="flex flex-col items-center">
          <FaTimesCircle className="text-red-300" size={48} />
          <span className="text-small">Last sync: {lastSyncTime}</span>
          <span className="text-small">Sync failed, please try again</span>
          <span className="text-small text-center">
            Failure reason: {mapFailureReasonToMessage(lastSync.failureReason)}
          </span>
        </div>
      ) : null}
    </>
  );
}

function ProgressSpinner({ progress }: { progress: ProgressState }) {
  const percent = Math.ceil((100 * progress.complete) / progress.total);
  let phase = null;
  let object = null;
  if (progress.phase === ProgressPhase.MonarchUpload) {
    phase = 'Setting Monarch notes';
    object = 'transactions';
  } else if (progress.phase === ProgressPhase.AmazonPageScan) {
    phase = 'Downloading Amazon Orders';
    object = 'pages';
  } else if (progress.phase === ProgressPhase.AmazonOrderDownload) {
    phase = 'Downloading Amazon Orders';
    object = 'orders';
  } else {
    phase = 'Downloading Transactions';
    object = 'transactions';
  }
  const status = `${progress.complete} / ${progress.total} ${object}`;

  return (
    <div className="flex flex-col">
      <div className="self-center">
        <Spinner size="xl" />
      </div>
      <p className="self-center text-slate-500 text-lg">{phase}</p>
      {progress.total > 0 && (
        <>
          <Progress progress={percent} />
          <p className="self-center text-slate-500">{status}</p>
        </>
      )}
    </div>
  );
}

export default ProgressIndicator;
