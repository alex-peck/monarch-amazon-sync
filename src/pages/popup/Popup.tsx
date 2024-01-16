import useStorage from '@root/src/shared/hooks/useStorage';
import Options from './Options';
import Main from './Main';
import ManualBackfill from './ManualBackfill';
import { Navbar } from 'flowbite-react';
import appStorage, { Page } from '@root/src/shared/storages/appStorage';

const Popup = () => {
  const storage = useStorage(appStorage);

  let page;
  if (storage.page === Page.Options) {
    page = <Options />;
  } else if (storage.page === Page.ManualBackfill) {
    page = <ManualBackfill />;
  } else {
    page = <Main />;
  }

  return (
    <div className="flex flex-col">
      <Navbar rounded fluid className="py-1">
        <Navbar.Brand>
          <img src="/icon-128.png" className="mr-3 h-6 sm:h-9" alt="logo" />
          <span className="self-center flex-1 whitespace-nowrap text-lg font-semibold dark:text-white">
            Monarch / Amazon Sync
          </span>
        </Navbar.Brand>
        <Navbar.Toggle />
        <Navbar.Collapse>
          <Navbar.Link
            active={storage.page == Page.Default}
            onClick={() => {
              appStorage.patch({ page: Page.Default });
            }}>
            Home
          </Navbar.Link>
          <Navbar.Link
            active={storage.page == Page.Options}
            onClick={() => {
              appStorage.patch({ page: Page.Options });
            }}>
            Options
          </Navbar.Link>
          <Navbar.Link
            active={storage.page == Page.ManualBackfill}
            onClick={() => {
              appStorage.patch({ page: Page.ManualBackfill });
            }}>
            Manual backfill
          </Navbar.Link>
        </Navbar.Collapse>
      </Navbar>
      {page}
    </div>
  );
};

export default Popup;
