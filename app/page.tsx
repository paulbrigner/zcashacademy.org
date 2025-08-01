'use client';

import { usePrivy, useWallets, useFundWallet } from '@privy-io/react-auth';
import { useState, useEffect, useMemo } from 'react';
import { BrowserProvider, Contract, JsonRpcProvider, parseUnits } from 'ethers';
import { WalletService } from '@unlock-protocol/unlock-js';
import { base } from 'viem/chains';

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
  // const SIGNER_URL = process.env.NEXT_PUBLIC_SIGNER_URL;
  const SIGNER_URL = 'https://emjxaqlflhuemvnkqiwzccgtue0foutk.lambda-url.us-east-1.on.aws/';


  const LOCK_ADDRESS = '0xed16cd934780a48697c2fd89f1b13ad15f0b64e1';
  const NETWORK_ID = 8453;
  const BASE_RPC_URL = 'https://mainnet.base.org';
  const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

  const unlockConfig = useMemo(
    () => ({
      [NETWORK_ID]: {
        provider: BASE_RPC_URL,
        unlockAddress: '0xd0b14797b9D08493392865647384974470202A78',
      },
    }),
    []
  );
  const walletService = useMemo(
    () => new WalletService(unlockConfig),
    [unlockConfig]
  );


  const UNLOCK_ERRORS: Record<string, string> = {
    '0x17ed8646': 'Membership sold out or max keys reached.',
    '0x31af6951': 'Lock sold out.',
    '0x1f04ddc8': 'Not enough funds.',
  };

  const decodeUnlockError = (data: string) => {
    const code = data.slice(0, 10).toLowerCase();
    return UNLOCK_ERRORS[code] || data;
  };


  // Check if connected wallet has membership
  const checkMembership = async () => {
    if (!ready || !authenticated || wallets.length === 0) return;
    setLoadingMembership(true);
    try {
      const provider = new JsonRpcProvider(BASE_RPC_URL, NETWORK_ID);
      const lockContract = new Contract(
        LOCK_ADDRESS,
        [
          'function totalKeys(address) view returns (uint256)',
          'function getHasValidKey(address) view returns (bool)'
        ],
        provider
      );
      let status: 'active' | 'expired' | 'none' = 'none';
      for (const w of wallets) {
        if (w.address) {

          const total = await lockContract.totalKeys(w.address);
          if (total.toString() !== '0') {
            const valid = await lockContract.getHasValidKey(w.address);
            status = valid ? 'active' : 'expired';
            break;
          }
        }
      }
      setMembershipStatus(status);
      setHasMembership(status === 'active');
    } catch (error) {
      console.error('Membership check failed:', error);
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
      // Ensure wallet is on Base network
      const eip1193 = await w.getEthereumProvider();
      try {
        await eip1193.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          // Add Base chain if missing
          await eip1193.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x2105',
              chainName: 'Base',
              rpcUrls: ['https://mainnet.base.org'],
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: ['https://basescan.org'],
            }],
          });
        } else {
          throw switchError;
        }
      }

      // Setup browser provider and signer
      const browserProvider = new BrowserProvider(eip1193, NETWORK_ID);
      const signer = await browserProvider.getSigner();

      // Connect Unlock.js service
      console.log('Connecting Unlock service...');
      await walletService.connect(browserProvider as unknown as JsonRpcProvider);

      // Approve USDC spend if needed
      const usdc = new Contract(
        USDC_ADDRESS,
        [
          'function allowance(address owner, address spender) view returns (uint256)',
          'function approve(address spender, uint256 amount) returns (bool)',
        ],
        signer
      );
      const amount = parseUnits('0.1', 6);
      const allowance = await usdc.allowance(w.address, LOCK_ADDRESS);
      if (allowance < amount) {
        console.log('Approving USDC spend...');
        const approveTx = await usdc.approve(LOCK_ADDRESS, amount);
        await approveTx.wait();
      }

      console.log('Purchasing key for 0.1 USDC...');
      const txHash = await walletService.purchaseKey(
        {
          lockAddress: LOCK_ADDRESS,
          owner: w.address,
          keyPrice: '0.1',
          erc20Address: USDC_ADDRESS,
          decimals: 6,
        } as any
      );
      console.log('purchaseKey TX hash:', txHash);

      await checkMembership();
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
      const eip1193 = await w.getEthereumProvider();
      try {
        await eip1193.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x2105' }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          await eip1193.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x2105',
                chainName: 'Base',
                rpcUrls: ['https://mainnet.base.org'],
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                blockExplorerUrls: ['https://basescan.org'],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }

      const browserProvider = new BrowserProvider(eip1193, NETWORK_ID);
      const signer = await browserProvider.getSigner();

      console.log('Connecting Unlock service...');
      await walletService.connect(browserProvider as unknown as JsonRpcProvider);

      const usdc = new Contract(
        USDC_ADDRESS,
        [
          'function allowance(address owner, address spender) view returns (uint256)',
          'function approve(address spender, uint256 amount) returns (bool)',
        ],
        signer
      );
      const amount = parseUnits('0.1', 6);
      const allowance = await usdc.allowance(w.address, LOCK_ADDRESS);
      if (allowance < amount) {
        console.log('Approving USDC spend...');
        const approveTx = await usdc.approve(LOCK_ADDRESS, amount);
        await approveTx.wait();
      }

      console.log('Renewing membership for 0.1 USDC...');
      const txHash = await walletService.extendKey({
        lockAddress: LOCK_ADDRESS,
        owner: w.address,
        keyPrice: '0.1',
        erc20Address: USDC_ADDRESS,
        decimals: 6,
        referrer: w.address,
      } as any);
      console.log('extendKey TX hash:', txHash);

      await checkMembership();
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
              className="px-4 py-2 border rounded-md bg-gray-200 hover:bg-gray-300"
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
              className="px-4 py-2 border rounded-md bg-gray-200 hover:bg-gray-300"
              onClick={checkMembership}
            >
              Refresh Status
            </button>
            <button
              className="px-4 py-2 border rounded-md bg-gray-200 hover:bg-gray-300"
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
