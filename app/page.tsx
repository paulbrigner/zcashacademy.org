'use client';

import { usePrivy, useWallets, useFundWallet } from '@privy-io/react-auth';
import { useState, useEffect, useMemo } from 'react';
import { WalletService } from '@unlock-protocol/unlock-js';
import { base } from 'viem/chains';
import {
  SIGNER_URL,
  UNLOCK_ADDRESS,
  LOCK_ADDRESS,
  BASE_NETWORK_ID,
  BASE_RPC_URL,
  USDC_ADDRESS,
} from '@/lib/config';
import {
  checkMembership as fetchMembership,
  purchaseMembership as purchaseMembershipService,
  renewMembership as renewMembershipService,
  decodeUnlockError,
} from '@/lib/membership';

export default function Home() {
  const { login, logout, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();

  const [hasMembership, setHasMembership] = useState(false);
  const [membershipStatus, setMembershipStatus] = useState<'active' | 'expired' | 'none'>('none');
  const [loadingMembership, setLoadingMembership] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const unlockConfig = useMemo(
    () => ({
      [BASE_NETWORK_ID]: {
        provider: BASE_RPC_URL,
        unlockAddress: UNLOCK_ADDRESS,
      },
    }),
    []
  );
  const walletService = useMemo(
    () => new WalletService(unlockConfig),
    [unlockConfig]
  );


  const refreshMembership = async () => {
    if (!ready || !authenticated || wallets.length === 0) return;
    setLoadingMembership(true);
    try {
      const status = await fetchMembership(
        wallets,
        BASE_RPC_URL,
        BASE_NETWORK_ID,
        LOCK_ADDRESS
      );
      setMembershipStatus(status);
      setHasMembership(status === 'active');
    } catch (error) {
      console.error('Membership check failed:', error);
    } finally {
      setLoadingMembership(false);
    }
  };

  useEffect(() => {
    refreshMembership();
  }, [ready, authenticated, wallets]);

  const connectWallet = async () => {
    if (!authenticated) {
      try {
        await login();
      } catch (error) {
        console.error('Login error:', error);
      }
    }
  };

  // Purchase membership with USDC
  const purchaseMembership = async () => {
    const w = wallets[0];
    if (!w?.address) {
      console.error('No wallet connected.');
      return;
    }
    setIsPurchasing(true);
    try {
      await purchaseMembershipService(
        w,
        walletService,
        BASE_NETWORK_ID,
        LOCK_ADDRESS,
        USDC_ADDRESS
      );
      await refreshMembership();
    } catch (error: any) {
      if (error?.data) {
        console.error('Purchase failed:', decodeUnlockError(error.data));
      } else {
        console.error('Purchase failed:', error);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  // Renew an expired membership
  const renewMembership = async () => {
    const w = wallets[0];
    if (!w?.address) {
      console.error('No wallet connected.');
      return;
    }
    setIsPurchasing(true);
    try {
      await renewMembershipService(
        w,
        walletService,
        BASE_NETWORK_ID,
        LOCK_ADDRESS,
        USDC_ADDRESS
      );
      await refreshMembership();
    } catch (error: any) {
      if (error?.data) {
        console.error('Renewal failed:', decodeUnlockError(error.data));
      } else {
        console.error('Renewal failed:', error);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const fundUserWallet = async () => {
    const w = wallets[0];
    if (!w?.address) {
      console.error('No wallet to fund.');
      return;
    }
    setIsFunding(true);
    try {
      await fundWallet(w.address, { chain: base });
    } catch (error) {
      console.error('Funding failed:', error);
    } finally {
      setIsFunding(false);
    }
  };

  const getContentUrl = async (file: string) => {
    const w = wallets[0];
    if (!w?.address) {
      console.error('No wallet connected.');
      return;
    }
    if (!SIGNER_URL) {
      console.error('Signer URL not configured');
      return;
    }
    try {
      const res = await fetch(`${SIGNER_URL}?address=${w.address}&file=${file}`);
      if (!res.ok) {
        throw new Error('Failed to fetch signed URL');
      }
      const data = await res.json();
      setSignedUrl(data.url);
    } catch (err) {
      console.error('Could not load content:', err);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold text-center">PGP for Crypto Community</h1>
      {!authenticated ? (
        <div className="space-y-4 text-center">
          <p>Please connect your wallet to continue.</p>
          <button
            className="px-4 py-2 border rounded-md bg-blue-600 text-white hover:bg-blue-700"
            onClick={connectWallet}
          >
            Connect Wallet
          </button>
        </div>
      ) : wallets.length === 0 ? (
        <div className="space-y-4 text-center">
          <p>No external wallet detected. Please install and connect your wallet.</p>
          <div className="space-x-2">
            <button
              className="px-4 py-2 border rounded-md bg-blue-600 text-white hover:bg-blue-700"
              onClick={connectWallet}
            >
              Connect Wallet
            </button>
            <button
              className="px-4 py-2 border rounded-md bg-gray-200 hover:bg-gray-300"
              onClick={logout}
            >
              Log Out
            </button>
          </div>
        </div>
      ) : loadingMembership ? (
        <p>Checking membership…</p>
      ) : membershipStatus === 'active' ? (
        <div className="space-y-4 text-center">
          <p>Hello, {wallets[0].address}! You’re a member.</p>
          <div className="space-x-2">
            <button
              className="px-4 py-2 border rounded-md bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => getContentUrl('index.html')}
            >
              View Home
            </button>
            <button
              className="px-4 py-2 border rounded-md bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => getContentUrl('guide.html')}
            >
              View Guide
            </button>
            <button
              className="px-4 py-2 border rounded-md bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => getContentUrl('faq.html')}
            >
              View FAQ
            </button>
            <button
              className="px-4 py-2 border rounded-md bg-blue-600 text-white hover:bg-blue-700"
              onClick={logout}
            >
              Log Out
            </button>
          </div>
          {signedUrl && (
            <iframe
              src={signedUrl}
              className="w-full h-96 border mt-4"
            ></iframe>
          )}
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <p>
            Hello, {wallets[0].address}!{' '}
            {membershipStatus === 'expired'
              ? 'Your membership has expired.'
              : 'You need a membership.'}
          </p>
          <div className="space-x-2">
            <button
              className="px-4 py-2 border rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={fundUserWallet}
              disabled={isFunding}
            >
              {isFunding ? 'Funding…' : 'Fund Wallet'}
            </button>
            <button
              className="px-4 py-2 border rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              onClick={
                membershipStatus === 'expired'
                  ? renewMembership
                  : purchaseMembership
              }
              disabled={isPurchasing}
            >
              {isPurchasing
                ? membershipStatus === 'expired'
                  ? 'Renewing…'
                  : 'Purchasing…'
                : membershipStatus === 'expired'
                ? 'Renew Membership'
                : 'Get Membership'}
            </button>
            <button
              className="px-4 py-2 border rounded-md bg-blue-600 text-white hover:bg-blue-700"
              onClick={refreshMembership}
            >
              Refresh Status
            </button>
            <button
              className="px-4 py-2 border rounded-md bg-blue-600 text-white hover:bg-blue-700"
              onClick={logout}
            >
              Log Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
