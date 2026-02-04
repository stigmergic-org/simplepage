import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router';
import './app.css';
import 'font-awesome/css/font-awesome.min.css';
import { WagmiConfigProvider } from './components/wagmi-provider';
import { useBasename } from './hooks/useBasename';
import { OverridesBanner, useDserviceParam, useRpcOverride } from '@simplepg/react-components';
import { useApplyThemeFromSettings } from './hooks/useApplyTheme';
import { ScrollProvider } from './contexts/ScrollContext';

import View from './pages/view';
import Edit from './pages/edit';
import Publish from './pages/publish';
import Subscription from './pages/subscription';
import Pages from './pages/pages';
import Files from './pages/files';
import Settings from './pages/settings';
import NotFound from './pages/notfound';
import { ROUTES } from './config/routes';


// Must run inside WagmiConfigProvider
const ThemeBooter = () => {
  useApplyThemeFromSettings();
  return null;
};

const App = (props) => {
  const basename = useBasename();
  const customDserviceUrl = useDserviceParam('new.simplepage.eth');
  const rpcOverrides = useRpcOverride();

  return (
    <WagmiConfigProvider rpcOverrides={rpcOverrides}>
      <ThemeBooter />
      {(customDserviceUrl || Object.keys(rpcOverrides).length > 0) && (
        <OverridesBanner dserviceUrl={customDserviceUrl} rpcOverrides={rpcOverrides} />
      )}
      <Router basename={basename}>
        <ScrollProvider>
          <Routes>
            <Route path={ROUTES.VIEW} element={<View existingContent={props.existingContent} />} />
            <Route path={ROUTES.EDIT} element={<Edit />} />
            <Route path={ROUTES.PUBLISH} element={<Publish />} />
            <Route path={ROUTES.SUBSCRIPTION} element={<Subscription />} />
            <Route path={ROUTES.PAGES} element={<Pages />} />
            <Route path={ROUTES.FILES} element={<Files />} />
            <Route path={ROUTES.SETTINGS} element={<Settings />} />
            <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
          </Routes>
        </ScrollProvider>
      </Router>
    </WagmiConfigProvider>
  );
};

export default App;
