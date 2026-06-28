# | TA | System - Mobil Uygulama Tasarımı

## Uygulama Özeti

**Amaç:** Roblox Turkish Army War Simulator oyununa sunucu takip ve VPN bağlantısı ile hızlı giriş sağlayan React Native mobil uygulaması.

**Hedef Kullanıcı:** Roblox oyuncuları, özellikle Türkiye'de oyun oynamak isteyen kullanıcılar.

**Platform:** iOS ve Android (portrait mode, 9:16 aspect ratio, one-handed usage).

---

## Ekran Listesi

### 1. Ana Ekran (Sunucu Listesi)
**Adı:** Serverlar  
**Amaç:** Roblox Turkish Army War Simulator sunucularının listesini göstermek ve oyuncuya hızlı giriş sağlamak.

**İçerik ve İşlevsellik:**
- **Header:** "| TA | SYSTEM" başlığı, gönderilen fotoğraf arka planı (40% opacity)
- **Sunucu Kartları:** Her sunucu için:
  - Sıra numarası (1. Server, 2. Server, vb.)
  - Oyuncu sayısı (örn: 45/100)
  - Doluluk oranı (yeşil → sarı → kırmızı progress bar)
  - Ping bilgisi (ms cinsinden)
  - Favori butonu (❤️ / 🤍)
  - "Oyuna Katıl" butonu
- **Hızlı Katıl Butonu:** En dolu sunucuya direkt bağlanma
- **Yenile Butonu:** Sunucu listesini yenileme
- **Bildirim Sistemi:** 85+ oyuncu olunca bildirim gönderme
- **Favori Sunucular:** AsyncStorage'da saklama

**Kullanıcı Akışı:**
1. Kullanıcı uygulamayı açar → Sunucu listesi yüklenir
2. Sunucu seçer → "Oyuna Katıl" butonuna basar
3. Roblox deep link açılır → Oyun açılır
4. Alternatif: "Hızlı Katıl" → En dolu sunucuya direkt katılır

---

### 2. VPN Sekmesi
**Adı:** VPN  
**Amaç:** Kullanıcıya VPN bağlantısı sağlamak ve bağlantı durumunu göstermek.

**İçerik ve İşlevsellik:**
- **VPN Durumu Kartı:**
  - Bağlı/Bağlı Değil göstergesi
  - Mevcut IP adresi
  - Mevcut ülke
  - Bağlantı süresi
- **Ülke Seçimi:**
  - Dropdown veya liste ile ülke seçimi
  - Fransa, Almanya, ABD, İngiltere vb.
- **BAĞLAN Butonu:**
  - Seçili ülkeye VPN bağlantısı kurma
  - Bağlandıktan sonra "BAĞLANTIY KES" butonuna dönüşme
- **Açıklama Kutusu:**
  - "VPN bağlandığında Roblox sunucularına Türkiye dışından erişebilirsiniz"
  - "IP adresiniz değişecek, ülkeniz değişecek"

**Kullanıcı Akışı:**
1. Kullanıcı VPN sekmesine gider
2. Ülke seçer (örn: Fransa)
3. "BAĞLAN" butonuna basar
4. VPN bağlantısı kurulur (IP değişir, ülke değişir)
5. Ana ekrana geri dönüp sunucu listesi yüklenir
6. Oyuna katılır

---

## Birincil İçerik ve İşlevsellik

| Ekran | İçerik | İşlevsellik |
|-------|--------|------------|
| Serverlar | Sunucu listesi, header arka planı | Sunucu seçme, oyuna katılma, favori ekleme, yenileme |
| VPN | VPN durumu, ülke seçimi | VPN bağlantı/kesme, IP/ülke gösterme |

---

## Anahtar Kullanıcı Akışları

### Akış 1: Oyuna Hızlı Katılma
```
Uygulama Açılır
  ↓
Sunucu Listesi Yüklenir (Türkiye dışından)
  ↓
Kullanıcı "Oyuna Katıl" Butonuna Basar
  ↓
Roblox Deep Link Açılır (roblox://placeId=3231515867&gameInstanceId={serverId})
  ↓
Roblox Oyunu Açılır
```

### Akış 2: VPN ile Oyuna Katılma
```
Kullanıcı VPN Sekmesine Gider
  ↓
Ülke Seçer (Fransa)
  ↓
"BAĞLAN" Butonuna Basar
  ↓
VPN Bağlantısı Kurulur (IP değişir)
  ↓
Ana Ekrana Geri Dönüp Sunucu Listesi Yüklenir
  ↓
Oyuna Katılır
```

### Akış 3: Favori Sunucu Ekleme
```
Sunucu Kartında Favori Butonu (🤍) Görür
  ↓
Butonuna Basar
  ↓
Kalp Kırmızı Olur (❤️)
  ↓
AsyncStorage'da Kaydedilir
```

---

## Renk Seçimleri

| Renk | Kullanım | Hex Kodu |
|------|----------|----------|
| Arka Plan | Ekran arka planı (koyu) | #0D0F14 |
| Başlık Metni | "| TA | SYSTEM" başlığı | #FFFFFF |
| Askeri Yeşil | Aksenler, butonlar | #4ADE80 |
| Yeşil (Boş) | Sunucu doluluk 0-60% | #4ADE80 |
| Sarı (Orta) | Sunucu doluluk 60-85% | #F59E0B |
| Kırmızı (Dolu) | Sunucu doluluk 85%+ | #EF4444 |
| Overlay | Header arka plan overlay | rgba(13, 15, 20, 0.75) |

---

## Tema ve Stil

- **Tema:** Koyu (dark mode), askeri yeşil (#4ADE80) aksenler
- **Font:** Monospace (terminal görünüşü) - sistem default
- **Animasyonlar:** 
  - Pulse: VPN bağlı göstergesi
  - Scale: Buton press (0.97)
  - Slide: Panel geçişi
- **Responsive:** Portrait mode (9:16), one-handed usage
- **Durum Çubuğu:** Koyu tema ile uyumlu

---

## Tasarım Kararları

1. **Koyu Tema:** Oyuncu deneyimi, gece kullanımı, pil tasarrufu
2. **Monospace Font:** Terminal/hacker estetik, askeri tema uyumu
3. **Hızlı Katıl:** En dolu sunucuya direkt katılma, zaman tasarrufu
4. **Bildirim Sistemi:** 85+ oyuncu eşiği, oyuncuyu harekete geçirme
5. **VPN Entegrasyonu:** Gerçek VPN protokolü, IP/ülke değişimi
6. **Deep Link:** Roblox uygulamasına direkt bağlantı, sorunsuz geçiş

---

## Erişilebilirlik

- **Buton Boyutları:** Minimum 48x48 dp (one-handed usage)
- **Kontrast:** Metin ve arka plan arasında yeterli kontrast
- **Yazı Boyutu:** Minimum 12sp, başlıklar 18sp+
- **Dokunma Alanları:** Minimum 44x44 pt (iOS), 48x48 dp (Android)

---

## Notlar

- **Backend Hosting:** Şu an sandbox'ta, production'da Türkiye dışında host et
- **VPN Sağlayıcı:** ProtonVPN, Windscribe, TunnelBear (ücretsiz tier)
- **Roblox API:** Türkiye'den bloklanıyor, VPN/proxy gerekli
- **Bildirim Eşiği:** 85 kişi (ayarlanabilir yapılabilir)
