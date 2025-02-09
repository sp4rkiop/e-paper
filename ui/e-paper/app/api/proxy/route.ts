import { NextResponse } from 'next/server';

export async function GET() {
  const pdfUrl = 'https://github.com/sp4rkiop/e-paper/releases/download/2025-02-09/Hindustan-Dhanbad.pdf';
  
  try {
    const response = await fetch(pdfUrl, { redirect: 'follow' });
    
    if (!response.ok) throw new Error('Failed to fetch PDF');
    
    const contentLength = response.headers.get('Content-Length');
    const headers = new Headers({
      'Content-Type': 'application/pdf',
      ...(contentLength && { 'Content-Length': contentLength })
    });

    return new NextResponse(response.body, {
      status: 200,
      statusText: 'OK',
      headers
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch PDF' },
      { status: 500 }
    );
  }
}