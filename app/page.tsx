'use client';

import { usePrivy, useWallets, useFundWallet } from '@privy-io/react-auth';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { WalletService } from '@unlock-protocol/unlock-js';
import { base } from 'viem/chains';

export default function Home() {
  const { login, logout, authenticated, user, ready } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();

  const [hasMembership, setHasMembership] = useState(false);
  const [loadingMembership, setLoadingMembership] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isFunding, setIsFunding] = useState(false);

  const LOCK_ADDRESS = '0xed16cd934780a48697c2fd89f1b13ad15f0b64e1';
  const NETWORK_ID = 8453;
  const BASE_RPC_URL = 'https://mainnet.base.org';

  const checkMembership = async () => {
    if (!ready || !authenticated || wallets.length === 0) return;
    setLoadingMembership(true);
    try {
      const rpcProvider = new ethers.JsonRpcProvider(BASE_RPC_URL);
      const lock = new ethers.Contract(
        LOCK_ADDRESS,
        ['function balanceOf(address) view returns (uint256)'],
        rpcProvider
      );

      let member = false;
      for (const w of wallets) {
        if (w.address) {
          const bal = await lock.balanceOf(w.address);
          if (bal > BigInt(0)) {
            member = true;
            break;
          }
        }
      }
      setHasMembership(member);
    } catch (e) {
      console.error('Membership check failed:', e);
    } finally {
      setLoadingMembership(false);
    }
  };

  useEffect(() => {
    checkMembership();
  }, [ready, authenticated, wallets]);

  const connectWallet = async () => {
    if (!authenticated) {
      try {
        await login();
      } catch (e) {
        console.error('Login error:', e);
      }
    }
  };

  const purchaseMembership = async () => {
    const w = wallets[0];
    if (!w) {
      console.error('No wallet connected.');
      return;
    }

    setIsPurchasing(true);
    try {
      const unlockConfig = {
        [NETWORK_ID]: {
          provider: BASE_RPC_URL,
          unlockAddress: LOCK_ADDRESS,
        },
      };
      const walletService = new WalletService(unlockConfig);

      const eip1193 = await w.getEthereumProvider();
      const browserProvider = new ethers.BrowserProvider(eip1193);
      const signer = await browserProvider.getSigner();
      const rpcProvider = new ethers.JsonRpcProvider(BASE_RPC_URL);

      await walletService.connect(rpcProvider, signer);
      // Remove override; use default ETH purchase
      await walletService.purchaseKey({
        lockAddress: LOCK_ADDRESS,
        owner: w.address,
      });
      await checkMembership();
    } catch (e) {
      console.error('Purchase failed:', e);
    } finally {
      setIsPurchasing(false);
    }
  };

  const fundUserWallet = async () => {
    const w = wallets[0];
    if (!w || !w.address) {
      console.error('No wallet to fund.');
      return;
    }

    setIsFunding(true);
    try {
      await fundWallet(w.address, { chain: base });
    } catch (e) {
      console.error('Funding failed:', e);
    } finally {
      setIsFunding(false);
    }
  };

  const refreshMembership = () => checkMembership();

  if (!ready) return <div>Loading…</div>;

  return (
    <div style={{ padding: 20 }}>
      <h1>PGP for Crypto Community</h1>

      {!authenticated ? (
        <div>
          <p>Please connect your wallet to continue.</p>
          <button onClick={connectWallet}>Connect Wallet</button>
        </div>
      ) : wallets.length === 0 ? (
        <div>
          <p>No external wallet detected. Please ensure your wallet extension is installed and connected.</p>
          <button onClick={connectWallet}>Connect Wallet</button>
          <button onClick={logout} style={{ marginLeft: 10 }}>Log Out</button>
        </div>
      ) : loadingMembership ? (
        <p>Checking membership…</p>
      ) : hasMembership ? (
        <div>
          <p>Hello, {wallets[0].address}! You’re a member.</p>
          <button onClick={logout}>Log Out</button>
        </div>
      ) : (
        <div>
          <p>Hello, {wallets[0].address}! You need a membership.</p>
          <p>Fund or purchase a membership to join the community.</p>
          <div style={{ marginBottom: 16 }}>
            <button onClick={fundUserWallet} disabled={isFunding}>
              {isFunding ? 'Funding…' : 'Fund Wallet'}
            </button>
          </div>
          <div style={{ marginBottom: 16 }}>
            <button onClick={purchaseMembership} disabled={isPurchasing}>
              {isPurchasing ? 'Purchasing…' : 'Get Membership'}
            </button>
            <button onClick={refreshMembership} style={{ marginLeft: 10 }}>
              Refresh Status
            </button>
          </div>
          <button onClick={logout} style={{ marginLeft: 10 }}>Log Out</button>
        </div>
      )}
    </div>
  );
}
