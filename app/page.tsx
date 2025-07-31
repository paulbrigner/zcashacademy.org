'use client';

import { usePrivy, useWallets, useFundWallet } from '@privy-io/react-auth';
import { useState, useEffect } from 'react';
import { BrowserProvider, Contract, JsonRpcProvider, parseUnits } from 'ethers';
import { WalletService } from '@unlock-protocol/unlock-js';
import { base } from 'viem/chains';

export default function Home() {
  const { login, logout, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();

  const [hasMembership, setHasMembership] = useState(false);
  const [loadingMembership, setLoadingMembership] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isFunding, setIsFunding] = useState(false);

  const LOCK_ADDRESS = '0xed16cd934780a48697c2fd89f1b13ad15f0b64e1';
  const NETWORK_ID = 8453;
  const BASE_RPC_URL = 'https://mainnet.base.org';
  const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

  // Check if connected wallet has membership
  const checkMembership = async () => {
    if (!ready || !authenticated || wallets.length === 0) return;
    setLoadingMembership(true);
    try {
      const provider = new JsonRpcProvider(BASE_RPC_URL, NETWORK_ID);
      const lockContract = new Contract(
        LOCK_ADDRESS,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      let member = false;
      for (const w of wallets) {
        if (w.address) {
          const balance = await lockContract.balanceOf(w.address);
          if (balance.toString() !== '0') {
            member = true;
            break;
          }
        }
      }
      setHasMembership(member);
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

      // Initialize Unlock.js service
      const unlockConfig = {
        [NETWORK_ID]: {
          provider: BASE_RPC_URL,
          // Unlock contract address on Base mainnet
          unlockAddress: '0xd0b14797b9D08493392865647384974470202A78',
        },
      };
      const walletService = new WalletService(unlockConfig);
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
    } catch (error) {
      console.error('Purchase failed:', error);
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
          <p>No external wallet detected. Please install and connect your wallet.</p>
          <button onClick={connectWallet}>Connect Wallet</button>
          <button onClick={logout}>Log Out</button>
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
          <button onClick={fundUserWallet} disabled={isFunding}>
            {isFunding ? 'Funding…' : 'Fund Wallet'}
          </button>
          <button onClick={purchaseMembership} disabled={isPurchasing}>
            {isPurchasing ? 'Purchasing…' : 'Get Membership'}
          </button>
          <button onClick={checkMembership}>Refresh Status</button>
          <button onClick={logout}>Log Out</button>
        </div>
      )}
    </div>
  );
}
