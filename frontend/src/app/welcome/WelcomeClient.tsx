"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

/* ═══ NAV LINKS ═══ */
const LEFT_LINKS = [
  { label: "Home", href: "/" },
  { label: "Sports", href: "/sports" },
  { label: "Schedules", href: "/schedules" },
];
const RIGHT_LINKS = [
  { label: "News", href: "/news" },
  { label: "Teams", href: "/teams" },
  { label: "Join Us", href: "/register" },
  { label: "About", href: "/about" },
];

/* ═══ MAIN PAGE ═══ */
export default function WelcomeClient() {
  const [active, setActive] = useState("Home");

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#ffffff", color: "#0f1b2d", minHeight: "100vh" }}>
     {/* ─── NAVBAR (crest style) ─── */}
<nav style={{ background: "#0d1f3c", borderTop: "3px solid #C9A84C", borderBottom: "3px solid #C9A84C", position: "sticky", top: 0, zIndex: 100 }}>
  <div style={{ maxWidth: 1280, margin: "0 auto", padding: "10px 24px 10px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid #C9A84C", overflow: "hidden", background: "#132a4d", flexShrink: 0 }}>
          <Image src="/osca-logo.png" alt="OSCA Crest" width={44} height={44} style={{ objectFit: "cover", width: "100%", height: "100%" }} priority />
        </div>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>OSCA Management System</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: "#C9A84C" }}>NAAP · Villamor Campus</span>
        </div>
      </Link>

      <div style={{ display: "flex", gap: 22 }}>
        {LEFT_LINKS.map((link) => (
          <button
            key={link.label}
            onClick={() => setActive(link.label)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
              color: active === link.label ? "#C9A84C" : "rgba(255,255,255,0.85)",
            }}
          >
            {link.label}
          </button>
        ))}
      </div>
    </div>

    <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
      {RIGHT_LINKS.map((link) => (
        <button
          key={link.label}
          onClick={() => setActive(link.label)}
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

      {/* ─── HERO (photo background, bold overlay) ─── */}
      <section
        style={{
          position: "relative",
          minHeight: 440,
          backgroundImage: "linear-gradient(180deg, rgba(13,31,60,0.3) 0%, rgba(13,31,60,0.8) 100%), url('/osca_pic.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          alignItems: "flex-end",
          padding: "0 0 48px",
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px", width: "100%" }}>
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
  OFFICE <span style={{ color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>of</span> SPORTS <span style={{ color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>AND</span> CULTURAL AFFAIRS<span style={{ color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>!</span>
</span>
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
          >
            <Link href="/register" style={{ padding: "14px 28px", fontWeight: 700, fontSize: 13, letterSpacing: "0.02em", color: "#fff", background: "#1d4ed8", borderRadius: 6, textDecoration: "none", textTransform: "uppercase" }}>
              Create Account
            </Link>
            <Link href="/schedules" style={{ padding: "14px 28px", fontWeight: 700, fontSize: 13, letterSpacing: "0.02em", color: "#0d1f3c", background: "#C9A84C", borderRadius: 6, textDecoration: "none", textTransform: "uppercase" }}>
              Sign In
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ─── VISION & MISSION ─── */}
      <section style={{ padding: "60px 24px", maxWidth: 1100, margin: "0 auto" }}>
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
      <section style={{ padding: "60px 24px", maxWidth: 1100, margin: "0 auto", background: "#fafafa" }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {[
              { name: "JONATHAN IVAN LUKE MANEJA", role: "Trainer of Musika Himpapawid" },
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
      <section style={{ padding: "56px 24px", maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
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
