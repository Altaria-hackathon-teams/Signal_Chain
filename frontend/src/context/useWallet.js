import { createContext, useContext } from 'react';

export const WalletContext = createContext(null);

export function useWallet() {
  return useContext(WalletContext);
}
