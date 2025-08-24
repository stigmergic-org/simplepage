import React, { useState, useEffect, useRef } from 'react';
import { useEnsAvatar } from 'wagmi'
import { useNavigation } from '../hooks/useNavigation';
import { useDomain } from '../hooks/useDomain';
import { usePagePath } from '../hooks/usePagePath';
import { useScrollContext } from '../contexts/ScrollContext';
import { useRepo } from '../hooks/useRepo';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import Notice from './Notice';

const defaultLogo = "/_assets/images/logo.svg";

const Navbar = ({
  activePage,
}) => {
  const navigate = useNavigate();
  const domain = useDomain();
  const { path } = usePagePath();
  const { data: ensAvatar } = useEnsAvatar({
    name: domain,
  });
  const { repo, dserviceFailed, rpcFailed } = useRepo();

  const { goToView, goToEdit, goToPublish, goToTheme, goToSubscription, goToPages, goToFiles, goToViewWithPreview, goToRoot, goToSettings } = useNavigation();
  const { saveScrollPosition, getScrollPosition, clearScrollPosition } = useScrollContext();

  const tabsContainerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [avatarPath, setAvatarPath] = useState(document.querySelector('link[rel="icon"]')?.href || defaultLogo);
  const [forkStyle, setForkStyle] = useState('rainbow');

  useEffect(() => {
    const loadForkStyle = async () => {
      if (repo) {
        const settings = await repo.settings.read();
        setForkStyle(settings?.appearance?.forkStyle || 'rainbow');
      }
    };
    loadForkStyle();
  }, [repo]);

  // Handle quit button click - clear scroll position and navigate to view
  const handleQuitClick = () => {
    clearScrollPosition('navbar-tabs');
    goToView();
  };

  // Check scroll position for indicators
  const checkScrollPosition = () => {
    if (tabsContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  const availableMenuItems = [
    {
      label: 'Settings',
      onClick: () => goToSettings(),
      icon: 'settings',
    },
    {
      label: 'Subscription',
      onClick: () => goToSubscription(),
      icon: 'credit-card',
    },
    {
      label: 'Quit editor',
      onClick: () => handleQuitClick(),
      icon: 'exit',
    },
  ]

  // Define available tabs with their navigation functions and icons
  const availableTabs = {
    'Preview': {
      onClick: () => goToViewWithPreview(path),
      icon: 'preview',
    },
    'Edit': {
      onClick: () => goToEdit(path),
      icon: 'edit',
    },
    'Pages': {
      onClick: () => goToPages(path),
      icon: 'document',
    },
    'Files': {
      onClick: () => goToFiles(path),
      icon: 'folder',
    },
    'Publish': {
      onClick: () => goToPublish(),
      icon: 'upload',
    },
     'Theme': {
      onClick: () => goToTheme(),
      icon: 'palette',
    }
  };

  // Check if in edit mode
  const editMode = activePage && (availableTabs.hasOwnProperty(activePage) || availableMenuItems.find(i => i.label === activePage));


  useEffect(() => {
    // Only update favicon if ensAvatar is available
    if (ensAvatar) {
      setAvatarPath(ensAvatar);
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

  // Set up scroll listeners for tabs
  useEffect(() => {
    if (editMode && tabsContainerRef.current) {
      const container = tabsContainerRef.current;

      // Restore scroll position if available
      const savedScrollPosition = getScrollPosition('navbar-tabs');
      if (savedScrollPosition > 0) {
        container.scrollLeft = savedScrollPosition;
      }

      checkScrollPosition();

      const handleScroll = () => {
        checkScrollPosition();
        // Save scroll position
        saveScrollPosition('navbar-tabs', container.scrollLeft);
      };

      container.addEventListener('scroll', handleScroll);
      window.addEventListener('resize', checkScrollPosition);

      return () => {
        container.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', checkScrollPosition);
      };
    }
  }, [editMode, saveScrollPosition, getScrollPosition]);

  const forkButton = forkStyle && (
    <div className="tooltip tooltip-bottom" data-tip={forkStyle === 'plain' ? 'Fork' : ''}>
      <button
        className={`btn btn-sm ${forkStyle === 'rainbow' ? 'btn-ghost rainbow-fork' : 'bg-transparent'} text-lg`}
        onClick={() => { goToEdit(path) }}
      >
        {forkStyle === 'rainbow' ? (<>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            width="16"
            height="16"
          >
            <defs>
              <mask id="fork-mask">
                <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" fill="white" />
              </mask>
            </defs>
          </svg>
          fork
        </>) : (
          <Icon name="fork" size={4} />
        )}
      </button>
    </div>
  )

  return (<>
    {dserviceFailed && (
      <Notice type="warning" className="z-50">
        <strong>Failed to connect to DService.</strong> If you have access to a DService endpoint, you can set it in the URL as <code>?ds-new.simplepage.eth=your-dservice.com</code>
      </Notice>
    )}
    {rpcFailed && (
      <Notice type="warning" className="z-50">
        <strong>Failed to connect to RPC.</strong> If you have access to a ethereum RPC endpoint, you can set it in the URL as <code>?ds-rpc-1=your-rpc.com</code>
      </Notice>
    )}
    <div className="relative z-[100] border-b bg-base-100 border-base-300">
      <div className="navbar z-[100] relative">
        <div className="navbar-start ml-2">
          <img
            src={avatarPath}
            alt="Logo"
            className={`h-9 w-9 cursor-pointer ${avatarPath.includes(defaultLogo) ? '' : 'mask mask-squircle'}`}
            onClick={goToRoot}
          />
        </div>
        <div className="navbar-center flex items-center justify-center h-full">
          <span
            className="text-base font-bold cursor-pointer"
            onClick={goToRoot}
          >
            {domain}
          </span>
        </div>
        <div className="navbar-end mr-4">
          <div className="flex gap-2 items-center">
            {/* Fork button */}
            {!editMode ? forkButton : (<>
                {/* Hamburger menu */}
                <div className="dropdown dropdown-end relative z-[100]">
                  <div tabIndex={0} role="button" className="btn btn-ghost btn-sm" >
                    <Icon name="hamburger" size={5} />
                  </div>
                  <ul
                    tabIndex={0}
                    className="menu menu-sm dropdown-content bg-base-100 rounded-box z-[100] mt-3 p-2 shadow absolute w-max"
                  >
                    {availableMenuItems.map((item) => (
                      <li key={item.label}>
                        <a onClick={item.onClick}>
                          <Icon name={item.icon} />
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
            </>)}
          </div>
        </div>
      </div>
      {editMode && (
        <div className="relative">
          {/* Left scroll indicator */}
          {canScrollLeft && (
            <div className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 z-10 text-base-content/60 text-sm">
              ⟨
            </div>
          )}
          <div className="overflow-x-auto" ref={tabsContainerRef}>
            <div className="tabs tabs-border min-w-max">
              {Object.keys(availableTabs).map((tab) => (
                <a
                  key={tab}
                  role="tab"
                  className={`tab group ${activePage === tab ? 'tab-active' : ''}`}
                  onClick={() => availableTabs[tab].onClick()}
                >
                  <span className="mr-1">
                    <Icon name={availableTabs[tab].icon} className={`opacity-${activePage === tab ? '100' : '50'} group-hover:opacity-100`} />
                  </span>
                  {tab}
                </a>
              ))}
            </div>
          </div>
          {/* Right scroll indicator */}
          {canScrollRight && (
            <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 z-10 text-base-content/60 text-sm">
              ⟩
            </div>
          )}
        </div>
      )}
    </div>
  </>);
};

export default Navbar;
