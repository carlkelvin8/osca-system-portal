"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { UserPlus, Calendar, Trophy, Building2, Palette, Users, ExternalLink, ArrowRight, X, ChevronLeft, ChevronRight } from "lucide-react";
import { announcementsApi } from "@/lib/api";
import type { Announcement, PaginatedResponse } from "@/types";

const HERO_SLIDES = [
  { src: "/osca_pics/osca_pic.jpg", alt: "OSCA Sports and Cultural Affairs" },
  { src: "/osca_pics/osca_pic2.jpg", alt: "OSCA Athletic Events" },
  { src: "/osca_pics/osca_pic3.jpg", alt: "OSCA PASUC" },
  { src: "/osca_pics/osca_pic4.jpg", alt: "OSCA Cultural Performances" },
  { src: "/osca_pics/osca_pic5.jpg", alt: "OSCA HHDC" },
  { src: "/osca_pics/osca_pic6.jpg", alt: "OSCA MH" },
  { src: "/osca_pics/osca_pic7.jpg", alt: "OSCA MHd" },
];

interface NewsItem {
  title: string;
  date: string;
  excerpt: string;
  image: string;
  href: string | null;
  images: string[];
}

function announcementImages(ann: Announcement): string[] {
  if (ann.image_urls && ann.image_urls.length) return ann.image_urls;
  return ann.image_url ? [ann.image_url] : [];
}

function announcementDateLabel(ann: Announcement, style: "card" | "carousel"): string {
  const d = ann.event_date ? new Date(ann.event_date) : new Date(ann.created_at);
  if (isNaN(d.getTime())) return "";
  return format(d, style === "card" ? "MMMM yyyy" : "MMMM d, yyyy");
}

const NAV_LINKS = [
  { label: "Home", section: "home" },
  { label: "News", section: "news" },
  { label: "About", section: "about" },
  { label: "Sports", section: "sports" },
  { label: "Contact", section: "contact" },
];

export default function WelcomeClient() {
  const [active, setActive] = useState("Home");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [winW, setWinW] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const update = () => setWinW(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const { data: publicData } = useQuery<PaginatedResponse<Announcement>>({
    queryKey: ["announcements", "public"],
    queryFn: async () => (await announcementsApi.publicList({ page_size: 50 })).data,
    staleTime: 60_000,
  });

  const dbNews: NewsItem[] = (publicData?.items ?? []).map((ann) => {
    const images = announcementImages(ann);
    return {
      title: ann.title,
      date: announcementDateLabel(ann, "card"),
      excerpt: ann.content,
      image: images[0] ?? "/osca_pics/osca_pic2.jpg",
      href: ann.link_url || null,
      images,
    };
  });
  const newsItems = dbNews;
  const carouselItems =
    dbNews.length && publicData
      ? publicData.items.map((ann) => ({
          title: ann.title,
          date: announcementDateLabel(ann, "carousel"),
          excerpt: ann.content,
        }))
      : [];

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
     <nav style={{ background: "#0d1f3c", borderTop: "3px solid #C9A84C", borderBottom: "3px solid #C9A84C", position: "sticky", top: 0, zIndex: 100 }}>
  <div style={{ width: "94%", maxWidth: 1600, margin: "0 auto", padding: "10px 24px 10px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
    <Link href="/" style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid #C9A84C", overflow: "hidden", background: "#132a4d", flexShrink: 0 }}>
        <Image src="/logo/osca-logo.png" alt="OSCA Crest" width={44} height={44} style={{ objectFit: "cover", width: "100%", height: "100%" }} priority />
      </div>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>OSCA Management System</span>
        <span style={{ fontSize: 10, fontWeight: 500, color: "#C9A84C" }}>NAAP · Villamor Campus</span>
      </div>
    </Link>

    <div style={{ display: "flex", gap: winW < 480 ? 12 : 22, alignItems: "center", flexWrap: "wrap", justifyContent: winW < 480 ? "center" : "flex-end" }}>
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

      <section id="home"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{
          position: "relative",
          minHeight: winW < 480 ? 360 : 440,
          overflow: "hidden",
          display: "flex",
          alignItems: "flex-end",
          padding: "0 0 48px",
        }}
      >
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slide.src}
              alt={slide.alt}
              loading={idx === 0 ? "eager" : "eager"}
              decoding="async"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        ))}

        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(13,31,60,0.3) 0%, rgba(13,31,60,0.8) 100%)",
            pointerEvents: "none",
          }}
        />

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

        <div style={{ position: "relative", zIndex: 5, width: "94%", maxWidth: 1600, margin: "0 auto", padding: "0 24px" }}>
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

      <section style={{ width: "94%", maxWidth: 1600, margin: "0 auto", padding: winW < 480 ? "8px 12px 0" : "8px 24px 0" }}>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          style={{ display: "grid", gridTemplateColumns: winW < 768 ? "1fr" : "260px 1fr 260px", gap: 22, alignItems: "start" }}>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

            <AnnouncementsCarousel items={carouselItems} />

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

            <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ background: "#0d1f3c", padding: "14px 20px" }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em" }}>Follow Our Artist Groups</h3>
              </div>
              <div style={{ padding: "12px 0", background: "#fff", display: "flex", flexDirection: "column" }}>
                {[
                  { name: "Hataw Himpapawid Dance Group", img: "/logo/HHDC.png", url: "https://www.facebook.com/HHDCOfficial" },
                  { name: "Himig Himpapawid Chorale", img: "/logo/HH.png", url: "https://www.facebook.com/profile.php?id=61584638812694" },
                  { name: "Musikang Himpapawid Live Band", img: "/logo/MH.png", url: "https://www.facebook.com/MHLBphilscavab" },
                ].map((org, i) => (
                  <a
                    key={i}
                    href={org.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Visit ${org.name} on Facebook`}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", textDecoration: "none", color: "inherit", transition: "background 0.2s, box-shadow 0.2s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f8f9fb"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <div style={{ width: 42, height: 42, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "2px solid #e7eaf0", background: "#f0f0f0" }}>
                      <img src={org.img} alt={org.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#0d1f3c", lineHeight: 1.3, margin: 0 }}>{org.name}</p>
                      <p style={{ fontSize: 10, color: "#8a8f98", marginTop: 2, margin: "2px 0 0" }}>Official Facebook Page</p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#1877F2" style={{ flexShrink: 0, transition: "fill 0.2s" }} onMouseEnter={(e) => { (e.currentTarget as SVGSVGElement).style.fill = "#1565C0"; }} onMouseLeave={(e) => { (e.currentTarget as SVGSVGElement).style.fill = "#1877F2"; }}>
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ background: "#0d1f3c", padding: "14px 20px" }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em" }}>Quick Links</h3>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: winW < 480 ? "1fr" : "1fr 1fr", gap: 10, padding: 16, background: "#fff" }}>
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

            <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ position: "relative", height: 180, overflow: "hidden", background: "#e7eaf0" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/osca_pics/osca_pic2.jpg" alt="OSCA" loading="eager" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
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

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ background: "#0d1f3c", padding: "14px 20px" }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em" }}>Follow Us</h3>
              </div>
              <div style={{ padding: 20, background: "#fff", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", border: "2px solid #C9A84C", overflow: "hidden", background: "#132a4d", flexShrink: 0 }}>
                    <Image src="/logo/osca-logo.png" alt="OSCA" width={56} height={56} style={{ objectFit: "cover", width: "100%", height: "100%" }} />
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

            <div style={{ padding: "28px 20px", borderRadius: 12, background: "linear-gradient(135deg, #1d4ed8, #0d1f3c)", textAlign: "center" }}>
              <p style={{ fontSize: 16, fontWeight: 900, color: "#fff", lineHeight: 1.4, letterSpacing: "0.02em" }}>
                EXCELLENCE<br />HAS NO LIMITS
              </p>
            </div>
          </div>

        </motion.div>
      </section>

      <section id="news" style={{ padding: "60px 24px", width: "94%", maxWidth: 1600, margin: "0 auto" }}>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 40 }}>
          <span style={{ display: "inline-block", padding: "5px 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#0d1f3c", background: "rgba(201,168,76,0.15)", borderRadius: 50, marginBottom: 14 }}>Latest News</span>
          <h2 style={{ fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 800, color: "#0d1f3c" }}>News & Announcements</h2>
        </motion.div>

        {newsItems.length === 0 ? (
          <p style={{ textAlign: "center", fontSize: 14, color: "#5b6472", padding: "40px 0" }}>No announcements available.</p>
        ) : (
          <>
            <NewsCarousel items={newsItems} onOpenLightbox={(images) => setLightbox({ images, index: 0 })} />

            <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginTop: 32 }}>
              <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 28px", fontSize: 12, fontWeight: 700, color: "#fff", background: "#1d4ed8", borderRadius: 6, textDecoration: "none", textTransform: "uppercase" }}>
                View Announcements <ArrowRight size={14} />
              </Link>
            </motion.div>
          </>
        )}
      </section>

      <section id="about" style={{ padding: "60px 24px", width: "94%", maxWidth: 1600, margin: "0 auto" }}>
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

      <section id="sports" style={{ padding: "60px 24px", width: "94%", maxWidth: 1600, margin: "0 auto", background: "#fafafa" }}>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: "center", marginBottom: 40 }}>
          <span style={{ display: "inline-block", padding: "5px 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#0d1f3c", background: "rgba(201,168,76,0.15)", borderRadius: 50, marginBottom: 14 }}>OSCA Personnel</span>
          <h2 style={{ fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 800, color: "#0d1f3c" }}>Our Team</h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          style={{ textAlign: "center", marginBottom: 40, padding: "26px 20px", borderRadius: 10, background: "#0d1f3c", border: "1px solid #0d1f3c" }}
        >
          <div style={{ width: 76, height: 76, margin: "0 auto 12px", borderRadius: "50%", background: "linear-gradient(135deg, #C9A84C, #f5d778)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, color: "#0d1f3c" }}>P</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>PROF. MARWIN M. DELA CRUZ, PH.D</p>
          <p style={{ fontSize: 12, color: "#C9A84C", fontWeight: 600, marginTop: 4 }}>President of National Aviation Academy of the Philippines</p>
        </motion.div>

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

      <footer style={{ background: "#0d1f3c", borderTop: "3px solid #C9A84C", padding: "24px" }}>
        <div style={{ width: "94%", maxWidth: 1600, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Image src="/logo/osca-logo.png" alt="OSCA" width={28} height={28} style={{ borderRadius: "50%" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#C9A84C" }}>OSCA Management System</span>
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>© {new Date().getFullYear()} Office of Sports and Cultural Affairs — National Aviation Academy of the Philippines</p>
          <div style={{ display: "flex", gap: 16 }}>
            <a href="#" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>Privacy</a>
            <a href="#" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>Terms</a>
          </div>
        </div>
      </footer>

      {lightbox && (
        <PublicImageViewer images={lightbox.images} initialIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

function AnnouncementsCarousel({ items }: { items: { title: string; date: string; excerpt: string }[] }) {
  const [idx, setIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setIdx((p) => (p + 1) % Math.max(items.length, 1)), 4500);
    return () => clearInterval(t);
  }, [items.length]);

  useEffect(() => { setExpanded(false); }, [idx]);

  const a = items.length ? items[Math.min(idx, items.length - 1)] : null;

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ background: "#0d1f3c", padding: "14px 20px" }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.08em" }}>Announcements</h3>
      </div>
      <div style={{ padding: 20, background: "#fff", minHeight: 120 }}>
        {a ? (
          <div style={{ maxHeight: expanded ? 500 : 130, overflow: "hidden", transition: "max-height 0.4s ease" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#0d1f3c", marginBottom: 4 }}>{a.title}</p>
            <p style={{ fontSize: 11, color: "#C9A84C", fontWeight: 600, marginBottom: 8 }}>{a.date}</p>
            <p style={{ fontSize: 12, color: "#5b6472", lineHeight: 1.6 }}>{a.excerpt}</p>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "#5b6472", lineHeight: 1.6 }}>No announcements at the moment. Check back soon.</p>
        )}
        {a && a.excerpt && (
          <button
            onClick={() => setExpanded((p) => !p)}
            style={{ display: "block", margin: "8px auto 0", padding: "4px 12px", fontSize: 10, fontWeight: 700, color: "#1d4ed8", background: "none", border: "none", cursor: "pointer", letterSpacing: "0.03em", transition: "color 0.2s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#0d1f3c"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#1d4ed8"; }}
          >
            {expanded ? "View Less" : "View More"}
          </button>
        )}
      </div>
      {items.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "0 20px 14px", background: "#fff" }}>
          {items.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} aria-label={`Announcement ${i + 1}`}
              style={{ width: i === idx ? 20 : 8, height: 8, borderRadius: 4, border: "none", background: i === idx ? "#C9A84C" : "#d9dce2", cursor: "pointer", padding: 0, transition: "all 0.3s ease" }} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewsCarousel({ items, onOpenLightbox }: { items: NewsItem[]; onOpenLightbox: (images: string[]) => void }) {
  const n = items.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [winW, setWinW] = useState(0);

  useEffect(() => {
    const update = () => setWinW(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const isMobile = winW > 0 && winW < 640;
  const isTablet = winW >= 640 && winW < 1024;

  const next = useCallback(() => setActive((p) => (p + 1) % n), [n]);

  useEffect(() => {
    if (n <= 1 || paused) return;
    const t = setInterval(next, 6000);
    return () => clearInterval(t);
  }, [n, paused, next]);

  if (n === 0) return null;

  const cardW = isMobile ? Math.min(360, Math.max(280, winW * 0.86)) : isTablet ? 280 : 320;
  const centerW = Math.round(cardW * (isMobile ? 1 : 1.28));
  const sideScale = 0.9;
  const sideHalf = (cardW * sideScale) / 2;
  const sideOpacity = 0.55;
  const sideBlur = 3.5;
  const overlap = 22;
  const offset = isMobile ? 0 : Math.round(centerW / 2 + sideHalf - overlap);
  const containerW = isMobile
    ? cardW
    : Math.min(Math.round(2 * (offset + sideHalf) + 12), Math.max(600, (winW || 900) - 40));
  const cardH = isMobile ? 400 : 366;

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{ position: "relative" }}
    >
      <div style={{ position: "relative", width: containerW, height: cardH, margin: "0 auto", overflow: "hidden", borderRadius: 14 }}>
        {items.map((item, i) => {
          let delta = i - active;
          if (delta > n / 2) delta -= n;
          if (delta < -n / 2) delta += n;
          const focused = delta === 0;
          const adjacent = Math.abs(delta) === 1;
          const x = delta * offset;
          return (
            <div
              key={i}
              onClick={adjacent ? () => setActive(i) : undefined}
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                width: focused ? centerW : cardW,
                height: cardH,
                transform: `translateX(calc(-50% + ${x}px)) scale(${focused ? 1 : sideScale})`,
                opacity: focused ? 1 : isMobile || !adjacent ? 0 : sideOpacity,
                filter: focused ? "none" : `blur(${adjacent ? sideBlur : 5}px)`,
                zIndex: focused ? 3 : 1,
                transition: "transform 0.7s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.6s ease, filter 0.6s ease",
                pointerEvents: focused || adjacent ? "auto" : "none",
                cursor: adjacent ? "pointer" : "default",
              }}
            >
              <div style={{ width: "100%", height: "100%", pointerEvents: adjacent ? "none" : "auto" }}>
                <CarouselCard item={item} onOpenLightbox={() => onOpenLightbox(item.images)} />
              </div>
            </div>
          );
        })}
      </div>

      {n > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 18 }}>
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Go to announcement ${i + 1}`}
              style={{ width: i === active ? 24 : 8, height: 8, borderRadius: 4, border: "none", background: i === active ? "#C9A84C" : "#d9dce2", cursor: "pointer", padding: 0, transition: "all 0.3s ease" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CarouselCard({ item, onOpenLightbox }: { item: NewsItem; onOpenLightbox: () => void }) {
  const hasImages = item.images.length > 0;
  const body = (
    <>
      <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color: "#C9A84C", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{item.date}</span>
      <h3 style={{ fontSize: 15, fontWeight: 800, color: "#0d1f3c", lineHeight: 1.4, marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.title}</h3>
      <p style={{ fontSize: 12, color: "#5b6472", lineHeight: 1.7, margin: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{item.excerpt}</p>
      {item.href && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, fontSize: 11, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          <ExternalLink size={12} /> View Link
        </span>
      )}
    </>
  );
  return (
    <div style={{ width: "100%", height: "100%", borderRadius: 14, overflow: "hidden", background: "#fff", border: "1px solid #e7eaf0", boxShadow: "0 10px 30px rgba(13,31,60,0.12)", display: "flex", flexDirection: "column" }}>
      <div
        onClick={() => hasImages && onOpenLightbox()}
        title={item.images.length > 1 ? "View images" : "View image"}
        style={{ position: "relative", height: 180, overflow: "hidden", background: "#e7eaf0", cursor: hasImages ? "zoom-in" : "default", flexShrink: 0 }}
      >
        <img src={item.image} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {item.images.length > 1 && (
          <span style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(13,31,60,0.75)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 50, letterSpacing: "0.03em" }}>
            +{item.images.length - 1} more
          </span>
        )}
      </div>
      {item.href ? (
        <a href={item.href} target="_blank" rel="noopener noreferrer" style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: "16px 18px 18px", textDecoration: "none" }}>{body}</a>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: "16px 18px 18px" }}>{body}</div>
      )}
    </div>
  );
}

function PublicImageViewer({ images, initialIndex, onClose }: { images: string[]; initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, images.length]);

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
    >
      <button
        onClick={onClose}
        aria-label="Close"
        style={{ position: "absolute", top: 16, right: 16, display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, border: "none", borderRadius: "50%", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", transition: "background 0.2s" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.25)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; }}
      >
        <X size={20} />
      </button>

      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.max(0, i - 1)); }}
            disabled={index === 0}
            aria-label="Previous image"
            style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, border: "none", borderRadius: "50%", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", transition: "background 0.2s", opacity: index === 0 ? 0.35 : 1 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.25)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; }}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.min(images.length - 1, i + 1)); }}
            disabled={index === images.length - 1}
            aria-label="Next image"
            style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, border: "none", borderRadius: "50%", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", transition: "background 0.2s", opacity: index === images.length - 1 ? 0.35 : 1 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.25)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; }}
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      <img
        src={images[index] ?? ""}
        alt="Announcement"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "92%", maxHeight: "88%", objectFit: "contain", borderRadius: 8 }}
      />

      <span style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", fontSize: 13, background: "rgba(255,255,255,0.15)", padding: "6px 14px", borderRadius: 50 }}>
        {index + 1} / {images.length}
      </span>
    </div>,
    document.body
  );
}
