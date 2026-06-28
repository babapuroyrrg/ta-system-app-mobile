# | TA | System - APK Alma ve AI Kurulum Rehberi

Bu döküman, uygulamanızı telefonunuza yüklemek (APK) ve AI asistanını aktif etmek için yapmanız gerekenleri adım adım açıklar.

## 1. AI Asistanı Aktif Etme (Google Gemini)

Groq yerine, ücretsiz katmanı çok daha geniş olan Google Gemini API'ye geçiş yaptık.

1.  [Google AI Studio](https://aistudio.google.com/app/apikey) adresine gidin.
2.  **"Create API key"** butonuna basarak ücretsiz bir anahtar alın.
3.  Projenizin kök dizinindeki `.env` dosyasını açın ve şu satırı ekleyin:
    ```
    GEMINI_API_KEY=ALDIĞINIZ_ANAHTAR_BURAYA
    ```

## 2. APK Çıktısı Alma (Android)

Uygulamayı telefonunuza indirilebilir bir dosya (.apk) olarak almak için şu adımları izleyin:

### A. Hazırlık
Bilgisayarınızda Node.js ve Expo CLI kurulu olmalıdır. Terminalde şu komutu çalıştırın:
```bash
npm install -g eas-cli
```

### B. Giriş Yapma
Expo hesabınız yoksa [expo.dev](https://expo.dev) üzerinden oluşturun ve terminalden giriş yapın:
```bash
eas login
```

### C. APK Oluşturma
Terminalde projenizin klasörüne gidin ve şu komutu çalıştırın:
```bash
eas build -p android --profile preview
```
*Bu komut size bir link verecektir. İşlem bittiğinde o linkten doğrudan `.apk` dosyasını indirebilirsiniz.*

## 3. Önemli Notlar
- **Bildirimler:** Uygulama kapalıyken bildirim alabilmek için backend sunucunuzun (Express) bir yerde (örneğin Render, Railway veya kendi sunucunuz) 7/24 çalışıyor olması gerekir.
- **Backend URL:** Uygulamayı telefona kurduğunuzda, `EXPO_PUBLIC_API_BASE_URL` değişkeninin backend sunucunuzun internetteki adresi (https://...) olduğundan emin olun. Yerel ağdaki (localhost) adresler gerçek telefonlarda çalışmaz.
