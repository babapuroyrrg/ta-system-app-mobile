const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("❌ GEMINI_API_KEY tanımlanmamış");
  process.exit(1);
}

async function testGemini() {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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

    if (!response.ok) {
      const error = await response.json();
      console.error("❌ Gemini API hatası:", error);
      process.exit(1);
    }

    const data = await response.json();
    console.log("✅ Gemini API başarılı!");
    console.log("Yanıt:", data.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 100));
    process.exit(0);
  } catch (e) {
    console.error("❌ Bağlantı hatası:", e.message);
    process.exit(1);
  }
}

testGemini();
