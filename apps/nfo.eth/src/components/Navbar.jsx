import React from 'react';
import { Link } from 'react-router';
import { Icon } from '@simplepg/react-components';

export default function Navbar() {
  return (
    <div className="navbar bg-base-100 shadow-sm px-4 rounded-box">
      <div className="navbar-start gap-2">
        <Link to="/" className="btn btn-ghost text-lg font-semibold gap-3">
          <Icon name="external-link" size={6} />
          <span className="tracking-wide">nfo.eth</span>
        </Link>
      </div>
      <div className="navbar-end gap-2">
        <Link to="/" className="btn btn-ghost">Blocks</Link>
        <Link to="/tx/0x..." className="btn btn-ghost">Tx</Link>
        <Link to="/address/0x..." className="btn btn-ghost">Address</Link>
      </div>
    </div>
  );
}
