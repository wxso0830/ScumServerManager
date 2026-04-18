# LGSS Manager — Tek-Paket `.exe` Build Rehberi (Türkçe)

Bu rehber, **Python / Node.js / MongoDB kurulu olmayan bilgisayarlarda da** tek tıkla çalışan bir kurulum dosyası (`LGSS Manager Setup.exe`) üretmeni sağlar.

> ⚠️ Bu adımları **SADECE BİR KEZ** yapacaksın (build yapan makinede). Sonuç `.exe`, istediğin kadar kullanıcıya dağıtılabilir.

---

## 📋 Build Makinesinde Olması Gerekenler

| Araç | Versiyon | İndir |
|---|---|---|
| Python | 3.11+ | https://python.org |
| Node.js | 20 LTS | https://nodejs.org |
| Yarn | 1.22+ | `npm i -g yarn` |
| MongoDB Community | 7.0+ ZIP (sadece `mongod.exe` için) | https://www.mongodb.com/try/download/community |

> MongoDB'yi **kurmana** gerek yok — sadece ZIP'ini indirip içinden `bin\mongod.exe` dosyasını alacağız.

---

## 🏗️ Build Adımları

### 1 · MongoDB portable hazırla (tek seferlik, ~2 dk)

1. https://www.mongodb.com/try/download/community adresine git.
2. **Version:** 7.0.x (veya en son), **Platform:** Windows, **Package:** **ZIP** seç.
3. İndirdiğin ZIP'i aç, içindeki `mongodb-win32-x86_64-...` klasörünü kopyala.
4. Projenin **kök** klasörüne (`lgss-manager\`) yeni klasör aç: `mongodb-portable\`
5. MongoDB ZIP'inin içindeki `bin\mongod.exe` dosyasını `lgss-manager\mongodb-portable\bin\mongod.exe` konumuna kopyala.

> Sadece `mongod.exe` gerekli, diğer dosyalara (mongos, mongoimport vs.) ihtiyaç yok. Ama tüm `bin\` klasörünü kopyalamakta sakınca yok.

**Doğrulama:** Aşağıdaki yol var olmalı:
```
C:\Users\umutc\Desktop\lgss-manager\mongodb-portable\bin\mongod.exe
```

---

### 2 · Backend'i `lgss-backend.exe` olarak paketle (~5 dk)

PowerShell aç:
```powershell
cd C:\Users\umutc\Desktop\lgss-manager\backend
.\.venv\Scripts\Activate.ps1
pip install pyinstaller
.\build.ps1
```

**Sonuç:** `backend\dist\lgss-backend.exe` (~80-100 MB, Python + tüm paketler gömülü)

**Test et (isteğe bağlı):**
```powershell
cd dist
.\lgss-backend.exe
```
Başka tarayıcıda: http://127.0.0.1:8001/api/ → JSON görmelisin. `Ctrl+C` ile kapat.

---

### 3 · Frontend'i production build'le (~2 dk)

```powershell
cd C:\Users\umutc\Desktop\lgss-manager\frontend
yarn build
```

**Sonuç:** `frontend\build\` klasörü oluşur (statik HTML+JS+CSS).

---

### 4 · Installer'ı üret (~3 dk)

```powershell
cd C:\Users\umutc\Desktop\lgss-manager\electron
npm run dist:only
```

> `dist:only` komutu adım 2 ve 3'ü tekrar yapmadan direkt installer üretir. Eğer backend/frontend kodunu değiştirdiysen `npm run dist` kullan (her şeyi baştan yapar).

**Sonuç:**
```
C:\Users\umutc\Desktop\lgss-manager\dist\LGSS Manager Setup 1.0.0.exe
```

Boyut: ~250-300 MB.

---

## 🎁 Dağıtım

Bu `.exe`'yi istediğin kullanıcıya gönder. Kullanıcı:
1. `.exe`'ye çift tıklar → NSIS kurulum sihirbazı açılır.
2. Kurulum dizini seçer (varsayılan: `C:\Program Files\LGSS Manager\`).
3. Kurulum biter → Desktop kısayolu oluşur.
4. Kısayola çift tıklar → UAC onayı ister → **Evet**.
5. Splash ekranı → 5-15 sn içinde uygulama açılır.
6. **Disk seçim sihirbazı** karşılar. İşte bu kadar. 🎉

---

## 🗂️ Kurulu Paket İçeriği

Kullanıcının makinesinde kurulum şöyle görünür:
```
C:\Program Files\LGSS Manager\
├── LGSS Manager.exe              (Electron ana yürütülebilir)
├── resources\
│   ├── app.asar                  (main.js + preload.js)
│   ├── frontend\build\           (React statik)
│   ├── backend\
│   │   ├── lgss-backend.exe      (Python + FastAPI + deps, PyInstaller)
│   │   └── scum_defaults\        (Config şablonları)
│   └── mongodb\bin\mongod.exe    (Portable MongoDB)
└── ... (Electron runtime)
```

Kullanıcı verisi:
```
C:\Users\<kullanıcı>\AppData\Roaming\LGSS Manager\
├── logs\
│   ├── backend.out.log
│   ├── backend.err.log
│   ├── mongod.out.log
│   └── mongod.err.log
└── mongo-db\                     (MongoDB veri klasörü)
```

---

## 🔧 Sorun Giderme

### "Başlatma hatası: MongoDB 15sn içinde başlamadı"
- Kullanıcının `%APPDATA%\LGSS Manager\logs\mongod.err.log` dosyasına baksın.
- Genelde antivirus `mongod.exe`'yi engeller. Windows Defender'da güvenilir ekle.

### "Backend hazır olmadı (60s timeout)"
- `backend.err.log`'a bak. PyInstaller bir modülü atlamış olabilir.
- Çözüm: `lgss-backend.spec` içindeki `hidden_imports`'a eksik modülü ekle → tekrar build et.

### Antivirus `.exe`'yi siliyor
- PyInstaller ile üretilen exe'ler bazen false positive yaratır.
- Çözüm: Code signing sertifikası al (EV Code Signing, ~$400/yıl) — zorunlu değil ama önerilir.

---

## 🔄 Güncelleme Dağıtımı

Kullanıcıya yeni `.exe` gönderdiğinde:
- Mevcut kurulumun üzerine yazar (ayarlar/veri korunur — `%APPDATA%` farklı yerde).
- Versiyon numarasını `electron/package.json` içindeki `"version"` alanından bump'la (1.0.0 → 1.0.1).

---

## 🚀 Hızlı Komut Özeti

Tüm build'i tek seferde (her şey kurulu olduktan sonra):
```powershell
cd C:\Users\umutc\Desktop\lgss-manager\electron
npm run dist
```

Bu komut:
1. `backend\build.ps1` çalıştırır → `lgss-backend.exe` üretir
2. `frontend\yarn build` çalıştırır → `build\` üretir
3. `electron-builder` çalıştırır → `dist\LGSS Manager Setup x.y.z.exe` üretir

Toplam süre: **~10 dakika** (ilk seferinde PyInstaller bağımlılıkları indirirken biraz daha uzun).
