# | TA | System - Geliştirme TODO

## Kritik Sorunlar (Çözülmesi Gerekli)

### Sorun 1: VPN Bağlantısı Çalışmıyor
- [ ] OpenVPN veya WireGuard kütüphanesi entegrasyonu
- [ ] Native VPN API'si (Android VpnService, iOS NEVPNManager) entegrasyonu
- [ ] Ücretsiz VPN config dosyaları (ProtonVPN, Windscribe) temin etme
- [ ] VPN bağlantı UI'sını gerçek bağlantı akışına güncelleme
- [ ] VPN bağlandığında IP değişimini doğrulama

### Sorun 2: Roblox Sunucu Listesi Stabilizasyonu
- [ ] Retry logic ekleme (3 deneme, exponential backoff)
- [ ] Timeout değerini 20 saniyeye çıkarma
- [ ] Error handling iyileştirmesi
- [ ] Otomatik retry butonu ekleme
- [ ] VPN bağlandıktan sonra sunucu listesi yükleme testi

### Sorun 3: Header Arka Planı Gösterilmiyor
- [ ] Gönderilen fotoğrafı header-bg.webp olarak kopyalama
- [ ] ImageBackground opacity ayarı (40%)
- [ ] Overlay rengi ayarı (koyu arka plan)
- [ ] Web platformunda test etme

## Mevcut Çalışan Özellikler (Korumalı Kalmalı)

- [x] Roblox Sunucu Listesi (Türkiye dışından)
- [x] Oyuna Katıl (Deep Link)
- [x] Hızlı Katıl Butonu
- [x] Bildirim Sistemi (85+ kişi)
- [x] Favori Serverlar
- [x] VPN Sekmesi UI
- [x] Tab Navigation

## Kod Entegrasyonu

- [ ] Ana ekran (index.tsx) kodlarını entegre etme
- [ ] VPN sekmesi (vpn.tsx) kodlarını entegre etme
- [ ] Backend API (server/_core/index.ts) kodlarını entegre etme
- [ ] Tema ve stil ayarlarını entegre etme
- [ ] İkon mappinglerini güncelleme

## Testler

- [ ] Android cihazda VPN bağlantısı testi
- [ ] iOS cihazda VPN bağlantısı testi
- [ ] Sunucu listesi yükleme testi
- [ ] Bildirim sistemi testi
- [ ] Deep link testi
- [ ] Favori sunucular testi

## Teslim Kontrol Listesi

- [ ] VPN bağlantısı gerçek protokolle çalışıyor
- [ ] "BAĞLAN" butonuna basınca IP değişiyor
- [ ] Sunucu listesi VPN bağlandıktan sonra yükleniyor
- [ ] Header'da fotoğraf görülüyor
- [ ] Tüm butonlar çalışıyor
- [ ] Bildirim sistemi çalışıyor
- [ ] Fiziksel cihazda test edildi
