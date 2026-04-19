# LGSS Manager — Kullanicilarin HIC BIR SEY Yuklemeden Kullanabilecegi .exe Build Rehberi

Bu rehber, **Python / Node.js / MongoDB / Visual C++ Redistributable** kurulu olmayan bilgisayarlarda bile **tek tikla calisacak** bir installer (`LGSS Manager Setup.exe`) uretmeni saglar.

## Ne Dahil?

Installer icerigi:
- **Electron + React Frontend** (~80 MB)
- **Python + Backend** (PyInstaller ile tek `lgss-backend.exe` ~25 MB)
- **MongoDB 4.4.29 Portable** (~50 MB, AVX gerektirmez, Server 2019 uyumlu)
- **Visual C++ Redistributable 2015-2022 x64** (~25 MB, sessizce otomatik kurulur)
- **SteamCMD** (uygulama ilk kullanimda otomatik indirir)

**Toplam installer boyutu:** ~280-320 MB

## Son Kullanici Deneyimi

1. `LGSS Manager Setup 1.0.0.exe`'ye cift tikla
2. VC++ Redistributable sessizce arka planda kurulur (kullanici farketmez)
3. Kurulum dizinini sec, `Next`, bitir
4. Masaustunden `LGSS Manager` ikonuna cift tikla
5. UAC onay iste -> `Evet`
6. Splash ekrani: "MongoDB baslatiliyor..." -> "Backend hazir olmayi bekliyor..." -> "Arayuz yukleniyor..."
7. Disk secim sihirbazi acilir

**Son kullanici hicbir sey kurmaz**, Python/Node/MongoDB bilmez.

---

## Build Makinesi Gereksinimleri (senin PC)

| Arac | Versiyon | Neden |
|---|---|---|
| Python | 3.11+ | Backend'i PyInstaller ile paketlemek icin |
| Node.js | 20 LTS | Electron ve React build |
| Yarn | 1.22+ | Frontend bagimliliklar |
| Internet | - | Ilk build'de MongoDB + VC++ indirilir |

Yonetici yetkisi **gerekmez**, npm run dist normal PowerShell'den calisir.

---

## Build Komutlari (Tek Seferlik Tam Akis)

### ILK KEZ Build Ediyorsan

```powershell
# 1. Backend sanal ortam (eger yoksa)
cd C:\Users\umutc\Desktop\lgss-manager\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 2. Frontend bagimliliklari
cd ..\frontend
yarn install

# 3. Electron bagimliliklari
cd ..\electron
npm install

# 4. TAM BUILD (tek komut - MongoDB + VC++ otomatik indirilir)
npm run dist
```

**Ilk build ~15 dk** (MongoDB ve VC++ indirilmesi dahil).  
**Sonraki build'ler ~6 dk** (MongoDB/VC++ cache'den kullanilir).

### Sadece Kod Degistirip Yeniden Build

```powershell
cd electron
npm run dist
```

`prepare-bundle.ps1` akilli — MongoDB ve VC++ zaten varsa tekrar indirmez.

### Cikti

```
C:\Users\umutc\Desktop\lgss-manager\dist\LGSS Manager Setup 1.0.0.exe
```

Bu dosyayi istedigin kullaniciya gonder.

---

## Kullanici Makinesinde Paket Yapisi

Kurulumdan sonra:
```
C:\Program Files\LGSS Manager\
├── LGSS Manager.exe
├── resources\
│   ├── app.asar                  (Electron main.js + preload.js)
│   ├── frontend\build\           (React statik dosyalar)
│   ├── backend\
│   │   ├── lgss-backend.exe      (Python + FastAPI + tum bagimliliklar)
│   │   └── scum_defaults\
│   └── mongodb\bin\mongod.exe    (MongoDB 4.4)
```

Kullanici verisi (ayrilmis, guncellemelerden etkilenmez):
```
C:\ProgramData\LGSS Manager\
└── mongo-db\                     (MongoDB veri klasoru, paylasimli)

C:\Users\<kullanici>\AppData\Roaming\LGSS Manager\
└── logs\
    ├── backend.out.log
    ├── backend.err.log
    ├── mongod.out.log
    └── mongod.err.log
```

---

## Sorun Giderme

### Kullanici "Baslatma hatasi" dialog goruyor
Log dosyasini iste:
```
C:\Users\<kullanici>\AppData\Roaming\LGSS Manager\logs\
```

Iceriklerini sana yollasin, sorunu 5 saniyede teshis edebilirsin.

### Windows Defender `.exe`'yi engelliyor
- Code signing sertifikasi yok (opsiyonel, ~$400/yil)
- Kullanici ilk acilista: **Daha fazla bilgi -> Yine de calistir**
- Ya da Defender'da klasor istisna: `C:\Program Files\LGSS Manager`

### Hala acilmiyor (nadir)
- Antivirus `mongod.exe`'yi karantinaya almis olabilir
- CPU cok eski (2010 oncesi) -> MongoDB 4.4 bile calismayabilir
- Windows 10 build 1809 altinda Electron 32 desteklenmiyor olabilir

---

## Hizli Komut Ozeti

| Ne Yapiyor | Komut |
|---|---|
| Full build (MongoDB + VC++ indir + build) | `npm run dist` |
| Sadece son paketleme (bagimliliklar varsa) | `npm run dist:only` |
| Portable .exe (installer gerekmez) | `npm run dist:portable` |
| Sadece MongoDB + VC++ indir | `npm run prepare:bundle` |
| Sadece backend PyInstaller build | `npm run build:backend` |
| Sadece frontend React build | `npm run build:frontend` |

---

## Guncelleme Dagitimi

Kullaniciya yeni surum gonderdiginde:
1. `electron/package.json` icindeki `"version"` alaninda bump'la (`1.0.0` -> `1.0.1`)
2. `npm run dist`
3. Yeni `.exe` kullaniciya gonder -> ustune kurar -> veriler (MongoDB, ayarlar) korunur
