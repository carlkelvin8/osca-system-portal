"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { UserPlus, Calendar, Trophy, Building2, Palette, Users, ExternalLink, ArrowRight } from "lucide-react";

/* ═══ HERO CAROUSEL IMAGES ═══ */
const HERO_SLIDES = [
  { src: "/osca_pic.jpg", alt: "OSCA Sports and Cultural Affairs" },
  { src: "/osca_pic2.jpg", alt: "OSCA Athletic Events" },
  { src: "/osca_pic3.jpg", alt: "OSCA Cultural Performances" },
];

/* ═══ NEWS ITEMS ═══ */
const NEWS_ITEMS = [
  {
    title: "Community Outreach: Supporting Assoc. Prof. Joselito N. Bacani",
    date: "July 2026",
    excerpt:
"The OSCA community is raising support for Assoc. Prof. Joselito N. Bacani, who is currently undergoing medical treatment. Please see the donation poster for details on how you can help.",
    image: "/bacani-fundraiser.jpg",
    href: "https://www.facebook.com/share/p/1ET8EMjQvw/",
  },
];

/* ═══ NAV LINKS ═══ */
const NAV_LINKS = [
  { label: "Home", section: "home" },
  { label: "News", section: "news" },
  { label: "About", section: "about" },
  { label: "Sports", section: "sports" },
  { label: "Contact", section: "contact" },
];

/* ═══ MAIN PAGE ═══ */
export default function WelcomeClient() {
  const [active, setActive] = useState("Home");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── IntersectionObserver for active nav ──
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const section = NAV_LINKS.find((l) => l.section === entry.target.id);
            if (section) setActive(section.label);
          }
        }
      },
      { rootMargin: "-80px 0px -50% 0px", threshold: 0 }
    );

    const sections = NAV_LINKS.map((l) => document.getElementById(l.section)).filter(Boolean);
    sections.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      setActive(NAV_LINKS.find((l) => l.section === sectionId)?.label || "Home");
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const goTo = useCallback((idx: number) => {
    setCurrentSlide(idx);
  }, []);

  const goNext = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
  }, []);

  const goPrev = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  }, []);

  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(goNext, 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, goNext]);

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#ffffff", color: "#0f1b2d", minHeight: "100vh" }}>
     {/* ─── NAVBAR (crest style) ─── */}
<nav style={{ background: "#0d1f3c", borderTop: "3px solid #C9A84C", borderBottom: "3px solid #C9A84C", position: "sticky", top: 0, zIndex: 100 }}>
  <div style={{ maxWidth: 1280, margin: "0 auto", padding: "10px 24px 10px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
    <Link href="/" style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid #C9A84C", overflow: "hidden", background: "#132a4d", flexShrink: 0 }}>
        <Image src="/osca-logo.png" alt="OSCA Crest" width={44} height={44} style={{ objectFit: "cover", width: "100%", height: "100%" }} priority />
      </div>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>OSCA Management System</span>
        <span style={{ fontSize: 10, fontWeight: 500, color: "#C9A84C" }}>NAAP · Villamor Campus</span>
      </div>
    </Link>

    <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
      {NAV_LINKS.map((link) => (
        <button
          key={link.label}
          onClick={() => scrollTo(link.section)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
            color: active === link.label ? "#C9A84C" : "rgba(255,255,255,0.85)",
          }}
        >
          {link.label}
        </button>
      ))}
      <Link href="/login" style={{ padding: "7px 16px", fontSize: 11, fontWeight: 700, color: "#0d1f3c", background: "#C9A84C", borderRadius: 6, textDecoration: "none", textTransform: "uppercase" }}>
        Sign In
      </Link>
    </div>
  </div>
 </nav>

      {/* ─── HERO CAROUSEL ─── */}
      <section id="home"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{
          position: "relative",
          minHeight: 440,
          overflow: "hidden",
          display: "flex",
          alignItems: "flex-end",
          padding: "0 0 48px",
        }}
      >
        {/* Slides */}
        {HERO_SLIDES.map((slide, idx) => (
          <div
            key={idx}
            style={{
              position: "absolute",
              inset: 0,
              opacity: currentSlide === idx ? 1 : 0,
              transition: "opacity 0.8s ease-in-out",
              pointerEvents: currentSlide === idx ? "auto" : "none",
            }}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              style={{ objectFit: "cover" }}
              priority={idx === 0}
              sizes="100vw"
            />
          </div>
        ))}

        {/* Gradient overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(13,31,60,0.3) 0%, rgba(13,31,60,0.8) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Prev / Next arrows */}
        <button
          onClick={goPrev}
          aria-label="Previous slide"
          style={{
            position: "absolute",
            left: 16,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 10,
            background: "rgba(0,0,0,0.35)",
            border: "none",
            borderRadius: "50%",
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
            fontSize: 18,
            lineHeight: 1,
            backdropFilter: "blur(4px)",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.6)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.35)"; }}
        >
          &#8249;
        </button>
        <button
          onClick={goNext}
          aria-label="Next slide"
          style={{
            position: "absolute",
            right: 16,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 10,
            background: "rgba(0,0,0,0.35)",
            border: "none",
            borderRadius: "50%",
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
            fontSize: 18,
            lineHeight: 1,
            backdropFilter: "blur(4px)",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.6)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.35)"; }}
        >
          &#8250;
        </button>

        {/* Pagination dots */}
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            display: "flex",
            gap: 8,
          }}
        >
          {HERO_SLIDES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goTo(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              style={{
                width: currentSlide === idx ? 24 : 10,
                height: 10,
                borderRadius: 5,
                border: "none",
                background: currentSlide === idx ? "#C9A84C" : "rgba(255,255,255,0.5)",
                cursor: "pointer",
                transition: "all 0.3s ease",
                padding: 0,
              }}
            />
          ))}
        </div>

        {/* Text overlay */}
        <div style={{ position: "relative", zIndex: 5, maxWidth: 1280, margin: "0 auto", padding: "0 24px", width: "100%" }}>
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            style={{ fontSize: "clamp(28px, 5vw, 46px)", fontWeight: 900, lineHeight: 1.15, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.4)", marginBottom: 10 }}
          >
            WELCOME TO THE
          </motion.h1>
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            style={{ fontSize: "clamp(28px, 5vw, 46px)", fontWeight: 900, lineHeight: 1.15, marginBottom: 24 }}
          >
           <span style={{ color: "#C9A84C" }}>
  OFFICE <span style={{ color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>of</span> SPORTS <span style={{ color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>AND</span> CULTURAL AFFAIRS
</span>
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
          >
            <Link href="/register" style={{ padding: "14px 28px", fontWeight: 700, fontSize: 13, letterSpacing: "0.02em", color: "#fff", background: "#1d4ed8", borderRadius: 6, textDecoration: "none", textTransform: "uppercase" }}>
              Create Account
            </Link>
            <Link href="/login" style={{ padding: "14px 28px", fontWeight: 700, fontSize: 13, letterSpacing: "0.02em", color: "#0d1f3c", background: "#C9A84C", borderRadius: 6, textDecoration: "none", textTransform: "uppercase" }}>
              Sign In
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ─── DASHBOARD (3‑COLUMN) ─── */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "8px 24px 0" }}>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          style={{ display: "grid", gridTemplateColumns: "260px 1fr 260px", gap: 22, alignItems: "start" }}>

          {/* ── LEFT COLUMN ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

            {/* Announcements Mini Carousel */}
            <AnnouncementsCarousel />

            {/* Open for Tryouts Card */}
            <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ borderTop: "3px solid #C9A84C", padding: 20, background: "#fff" }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: "#0d1f3c", marginBottom: 8 }}>Open for Tryouts</h3>
                <p style={{ fontSize: 12, color: "#5b6472", lineHeight: 1.6, marginBottom: 16 }}>
                  Showcase your talent and represent NAAP in various sports and cultural events.
                </p>
                <Link href="/register"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", fontSize: 11, fontWeight: 700, color: "#0d1f3c", background: "#C9A84C", borderRadius: 6, textDecoration: "none", textTransform: "uppercase" }}>
                  Sign Up Now <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </div>

          {/* ── CENTER COLUMN ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {/* Quick Links Panel */}
            <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ background: "#0d1f3c", padding: "14px 20px" }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em" }}>Quick Links</h3>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: 16, background: "#fff" }}>
                {[
                  { label: "Player Registration", icon: UserPlus, href: "/register" },
                  { label: "Event Calendar", icon: Calendar, href: "#" },
                  { label: "Results & Standings", icon: Trophy, href: "#" },
                  { label: "Facility Booking", icon: Building2, href: "#" },
                  { label: "Cultural Programs", icon: Palette, href: "#" },
                  { label: "Membership Portal", icon: Users, href: "#" },
                ].map((link, i) => {
                  const Icon = link.icon;
                  return (
                    <a key={i} href={link.href}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 8px", borderRadius: 10, background: "#fafafa", border: "1px solid transparent", textDecoration: "none", color: "#0d1f3c", transition: "all 0.2s", cursor: "pointer" }}
                      onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = "#C9A84C"; el.style.background = "rgba(201,168,76,0.08)"; }}
                      onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = "transparent"; el.style.background = "#fafafa"; }}
                    >
                      <Icon size={20} style={{ color: "#C9A84C" }} />
                      <span style={{ fontSize: 10, fontWeight: 700, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.3 }}>{link.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Message Card */}
            <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ position: "relative", height: 180, overflow: "hidden", background: "#e7eaf0" }}>
                <Image src="/osca_pic.jpg" alt="OSCA" fill style={{ objectFit: "cover" }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "50%", background: "linear-gradient(transparent, rgba(13,31,60,0.7))" }} />
                <div style={{ position: "absolute", bottom: 12, left: 12, display: "inline-block", padding: "5px 14px", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0d1f3c", background: "#C9A84C", borderRadius: 50 }}>
                  Message
                </div>
              </div>
              <div style={{ padding: "14px 20px 20px", background: "#fff" }}>
                <p style={{ fontSize: 12, color: "#5b6472", lineHeight: 1.7, fontStyle: "italic" }}>
                  "Welcome to the OSCA Management System — your gateway to sports and cultural excellence at NAAP."
                </p>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {/* Follow Us Card */}
            <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ background: "#0d1f3c", padding: "14px 20px" }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em" }}>Follow Us</h3>
              </div>
              <div style={{ padding: 20, background: "#fff", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", border: "2px solid #C9A84C", overflow: "hidden", background: "#132a4d", flexShrink: 0 }}>
                    <Image src="/osca-logo.png" alt="OSCA" width={56} height={56} style={{ objectFit: "cover", width: "100%", height: "100%" }} />
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: "#0d1f3c", lineHeight: 1.3 }}>NAAP- Office of Sports and Cultural Affairs</p>
                  </div>
                </div>
                <a href="https://www.facebook.com/profile.php?id=61555726719574" target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 22px", fontSize: 11, fontWeight: 700, color: "#fff", background: "#1877F2", borderRadius: 6, textDecoration: "none", textTransform: "uppercase" }}>
                  <ExternalLink size={13} /> Facebook Page
                </a>
                <p style={{ fontSize: 11, color: "#5b6472", textAlign: "center", fontWeight: 600 }}>FIND US ON FACEBOOK</p>
              </div>
            </div>

            {/* Find Your Team Card */}
            <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ background: "#0d1f3c", padding: "14px 20px" }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em" }}>Find Your Team</h3>
              </div>
              <div style={{ padding: 20, background: "#fff" }}>
                <p style={{ fontSize: 12, color: "#5b6472", lineHeight: 1.7, marginBottom: 16 }}>
                  Choose your track and become part of a team that matches your passion.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <a href="/register?track=sports" style={{ padding: "10px", fontSize: 11, fontWeight: 700, color: "#0d1f3c", background: "#C9A84C", borderRadius: 6, textDecoration: "none", textTransform: "uppercase", textAlign: "center" }}>
                    Sports Track
                  </a>
                  <a href="/register?track=culture" style={{ padding: "10px", fontSize: 11, fontWeight: 700, color: "#fff", background: "#0d1f3c", borderRadius: 6, textDecoration: "none", textTransform: "uppercase", textAlign: "center" }}>
                    Cultural Track
                  </a>
                </div>
              </div>
            </div>

            {/* Motivation Banner */}
            <div style={{ padding: "28px 20px", borderRadius: 12, background: "linear-gradient(135deg, #1d4ed8, #0d1f3c)", textAlign: "center" }}>
              <p style={{ fontSize: 16, fontWeight: 900, color: "#fff", lineHeight: 1.4, letterSpacing: "0.02em" }}>
                EXCELLENCE<br />HAS NO LIMITS
              </p>
            </div>
          </div>

        </motion.div>
      </section>

      {/* ─── LATEST NEWS & ANNOUNCEMENTS ─── */}
      <section id="news" style={{ padding: "60px 24px", maxWidth: 1100, margin: "0 auto" }}>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 40 }}>
          <span style={{ display: "inline-block", padding: "5px 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#0d1f3c", background: "rgba(201,168,76,0.15)", borderRadius: 50, marginBottom: 14 }}>Latest News</span>
          <h2 style={{ fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 800, color: "#0d1f3c" }}>News & Announcements</h2>
        </motion.div>

        {NEWS_ITEMS.length === 0 ? (
          <p style={{ textAlign: "center", fontSize: 14, color: "#5b6472", padding: "40px 0" }}>No announcements available.</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
              {NEWS_ITEMS.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <a href={item.href} target="_blank" rel="noopener noreferrer"
                    style={{ display: "block", borderRadius: 10, overflow: "hidden", background: "#fff", border: "1px solid #e7eaf0", textDecoration: "none", transition: "box-shadow 0.2s, transform 0.2s", cursor: "pointer" }}
                    onMouseEnter={(e) => { const el = e.currentTarget; el.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)"; el.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={(e) => { const el = e.currentTarget; el.style.boxShadow = "none"; el.style.transform = "none"; }}
                  >
                    <div style={{ position: "relative", height: 160, overflow: "hidden", background: "#e7eaf0" }}>
                      <Image src={item.image} alt={item.title} fill style={{ objectFit: "cover" }} />
                    </div>
                    <div style={{ padding: "16px 18px 18px" }}>
                      <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{item.date}</span>
                      <h3 style={{ fontSize: 14, fontWeight: 800, color: "#0d1f3c", lineHeight: 1.4, marginBottom: 8 }}>{item.title}</h3>
                      <p style={{ fontSize: 12, color: "#5b6472", lineHeight: 1.7 }}>{item.excerpt}</p>
                    </div>
                  </a>
                </motion.div>
              ))}
            </div>

            <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginTop: 32 }}>
              <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 28px", fontSize: 12, fontWeight: 700, color: "#fff", background: "#1d4ed8", borderRadius: 6, textDecoration: "none", textTransform: "uppercase" }}>
                View Announcements <ArrowRight size={14} />
              </Link>
            </motion.div>
          </>
        )}
      </section>

      {/* ─── VISION & MISSION ─── */}
      <section id="about" style={{ padding: "60px 24px", maxWidth: 1100, margin: "0 auto" }}>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 40 }}>
          <span style={{ display: "inline-block", padding: "5px 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#0d1f3c", background: "rgba(201,168,76,0.15)", borderRadius: 50, marginBottom: 14 }}>About OSCA</span>
          <h2 style={{ fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 800, color: "#0d1f3c" }}>Who We Are</h2>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {[
            { title: "Vision", icon: "🌟", text: "To empower students to reach their full potential in sports and arts, fostering excellence, discipline, and creativity." },
            { title: "Mission", icon: "🏆", text: "To promote, facilitate and develop holistic student athletes and artists at all levels of competition and performance." },
            { title: "About", icon: "🏛️", text: "The Office of Sports and Cultural Affairs is committed to providing access to quality sports and cultural trainings, practices, and opportunities." },
          ].map((card, i) => (
            <motion.div
              key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              style={{ padding: "28px 22px", borderRadius: 10, background: "#fff", border: "1px solid #e7eaf0", borderTop: "3px solid #C9A84C", textAlign: "center" }}
            >
              <span style={{ fontSize: 32, display: "block", marginBottom: 14 }}>{card.icon}</span>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#0d1f3c", marginBottom: 8 }}>{card.title}</h3>
              <p style={{ fontSize: 13, color: "#5b6472", lineHeight: 1.7 }}>{card.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── OSCA PERSONNEL ─── */}
      <section id="sports" style={{ padding: "60px 24px", maxWidth: 1100, margin: "0 auto", background: "#fafafa" }}>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 40 }}>
          <span style={{ display: "inline-block", padding: "5px 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#0d1f3c", background: "rgba(201,168,76,0.15)", borderRadius: 50, marginBottom: 14 }}>OSCA Personnel</span>
          <h2 style={{ fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 800, color: "#0d1f3c" }}>Our Team</h2>
        </motion.div>

        {/* President */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: 40, padding: "26px 20px", borderRadius: 10, background: "#0d1f3c", border: "1px solid #0d1f3c" }}
        >
          <div style={{ width: 76, height: 76, margin: "0 auto 12px", borderRadius: "50%", background: "linear-gradient(135deg, #C9A84C, #f5d778)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, color: "#0d1f3c" }}>P</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>PROF. MARWIN M. DELA CRUZ, PH.D</p>
          <p style={{ fontSize: 12, color: "#C9A84C", fontWeight: 600, marginTop: 4 }}>President of National Aviation Academy of the Philippines</p>
        </motion.div>

        {/* Director & Staff */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 36 }}>
          {[
            { name: "ENGR. JEQ ZYRIUS A. SUDWESTE, MEA", role: "Vice President of Student Affairs" },
            { name: "NUR KHAN D. UMPA, MA.ED.", role: "Director of Sports and Cultural Affairs Unit" },
            { name: "JAYVEE CONDADA", role: "Office of Sports and Cultural Affairs - Staff" },
          ].map((p, i) => (
            <motion.div
              key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              style={{ padding: "20px 16px", borderRadius: 10, background: "#fff", border: "1px solid #e7eaf0", textAlign: "center" }}
            >
              <div style={{ width: 46, height: 46, margin: "0 auto 10px", borderRadius: "50%", background: "#0d1f3c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#C9A84C" }}>{p.name[0]}</div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0d1f3c" }}>{p.name}</p>
              <p style={{ fontSize: 11, color: "#8a8f98", marginTop: 4 }}>{p.role}</p>
            </motion.div>
          ))}
        </div>

        {/* Sports Coaches */}
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ marginBottom: 36 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#0d1f3c", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center", marginBottom: 18 }}>Sports Coaches</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {[
              { name: "BERT BALAJADIA", role: "Head Coach of Taekwondo" },
              { name: "JAYVEE CONDADA", role: "Head Coach of Volleyball - Men" },
              { name: "RAY ALLEN CASTILLO", role: "Head Coach of Volleyball - Women" },
              { name: "JJ MALANAY", role: "Head Coach of Arnis" },
              { name: "ROI PAGUE", role: "Head Coach of Sepak Takraw" },
              { name: "DENNIS PAGLIGARAN", role: "Head Coach of Basketball" },
            ].map((coach, i) => (
              <motion.div
                key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                style={{ padding: "16px 12px", borderRadius: 8, background: "#fff", border: "1px solid #e7eaf0", borderLeft: "3px solid #1d4ed8", textAlign: "center" }}
              >
                <p style={{ fontSize: 12, fontWeight: 700, color: "#0d1f3c" }}>{coach.name}</p>
                <p style={{ fontSize: 10, color: "#8a8f98", marginTop: 4 }}>{coach.role}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Trainers */}
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#0d1f3c", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center", marginBottom: 18 }}>Trainers</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {[
              { name: "JOHANN CINCO", role: "Choir Conduction of Himig Himpapawid" },
            ].map((trainer, i) => (
              <motion.div
                key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                style={{ padding: "16px 12px", borderRadius: 8, background: "#fff", border: "1px solid #e7eaf0", borderLeft: "3px solid #C9A84C", textAlign: "center" }}
              >
                <p style={{ fontSize: 12, fontWeight: 700, color: "#0d1f3c" }}>{trainer.name}</p>
                <p style={{ fontSize: 10, color: "#8a8f98", marginTop: 4 }}>{trainer.role}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ─── CONTACT ─── */}
      <section id="contact" style={{ padding: "56px 24px", maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <span style={{ display: "inline-block", padding: "5px 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#0d1f3c", background: "rgba(201,168,76,0.15)", borderRadius: 50, marginBottom: 16 }}>Contact</span>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0d1f3c", marginBottom: 20 }}>OFFICE INFORMATION</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <a href="mailto:osca@naap.edu.ph" style={{ fontSize: 14, color: "#5b6472", textDecoration: "none" }}>📧 osca@naap.edu.ph</a>
            <p style={{ fontSize: 14, color: "#5b6472" }}>📍OSCA Office, 1st Floor, Building A, NAAP Main Campus, Piccio Garden, Villamor, Pasay City</p>
          </div>
        </motion.div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={{ background: "#0d1f3c", borderTop: "3px solid #C9A84C", padding: "24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Image src="/osca-logo.png" alt="OSCA" width={28} height={28} style={{ borderRadius: "50%" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#C9A84C" }}>OSCA Management System</span>
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>© {new Date().getFullYear()} Office of Sports and Cultural Affairs — National Aviation Academy of the Philippines</p>
          <div style={{ display: "flex", gap: 16 }}>
            <a href="#" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>Privacy</a>
            <a href="#" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ═══ ANNOUNCEMENTS MINI CAROUSEL ═══ */
const ANNOUNCEMENTS = [
  { title: "Basketball & Volleyball Tryouts", date: "March 15, 2026", excerpt: "Tryouts for the NAAP men's and women's basketball and volleyball teams are now open for all students." },
  { title: "OSCA Choir Auditions", date: "March 22, 2026", excerpt: "Showcase your vocal talent! Auditions for the OSCA Chorale are open to all grade levels." },
  { title: "Annual Sports Fest Schedule", date: "April 5–12, 2026", excerpt: "The week-long annual sports festival featuring inter-department competitions in various disciplines." },
];

function AnnouncementsCarousel() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((p) => (p + 1) % ANNOUNCEMENTS.length), 4500);
    return () => clearInterval(t);
  }, []);

  const a = ANNOUNCEMENTS[idx];

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ background: "#0d1f3c", padding: "14px 20px" }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em" }}>Announcements</h3>
      </div>
      <div style={{ padding: 20, background: "#fff", minHeight: 120 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#0d1f3c", marginBottom: 4 }}>{a.title}</p>
        <p style={{ fontSize: 11, color: "#C9A84C", fontWeight: 600, marginBottom: 8 }}>{a.date}</p>
        <p style={{ fontSize: 12, color: "#5b6472", lineHeight: 1.6 }}>{a.excerpt}</p>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "0 20px 14px", background: "#fff" }}>
        {ANNOUNCEMENTS.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)} aria-label={`Announcement ${i + 1}`}
            style={{ width: i === idx ? 20 : 8, height: 8, borderRadius: 4, border: "none", background: i === idx ? "#C9A84C" : "#d9dce2", cursor: "pointer", padding: 0, transition: "all 0.3s ease" }} />
        ))}
      </div>
    </div>
  );
}
