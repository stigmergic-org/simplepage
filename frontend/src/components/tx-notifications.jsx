import { useState, useEffect, useRef } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';

const TOAST_DURATION = 10000;

// const shortenHash = (hash) => {
//   if (!hash) return '';
//   return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
// };

const TxNotifications = ({ notifications, _position = 'top' }) => {
  const [notificationMap, setNotificationMap] = useState(new Map());
  const timers = useRef(new Map());

  useEffect(() => {
    if (notifications && notifications.length > 0) {
      setNotificationMap(prevMap => {
        const newMap = new Map(prevMap);
        notifications.forEach(notification => {
          if (!newMap.has(notification.hash)) {
            newMap.set(notification.hash, { ...notification, display: true });
            startTimer(notification.hash);
          }
        });
        return newMap;
      });
    }
  }, [notifications]);

  const startTimer = (hash) => {
    if (timers.current.has(hash)) {
      clearTimeout(timers.current.get(hash));
    }
    const timer = setTimeout(() => {
      setNotificationMap(prevMap => {
        const newMap = new Map(prevMap);
        const notification = newMap.get(hash);
        if (notification) {
          newMap.set(hash, { ...notification, display: false });
        }
        return newMap;
      });
      timers.current.delete(hash);
    }, TOAST_DURATION);
    timers.current.set(hash, timer);
  };

  const { data: transactionReceipt } = useWaitForTransactionReceipt({
    hash: Array.from(notificationMap.values()).find(n => n.hash && !n.confirmed)?.hash,
  });

  useEffect(() => {
    if (transactionReceipt) {
      setNotificationMap(prevMap => {
        const newMap = new Map(prevMap);
        const notification = newMap.get(transactionReceipt.transactionHash);
        if (notification) {
          newMap.set(transactionReceipt.transactionHash, { ...notification, confirmed: true });
          startTimer(transactionReceipt.transactionHash);
        }
        return newMap;
      });
    }
  }, [transactionReceipt]);

  // const handleClose = (hash) => {
  //   setNotificationMap(prevMap => {
  //     const newMap = new Map(prevMap);
  //     newMap.set(hash, { ...newMap.get(hash), display: false });
  //     return newMap;
  //   });
  //   if (timers.current.has(hash)) {
  //     clearTimeout(timers.current.get(hash));
  //     timers.current.delete(hash);
  //   }
  // };

  // const activeNotifications = Array.from(notificationMap.values()).filter(n => n.display);

  // return (
  //   <div className={`toast toast-${position} toast-center mt-16 mb-16`}>
  //     {activeNotifications.map((notification) => (
  //       notification.error ? (
  //         <div key={notification.hash} className="alert alert-error flex justify-between items-center mx-10">
  //           <svg
  //             xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
  //             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
  //               d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  //           </svg>
  //           <span>{notification.error}</span>
  //           <button onClick={() => handleClose(notification.hash)} className="btn btn-sm btn-circle btn-ghost ml-2">✕</button>
  //         </div>
  //       ) : notification.confirmed ? (
  //         <div key={notification.hash} role="alert" className="alert shadow-lg flex justify-between items-center">
  //           <svg
  //             xmlns="http://www.w3.org/2000/svg" className="stroke-success shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
  //             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  //           </svg>
  //           <div className="">
  //             <h3 className="font-bold">{notification.text} confirmed!</h3>
  //             <div className="text-xs">{shortenHash(notification.hash)}</div>
  //           </div>
  //           <button onClick={() => handleClose(notification.hash)} className="btn btn-sm btn-circle btn-ghost ml-2">✕</button>
  //         </div>
  //       ) : (
  //         <div key={notification.hash} role="alert" className="alert shadow-lg flex justify-between items-center">
  //           <svg
  //             xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-info h-6 w-6 shrink-0">
  //             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
  //               d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
  //           </svg>
  //           <div className="">
  //             <h3 className="font-bold">{notification.text} pending!</h3>
  //             <div className="text-xs">{shortenHash(notification.hash)}</div>
  //           </div>
  //           <button onClick={() => handleClose(notification.hash)} className="btn btn-sm btn-circle btn-ghost ml-2">✕</button>
  //         </div>
  //       )
  //     ))}
  //   </div>
  // );
};

export { TxNotifications };
export default TxNotifications;