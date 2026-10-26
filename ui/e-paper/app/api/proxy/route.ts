import { NextResponse } from 'next/server';

const REPOSITORY = process.env.RELEASE_REPOSITORY ?? 'sp4rkiop/e-paper';
const ASSET_NAME = 'Hindustan-Dhanbad.pdf';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  let pdfUrl: string;
  let cacheControl: string;

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    pdfUrl = `https://github.com/${REPOSITORY}/releases/download/${date}/${ASSET_NAME}`;
    cacheControl = 'public, max-age=31536000, immutable';
  } else {
    try {
      const releaseRes = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
      });
      if (!releaseRes.ok) {
        return NextResponse.json({ error: 'Failed to resolve latest release' }, { status: 502 });
      }
      const tag = (await releaseRes.json())?.tag_name;
      if (!tag) {
        return NextResponse.json({ error: 'No releases available' }, { status: 404 });
      }
      pdfUrl = `https://github.com/${REPOSITORY}/releases/download/${tag}/${ASSET_NAME}`;
    } catch {
      return NextResponse.json({ error: 'Failed to resolve latest release' }, { status: 502 });
    }
    cacheControl = 'public, max-age=900';
  }

  try {
    const response = await fetch(pdfUrl, { redirect: 'follow', cache: 'no-store' });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Release asset unavailable (HTTP ${response.status})` },
        { status: response.status === 404 ? 404 : 502 },
      );
    }
    if (!response.body) {
      return NextResponse.json({ error: 'Empty response from GitHub' }, { status: 502 });
    }

    const contentLength = response.headers.get('Content-Length');
    const headers = new Headers({
      'Content-Type': 'application/pdf',
      'Cache-Control': cacheControl,
      ...(contentLength && { 'Content-Length': contentLength }),
    });

    return new NextResponse(response.body, {
      status: 200,
      statusText: 'OK',
      headers,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to stream PDF' }, { status: 502 });
  }
}
