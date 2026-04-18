import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/sessions';
import fs from 'fs';
import path from 'path';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string; index: string }> }
) {
  const { sessionId, index } = await params;
  const idx = parseInt(index, 10);

  const session = getSession(sessionId);
  if (!session) {
    return new NextResponse('Session not found', { status: 404 });
  }

  const file = session.downloadedFiles.find(f => f.index === idx);
  if (!file || !fs.existsSync(file.filepath)) {
    // Fallback: redirect to the original scraped image URL
    const imgUrl = session.scrapedData.images[idx];
    if (imgUrl) {
      return NextResponse.redirect(imgUrl);
    }
    return new NextResponse('Image not found', { status: 404 });
  }

  const ext = path.extname(file.filepath).toLowerCase();
  const contentType =
    ext === '.png' ? 'image/png' :
    ext === '.webp' ? 'image/webp' :
    ext === '.gif' ? 'image/gif' :
    'image/jpeg';

  const buf = fs.readFileSync(file.filepath);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
