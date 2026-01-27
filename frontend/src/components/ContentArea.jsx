import React from 'react';

/**
 * ContentArea Component
 *
 * Isolates content rendering to prevent unnecessary rerenders
 * when layout state (like navbarEffectiveTop) changes.
 *
 * Only rerenders when the content prop actually changes.
 */
const ContentArea = React.memo(({ content }) => {
  return (
    <div dangerouslySetInnerHTML={{ __html: content }} />
  );
});

ContentArea.displayName = 'ContentArea';

export default ContentArea;
