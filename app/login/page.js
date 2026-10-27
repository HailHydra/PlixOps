"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TEAM_USERS } from "@/lib/auth/users";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleLogin(e, directUser = null) {
    if (e) e.preventDefault();
    setLoading(true);
    setMessage("");

    const targetEmail = directUser ? directUser.email : email;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setMessage(err.message || "Could not sign in");
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleLogin}>
        <div className="brand-logo-large">
          <img src="/plix-ops-logo.png" alt="Plix Ops" />
        </div>
        <div>
          <span className="eyebrow">Plix Ops</span>
          <h1>Sign in to Plix Ops</h1>
          <p>Sign in with your team credentials to access your isolated workspace.</p>
        </div>

        <label>
          <span>Email address</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. himani@plix.com"
          />
        </label>

        <button className="button primary" disabled={loading}>
          {loading ? "Signing in…" : "Sign In with Email"}
        </button>

        {message && <p className="login-message" style={{ color: "#bd4b54", background: "#fae7e8" }}>{message}</p>}

        <div style={{ borderTop: "1px solid #eef0ee", paddingTop: "18px" }}>
          <span className="eyebrow" style={{ display: "block", marginBottom: "12px" }}>
            Or 1-Click Sign-In by Team Role:
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {TEAM_USERS.map((user) => (
              <button
                type="button"
                key={user.id}
                className="button"
                style={{
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "14px",
                  textAlign: "left",
                }}
                disabled={loading}
                onClick={() => handleLogin(null, user)}
              >
                <span>
                  <strong>{user.name}</strong>
                  <small style={{ display: "block", color: "#858a87", fontSize: "11px" }}>{user.email}</small>
                </span>
                <span className="status" style={{ fontSize: "10px", padding: "4px 8px" }}>
                  {user.teamName}
                </span>
              </button>
            ))}
          </div>
        </div>
      </form>
    </main>
  );
}

