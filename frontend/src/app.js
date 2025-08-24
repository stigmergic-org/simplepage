import React, { useEffect } from 'react';
import './app.css';
import 'font-awesome/css/font-awesome.min.css';

import { WagmiConfigProvider } from './components/wagmi-provider';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useBasename } from './hooks/useBasename';
import OverridesBanner from './components/OverridesBanner';
import { useDserviceParam } from './hooks/useDserviceParam';
import { useRpcOverride } from './hooks/useRpcOverride';
import { ScrollProvider } from './contexts/ScrollContext';

import View from './pages/view';
import Edit from './pages/edit';
import Publish from './pages/publish';
import ThemePage from './pages/theme';
import Subscription from './pages/subscription';
import Pages from './pages/pages';
import Files from './pages/files';
import Settings from './pages/settings';
import NotFound from './pages/notfound';
import { ROUTES } from './config/routes';
import { applyTheme, loadTheme } from './utils/theme';

// clear, read, apply theme classes
function App(props) {
  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.body?.classList?.remove('dark', 'light');
    applyTheme(loadTheme()); // sets data-theme on <html>
  }, []);

  const basename = useBasename();
  // Get custom dservice url for new.simplepage.eth
  const customDserviceUrl = useDserviceParam('new.simplepage.eth');
  // Get custom rpc override
  const rpcOverrides = useRpcOverride();

  return (
    <WagmiConfigProvider rpcOverrides={rpcOverrides}>
      {(customDserviceUrl || Object.keys(rpcOverrides).length > 0) && (
        <OverridesBanner dserviceUrl={customDserviceUrl} rpcOverrides={rpcOverrides} />
      )}
      <Router basename={basename}>
        <ScrollProvider>
          <Routes>
            <Route path={ROUTES.VIEW} element={<View existingContent={props.existingContent} />} />
            <Route path={ROUTES.EDIT} element={<Edit />} />
            <Route path={ROUTES.PUBLISH} element={<Publish />} />
            <Route path={ROUTES.THEME} element={<ThemePage />} />
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
}

export default App;