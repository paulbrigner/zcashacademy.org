import { NextRequest, NextResponse } from 'next/server';
import { Contract, JsonRpcProvider } from 'ethers';
import { getSignedUrl } from '@/lambda/cloudFrontSigner';

const LOCK_ADDRESS = process.env.LOCK_ADDRESS as string;
const NETWORK_ID = Number(process.env.NETWORK_ID);
const BASE_RPC_URL = process.env.BASE_RPC_URL as string;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN as string;
const KEY_PAIR_ID = process.env.KEY_PAIR_ID as string;
const PRIVATE_KEY = process.env.PRIVATE_KEY as string;

const ABI = [
  'function totalKeys(address) view returns (uint256)',
  'function getHasValidKey(address) view returns (bool)',
];
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ file: string }> }
) {
  const address = request.nextUrl.searchParams.get('address');
  const { file } = await context.params;

  if (!address || !file) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  try {
    const provider = new JsonRpcProvider(BASE_RPC_URL, NETWORK_ID);
    const lock = new Contract(LOCK_ADDRESS, ABI, provider);

    const total = await lock.totalKeys(address);
    if (total.toString() === '0') {
      return NextResponse.json({ error: 'No membership' }, { status: 403 });
    }

    const valid = await lock.getHasValidKey(address);
    if (!valid) {
      return NextResponse.json({ error: 'Membership expired' }, { status: 403 });
    }

    const expires = Math.floor(Date.now() / 1000) + 60 * 5; // 5 minutes
    const url = getSignedUrl({
      url: `https://${CLOUDFRONT_DOMAIN}/${file}`,
      keyPairId: KEY_PAIR_ID,
      privateKey: PRIVATE_KEY,
      expires,
    });

    return NextResponse.json({ url });
  } catch (err) {
    console.error('Failed to generate URL', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
