import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// Birden fazla proxy URL'si dene - retry logic ile
async function fetchWithFallback(targetUrl: string, maxRetries: number = 3): Promise<Response> {
  const timeoutMs = 20000; // 20 saniye timeout
  const headers = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  // Önce direkt dene
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(targetUrl, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) return res;
  } catch (e) {
    // direkt başarısız, proxy dene
  }

  // Proxy'ler - sırasıyla dene
  const proxies = [
    // Proxifly - en hızlı ve güvenilir
    {
      name: "Proxifly",
      url: (url: string) =>
        `https://api.proxifly.dev/v1/proxy?url=${encodeURIComponent(url)}&country=us`,
    },
    // AllOrigins - CORS proxy
    {
      name: "AllOrigins",
      url: (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    },
    // CorsProxy
    {
      name: "CorsProxy",
      url: (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    },
    // Direkten tarayıcı üzerinden (son çare)
    {
      name: "Direct",
      url: (url: string) => url,
    },
  ];

  for (const proxy of proxies) {
    try {
      const proxyUrl = proxy.url(targetUrl);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(proxyUrl, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        console.log(`[Proxy] ${proxy.name} başarılı`);
        return res;
      }
    } catch (e) {
      console.log(`[Proxy] ${proxy.name} başarısız:`, e instanceof Error ? e.message : "Unknown");
    }
  }

  throw new Error("Tüm proxy sunucuları başarısız oldu");
}

// Retry logic ile Roblox sunucu listesi getir
async function fetchRobloxServersWithRetry(placeId: string, maxRetries: number = 3): Promise<Response> {
  const robloxUrl = `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Desc&limit=100`;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[Roblox] Attempt ${attempt + 1}/${maxRetries}: ${robloxUrl}`);
      const response = await fetchWithFallback(robloxUrl);
      if (response.ok) {
        console.log(`[Roblox] Success on attempt ${attempt + 1}`);
        return response;
      }
      console.log(`[Roblox] HTTP ${response.status} on attempt ${attempt + 1}`);
    } catch (e) {
      console.log(`[Roblox] Error on attempt ${attempt + 1}:`, e instanceof Error ? e.message : "Unknown");
      if (attempt < maxRetries - 1) {
        // Exponential backoff: 2s, 4s, 6s
        const delayMs = 2000 * (attempt + 1);
        console.log(`[Roblox] Retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  
  throw new Error("Roblox sunucu listesi yüklenemedi - tüm denemeler başarısız");
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // ─── Roblox sunucu listesi proxy (CORS bypass + çoklu fallback + retry logic) ───────────
  app.get("/api/roblox/servers/:placeId", async (req, res) => {
    try {
      const { placeId } = req.params;
      console.log(`[Roblox] Fetching servers for placeId: ${placeId}`);

      const response = await fetchRobloxServersWithRetry(placeId, 3);

      if (!response.ok) {
        console.error(`[Roblox] API error: ${response.status}`);
        res.status(response.status).json({ error: `Roblox API error: ${response.status}` });
        return;
      }

      const data = await response.json();
      console.log(`[Roblox] Success: ${data.data?.length || 0} servers`);
      res.json(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(`[Roblox] Error:`, msg);
      res.status(500).json({ error: msg });
    }
  });

  // ─── VPN bağlantı durumu endpoint'i (çalışan API'ler) ─────────────────────
  app.get("/api/vpn/status", async (_req, res) => {
    try {
      console.log("[VPN] Checking connection...");

      let connected = false;
      let ip = "Unknown";
      let country = "Unknown";
      let provider = "Unknown";

      // 1. PubProxy API - Ücretsiz proxy listesi (en güvenilir)
      try {
        console.log("[VPN] Trying PubProxy API...");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const proxyRes = await fetch("http://pubproxy.com/api/proxy?type=http&level=elite&speed=10", {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (proxyRes.ok) {
          const proxyData = await proxyRes.json() as { data?: Array<{ ip?: string; country?: string }> };
          if (proxyData.data && proxyData.data.length > 0) {
            const proxy = proxyData.data[0];
            ip = proxy.ip || "Unknown";
            country = proxy.country || "Unknown";
            provider = "PubProxy";
            connected = true;
            console.log(`[VPN] PubProxy success - IP: ${ip}, Country: ${country}`);
          }
        }
      } catch (e) {
        console.log("[VPN] PubProxy failed:", e instanceof Error ? e.message : "Unknown");
      }

      // 2. IPify API - IP adresi kontrol et (fallback)
      if (!connected) {
        try {
          console.log("[VPN] Trying IPify API...");
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const ipRes = await fetch("https://ipapi.co/json/", {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          });
          clearTimeout(timeoutId);

          if (ipRes.ok) {
            const ipData = await ipRes.json() as { ip?: string; country_name?: string };
            ip = ipData.ip || "Unknown";
            country = ipData.country_name || "Unknown";
            provider = "IPify";
            connected = true;
            console.log(`[VPN] IPify success - IP: ${ip}, Country: ${country}`);
          }
        } catch (e) {
          console.log("[VPN] IPify failed:", e instanceof Error ? e.message : "Unknown");
        }
      }

      // 3. LocationIQ API - Konum bilgisi (son çare)
      if (!connected) {
        try {
          console.log("[VPN] Trying LocationIQ API...");
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const locRes = await fetch("https://ipinfo.io/json", {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          });
          clearTimeout(timeoutId);

          if (locRes.ok) {
            const locData = await locRes.json() as { ip?: string; country?: string };
            ip = locData.ip || "Unknown";
            country = locData.country || "Unknown";
            provider = "LocationIQ";
            connected = true;
            console.log(`[VPN] LocationIQ success - IP: ${ip}, Country: ${country}`);
          }
        } catch (e) {
          console.log("[VPN] LocationIQ failed:", e instanceof Error ? e.message : "Unknown");
        }
      }

      res.json({
        connected,
        ip,
        country,
        provider,
        timestamp: new Date().toISOString(),
      });
    } catch (e: unknown) {
      console.error("[VPN] Error:", e instanceof Error ? e.message : "Unknown");
      res.json({
        connected: false,
        error: e instanceof Error ? e.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Push token kaydı — cihaz token'ını bellekte tutar (basit in-memory, production için DB'ye taşı)
  const pushTokens = new Set<string>();

  app.post("/api/push/register", (req, res) => {
    const { token } = req.body as { token?: string };
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "token gerekli" });
    }
    pushTokens.add(token);
    console.log(`[Push] Token kaydedildi. Toplam: ${pushTokens.size}`);
    return res.json({ ok: true });
  });

  // Push token listesi — heartbeat servisi bunu kullanır
  app.get("/api/push/tokens", (_req, res) => {
    return res.json({ tokens: Array.from(pushTokens) });
  });

  // AI Asistan endpoint — Google Gemini (ücretsiz) kullanır
  app.post("/api/ai/chat", async (req, res) => {
    const { messages, serverContext } = req.body as {
      messages?: Array<{ role: "user" | "assistant"; content: string }>;
      serverContext?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages gerekli" });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY ?? "";
    if (!geminiApiKey) {
      return res.status(503).json({ error: "AI servisi şu an kullanılamıyor (API Key eksik)." });
    }

    const taGameKnowledge = `
TA (Türk Ordusu) oyunu hakkında detaylı bilgiler:

HAVA KUVVETLERİ KOMUTANLIĞI (HKK):
Slogan: "İstikbal Göklerdedir". Görevler: Hava operasyonları, jetler ve helikopterler ile görevler. Rekorlar: TA Cup 2024-2025 Kısa Film Şampiyonu, 192+1 aktiflik rekoru. Birimler: Filo Hançerler (bombalama), Filo Türk Yıldızları (akrobasi), Muharebe Arama Kurtarma (helikopter), Disiplin Ofisi. Özellikleri: Yüksek aktiflik, samimilik, ortam, jetler ve helikopterler.

KARA KUVVETLERİ KOMUTANLIĞI (KK):
Slogan: "Bütün Branşları geç, Kara Kuvvetleri Komutanlığını seç." Altın Kural: "Man Face!" Özellikleri: Sıcak, arkadaş canlı, eğlenceyi seven, 8000+ üye, en kalabalık branş. Rekorlar: 186 kişi ile aktiflik rekoru, 62 kişi ile patrol rekoru. Araçlar: 2 BMC, 1 Kirpi, 2 Tank. Silahlar: 1 G3, 1 Glock-17, 2 Tank. Birimler: Zırhlı Birlikler (Tankçılar/Siyah Bereliler), Komando Harp Okulu (Mavi Bereliler), BÖRÜ Timi. Giriş Şartı: 50+ hesap yaşı, OR-2 ve üstü rütbe.

JANDARMA GENEL KOMUTANLIĞI (JGK):
Slogan: "Kanun Ordusu!" Görevler: Trafik asayişi, trafik cezası, ehliyet kontrolü, çevirme, radar hız ölçümü. Özellikleri: Aktiflik ve göreve dayalı, sık alımlar, 6000+ üye. Araçlar: 2 sirenli görev aracı, 1 BMC. Silahlar: HK416, Glock17, detain, barikat, dur/geç tabelası, radar tabancası. Birimler: THDB (Trafik Hizmetleri Daire Başkanlığı), JÖH (Jandarma Özel Harekat). Giriş Şartı: 50+ hesap yaşı, OR-2 ve üstü rütbe, TA DC'de bulunma.

ÖZEL KUVVETLER KOMUTANLIĞI (ÖKK):
Altın Kural: "Saygı". Görevler: İsyanlara karşı mücadele, operasyon, sınırda nöbet, sınırı savunma. Özellikleri: En çok üniformaya sahip branş (18 adet), elit branş. Silahlar: Glock-17, Kalkan, M4, Bora-12 (KNT biriminde). Araçlar: 3 adet. Birimler: ÖKB (denetim koruma), SAS (nöbet/devriye), SAT (gizli görevler), KNT (operasyon). Giriş Şartı: 150+ hesap yaşı, OR-3 ve üstü rütbe, ÖKHA sınavını geçme.

SINIR MÜFETTİŞLERİ (SM):
Slogan: "Hudut Namustur!" Görevler: Sınır güvenliği, sivil kontrol, sınırı düzende tutma. Özellikleri: Aktiflik branşı, sık alımlar. Silahlar: AK-74M, Glock-17, detain (IV Müfettiş ve üstü). Araçlar: 2 BMC, 1 Kirpi. Birimler: Denetim Birimi, Gardiyan Muhafızlar. Özel Sistem: Haftanın Müfettişi (OR-9'dan OF-1/A'ya terfi). Giriş Şartı: 50+ hesap yaşı, OR-2 ve üstü rütbe.

GENEL OYUN BİLGİLERİ:
TA içerisinde eğitimlere katılarak rütbe atlarsinız. Ilerledikçe kariyeriniz gelişir, çeşitli branşlara katılır, arkadaşlar edinir ve sosyal çevre kurarsinız. Her oyuncu kendi yolunu seçerek ilerleyebilir. Her branşın kendine özgü kültürü, sloganı, rekorları ve birim yapısı vardır.
`;

    const systemPrompt = `Sen | TA | Türk Ordusu klan uygulamasının AI asistanısın. Türkçe yanıt ver. Kısa ve net ol.

TA oyunu ve branşları hakkında bilgi:
${taGameKnowledge}

Roblox oyunları, klan stratejileri ve oyun tavsiyeleri konusunda yardımcı ol. Kullanıcı TA oyunu hakkında sorular sorduğunda yukarıdaki bilgileri kullan. Her cevap farklı perspektiften olabilir ama doğru bilgiler içermelidir.${
      serverContext ? `\n\nŞu anki sunucu durumu:\n${serverContext}` : ""
    }`;

    try {
      // Son 10 mesajı al (context window'u sınırla)
      const recentMessages = messages.slice(-10);
      
      // Gemini formatına dönüştür
      const contents = recentMessages.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

      // System prompt'u en başa ekle
      contents.unshift({
        role: "user",
        parts: [{ text: `TALİMAT: ${systemPrompt}` }]
      });
      contents.push({
        role: "model",
        parts: [{ text: "Anladım, TA oyunu hakkında bilgili bir asistan olarak yardımcı olacağım." }]
      });

      // Model fallback zinciri: en hızlıdan en yavaşa
      const GEMINI_MODELS = [
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
        "gemini-2.0-flash-lite",
      ];

      async function callGeminiWithFallback(contents: any[]): Promise<string> {
        let lastError = "";
        for (const model of GEMINI_MODELS) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 25000);

              const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ contents }),
                  signal: controller.signal,
                }
              );

              clearTimeout(timeoutId);

              if (geminiRes.ok) {
                const data = await geminiRes.json() as any;
                const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (reply) {
                  console.log(`[AI] Success with model: ${model}`);
                  return reply;
                }
              }

              const errBody = await geminiRes.json().catch(() => ({})) as any;
              lastError = errBody?.error?.message ?? `HTTP ${geminiRes.status}`;
              console.warn(`[AI] Model ${model} attempt ${attempt + 1} failed: ${lastError}`);

              // 429 veya 503 ise kısa bekle ve tekrar dene
              if (geminiRes.status === 429 || geminiRes.status === 503) {
                await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
              } else {
                break; // Diğer hatalarda bu modeli bırak
              }
            } catch (e: unknown) {
              lastError = e instanceof Error ? e.message : "Unknown";
              console.warn(`[AI] Model ${model} attempt ${attempt + 1} exception: ${lastError}`);
              if (lastError.includes("abort")) {
                break; // Timeout, bu modeli bırak
              }
            }
          }
        }
        throw new Error(lastError || "Tüm modeller başarısız");
      }

      const reply = await callGeminiWithFallback(contents);
      return res.json({ reply });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      console.error(`[AI] Exception: ${msg}`);
      if (msg.includes("abort") || msg.includes("zaman aşımı")) {
        return res.status(504).json({ error: "Yanıt süresi doldu. Lütfen daha kısa bir soru sorun." });
      }
      if (msg.includes("quota") || msg.includes("429")) {
        return res.status(429).json({ error: "AI servisi şu an yoğun. 1 dakika sonra tekrar deneyin." });
      }
      return res.status(500).json({ error: `AI servisi geçici olarak kullanılamıyor. Lütfen tekrar deneyin.` });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
