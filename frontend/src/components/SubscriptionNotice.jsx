import React, { useState, useEffect } from 'react';
import { useDomain } from '../hooks/useDomain';
import { useGetSubscription } from '../hooks/useGetSubscription';
import { useNavigation } from '../hooks/useNavigation';
import { useRepo } from '../hooks/useRepo';
import { Notice } from '@simplepg/react-components';

const SubscriptionNotice = ({ editMode = false }) => {
  const domain = useDomain();
  const { pageData } = useGetSubscription(domain);
  const { goToSubscription } = useNavigation();
  const { repo } = useRepo();
  const [settings, setSettings] = useState({ subscription: { hideDonationNotice: true } });
  const [showNotice, setShowNotice] = useState(false);
  
  // Load settings to check if donation notice is disabled
  useEffect(() => {
    const loadSettings = async () => {
      if (repo) {
        try {
          const loadedSettings = await repo.settings.read();
          setSettings(loadedSettings || {});
        } catch (error) {
          console.error('Failed to load settings:', error);
        }
      }
    };
    loadSettings();
  }, [repo]);

  // Calculate days until expiration
  const daysUntilExpiration = React.useMemo(() => {
    if (!pageData?.units?.[0]) return null;
    
    const expirationTimestamp = Number(pageData.units[0]);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const secondsUntilExpiration = expirationTimestamp - currentTimestamp;
    const days = Math.floor(secondsUntilExpiration / (24 * 60 * 60));
    
    return days;
  }, [pageData]);

  // Determine if we should show the notice
  useEffect(() => {
    if (daysUntilExpiration === null) {
      setShowNotice(false);
      return;
    }

    // Show notice if subscription is expired or expires within 30 days
    const shouldShowForExpiration = daysUntilExpiration <= 30;
    
    // In edit mode, always show if expiring soon
    // In view mode, only show if donation notice is not disabled
    if (editMode) {
      setShowNotice(shouldShowForExpiration);
    } else {
      const donationNoticeDisabled = settings?.subscription?.hideDonationNotice === true;
      setShowNotice(shouldShowForExpiration && !donationNoticeDisabled);
    }
  }, [daysUntilExpiration, editMode, settings]);

  const handleDonateClick = () => {
    // Navigate to subscription page with donate query param
    goToSubscription(domain, null, true);
  };

  const handleExtendClick = () => {
    // Navigate to normal subscription page
    goToSubscription(domain);
  };

  if (!showNotice) return null;

  const isExpired = daysUntilExpiration <= 0;
  const isExpiringSoon = daysUntilExpiration > 0 && daysUntilExpiration <= 30;

  // Determine notice type and message
  let noticeType = 'info';
  let message = '';
  let buttonText = '';
  let buttonAction = null;

  if (isExpired) {
    if (editMode) {
      message = 'Your subscription has expired. Extend your subscription to continue editing.';
      buttonText = 'Extend';
      buttonAction = handleExtendClick;
    } else {
      message = 'This website\'s subscription has expired. Help keep it online by making a donation.';
      buttonText = 'Donate';
      buttonAction = handleDonateClick;
    }
  } else if (isExpiringSoon) {
    if (editMode) {
      message = `Page subscription expires in ${daysUntilExpiration} day${daysUntilExpiration === 1 ? '' : 's'}. Extend the subscription to make sure this website stays online.`;
      buttonText = 'Extend';
      buttonAction = handleExtendClick;
    } else {
      message = `This website's subscription expires in ${daysUntilExpiration} day${daysUntilExpiration === 1 ? '' : 's'}. Help keep it online by making a donation.`;
      buttonText = 'Donate';
      buttonAction = handleDonateClick;
    }
  }

  return (
      <Notice type={noticeType} buttonText={buttonText} onClose={buttonAction}>
        <span><strong>{isExpired ? 'Subscription Expired:' : 'Subscription Expiring:'}</strong> {message}</span>
      </Notice>
  );
};

export default SubscriptionNotice;
