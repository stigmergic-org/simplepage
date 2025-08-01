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
      iconSrc: "/images/icons/preview.svg",
      alt: "👁️"
    },
    'Edit': {
      onClick: () => goToEdit(path),
      iconSrc: "/images/icons/edit.svg",
      alt: "✏️"
    },
    'Pages': {
      onClick: () => goToPages(path),
      iconSrc: "/images/icons/document.svg",
      alt: "📄"
    },
    'Subscription': {
      onClick: () => goToSubscription(),
      iconSrc: "/images/icons/credit-card.svg",
      alt: "💳"
    },
    'Publish': {
      onClick: () => goToPublish(),
      iconSrc: "/images/icons/upload.svg",
      alt: "️⬆️"
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
                  className={`tab group ${activeTab === tab ? 'tab-active' : ''}`}
                  onClick={() => availableTabs[tab].onClick()}
                >
                  <span className="mr-1">
                    <img
                      src={availableTabs[tab].iconSrc}
                      alt={availableTabs[tab].alt}
                      className={`w-4 h-4 dark:invert opacity-${activeTab === tab ? '100' : '50'} group-hover:opacity-100`}
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
