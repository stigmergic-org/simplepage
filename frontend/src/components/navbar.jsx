import React, { useState, useEffect, useRef } from 'react';
import { useEnsAvatar } from 'wagmi'
import { useNavigation } from '../hooks/useNavigation';
import { useDomain } from '../hooks/useDomain';
import { usePagePath } from '../hooks/usePagePath';
import { useScrollContext } from '../contexts/ScrollContext';
import { ICONS } from '../config/icons';

const Navbar = ({
  activePage,
}) => {
  const domain = useDomain();
  const { path } = usePagePath();
  const { data: ensAvatar } = useEnsAvatar({
    name: domain,
  });

  const { goToView, goToEdit, goToPublish, goToSubscription, goToPages, goToFiles, goToViewWithPreview, goToRoot } = useNavigation();
  const { saveScrollPosition, getScrollPosition, clearScrollPosition } = useScrollContext();

  const tabsContainerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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
      label: 'Subscription',
      onClick: () => goToSubscription(),
      ...ICONS['credit-card'],
    },
    {
      label: 'Quit editor',
      onClick: () => handleQuitClick(),
      ...ICONS.exit,
    },
  ]

  // Define available tabs with their navigation functions and icons
  const availableTabs = {
    'Preview': {
      onClick: () => goToViewWithPreview(path),
      ...ICONS.preview,
    },
    'Edit': {
      onClick: () => goToEdit(path),
      ...ICONS.edit,
    },
    'Pages': {
      onClick: () => goToPages(path),
      ...ICONS.document,
    },
    'Files': {
      onClick: () => goToFiles(path),
      ...ICONS.folder,
    },
    'Publish': {
      onClick: () => goToPublish(),
      ...ICONS.upload,
    }
  };

  // Check if in edit mode
  const editMode = activePage && (availableTabs.hasOwnProperty(activePage) || availableMenuItems.find(i => i.label === activePage));


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

  return (
    <div className="relative z-[100] border-b bg-base-100 border-base-300">
      <div className="navbar z-[100] relative">
        <div className="navbar-start ml-2">
          <img
            src={ensAvatar || "/_assets/images/logo.svg"}
            alt="Logo"
            className={`h-9 w-9 cursor-pointer ${ensAvatar ? 'mask mask-squircle' : ''}`}
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
            {!editMode ? (
              <button
                className="btn btn-ghost btn-sm rainbow-fork text-lg"
                onClick={() => { goToEdit(path) }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                >
                  <defs>
                    <mask id="fork-mask">
                      <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" fill="white"/>
                    </mask>
                  </defs>
                </svg>
                {'fork'}
              </button>
            ) : (<>
                {/* Hamburger menu */}
                <div className="dropdown dropdown-end relative z-[100]">
                  <div tabIndex={0} role="button" className="btn btn-ghost btn-sm" >
                    <img
                      src={ICONS.hamburger.src}
                      alt={ICONS.hamburger.alt}
                      className="h-5 w-5"
                    />
                  </div>
                  <ul
                    tabIndex={0}
                    className="menu menu-sm dropdown-content bg-base-100 rounded-box z-[100] mt-3 p-2 shadow absolute w-max"
                  >
                    {availableMenuItems.map((item) => (
                      <li key={item.label}>
                        <a onClick={item.onClick}>
                          <img
                            src={item.src}
                            alt={item.alt}
                            className="w-4 h-4 dark:invert"
                          />
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
                    <img
                      src={availableTabs[tab].src}
                      alt={availableTabs[tab].alt}
                      className={`w-4 h-4 dark:invert opacity-${activePage === tab ? '100' : '50'} group-hover:opacity-100`}
                    />
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
  );
};

export default Navbar;
