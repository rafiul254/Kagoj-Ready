"use client";
import Link from "next/link";
import { workflow } from "@/i18n/workflow";
import { DocumentIcon, useUi } from "@/components/Shell";
export default function Home() {
  const { t, language } = useUi();
  const w = workflow[language];
  return (
    <main id="main">
      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" />
            {t.phase}
          </div>
          <h1>
            {t.hero1}
            <br />
            <span>{t.hero2}</span>
          </h1>
          <p className="hero-tagline" lang="en">
            {t.heroEn}
          </p>
          <p className="hero-intro">{t.intro}</p>
          <div className="hero-actions">
            <Link className="primary-button" href="/prepare?sample=1">
              {t.try}
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="hero-sample-link" href="/prepare">
              {w.start} →
            </Link>
          </div>
          <p className="hero-sample-sub">{t.sampleSub}</p>
          <p className="scope">
            <span aria-hidden="true">◎</span>
            {t.scope}
          </p>
        </div>
        <div className="journey-visual">
          <div className="visual-caption">
            <span className="status-dot" />
            {t.packetSub}
          </div>
          <div className="paper-card">
            <div className="paper-top">
              <span className="paper-icon">
                <DocumentIcon />
              </span>
              <span className="sample-badge">{t.sample}</span>
            </div>
            <h2>{t.paperTitle}</h2>
            <p>{t.paperBody}</p>
            <div className="sample-field">
              <small>{t.paperField}</small>
              <strong>{t.paperName}</strong>
              <span className="field-mark" aria-hidden="true">
                Aa
              </span>
            </div>
            <div className="paper-lines" aria-hidden="true">
              <span />
              <span />
            </div>
            <div className="paper-bottom">
              <span aria-hidden="true">ⓘ</span>
              {t.paperNote}
            </div>
          </div>
          <div className="visual-bottom">
            <span className="leaf-symbol" aria-hidden="true">
              ✳
            </span>
            {t.packet}
          </div>
        </div>
      </section>
      <div className="container">
        <div className="trust-strip">
          {[t.trust1, t.trust2, t.trust3].map((s) => (
            <span key={s}>
              <span className="check-icon" aria-hidden="true">
                ✓
              </span>
              {s}
            </span>
          ))}
        </div>
        <section className="gate-note">
          <span className="note-symbol" aria-hidden="true">
            i
          </span>
          <div>
            <h2>{t.gateTitle}</h2>
            <p>{t.gateBody}</p>
          </div>
        </section>
        <section className="example" aria-labelledby="example-title">
          <div className="section-heading">
            <span className="sample-badge">{t.exTag}</span>
            <h2 id="example-title">{t.exTitle}</h2>
            <p>{t.exIntro}</p>
          </div>
          <div className="example-grid">
            <article className="example-card before">
              <h3>{t.exBeforeTitle}</h3>
              <p>{t.exBeforeBody}</p>
            </article>
            <article className="example-card after">
              <h3>{t.exAfterTitle}</h3>
              <p>{t.exAfterBody}</p>
              <div className="diff-pair">
                <div>
                  <small>{t.exDocA}</small>
                  <strong>{t.exValA}</strong>
                </div>
                <div>
                  <small>{t.exDocB}</small>
                  <strong>{t.exValB}</strong>
                </div>
              </div>
              <p className="diff-flag">
                <span aria-hidden="true">≠</span> {t.exFlag}
              </p>
            </article>
          </div>
          <p className="caption">{t.exNote}</p>
        </section>
        <section className="services">
          <div className="section-heading">
            <h2>{t.serviceTitle}</h2>
            <p>{t.serviceIntro}</p>
          </div>
          <div className="service-grid">
            <Link href="/prepare" className="service-card active">
              <span className="service-icon">
                <DocumentIcon />
              </span>
              <div>
                <div className="service-label">
                  <h3>{t.passport}</h3>
                  <span className="pill">{t.prototype}</span>
                </div>
                <p>{t.passportBody}</p>
              </div>
              <span className="card-arrow" aria-hidden="true">
                ↗
              </span>
            </Link>
            <div className="service-card muted">
              <span className="service-icon">
                <svg
                  viewBox="0 0 32 32"
                  width="30"
                  height="30"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="3"
                    y="7"
                    width="26"
                    height="19"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <circle
                    cx="11"
                    cy="14"
                    r="3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M7 22v-2c0-4 8-4 8 0v2m5-8h5m-5 5h5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                </svg>
              </span>
              <div>
                <div className="service-label">
                  <h3>{t.nid}</h3>
                  <span className="pill neutral">{t.soon}</span>
                </div>
                <p>{t.nidBody}</p>
              </div>
            </div>
          </div>
        </section>
        <section id="how" className="how-section">
          <div className="section-heading">
            <h2>{t.howTitle}</h2>
            <p>{t.howSub}</p>
          </div>
          <div className="steps">
            {[
              [t.step1, t.step1Body, t.step1Link],
              [t.step2, t.step2Body, t.step2Link],
              [t.step3, t.step3Body, t.step3Link],
            ].map(([title, body, link], i) => (
              <article className="step" key={title}>
                <span className="step-number">0{i + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
                <Link className="step-link" href="/prepare?sample=1">
                  {link} →
                </Link>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
