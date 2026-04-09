import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// Telegram mesaj gönder
async function sendMessage(chatId: number, text: string, parseMode = "HTML") {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    });
    console.log("Telegram response:", await response.text());
  } catch (error) {
    console.error("Telegram send error:", error);
  }
}

// Domain listesini al
async function getDomains(userId: number): Promise<string[]> {
  try {
    const store = getStore("domains");
    const key = `user_${userId}`;
    console.log(`Getting domains for key: ${key}`);
    const data = await store.get(key, { type: "json" });
    console.log(`Retrieved data:`, data);
    return (data as string[]) || [];
  } catch (error) {
    console.error("getDomains error:", error);
    return [];
  }
}

// Domain listesini kaydet
async function saveDomains(userId: number, domains: string[]): Promise<boolean> {
  try {
    const store = getStore("domains");
    const key = `user_${userId}`;
    console.log(`Saving domains for key: ${key}`, domains);
    await store.setJSON(key, domains);
    console.log(`Successfully saved domains for ${key}`);
    return true;
  } catch (error) {
    console.error("saveDomains error:", error);
    return false;
  }
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
  const message = `<b>Komutlar</b>

/add domain.com - Ekle
/remove domain.com - Çıkar
/list - Listele
/check - Kontrol et`;
  await sendMessage(chatId, message);
}

async function handleHelp(chatId: number) {
  const message = `/add domain.com - Ekle
/add site1.com site2.com - Çoklu ekle
/remove domain.com - Çıkar
/list - Listele
/check - Tümünü kontrol et
/check domain.com - Tek kontrol`;
  await sendMessage(chatId, message);
}

async function handleAdd(chatId: number, userId: number, args: string[]) {
  if (args.length === 0) {
    await sendMessage(chatId, "Kullanım: /add domain.com");
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
    const saved = await saveDomains(userId, domains);
    if (!saved) {
      await sendMessage(chatId, "Hata: Kaydedilemedi");
      return;
    }
  }

  let message = "";
  if (added.length > 0) {
    message += `Eklendi: ${added.join(", ")}`;
  }
  if (exists.length > 0) {
    if (message) message += "\n";
    message += `Zaten ekli: ${exists.join(", ")}`;
  }
  message += `\nToplam: ${domains.length}`;

  await sendMessage(chatId, message);
}

async function handleRemove(chatId: number, userId: number, args: string[]) {
  if (args.length === 0) {
    await sendMessage(chatId, "Kullanım: /remove domain.com");
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
    const saved = await saveDomains(userId, domains);
    if (!saved) {
      await sendMessage(chatId, "Hata: Kaydedilemedi");
      return;
    }
  }

  let message = "";
  if (removed.length > 0) {
    message += `Çıkarıldı: ${removed.join(", ")}`;
  }
  if (notFound.length > 0) {
    if (message) message += "\n";
    message += `Bulunamadı: ${notFound.join(", ")}`;
  }
  message += `\nToplam: ${domains.length}`;

  await sendMessage(chatId, message);
}

async function handleList(chatId: number, userId: number) {
  const domains = await getDomains(userId);

  if (domains.length === 0) {
    await sendMessage(chatId, "Liste boş");
    return;
  }

  const message = domains.map((d, i) => `${i + 1}. ${d}`).join("\n");
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

    const result = await checkDomain(domain);
    const status = result.blocked ? "ENGELLI" : "ACIK";
    await sendMessage(chatId, `${domain}: ${status}`);
    return;
  }

  // Tüm domainleri kontrol et
  const domains = await getDomains(userId);

  if (domains.length === 0) {
    await sendMessage(chatId, "Liste boş");
    return;
  }

  const results: { domain: string; blocked: boolean }[] = [];

  for (const domain of domains) {
    const result = await checkDomain(domain);
    results.push({ domain, blocked: result.blocked });
  }

  const blocked = results.filter((r) => r.blocked);
  const open = results.filter((r) => !r.blocked);

  let message = "";

  if (blocked.length > 0) {
    message += `ENGELLI:\n${blocked.map((r) => r.domain).join("\n")}`;
  }

  if (open.length > 0) {
    if (message) message += "\n\n";
    message += `ACIK:\n${open.map((r) => r.domain).join("\n")}`;
  }

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
