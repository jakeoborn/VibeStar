// Supabase cloud sync — account auth + lineup/notes backup
//
// Setup (5 min):
//  1. Create free project at https://supabase.com
//  2. Paste your Project URL and anon key below
//  3. Open Supabase → SQL Editor → run the block below once
//
/* ── SQL (run once in Supabase SQL Editor) ───────────────────────────
create table if not exists user_data (
  user_id     uuid references auth.users primary key,
  artist_ids  text[]   not null default '{}',
  notes       jsonb    not null default '{}',
  updated_at  timestamptz default now()
);
alter table user_data enable row level security;
create policy "own rows only" on user_data for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
─────────────────────────────────────────────────────────────────── */

const SUPABASE_URL  = "";
const SUPABASE_ANON = "";

const _sb = (SUPABASE_URL && SUPABASE_ANON)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
  : null;

// ── Auth ──────────────────────────────────────────────────────
async function sbSignIn(email) {
  if (!_sb) return { error: "Supabase not configured" };
  const { error } = await _sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return { error: error?.message || null };
}

async function sbSignOut() {
  if (!_sb) return;
  await _sb.auth.signOut();
}

async function sbGetUser() {
  if (!_sb) return null;
  const { data } = await _sb.auth.getUser();
  return data?.user || null;
}

// Subscribe to auth changes — returns unsubscribe fn
function sbOnAuthChange(cb) {
  if (!_sb) return () => {};
  const { data } = _sb.auth.onAuthStateChange((event, session) => {
    cb(event, session?.user || null);
  });
  return () => data.subscription.unsubscribe();
}

// ── Cloud sync ────────────────────────────────────────────────
async function sbPush(artistIds, notes) {
  if (!_sb) return;
  const user = await sbGetUser();
  if (!user) return;
  await _sb.from("user_data").upsert({
    user_id:    user.id,
    artist_ids: artistIds,
    notes:      notes,
    updated_at: new Date().toISOString(),
  });
}

async function sbPull() {
  if (!_sb) return null;
  const user = await sbGetUser();
  if (!user) return null;
  const { data } = await _sb
    .from("user_data")
    .select("artist_ids, notes")
    .eq("user_id", user.id)
    .single();
  return data || null;
}

// ── Account card (shown inside MeScreen) ─────────────────────
function AccountCard({ state, setState }) {
  const configured = !!(SUPABASE_URL && SUPABASE_ANON);
  const [sbUser, setSbUser] = React.useState(null);
  const [email,  setEmail]  = React.useState("");
  const [phase,  setPhase]  = React.useState("idle"); // idle | sending | sent | error
  const [errMsg, setErrMsg] = React.useState("");
  const [syncing, setSyncing] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState("");

  // Resolve current user on mount
  React.useEffect(() => {
    if (!configured) return;
    sbGetUser().then(setSbUser);
    return sbOnAuthChange((event, user) => {
      setSbUser(user);
      // On sign-in, pull cloud data and merge into local state
      if (event === "SIGNED_IN" && user) {
        sbPull().then(cloud => {
          if (!cloud) return;
          setState(st => {
            // Merge cloud artist_ids with local saved (union)
            const merged = [...new Set([...st.saved, ...(cloud.artist_ids || [])])];
            // Merge notes (cloud wins for non-empty entries)
            let localNotes = {};
            try { localNotes = JSON.parse(localStorage.getItem("artist_notes_v1") || "{}"); } catch {}
            const mergedNotes = { ...localNotes, ...cloud.notes };
            try { localStorage.setItem("artist_notes_v1", JSON.stringify(mergedNotes)); } catch {}
            return { ...st, saved: merged };
          });
        });
      }
    });
  }, [configured]);

  const handleSignIn = async () => {
    if (!email.trim()) return;
    setPhase("sending");
    const { error } = await sbSignIn(email.trim());
    if (error) { setPhase("error"); setErrMsg(error); }
    else setPhase("sent");
  };

  const handleSignOut = async () => {
    await sbSignOut();
    setSbUser(null);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    let notes = {};
    try { notes = JSON.parse(localStorage.getItem("artist_notes_v1") || "{}"); } catch {}
    await sbPush(state.saved, notes);
    setSyncing(false);
    setSyncMsg("Saved to cloud ✓");
    setTimeout(() => setSyncMsg(""), 2500);
  };

  return (
    <div style={{
      marginTop: 20,
      background: "var(--paper)", border: "1px solid var(--line)",
      borderRadius: 16, padding: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: "var(--ink)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--paper)" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20 c0-4 3.6-7 8-7 s8 3 8 7"/>
          </svg>
        </div>
        <div>
          <div className="serif" style={{ fontSize: 18, lineHeight: 1 }}>Cloud account</div>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.2, color: "var(--muted)", marginTop: 2 }}>
            SYNC LINEUP + NOTES ACROSS DEVICES
          </div>
        </div>
      </div>

      {!configured && (
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
          Add your Supabase URL and anon key to <span className="mono" style={{ fontSize: 11 }}>supabase.jsx</span> to enable cloud sync.
        </div>
      )}

      {configured && sbUser && (
        <>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", background: "var(--paper-2)",
            borderRadius: 10, marginBottom: 12,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 30,
              background: "linear-gradient(135deg, var(--ember), var(--horizon))",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontFamily: "Instrument Serif, serif", fontSize: 15, flexShrink: 0,
            }}>
              {(sbUser.email || "?")[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {sbUser.email}
              </div>
              <div className="mono" style={{ fontSize: 8, letterSpacing: 1.1, color: "var(--success)", marginTop: 2 }}>● SIGNED IN</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleSync} disabled={syncing} style={{
              flex: 1,
              background: syncMsg ? "var(--success)" : "var(--ink)",
              color: "var(--paper)", border: "none",
              borderRadius: 10, padding: "10px 14px", cursor: "pointer",
              fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 600,
              transition: "background 0.3s",
            }}>
              {syncing ? "SYNCING…" : syncMsg || `↑ PUSH ${state.saved.length} SETS TO CLOUD`}
            </button>
            <button onClick={handleSignOut} style={{
              background: "transparent", border: "1px solid var(--line-2)",
              borderRadius: 10, padding: "10px 14px", cursor: "pointer",
              fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, color: "var(--muted)",
            }}>SIGN OUT</button>
          </div>
        </>
      )}

      {configured && !sbUser && (
        <>
          {phase === "sent" ? (
            <div style={{
              padding: "12px 14px", background: "rgba(45,122,85,0.1)",
              border: "1px solid var(--success)", borderRadius: 10,
              fontSize: 13, color: "var(--success)", lineHeight: 1.5,
            }}>
              Magic link sent to <strong>{email}</strong>.<br/>
              Check your email and tap the link — this tab will sign you in automatically.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>
                Enter your email to get a magic sign-in link. No password needed.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setPhase("idle"); }}
                  onKeyDown={e => e.key === "Enter" && handleSignIn()}
                  placeholder="you@example.com"
                  style={{
                    flex: 1,
                    background: "var(--paper-2)", border: `1px solid ${phase === "error" ? "#f87171" : "var(--line-2)"}`,
                    borderRadius: 10, padding: "10px 12px",
                    fontFamily: "Geist, sans-serif", fontSize: 14, color: "var(--ink)", outline: "none",
                  }}
                />
                <button onClick={handleSignIn} disabled={phase === "sending" || !email.trim()} style={{
                  background: email.trim() ? "var(--ink)" : "var(--paper-2)",
                  color: email.trim() ? "var(--paper)" : "var(--muted)",
                  border: "none", borderRadius: 10, padding: "10px 14px", cursor: email.trim() ? "pointer" : "default",
                  fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
                  whiteSpace: "nowrap", transition: "all .15s",
                }}>
                  {phase === "sending" ? "…" : "SEND LINK"}
                </button>
              </div>
              {phase === "error" && (
                <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{errMsg}</div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

Object.assign(window, { AccountCard, sbSignIn, sbSignOut, sbGetUser, sbPush, sbPull, sbOnAuthChange });
