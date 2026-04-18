# LGSS Manager — Installation Guide

Bu rehber **gerçek kullanılan modülleri** listeler. Geliştirme env'indeki ekstra paketlere gerek yok.

---

## 1 · System Prerequisites

| Gereksinim      | Versiyon      | Notlar                                                        |
|-----------------|---------------|---------------------------------------------------------------|
| **Python**      | 3.11+         | Backend (FastAPI + async)                                     |
| **Node.js**     | 20 LTS        | Frontend + Electron                                           |
| **Yarn**        | 1.22+         | `npm i -g yarn`                                               |
| **MongoDB**     | 6.0+          | Local (`mongodb://localhost:27017`) veya Atlas                |
| **Git**         | any           | Deposu çekmek için                                            |
| **SteamCMD**    | latest        | Windows'ta manager otomatik indirir (manuel gereksiz)         |
| **OS**          | Windows 10/11 | SCUMServer.exe için. Manager UI geliştirmesi Linux/macOS'ta da|

---

## 2 · Backend (FastAPI + MongoDB)

### 2.1 Python paketleri

`/app/backend/requirements-minimal.txt` oluştur:

```
fastapi==0.110.1
uvicorn==0.25.0
starlette==0.37.2
pydantic==2.12.5
motor==3.3.1
pymongo==4.5.0
python-dotenv==1.2.2
python-multipart==0.0.24
httpx==0.28.1
psutil==7.2.2
```

Kurulum:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-minimal.txt
```

### 2.2 `.env` dosyası — `/app/backend/.env`
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=lgss_manager
CORS_ORIGINS=*
```

### 2.3 Çalıştırma
```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

---

## 3 · Frontend (React SPA)

### 3.1 Ana runtime dependencies
`/app/frontend/package.json` içinde — üretimde gerekli olanlar:

```
react ^19.0.0
react-dom ^19.0.0
react-scripts 5.0.1
axios ^1.8.4
lucide-react ^0.507.0
sonner ^2.0.3
tailwindcss ^3.4.17
autoprefixer ^10.4.20
postcss ^8.4.49
@craco/craco ^7.1.0
clsx ^2.1.1
tailwind-merge ^3.2.0
```

> Proje içinde kurulu diğer shadcn/Radix paketleri UI component'lerinde kullanılıyor. Tam liste `package.json`'da — `yarn install` tümünü çeker.

Kurulum:
```bash
cd frontend
yarn install
```

### 3.2 `.env` — `/app/frontend/.env`
```
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=0
```
> Electron build'de `REACT_APP_BACKEND_URL=http://127.0.0.1:8001` kullanılır.

### 3.3 Çalıştırma
```bash
yarn start      # dev (http://localhost:3000)
yarn build      # prod bundle (→ build/)
```

---

## 4 · Electron Desktop Shell

### 4.1 Paketler
Yeni bir `/app/electron/package.json` oluştur:

```json
{
  "name": "lgss-manager-shell",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder"
  },
  "dependencies": {
    "is-elevated": "^4.0.0",
    "sudo-prompt": "^9.2.1"
  },
  "devDependencies": {
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0"
  }
}
```

Kurulum:
```bash
cd electron
npm install
```

### 4.2 Paketleme (Windows installer)
```bash
npm run dist
```
Çıktı: `dist/LGSS Manager Setup x.y.z.exe`

---

## 5 · İlk Çalıştırma Sırası

1. MongoDB servisini başlat (`mongod` / sistem servisi).
2. Backend'i başlat: `uvicorn server:app --port 8001`.
3. Frontend dev server: `yarn start` (port 3000).
4. Electron shell: `cd electron && npm start` (Admin olarak açılır, disk seçim sihirbazı görünür).
5. `LGSSManagers/Servers/Server1/` otomatik oluşur, SteamCMD arka planda AppID `3792580`'i indirir (~20 GB).
6. Settings → 8 kategori sekmesinden ayarları düzenle → **Save Config Files** → Windows path altına yazılır.
7. Automation → restart saatleri + Discord webhook'ları.
8. Players / Logs → log dosyalarını manuel yükle veya canlı klasör taratma.

---

## 6 · Supervisor (Linux production deployment)

`/etc/supervisor/conf.d/lgss.conf`:
```
[program:lgss-backend]
command=/path/to/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
directory=/path/to/backend
autostart=true
autorestart=true

[program:lgss-frontend]
command=/usr/bin/yarn start
directory=/path/to/frontend
autostart=true
autorestart=true
environment=PORT="3000"
```

---

## 7 · Development Araçları (opsiyonel)

Eğer geliştirme de yapacaksan:
```
black
ruff
pytest
eslint
```
