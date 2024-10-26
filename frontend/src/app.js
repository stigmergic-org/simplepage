import React, { useState } from 'react';
import './app.css';
import 'font-awesome/css/font-awesome.min.css';
import { WagmiConfigProvider } from './components/wagmi-provider';
import { BrowserRouter as Router, Routes, Route } from 'react-router';
import { useBasename } from './hooks/useBasename';

import View from './pages/view';
import Edit from './pages/edit';
import Publish from './pages/publish';
import Subscription from './pages/subscription';
import Pages from './pages/pages';
import NotFound from './pages/notfound';
import { ROUTES } from './config/routes';

const App = (props) => {
  const basename = useBasename();

  return (
    <WagmiConfigProvider>
      <Router basename={basename}>
        <Routes>
          <Route path={ROUTES.VIEW} element={<View existingContent={props.existingContent} />} />
          <Route path={ROUTES.EDIT} element={<Edit />} />
          <Route path={ROUTES.PUBLISH} element={<Publish />} />
          <Route path={ROUTES.SUBSCRIPTION} element={<Subscription />} />
          <Route path={ROUTES.PAGES} element={<Pages />} />
          <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
        </Routes>
      </Router>
    </WagmiConfigProvider>
  );
};

export default App;
