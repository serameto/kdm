# 키오스크·DID 도면 기반 위치·상태 관리 시스템

Claude.ai에서 만든 프로토타입을 실제로 돌아가는 웹 서비스로 옮긴 버전입니다.
- `server/` — Node.js + Express + SQLite 백엔드 (로그인, 영업장/층/도면, 장비 CRUD, 역할별 권한)
- `client/` — React + Vite + Tailwind 프론트엔드 (기존 프로토타입 화면을 그대로 이식)

## 1. 로컬에서 실행해보기

### 백엔드
```bash
cd server
cp .env.example .env      # 필요하면 JWT_SECRET 등 수정
npm install
npm run seed               # 기본 계정 + 영업장/층 생성 (최초 1회)
npm start                  # http://localhost:4000
```

### 프론트엔드 (새 터미널)
```bash
cd client
npm install
npm run dev                 # http://localhost:5173
```

브라우저에서 `http://localhost:5173` 접속 → 아래 기본 계정으로 로그인:

| 아이디 | 비밀번호 | 역할 |
|---|---|---|
| admin | admin123! | 본사 관리자 (전체 권한) |
| ops | ops123! | 운영 관리자 (장비 등록/수정, 상태 변경) |
| maint | maint123! | 유지보수 담당자 (상태 변경만) |

**반드시 운영에 올리기 전에 비밀번호를 바꾸세요.** `server/src/seed.js`에서 비밀번호를 바꾼 뒤 `data.sqlite`를 지우고 다시 `npm run seed`를 실행하거나, DB에 직접 사용자를 추가하는 관리 스크립트를 만들어 쓰세요.

## 2. 실제로 배포하기 (Docker, 가장 간단한 방법)

사내 서버(또는 클라우드 VM)에 Docker가 설치되어 있으면:

```bash
cp server/.env.example server/.env   # JWT_SECRET을 꼭 랜덤 문자열로 변경
docker compose up -d --build
docker compose exec server npm run seed   # 최초 1회, 기본 계정 생성
```

- `http://서버주소` 로 접속하면 프론트엔드가 뜨고, `/api`는 자동으로 백엔드로 프록시됩니다.
- 장비 데이터는 `server/data.sqlite`, 도면 이미지는 `server/uploads/`에 저장됩니다 (docker-compose volume으로 서버가 재시작돼도 유지됩니다). 이 두 개를 주기적으로 백업하세요.

### 이미지·데이터 보안 관련 주의
- 실제 영업장 도면과 장비 목록처럼 민감한 내부 자료가 들어갑니다. **외부 인터넷에 그대로 노출하지 말고**, 사내망/VPN 안에서만 접근되도록 방화벽·리버스 프록시를 설정하세요.
- HTTPS가 필요하면 앞단에 Nginx/Caddy나 Cloudflare Tunnel 같은 리버스 프록시를 하나 더 두고 인증서를 붙이는 걸 권장합니다 (이 저장소에는 포함돼 있지 않습니다).

## 3. Docker 없이 자체 서버에 올리는 방법 (예: 사내 리눅스 서버)

```bash
# 백엔드
cd server && npm install --omit=dev
npm run seed
pm2 start src/index.js --name floorplan-server   # 또는 systemd 서비스로 등록

# 프론트엔드 (정적 파일로 빌드해서 nginx 등으로 서빙)
cd ../client && npm install && npm run build
# dist/ 폴더를 nginx 등 웹서버의 문서 루트로 지정하고,
# /api, /uploads 요청은 4000번 포트(백엔드)로 프록시하도록 설정하세요.
```

## 4. 지금 구현된 것 / 아직 안 된 것

**구현됨**
- 로그인 + 역할별 권한(본사 관리자 / 운영 관리자 / 유지보수 담당자)
- 영업장·층 등록, 도면 이미지 업로드 (본사 관리자)
- 도면 위 장비 마커 표시, 확대/축소/이동
- 신규 장비 등록(도면 클릭), 정보 수정, 위치 변경, 상태 변경
- 장비 목록/상세 패널, 상태 필터, 범례
- 서버에 실제로 저장됨 (새로고침해도 데이터 유지)

**아직 프로토타입 수준 / 확장이 필요한 부분**
- HTTPS, 리버스 프록시, 백업 자동화는 포함돼 있지 않습니다.
- 감사 로그(누가 언제 무엇을 바꿨는지 이력 전체 보관)는 `updated_by`/`updated_at` 필드만 있고 별도 이력 테이블은 없습니다.
- 대량 장비 CSV 업로드, 영업장/도면 삭제 기능은 아직 없습니다.
- 비밀번호 재설정, 사용자 관리 화면은 없고 DB에 직접 계정을 넣어야 합니다.

## 5. 프로젝트 구조
```
floorplan-service/
├── docker-compose.yml
├── server/
│   ├── src/
│   │   ├── index.js       # Express 앱 진입점
│   │   ├── db.js          # SQLite 스키마
│   │   ├── auth.js        # JWT 발급/검증, 역할 미들웨어
│   │   ├── seed.js        # 기본 계정 + 영업장 생성 스크립트
│   │   └── routes/        # /api/auth, /api/locations, /api/floors, /api/devices
│   └── uploads/           # 업로드된 도면 이미지
└── client/
    └── src/
        ├── App.jsx         # 전체 화면 (사이드바 + 도면 캔버스 + 장비 패널)
        ├── Login.jsx
        └── api.js          # 백엔드 호출 래퍼
```
