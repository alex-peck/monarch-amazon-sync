import { useEffect, useState } from 'react';

export const useAlarm = (alarmName: string) => {
  const [alarm, setAlarm] = useState<chrome.alarms.Alarm | undefined>(undefined);

  useEffect(() => {
    chrome.alarms.get(alarmName, setAlarm);
  }, [alarmName]);

  return alarm;
};
