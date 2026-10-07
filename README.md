# Instagram 댓글 → DM 자동화

Instagram 프로 계정의 새 댓글을 Meta Webhook으로 받고, 채용공고 페이지 링크가 담긴 Private Reply DM을 보내는 Next.js 16 프로젝트입니다.

## 구현된 흐름

1. `GET /api/instagram/webhook`이 Meta의 Webhook 등록 challenge를 검증합니다.
2. `POST /api/instagram/webhook`이 원문 body와 `X-Hub-Signature-256`을 App Secret으로 검증합니다.
3. `comments` 및 `live_comments` 이벤트에서 새 댓글만 추출합니다.
4. 계정/자기 댓글/7일 제한/선택 키워드/중복 이벤트를 검사합니다.
5. 댓글 ID 기반 Private Reply로 `https://gongbueong.career.co.kr/` 링크를 보냅니다.
6. Meta API의 일시 오류에는 `503`을 반환해 Webhook 재전송이 가능하게 하고, 영구 오류는 재시도하지 않습니다.

기본값은 팔로우 여부와 관계없이 댓글 작성자에게 전송합니다. `INSTAGRAM_REQUIRE_FOLLOWER=true`로 설정하면 `is_user_follow_business`가 `true`인 사용자만 통과시키는 선택적 팔로워 제한을 사용할 수 있습니다.

Meta의 Private Reply는 댓글 하나당 한 번만 보낼 수 있고 일반 게시물/릴스/스토리/광고 댓글은 작성 후 7일 안에 보내야 합니다. Live 댓글은 라이브 방송 중에만 전송할 수 있습니다. 첫 Private Reply 이후 추가 DM은 상대가 답장해 일반 메시징 창이 열린 뒤에 구현해야 합니다.

## 1. 환경변수

`.env.example`을 `.env.local`로 복사하고 값을 입력합니다. 시크릿과 토큰에는 절대로 `NEXT_PUBLIC_` 접두사를 붙이지 마세요.

```dotenv
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=충분히-긴-임의의-문자열
INSTAGRAM_ACCESS_TOKEN=...
INSTAGRAM_ACCOUNT_ID=...
INSTAGRAM_API_VERSION=v25.0
INSTAGRAM_LOGIN_TYPE=instagram

INSTAGRAM_TRIGGER_KEYWORDS=링크,자료
INSTAGRAM_TARGET_URL=https://gongbueong.career.co.kr/
INSTAGRAM_DM_TEMPLATE="요청하신 채용공고 정보입니다.\n아래에서 확인해 주세요.\n\n{{url}}"
INSTAGRAM_REQUIRE_FOLLOWER=false
INSTAGRAM_UNKNOWN_FOLLOWER_POLICY=skip

APP_URL=https://your-domain.com
```

- `INSTAGRAM_API_VERSION`은 Meta App에서 현재 사용 중인 버전으로 맞춥니다.
- `INSTAGRAM_TRIGGER_KEYWORDS`가 비어 있으면 모든 댓글이 트리거됩니다. 값이 있으면 댓글 본문에 키워드 중 하나가 포함될 때만 전송합니다.
- 메시지에서 `{{username}}`, `{{comment}}`, `{{url}}`을 사용할 수 있습니다. 최종 메시지는 Meta 제한에 맞춰 1,000자로 자릅니다.
- 기본 DM은 `요청하신 채용공고 정보입니다.`라는 안내와 `INSTAGRAM_TARGET_URL` 링크를 함께 보냅니다.
- `INSTAGRAM_REQUIRE_FOLLOWER=true`일 때만 팔로우 상태를 조회합니다. 이때 `INSTAGRAM_UNKNOWN_FOLLOWER_POLICY=skip`이면 상태를 확인할 수 없는 사용자는 건너뜁니다.
- `INSTAGRAM_LOGIN_TYPE=facebook`을 사용하면 API 호스트가 `graph.facebook.com`으로 바뀝니다. 이 경우 토큰과 권한도 Facebook Login 방식에 맞아야 합니다.

## 2. Meta App 설정

Instagram API with Instagram Login 기준으로 다음 권한이 필요합니다.

- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`

실사용자 이벤트를 받으려면 앱을 Live 모드로 전환하고 필요한 권한에 Advanced Access를 받아야 합니다. Instagram 계정은 Business 또는 Creator 프로 계정이어야 합니다.

Meta App Dashboard의 Instagram Webhooks 설정에 아래 값을 등록합니다.

- Callback URL: `https://your-domain.com/api/instagram/webhook`
- Verify token: `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`과 같은 값
- Fields: `comments` (Live 댓글도 처리하려면 `live_comments` 추가)

Dashboard 설정만으로는 실제 Instagram 계정 구독이 끝나지 않습니다. 계정 액세스 토큰으로 앱도 구독합니다.

```bash
curl -X POST \
  "https://graph.instagram.com/v25.0/me/subscribed_apps?subscribed_fields=comments,live_comments" \
  -H "Authorization: Bearer YOUR_INSTAGRAM_ACCESS_TOKEN"
```

URL의 API 버전은 `.env.local`의 값과 동일하게 맞추세요.

## 3. 선택적 팔로워 제한

기본 설정에서는 Private Reply가 팔로우 여부와 관계없이 댓글 작성자에게 전송됩니다. 팔로워는 Instagram Inbox에서, 비팔로워는 Requests에서 메시지를 받을 수 있습니다.

팔로워만 허용하려면 `INSTAGRAM_REQUIRE_FOLLOWER=true`로 변경합니다. 이 모드는 Instagram User Profile API의 `is_user_follow_business`를 사용합니다. 앱 권한, 로그인 방식, 사용자와의 메시징 컨텍스트에 따라 Meta가 이 필드를 반환하지 않을 수 있으며, 기본 `skip` 정책에서는 이런 사용자의 DM을 건너뜁니다.

먼저 앱 Role이 있는 테스트 계정으로 다음 순서대로 검증하세요.

1. 테스트 계정이 프로 계정을 팔로우합니다.
2. 테스트 게시물에 키워드 댓글을 남깁니다.
3. 서버 로그와 DM 수신 여부를 확인합니다.
4. 팔로우를 해제한 뒤 다른 댓글로 DM이 오지 않는지 확인합니다.

## 4. 중복 처리

로컬 및 단일 Node 프로세스에서는 메모리로 댓글 ID를 8일간 기억합니다. 여러 서버 인스턴스나 Serverless 운영 환경에서는 Upstash Redis REST 값을 추가하세요.

```dotenv
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Redis가 일시적으로 실패하면 프로세스 메모리로 자동 대체됩니다. Meta도 댓글 하나당 Private Reply 한 번만 허용하므로 최종 중복 발송을 한 번 더 막아 줍니다.

## 5. 실행 및 확인

```bash
npm run dev
npm run lint
npm run build
```

- 대시보드: `http://localhost:3000`
- 비밀값을 노출하지 않는 상태 API: `GET /api/instagram/health`
- Meta Webhook: `GET|POST /api/instagram/webhook`

Webhook에는 공개 HTTPS URL이 필요합니다. 로컬 테스트 시 HTTPS 터널을 사용하고, 운영 배포는 정적 export가 아닌 Next.js 서버/Serverless 런타임을 사용하세요.
