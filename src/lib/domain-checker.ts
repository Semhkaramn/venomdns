// Domain Engel Kontrol Sistemi

export interface DomainCheckResult {
  domain: string;
  blocked: boolean;
  reason?: string;
  httpStatus?: number;
  dnsResolved?: boolean;
  redirectedTo?: string;
  responseTime?: number;
  checkedAt: Date;
}

// Türkiye'de engelli sitelerin yönlendirildiği bilinen IP'ler ve domainler
const BLOCKED_INDICATORS = [
  'uyari.btk.gov.tr',
  'blocked.net.tr',
  'engellisite.com',
  '195.175.254.2',
  '212.175.180.166',
  'internet-sansuru.tc',
];

// DNS kontrolü için Google DNS API kullan
async function checkDNS(domain: string): Promise<{ resolved: boolean; ip?: string }> {
  try {
    const response = await fetch(
      `https://dns.google/resolve?name=${domain}&type=A`,
      {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      }
    );

    const data = await response.json();

    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      const ip = data.Answer.find((a: { type: number; data: string }) => a.type === 1)?.data;
      return { resolved: true, ip };
    }

    return { resolved: false };
  } catch (error) {
    console.error(`DNS check failed for ${domain}:`, error);
    return { resolved: false };
  }
}

// HTTP erişim kontrolü
async function checkHTTP(domain: string): Promise<{
  accessible: boolean;
  status?: number;
  redirectedTo?: string;
  blocked?: boolean;
  responseTime?: number;
}> {
  const startTime = Date.now();

  try {
    // HTTPS dene
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`https://${domain}`, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    const finalUrl = response.url;

    // Engel sayfasına yönlendirilmiş mi kontrol et
    const isBlocked = BLOCKED_INDICATORS.some(
      indicator => finalUrl.toLowerCase().includes(indicator.toLowerCase())
    );

    return {
      accessible: response.ok,
      status: response.status,
      redirectedTo: finalUrl !== `https://${domain}` && finalUrl !== `https://${domain}/` ? finalUrl : undefined,
      blocked: isBlocked,
      responseTime,
    };
  } catch (error) {
    // HTTPS başarısız, HTTP dene
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`http://${domain}`, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      const finalUrl = response.url;
      const isBlocked = BLOCKED_INDICATORS.some(
        indicator => finalUrl.toLowerCase().includes(indicator.toLowerCase())
      );

      return {
        accessible: response.ok,
        status: response.status,
        redirectedTo: finalUrl !== `http://${domain}` && finalUrl !== `http://${domain}/` ? finalUrl : undefined,
        blocked: isBlocked,
        responseTime,
      };
    } catch {
      const responseTime = Date.now() - startTime;
      return {
        accessible: false,
        blocked: true,
        responseTime,
      };
    }
  }
}

// Ana kontrol fonksiyonu
export async function checkDomain(domain: string): Promise<DomainCheckResult> {
  // Domain'i temizle
  const cleanDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim()
    .toLowerCase();

  const [dnsResult, httpResult] = await Promise.all([
    checkDNS(cleanDomain),
    checkHTTP(cleanDomain),
  ]);

  let blocked = false;
  let reason = '';

  // Engel tespiti mantığı
  if (httpResult.blocked) {
    blocked = true;
    reason = 'BTK engel sayfasına yönlendirildi';
  } else if (!dnsResult.resolved && !httpResult.accessible) {
    blocked = true;
    reason = 'DNS çözümlenemedi ve HTTP erişilemedi';
  } else if (!httpResult.accessible && httpResult.status === 403) {
    blocked = true;
    reason = 'Erişim engellendi (403)';
  } else if (httpResult.redirectedTo && BLOCKED_INDICATORS.some(
    i => httpResult.redirectedTo?.includes(i)
  )) {
    blocked = true;
    reason = `Engel sayfasına yönlendirildi: ${httpResult.redirectedTo}`;
  }

  return {
    domain: cleanDomain,
    blocked,
    reason: blocked ? reason : 'Erişilebilir',
    httpStatus: httpResult.status,
    dnsResolved: dnsResult.resolved,
    redirectedTo: httpResult.redirectedTo,
    responseTime: httpResult.responseTime,
    checkedAt: new Date(),
  };
}

// Birden fazla domain'i kontrol et
export async function checkDomains(domains: string[]): Promise<DomainCheckResult[]> {
  const results = await Promise.all(
    domains.map(domain => checkDomain(domain))
  );
  return results;
}

// Domain listesini al (environment variable'dan veya config'den)
export function getDomainList(): string[] {
  const domainsEnv = process.env.DOMAINS || '';
  if (domainsEnv) {
    return domainsEnv.split(',').map(d => d.trim()).filter(d => d.length > 0);
  }
  return [];
}
