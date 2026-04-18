import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = [
  'img.diylooks.com',
  'i0.wp.com',
  'i1.wp.com',
  'i2.wp.com',
  'greenagefarms.com',
  'sunsky-online.com',
];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('Missing url', { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse('Invalid url', { status: 400 });
  }

  if (!ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
    return new NextResponse('Host not allowed', { status: 403 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': `${parsed.protocol}//${parsed.hostname}/`,
        'Accept': 'image/webp,image/avif,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return new NextResponse('Upstream error', { status: res.status });

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buf = await res.arrayBuffer();

    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new NextResponse('Fetch failed', { status: 502 });
  }
}
