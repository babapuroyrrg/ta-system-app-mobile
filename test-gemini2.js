const apiKey = process.env.GEMINI_API_KEY;

async function testGemini() {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: "Merhaba" }]
            }
          ]
        })
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("❌ Hata:", data.error?.message);
      process.exit(1);
    }

    console.log("✅ Gemini API çalışıyor!");
    process.exit(0);
  } catch (e) {
    console.error("❌ Bağlantı hatası:", e.message);
    process.exit(1);
  }
}

testGemini();
