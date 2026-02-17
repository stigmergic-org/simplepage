import React from 'react';

const RainbowEditContent = () => (
  <>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      className="mt-0.5"
    >
      <defs>
        <mask id="edit-mask">
          <g transform="scale(0.666666)">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="white" fill="none" />
          </g>
        </mask>
      </defs>
    </svg>
    edit
  </>
);

export default RainbowEditContent;
