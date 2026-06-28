const apiKey = process.env.GEMINI_API_KEY;

async function testGemini() {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: "Merhaba, sen kimsin?" }]
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

    console.log("✅ Gemini API başarılı!");
    console.log("Yanıt:", data.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 100));
    process.exit(0);
  } catch (e) {
    console.error("❌ Bağlantı hatası:", e.message);
    process.exit(1);
  }
}

testGemini();
