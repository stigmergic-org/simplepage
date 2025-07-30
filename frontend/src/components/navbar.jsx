import React, { useState, useEffect, useRef } from 'react';
import { useEnsAvatar } from 'wagmi'
import { useNavigation } from '../hooks/useNavigation';
import { useDomain } from '../hooks/useDomain';
import { usePagePath } from '../hooks/usePagePath';
import { useScrollContext } from '../contexts/ScrollContext';

const Navbar = ({
  activeTab
}) => {
  const domain = useDomain();
  const { path } = usePagePath();
  const { data: ensAvatar } = useEnsAvatar({
    name: domain,
  });

  const { goToView, goToEdit, goToPublish, goToSubscription, goToPages, goToViewWithPreview, goToRoot } = useNavigation();
  const { saveScrollPosition, getScrollPosition, clearScrollPosition } = useScrollContext();

  const [showDomain, setShowDomain] = useState(true);
  const domainRef = useRef(null);
  const navbarRef = useRef(null);
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

  // Define available tabs with their navigation functions and icons
  const availableTabs = {
    'Preview': {
      onClick: () => goToViewWithPreview(path),
      icon: <img src="/images/icons/preview.svg" alt="👁️" className="w-4 h-4" />
    },
    'Edit': {
      onClick: () => goToEdit(path),
      icon: <img src="/images/icons/edit.svg" alt="✏️" className="w-4 h-4" />
    },
    'Pages': {
      onClick: () => goToPages(path),
      icon: <img src="/images/icons/document.svg" alt="📄" className="w-4 h-4" />
    },
    'Subscription': {
      onClick: () => goToSubscription(),
      icon: <img src="/images/icons/credit-card.svg" alt="💳" className="w-4 h-4" />
    },
    'Publish': {
      onClick: () => goToPublish(),
      icon: <img src="/images/icons/upload.svg" alt="️⬆️" className="w-4 h-4" />
    }
  };

  // Check if activeTab is valid
  const showTabs = activeTab && availableTabs.hasOwnProperty(activeTab);


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
        console.log('domainWidth:', domainWidth);
        console.log('availableWidth:', availableWidth);
        setShowDomain(domainWidth <= availableWidth);
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);

    return () => window.removeEventListener('resize', checkOverflow);
  }, [domain]);

  // Set up scroll listeners for tabs
  useEffect(() => {
    if (showTabs && tabsContainerRef.current) {
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
  }, [showTabs, saveScrollPosition, getScrollPosition]);

  return (
    <div className="relative z-[100] border-b border-base-300">
      <div ref={navbarRef} className="navbar bg-base-100 z-[100] relative">
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
            ref={domainRef}
            className="text-base font-bold cursor-pointer"
            onClick={goToRoot}
          >
            {showDomain ? domain : '~'}
          </span>
        </div>
        <div className="navbar-end mr-4">
          <div className="flex gap-2 items-center">
            {!showTabs ? (
              <button
                className="btn btn-ghost btn-sm rainbow-fork text-xl"
                onClick={() => { goToEdit(path) }}
              >
                {'fork'}
              </button>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleQuitClick}
              >
                Quit
              </button>
            )}
          </div>
        </div>
      </div>
      {showTabs && (
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
                  className={`tab ${activeTab === tab ? 'tab-active' : ''}`}
                  onClick={() => availableTabs[tab].onClick()}
                >
                  <span className="mr-1">{availableTabs[tab].icon}</span>
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
