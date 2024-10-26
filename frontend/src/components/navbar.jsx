import React, { useState, useEffect, useRef } from 'react';
import useDarkMode from '../hooks/useDarkMode';
import { useAccount, usePublicClient, useEnsAvatar, useDisconnect, useEnsName, useChainId } from 'wagmi'
import { useIsEnsOwner } from '../hooks/useIsEnsOwner';
import { useNavigation } from '../hooks/useNavigation';
import { useDomain } from '../hooks/useDomain';
import { usePagePath } from '../hooks/usePagePath';

const Navbar = ({ 
  logo = false, 
  buttons = {},
  label = null
}) => {
  const domain = useDomain();
  const { path } = usePagePath();
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect()
  const { data: ensAvatar } = useEnsAvatar({
    name: domain,
  });
  const { address } = useAccount();
  const { data: ensName } = useEnsName({
    address: address,
  });

  const { goToView, goToEdit, goToPublish, goToSubscription, goToPages, goToViewWithPreview, goToRoot } = useNavigation();

  const [showDomain, setShowDomain] = useState(true);
  const domainRef = useRef(null);
  const navbarRef = useRef(null);

  const handleDisconnect = () => {
    disconnect();
    goToView();
  };

  useEffect(() => {
    // Only update favicon if ensAvatar is available
    if (ensAvatar) {
      const favicon = document.querySelector('link[rel="icon"]');
      if (!favicon) {
        const newFavicon = document.createElement('link');
        newFavicon.rel = 'icon';
        document.head.appendChild(newFavicon);
      }
      
      const faviconElement = favicon || document.querySelector('link[rel="icon"]');
      faviconElement.href = ensAvatar;
    }
  }, [ensAvatar]);

  useEffect(() => {
    const checkOverflow = () => {
      if (domainRef.current && navbarRef.current) {
        const domainElement = domainRef.current;
        const navbarElement = navbarRef.current;
        
        // Get the available width for the center section
        const navbarWidth = navbarElement.offsetWidth;
        const startWidth = navbarElement.querySelector('.navbar-start').offsetWidth;
        const endWidth = navbarElement.querySelector('.navbar-end').offsetWidth;
        const availableWidth = navbarWidth - startWidth - endWidth - 40; // 40px for padding/margins
        
        // Check if domain text would overflow
        const domainWidth = domainElement.scrollWidth;
        setShowDomain(domainWidth <= availableWidth);
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    
    return () => window.removeEventListener('resize', checkOverflow);
  }, [domain]);

  return (
    <div ref={navbarRef} className="navbar bg-base-100 border-b border-base-300 z-[100] relative">
      <div className="navbar-start ml-2">
        {!logo ?
          <div className="dropdown relative z-[100]">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-sm" >
              <svg
                xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </div>
              <ul
                tabIndex={0}
                className="menu menu-sm dropdown-content bg-base-100 rounded-box z-[100] w-52 mt-3 p-2 shadow absolute"
              >
                <li><a onClick={() => { goToPages(); }}>Pages</a></li>
                <li><a onClick={() => { goToSubscription(); }}>Subscription</a></li>
                {isConnected && 
                  <li><a onClick={handleDisconnect}>Disconnect ({ensName || `${address?.slice(0,6)}...${address?.slice(-6)}`})</a></li>
                }
              </ul>
          </div>
          :
          <img 
            src={ensAvatar || "/_assets/images/logo.svg"}
            alt="Logo" 
            className={`h-9 w-9 cursor-pointer ${ensAvatar ? 'mask mask-squircle' : ''}`}
            onClick={goToRoot}
          />
        }
      </div>
      <div className="navbar-center flex items-center justify-center h-full">
        {showDomain && (
          <span 
            ref={domainRef}
            className="text-2xl font-bold cursor-pointer" 
            onClick={goToRoot}
          >
            {domain}
          </span>
        )}
        {label && (
          <span className="text-xs text-gray-500 mr-2 ml-2 italic">({label})</span>
        )}
      </div>
      <div className="navbar-end mr-4">
        <div className="flex gap-2 items-center">
          {buttons.preview && (
            <button 
              className="btn btn-ghost btn-sm"
              onClick={() => { goToViewWithPreview(path) }}
            >
              Preview
            </button>
          )}
          {buttons.publish && (
            <button 
              className="btn btn-ghost btn-sm"
              onClick={() => { goToPublish() }}
            >
              Publish
            </button>
          )}
          {buttons.editLabel && (
            <button 
              className="btn btn-ghost btn-sm"
              onClick={() => { goToEdit(path) }}
            >
              {buttons.editLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Navbar;
