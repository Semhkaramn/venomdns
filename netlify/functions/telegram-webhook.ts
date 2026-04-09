import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// Telegram mesaj gönder
async function sendMessage(chatId: number, text: string, parseMode = "HTML") {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    }),
  });
}

// Domain listesini al
async function getDomains(userId: number): Promise<string[]> {
  try {
    const store = getStore("domains");
    const data = await store.get(`user_${userId}`, { type: "json" });
    return (data as string[]) || [];
  } catch {
    return [];
  }
}

// Domain listesini kaydet
async function saveDomains(userId: number, domains: string[]): Promise<void> {
  const store = getStore("domains");
  await store.setJSON(`user_${userId}`, domains);
}

// Domain kontrolü
async function checkDomain(domain: string): Promise<{
  blocked: boolean;
  reason: string;
}> {
  const cleanDomain = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();

  const BLOCKED_INDICATORS = [
    "uyari.btk.gov.tr",
    "blocked.net.tr",
    "195.175.254.2",
    "212.175.180.166",
  ];

  // DNS kontrolü
  let dnsResolved = false;
  try {
    const dnsRes = await fetch(
      `https://dns.google/resolve?name=${cleanDomain}&type=A`
    );
    const dnsData = await dnsRes.json();
    dnsResolved = dnsData.Status === 0 && dnsData.Answer?.length > 0;
  } catch {
    dnsResolved = false;
  }

  // HTTP kontrolü
  let httpOk = false;
  let redirectedTo = "";
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`https://${cleanDomain}`, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    httpOk = res.ok;
    redirectedTo = res.url;
  } catch {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`http://${cleanDomain}`, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
      });
      httpOk = res.ok;
      redirectedTo = res.url;
    } catch {
      httpOk = false;
    }
  }

  // Engel tespiti
  const isBlocked = BLOCKED_INDICATORS.some((i) =>
    redirectedTo.toLowerCase().includes(i.toLowerCase())
  );

  if (isBlocked) {
    return { blocked: true, reason: "BTK engel sayfasına yönlendirildi" };
  }
  if (!dnsResolved && !httpOk) {
    return { blocked: true, reason: "DNS ve HTTP erişilemedi" };
  }
  return { blocked: false, reason: "Erişilebilir" };
}

// Komut işleyicileri
async function handleStart(chatId: number, firstName: string) {
  const message = `
👋 <b>Merhaba ${firstName}!</b>

Ben <b>Domain Engel Kontrol Botu</b>yum.

Türkiye'de engellenmiş domainleri takip eder ve sana bildirim gönderirim.

<b>📋 Komutlar:</b>

/add <code>domain.com</code> - Domain ekle
/remove <code>domain.com</code> - Domain çıkar
/list - Domainlerini listele
/check - Tüm domainleri kontrol et
/check <code>domain.com</code> - Tek domain kontrol
/help - Yardım

<b>🔔 Otomatik Kontrol:</b>
Eklediğin domainler her 5 dakikada bir kontrol edilir. Engel tespit edilirse sana haber veririm!
`;
  await sendMessage(chatId, message);
}

async function handleHelp(chatId: number) {
  const message = `
📖 <b>Yardım</b>

<b>Domain Ekleme:</b>
<code>/add example.com</code>
<code>/add site1.com site2.net</code>

<b>Domain Çıkarma:</b>
<code>/remove example.com</code>

<b>Listeleme:</b>
<code>/list</code>

<b>Manuel Kontrol:</b>
<code>/check</code> - Tüm domainler
<code>/check example.com</code> - Tek domain
`;
  await sendMessage(chatId, message);
}

async function handleAdd(chatId: number, userId: number, args: string[]) {
  if (args.length === 0) {
    await sendMessage(
      chatId,
      "❌ Kullanım: <code>/add domain.com</code>",
    );
    return;
  }

  const domains = await getDomains(userId);
  const added: string[] = [];
  const exists: string[] = [];

  for (const arg of args) {
    const domain = arg
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .trim()
      .toLowerCase();

    if (domain && domain.includes(".")) {
      if (domains.includes(domain)) {
        exists.push(domain);
      } else {
        domains.push(domain);
        added.push(domain);
      }
    }
  }

  if (added.length > 0) {
    await saveDomains(userId, domains);
  }

  let message = "";
  if (added.length > 0) {
    message += `✅ <b>Eklendi:</b>\n${added.map((d) => `• ${d}`).join("\n")}\n\n`;
  }
  if (exists.length > 0) {
    message += `⚠️ <b>Zaten ekli:</b>\n${exists.map((d) => `• ${d}`).join("\n")}\n\n`;
  }
  message += `📊 Toplam ${domains.length} domain takip ediliyor.`;

  await sendMessage(chatId, message);
}

async function handleRemove(chatId: number, userId: number, args: string[]) {
  if (args.length === 0) {
    await sendMessage(
      chatId,
      "❌ Kullanım: <code>/remove domain.com</code>",
    );
    return;
  }

  const domains = await getDomains(userId);
  const removed: string[] = [];
  const notFound: string[] = [];

  for (const arg of args) {
    const domain = arg.toLowerCase().trim();
    const index = domains.indexOf(domain);
    if (index > -1) {
      domains.splice(index, 1);
      removed.push(domain);
    } else {
      notFound.push(domain);
    }
  }

  if (removed.length > 0) {
    await saveDomains(userId, domains);
  }

  let message = "";
  if (removed.length > 0) {
    message += `🗑️ <b>Çıkarıldı:</b>\n${removed.map((d) => `• ${d}`).join("\n")}\n\n`;
  }
  if (notFound.length > 0) {
    message += `⚠️ <b>Bulunamadı:</b>\n${notFound.map((d) => `• ${d}`).join("\n")}\n\n`;
  }
  message += `📊 Toplam ${domains.length} domain takip ediliyor.`;

  await sendMessage(chatId, message);
}

async function handleList(chatId: number, userId: number) {
  const domains = await getDomains(userId);

  if (domains.length === 0) {
    await sendMessage(
      chatId,
      "📭 Henüz domain eklememişsin.\n\n<code>/add domain.com</code> ile ekleyebilirsin.",
    );
    return;
  }

  const message = `
📋 <b>Domain Listesi</b> (${domains.length})

${domains.map((d, i) => `${i + 1}. <code>${d}</code>`).join("\n")}

Her 5 dakikada bir otomatik kontrol edilir.
`;
  await sendMessage(chatId, message);
}

async function handleCheck(chatId: number, userId: number, args: string[]) {
  // Tek domain kontrolü
  if (args.length > 0) {
    const domain = args[0]
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .toLowerCase()
      .trim();

    await sendMessage(chatId, `🔍 <code>${domain}</code> kontrol ediliyor...`);

    const result = await checkDomain(domain);
    const emoji = result.blocked ? "🚫" : "✅";
    const status = result.blocked ? "ENGELLİ" : "AÇIK";

    const message = `
${emoji} <b>${status}</b>

🌐 <b>Domain:</b> <code>${domain}</code>
📝 <b>Durum:</b> ${result.reason}
🕐 <b>Kontrol:</b> ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}
`;
    await sendMessage(chatId, message);
    return;
  }

  // Tüm domainleri kontrol et
  const domains = await getDomains(userId);

  if (domains.length === 0) {
    await sendMessage(
      chatId,
      "📭 Kontrol edilecek domain yok.\n\n<code>/add domain.com</code> ile ekleyebilirsin.",
    );
    return;
  }

  await sendMessage(
    chatId,
    `🔍 ${domains.length} domain kontrol ediliyor...`,
  );

  const results: { domain: string; blocked: boolean; reason: string }[] = [];

  for (const domain of domains) {
    const result = await checkDomain(domain);
    results.push({ domain, ...result });
  }

  const blocked = results.filter((r) => r.blocked);
  const open = results.filter((r) => !r.blocked);

  let message = `
📊 <b>Kontrol Sonuçları</b>

✅ Açık: ${open.length}
🚫 Engelli: ${blocked.length}

`;

  if (blocked.length > 0) {
    message += `<b>🚫 Engelli Domainler:</b>\n`;
    for (const r of blocked) {
      message += `• <code>${r.domain}</code>\n  └ ${r.reason}\n`;
    }
    message += "\n";
  }

  if (open.length > 0) {
    message += `<b>✅ Açık Domainler:</b>\n`;
    for (const r of open) {
      message += `• <code>${r.domain}</code>\n`;
    }
  }

  message += `\n🕐 ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`;

  await sendMessage(chatId, message);
}

// Ana webhook handler
export default async function handler(req: Request, context: Context) {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const update = await req.json();

    // Mesaj kontrolü
    const message = update.message;
    if (!message || !message.text) {
      return new Response("OK", { status: 200 });
    }

    const chatId = message.chat.id;
    const userId = message.from.id;
    const firstName = message.from.first_name || "Kullanıcı";
    const text = message.text.trim();

    // Komut parse et
    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase().replace("@", "").split("@")[0];
    const args = parts.slice(1);

    switch (command) {
      case "/start":
        await handleStart(chatId, firstName);
        break;
      case "/help":
        await handleHelp(chatId);
        break;
      case "/add":
        await handleAdd(chatId, userId, args);
        break;
      case "/remove":
      case "/delete":
      case "/del":
        await handleRemove(chatId, userId, args);
        break;
      case "/list":
      case "/domains":
        await handleList(chatId, userId);
        break;
      case "/check":
      case "/kontrol":
        await handleCheck(chatId, userId, args);
        break;
      default:
        // Bilinmeyen komut - yoksay
        break;
    }
  } catch (error) {
    console.error("Webhook error:", error);
  }

  return new Response("OK", { status: 200 });
}

export const config: Config = {
  path: "/api/telegram-webhook",
};
