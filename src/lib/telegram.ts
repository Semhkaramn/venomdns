// Telegram Bot API Helper

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

interface TelegramMessage {
  domain: string;
  status: 'blocked' | 'unblocked' | 'error';
  details?: string;
  checkedAt: Date;
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Telegram credentials not configured');
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: text,
          parse_mode: 'HTML',
        }),
      }
    );

    const data = await response.json();
    return data.ok;
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    return false;
  }
}

export async function sendBlockedAlert(message: TelegramMessage): Promise<boolean> {
  const emoji = message.status === 'blocked' ? '🚫' : message.status === 'unblocked' ? '✅' : '⚠️';
  const statusText = message.status === 'blocked' ? 'ENGELLENDİ' : message.status === 'unblocked' ? 'ERİŞİLEBİLİR' : 'HATA';

  const text = `
${emoji} <b>Domain Durum Değişikliği</b>

🌐 <b>Domain:</b> ${message.domain}
📊 <b>Durum:</b> ${statusText}
${message.details ? `📝 <b>Detay:</b> ${message.details}` : ''}
🕐 <b>Kontrol:</b> ${message.checkedAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
`;

  return sendTelegramMessage(text.trim());
}

export async function sendDailyReport(
  domains: { domain: string; blocked: boolean; lastChecked: Date }[]
): Promise<boolean> {
  const blockedCount = domains.filter(d => d.blocked).length;
  const openCount = domains.filter(d => !d.blocked).length;

  let text = `
📊 <b>Günlük Domain Raporu</b>

✅ Açık: ${openCount}
🚫 Engelli: ${blockedCount}
📁 Toplam: ${domains.length}

<b>Detaylar:</b>
`;

  for (const d of domains) {
    const emoji = d.blocked ? '🚫' : '✅';
    text += `${emoji} ${d.domain}\n`;
  }

  text += `\n🕐 ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`;

  return sendTelegramMessage(text.trim());
}
