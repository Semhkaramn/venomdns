import { NextResponse } from 'next/server';
import { checkDomain, checkDomains, getDomainList } from '@/lib/domain-checker';
import { sendBlockedAlert } from '@/lib/telegram';
import { shouldNotify, updateState } from '@/lib/state';

// Manuel kontrol endpoint'i
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');

  // Tek domain kontrolü
  if (domain) {
    const result = await checkDomain(domain);
    return NextResponse.json(result);
  }

  // Tüm domainleri kontrol et
  const domains = getDomainList();

  if (domains.length === 0) {
    return NextResponse.json(
      { error: 'No domains configured. Set DOMAINS environment variable.' },
      { status: 400 }
    );
  }

  const results = await checkDomains(domains);
  const notifications: string[] = [];

  // Durum değişikliklerini kontrol et ve bildirim gönder
  for (const result of results) {
    const { notify, type } = shouldNotify(result.domain, result.blocked);

    if (notify) {
      await sendBlockedAlert({
        domain: result.domain,
        status: type === 'blocked' ? 'blocked' : 'unblocked',
        details: result.reason,
        checkedAt: result.checkedAt,
      });
      notifications.push(`${result.domain} (${type})`);
    }

    updateState(result.domain, result.blocked);
  }

  const blockedCount = results.filter(r => r.blocked).length;

  return NextResponse.json({
    success: true,
    checked: results.length,
    blocked: blockedCount,
    open: results.length - blockedCount,
    notifications,
    results,
    timestamp: new Date().toISOString(),
  });
}

// POST ile domain listesi gönderip kontrol et
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { domains } = body;

    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return NextResponse.json(
        { error: 'domains array required in request body' },
        { status: 400 }
      );
    }

    const results = await checkDomains(domains);
    const blockedCount = results.filter(r => r.blocked).length;

    return NextResponse.json({
      success: true,
      checked: results.length,
      blocked: blockedCount,
      open: results.length - blockedCount,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
