import { NextRequest, NextResponse } from 'next/server';
import { generateCsrfToken } from '@/lib/csrf';

export async function GET(request: NextRequest) {
  const sessionId = request.headers.get('x-session-id') ||
    request.headers.get('authorization')?.replace('Bearer ', '')?.slice(0, 16) ||
    'anonymous';

  const token = generateCsrfToken(sessionId);

  return NextResponse.json({ csrfToken: token });
}
