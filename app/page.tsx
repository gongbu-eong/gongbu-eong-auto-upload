import { getInstagramConfigurationStatus } from "@/lib/instagram/config";

const steps = [
  {
    number: "01",
    title: "댓글 수신",
    description: "Meta Webhook의 comments 이벤트를 원문 서명과 함께 검증합니다.",
  },
  {
    number: "02",
    title: "조건 확인",
    description: "키워드, 전송 기한, 중복 여부를 확인하고 선택적으로 팔로우 상태도 검사합니다.",
  },
  {
    number: "03",
    title: "DM 발송",
    description: "댓글 ID에 Private Reply를 보내고 중복 이벤트는 다시 처리하지 않습니다.",
  },
];

export default function Home() {
  const config = getInstagramConfigurationStatus();
  const baseUrl = (process.env.APP_URL || "https://your-domain.com").replace(
    /\/$/,
    "",
  );
  const webhookUrl = `${baseUrl}/api/instagram/webhook`;
  const followerCheck =
    process.env.INSTAGRAM_REQUIRE_FOLLOWER?.toLowerCase() === "true"
      ? "팔로워만"
      : "모든 댓글";

  return (
    <main className="shell">
      <nav className="nav" aria-label="서비스 정보">
        <a className="brand" href="#top" aria-label="Comment Relay 홈">
          <span className="brand-mark" aria-hidden="true">
            CR
          </span>
          <span>Comment Relay</span>
        </a>
        <a className="docs-link" href="/api/instagram/health">
          API 상태
          <span aria-hidden="true">↗</span>
        </a>
      </nav>

      <section className="hero" id="top">
        <div className="eyebrow">
          <span className={`pulse ${config.ready ? "is-ready" : ""}`} />
          Instagram automation
        </div>
        <h1>
          댓글이 달리는 순간,
          <br />
          <span>대화가 시작됩니다.</span>
        </h1>
        <p className="hero-copy">
          Instagram 댓글을 안전하게 감지하고 채용공고 페이지를 개인 DM으로 연결하는 Meta 공식
          API 기반 자동화입니다.
        </p>

        <div className="status-card">
          <div>
            <p className="status-label">현재 연결 상태</p>
            <p className="status-value">
              {config.ready ? "Webhook 준비 완료" : "환경변수 설정 필요"}
            </p>
          </div>
          <span className={`status-badge ${config.ready ? "ready" : "waiting"}`}>
            {config.ready
              ? "Ready"
              : `${config.configuredCount}/${config.requiredCount} configured`}
          </span>
        </div>
      </section>

      <section className="flow-section" aria-labelledby="flow-title">
        <div className="section-heading">
          <p>Automation flow</p>
          <h2 id="flow-title">한 댓글이 DM이 되기까지</h2>
        </div>
        <div className="flow-grid">
          {steps.map((step, index) => (
            <article className="flow-card" key={step.number}>
              <div className="step-topline">
                <span>{step.number}</span>
                {index < steps.length - 1 ? (
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                ) : null}
              </div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="config-section" aria-labelledby="config-title">
        <div className="section-heading">
          <p>Runtime configuration</p>
          <h2 id="config-title">배포 전 체크</h2>
        </div>

        <div className="config-grid">
          <div className="endpoint-panel">
            <p className="panel-kicker">Meta Callback URL</p>
            <code>{webhookUrl}</code>
            <p className="panel-help">
              Meta App Dashboard의 Instagram Webhooks 콜백 URL에 입력하세요.
            </p>
          </div>

          <div className="checks-panel">
            <div className="check-row">
              <div>
                <p>필수 환경변수</p>
                <span>시크릿 값은 브라우저에 노출되지 않습니다.</span>
              </div>
              <strong className={config.ready ? "ok" : "warn"}>
                {config.configuredCount}/{config.requiredCount}
              </strong>
            </div>
            <div className="check-row">
              <div>
                <p>전송 조건</p>
                <span>필요하면 팔로워 전용 모드로 전환할 수 있습니다.</span>
              </div>
              <strong>{followerCheck}</strong>
            </div>
            <div className="check-row">
              <div>
                <p>중복 방지 저장소</p>
                <span>
                  {config.hasDurableIdempotency
                    ? "여러 서버 인스턴스에서도 처리 상태를 공유합니다."
                    : "운영 환경에서는 Upstash Redis 연결을 권장합니다."}
                </span>
              </div>
              <strong>{config.hasDurableIdempotency ? "Redis" : "Memory"}</strong>
            </div>
          </div>
        </div>

        {!config.ready ? (
          <div className="missing-note">
            <span aria-hidden="true">!</span>
            <p>
              <strong>아직 필요한 값이 있습니다.</strong>
              <br />
              <code>{config.missingKeys.join(", ")}</code>
            </p>
          </div>
        ) : null}
      </section>

      <footer>
        <p>Meta Private Replies · one reply per comment · seven-day window</p>
        <a href="https://developers.facebook.com/docs/instagram-platform/private-replies">
          Meta 문서
          <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>
  );
}
