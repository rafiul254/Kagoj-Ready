"use client";
import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { strings } from "@/i18n/strings";
import type { Language } from "@/lib/schemas";
import BuildathonWatermark, { BuildathonSticker } from "./BuildathonWatermark";
const UiContext = createContext({
  language: "bn" as Language,
  t: strings.bn as typeof strings.en | typeof strings.bn,
});
export const useUi = () => useContext(UiContext);
export function DocumentIcon({ small = false }: { small?: boolean }) {
  return (
    <svg
      width={small ? 22 : 30}
      height={small ? 22 : 30}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 3h11l6 6v19H6V3h3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M20 3v7h6M11 15h10M11 20h10M11 25h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
export default function Shell({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("bn");
  const [large, setLarge] = useState(false);
  const [notice, setNotice] = useState(false);
  const t = strings[language];
  useEffect(() => {
    try {
      if (sessionStorage.getItem("kagoj:language") === "en") setLanguage("en");
      setLarge(sessionStorage.getItem("kagoj:large") === "true");
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  function toggleLanguage() {
    const next = language === "bn" ? "en" : "bn";
    setLanguage(next);
    try {
      sessionStorage.setItem("kagoj:language", next);
    } catch {}
  }
  function clear() {
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("kagoj:"))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch {}
    setNotice(true);
    window.dispatchEvent(new Event("kagoj:delete"));
  }
  return (
    <UiContext.Provider value={{ language, t }}>
      <div className={large ? "app large" : "app"}>
        <a className="skip-link" href="#main">
          {t.skip}
        </a>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              {/* Official project logo — swap /public/logo.png to replace app-wide */}
              <img
                className="brand-logo"
                src="/logo.png"
                alt={`${t.brand} — ${t.tagline}`}
                width={66}
                height={46}
              />
              <span className="brand-text-wrap">
                <small>{t.tagline}</small>
              </span>
            </Link>
            <div className="header-actions">
              <button
                className="text-size"
                aria-label={t.large}
                aria-pressed={large}
                onClick={() => {
                  setLarge(!large);
                  try {
                    sessionStorage.setItem("kagoj:large", String(!large));
                  } catch {}
                }}
              >
                A<span>আ</span>
              </button>
              <button
                className="language"
                onClick={toggleLanguage}
                aria-label={
                  language === "bn" ? "Switch to English" : "বাংলায় দেখুন"
                }
              >
                {language === "bn" ? "English" : "বাংলা"}{" "}
                <span aria-hidden="true">⌄</span>
              </button>
            </div>
          </div>
          <div className="masthead-strip">
            <div className="container masthead-inner">
              {/* Mandatory buildathon sticker — prominent position near the top of every page */}
              <BuildathonSticker />
              <nav
                aria-label={
                  language === "bn" ? "মূল নেভিগেশন" : "Main navigation"
                }
              >
                <Link href="/#how">{t.how}</Link>
                <Link href="/privacy">{t.privacy}</Link>
              </nav>
            </div>
          </div>
        </header>
        {notice && (
          <div className="notice" role="status">
            {t.cleared}
          </div>
        )}
        {children}
        <footer className="site-footer">
          <div className="container footer-top">
            <div>
              <Link className="brand footer-brand" href="/">
                <img
                  className="brand-logo"
                  src="/logo.png"
                  alt={t.brand}
                  width={52}
                  height={36}
                />
              </Link>
              <p>{t.footNote}</p>
            </div>
            <div className="footer-links">
              <Link href="/privacy">{t.privacy}</Link>
              <button className="link-button" onClick={clear}>
                {t.clear}
              </button>
            </div>
          </div>
          <div className="container disclaimer">{t.disclaimer}</div>
          <BuildathonWatermark />
        </footer>
      </div>
    </UiContext.Provider>
  );
}
