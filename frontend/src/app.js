import React, { useState } from 'react';
import './app.css';
import 'font-awesome/css/font-awesome.min.css';
import { WagmiConfigProvider } from './components/wagmi-provider';
import { BrowserRouter as Router, Routes, Route } from 'react-router';
import { useBasename } from './hooks/useBasename';
import OverridesBanner from './components/OverridesBanner';
import { useDserviceParam } from './hooks/useDserviceParam';
import { useRpcOverride } from './hooks/useRpcOverride';
import { ScrollProvider } from './contexts/ScrollContext';

import View from './pages/view';
import Edit from './pages/edit';
import Publish from './pages/publish';
import Subscription from './pages/subscription';
import Pages from './pages/pages';
import NotFound from './pages/notfound';
import { ROUTES } from './config/routes';

const App = (props) => {
  const basename = useBasename();
  // Get custom dservice url for new.simplepage.eth
  const customDserviceUrl = useDserviceParam('new.simplepage.eth');
  // Get custom rpc overrides
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
            <Route path={ROUTES.SUBSCRIPTION} element={<Subscription />} />
            <Route path={ROUTES.PAGES} element={<Pages />} />
            <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
          </Routes>
        </ScrollProvider>
      </Router>
    </WagmiConfigProvider>
  );
};

export default App;
