"use client";
import { useUi } from "@/components/Shell";
import Link from "next/link";
import { privacyCopy } from "@/i18n/privacy";
export default function Privacy() {
  const { t, language } = useUi();
  const copy = privacyCopy[language];
  return (
    <main id="main" className="container privacy-page">
      <Link className="back-link" href="/">
        ← {t.back}
      </Link>
      <div className="eyebrow">{t.privacy}</div>
      <h1>{t.privacyTitle}</h1>
      <p className="page-intro">{copy.intro}</p>
      {copy.sections.map(([heading, body]) => (
        <section className="privacy-section" key={heading}>
          <h2>{heading}</h2>
          <p>{body}</p>
        </section>
      ))}
      <a
        className="source-link"
        href="https://www.epassport.gov.bd/instructions/instructions"
        target="_blank"
        rel="noreferrer"
      >
        {t.official} ↗
      </a>
    </main>
  );
}
