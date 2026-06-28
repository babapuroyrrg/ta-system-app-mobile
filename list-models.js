const apiKey = process.env.GEMINI_API_KEY;

async function listModels() {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    const data = await response.json();
    if (data.models) {
      console.log("Mevcut modeller:");
      data.models.forEach(m => console.log("- " + m.name));
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error("Hata:", e.message);
  }
}

listModels();
