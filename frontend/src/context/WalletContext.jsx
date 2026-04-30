import { useState, useEffect } from 'react';
import { WalletContext } from './useWallet';

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null);
  const [freighterInstalled, setFreighterInstalled] = useState(null);
  const [shakeSignal, setShakeSignal] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const { isConnected } = await import('@stellar/freighter-api');
        const result = await isConnected();
        const installed = result?.isConnected !== false;
        setFreighterInstalled(installed);
        if (installed) {
          const saved = localStorage.getItem('tp_wallet');
          if (saved) setAddress(saved);
        }
      } catch {
        setFreighterInstalled(false);
      }
    })();
  }, []);

  async function connect() {
    const freighter = await import('@stellar/freighter-api');
    let pubKey = null;
    if (freighter.requestAccess) {
      const result = await freighter.requestAccess();
      pubKey = result?.address || null;
    }
    if (!pubKey && freighter.getAddress) {
      const result = await freighter.getAddress();
      pubKey = result?.address || null;
    }
    if (!pubKey && freighter.getPublicKey) {
      pubKey = await freighter.getPublicKey();
    }
    if (!pubKey) throw new Error('Could not retrieve wallet address');
    setAddress(pubKey);
    localStorage.setItem('tp_wallet', pubKey);
    return pubKey;
  }

  function disconnect() {
    setAddress(null);
    localStorage.removeItem('tp_wallet');
  }

  function triggerWalletShake() {
    setShakeSignal((s) => s + 1);
  }

  return (
    <WalletContext.Provider value={{ address, freighterInstalled, connect, disconnect, shakeSignal, triggerWalletShake }}>
      {children}
    </WalletContext.Provider>
  );
}
