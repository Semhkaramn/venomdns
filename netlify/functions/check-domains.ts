import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// Telegram mesaj gönder
async function sendMessage(chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
}

// Engel göstergeleri
const BLOCKED_INDICATORS = [
  "uyari.btk.gov.tr",
  "blocked.net.tr",
  "195.175.254.2",
  "212.175.180.166",
];

// Domain kontrolü
async function checkDomain(domain: string): Promise<{
  blocked: boolean;
  reason: string;
}> {
  // DNS kontrolü
  let dnsResolved = false;
  try {
    const dnsRes = await fetch(
      `https://dns.google/resolve?name=${domain}&type=A`
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

    const res = await fetch(`https://${domain}`, {
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
      const res = await fetch(`http://${domain}`, {
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

// Önceki durumları al
async function getPreviousStates(
  userId: string
): Promise<Record<string, boolean>> {
  try {
    const store = getStore("domain-states");
    const data = await store.get(`states_${userId}`, { type: "json" });
    return (data as Record<string, boolean>) || {};
  } catch {
    return {};
  }
}

// Durumları kaydet
async function saveStates(
  userId: string,
  states: Record<string, boolean>
): Promise<void> {
  const store = getStore("domain-states");
  await store.setJSON(`states_${userId}`, states);
}

export default async function handler(req: Request, context: Context) {
  console.log("Domain kontrolu basladi");

  try {
    const store = getStore("domains");
    const { blobs } = await store.list();

    if (blobs.length === 0) {
      console.log("Kullanici yok");
      return new Response(JSON.stringify({ message: "No users" }), {
        status: 200,
      });
    }

    let totalChecked = 0;
    let totalBlocked = 0;
    let notificationsSent = 0;

    // Her kullanıcı için kontrol et
    for (const blob of blobs) {
      const userId = blob.key.replace("user_", "");
      const domains = (await store.get(blob.key, { type: "json" })) as string[];

      if (!domains || domains.length === 0) continue;

      console.log(`User ${userId}: ${domains.length} domain`);

      const previousStates = await getPreviousStates(userId);
      const currentStates: Record<string, boolean> = {};

      for (const domain of domains) {
        const result = await checkDomain(domain);
        currentStates[domain] = result.blocked;
        totalChecked++;

        if (result.blocked) {
          totalBlocked++;
        }

        // Durum değişti mi? (yeni engel)
        const wasBlocked = previousStates[domain] === true;
        const isNowBlocked = result.blocked;

        // Yeni engel tespit edildi
        if (isNowBlocked && !wasBlocked) {
          await sendMessage(userId, `ENGEL: ${domain}`);
          notificationsSent++;
          console.log(`${domain} ENGELLENDİ`);
        }

        // Engel kalktı
        if (!isNowBlocked && wasBlocked) {
          await sendMessage(userId, `ACIK: ${domain}`);
          notificationsSent++;
          console.log(`${domain} ACILDI`);
        }
      }

      // Durumları kaydet
      await saveStates(userId, currentStates);
    }

    console.log(`Sonuc: ${totalChecked} kontrol, ${totalBlocked} engelli, ${notificationsSent} bildirim`);

    return new Response(
      JSON.stringify({
        success: true,
        checked: totalChecked,
        blocked: totalBlocked,
        notifications: notificationsSent,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Kontrol hatası:", error);
    return new Response(JSON.stringify({ error: "Check failed" }), {
      status: 500,
    });
  }
}

// Her 5 dakikada bir çalış
export const config: Config = {
  schedule: "*/5 * * * *",
};
