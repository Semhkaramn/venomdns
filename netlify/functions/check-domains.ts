import type { Config, Context } from "@netlify/functions";

// Telegram API Helper
async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('Telegram credentials not configured');
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML',
        }),
      }
    );
    const data = await response.json();
    return data.ok;
  } catch (error) {
    console.error('Telegram error:', error);
    return false;
  }
}

// DNS kontrolü
async function checkDNS(domain: string): Promise<{ resolved: boolean; ip?: string }> {
  try {
    const response = await fetch(
      `https://dns.google/resolve?name=${domain}&type=A`,
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await response.json();
    if (data.Status === 0 && data.Answer?.length > 0) {
      const ip = data.Answer.find((a: { type: number }) => a.type === 1)?.data;
      return { resolved: true, ip };
    }
    return { resolved: false };
  } catch {
    return { resolved: false };
  }
}

// Engel göstergeleri
const BLOCKED_INDICATORS = [
  'uyari.btk.gov.tr',
  'blocked.net.tr',
  '195.175.254.2',
  '212.175.180.166',
];

// HTTP kontrolü
async function checkHTTP(domain: string): Promise<{
  accessible: boolean;
  blocked: boolean;
  redirectedTo?: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`https://${domain}`, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    clearTimeout(timeoutId);
    const finalUrl = response.url;

    const isBlocked = BLOCKED_INDICATORS.some(
      indicator => finalUrl.toLowerCase().includes(indicator.toLowerCase())
    );

    return {
      accessible: response.ok,
      blocked: isBlocked,
      redirectedTo: finalUrl !== `https://${domain}/` ? finalUrl : undefined,
    };
  } catch {
    // HTTPS failed, try HTTP
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`http://${domain}`, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const finalUrl = response.url;

      const isBlocked = BLOCKED_INDICATORS.some(
        indicator => finalUrl.toLowerCase().includes(indicator.toLowerCase())
      );

      return {
        accessible: response.ok,
        blocked: isBlocked,
        redirectedTo: finalUrl,
      };
    } catch {
      return { accessible: false, blocked: true };
    }
  }
}

// Ana domain kontrol fonksiyonu
async function checkDomain(domain: string) {
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
  let reason = 'Erişilebilir';

  if (httpResult.blocked) {
    blocked = true;
    reason = 'BTK engel sayfasına yönlendirildi';
  } else if (!dnsResult.resolved && !httpResult.accessible) {
    blocked = true;
    reason = 'DNS çözümlenemedi ve HTTP erişilemedi';
  } else if (httpResult.redirectedTo && BLOCKED_INDICATORS.some(i => httpResult.redirectedTo?.includes(i))) {
    blocked = true;
    reason = 'Engel sayfasına yönlendirildi';
  }

  return {
    domain: cleanDomain,
    blocked,
    reason,
    dnsResolved: dnsResult.resolved,
    redirectedTo: httpResult.redirectedTo,
  };
}

// Basit in-memory state (Netlify Blobs ile değiştirilebilir)
// Her schedule çağrısında sıfırlanır, bu yüzden sadece değişiklikleri bildirir
const previousStates: Map<string, boolean> = new Map();

export default async function handler(req: Request, context: Context) {
  console.log('🔍 Domain kontrol başladı...');

  // Domain listesini al
  const domainsEnv = process.env.DOMAINS || '';
  const domains = domainsEnv.split(',').map(d => d.trim()).filter(d => d.length > 0);

  if (domains.length === 0) {
    console.log('❌ Domain listesi boş');
    return new Response(JSON.stringify({ error: 'No domains configured' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`📋 Kontrol edilecek domainler: ${domains.join(', ')}`);

  const results = [];
  const notifications = [];

  for (const domain of domains) {
    const result = await checkDomain(domain);
    results.push(result);

    // Engelliyse bildirim gönder
    if (result.blocked) {
      const emoji = '🚫';
      const message = `
${emoji} <b>DOMAIN ENGELLENDİ!</b>

🌐 <b>Domain:</b> ${result.domain}
📝 <b>Sebep:</b> ${result.reason}
🔗 <b>DNS:</b> ${result.dnsResolved ? 'Çözüldü' : 'Çözülemedi'}
${result.redirectedTo ? `↪️ <b>Yönlendirme:</b> ${result.redirectedTo}` : ''}
🕐 <b>Zaman:</b> ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
`;
      await sendTelegramMessage(message.trim());
      notifications.push(result.domain);
      console.log(`🚫 ${result.domain} ENGELLİ - Bildirim gönderildi`);
    } else {
      console.log(`✅ ${result.domain} erişilebilir`);
    }
  }

  // Özet rapor
  const blockedCount = results.filter(r => r.blocked).length;
  if (blockedCount > 0) {
    console.log(`📊 Sonuç: ${blockedCount}/${results.length} domain engelli`);
  } else {
    console.log(`✅ Tüm domainler erişilebilir`);
  }

  return new Response(
    JSON.stringify({
      success: true,
      checked: results.length,
      blocked: blockedCount,
      notifications: notifications.length,
      results,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

// Netlify Scheduled Function - Her 5 dakikada bir çalışır
export const config: Config = {
  schedule: "*/5 * * * *", // Her 5 dakika
};
