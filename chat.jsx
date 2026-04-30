// Ask Plursky — AI chat with Claude Haiku
// Key stored in localStorage under plursky_anthropic_key

const _CHAT_MODEL = "claude-haiku-4-5-20251001";

function _chatSystemPrompt(state) {
  const saved = ARTISTS.filter(a => state.saved.includes(a.id));
  const savedStr = saved.length
    ? saved.map(a => {
        const s = STAGES.find(x => x.id === a.stage);
        const d = FESTIVAL_CONFIG.dayDates[a.day];
        return `${a.name} (${d?.short || "Day " + a.day} ${a.start}–${a.end}, ${s?.name || a.stage}, ${a.genre})`;
      }).join("; ")
    : "none saved yet";

  const compact = ARTISTS.map(a => {
    const s = STAGES.find(x => x.id === a.stage);
    return `${a.name}|D${a.day}|${a.start}-${a.end}|${s?.short || a.stage}|${a.genre}|T${a.tier}`;
  }).join(", ");

  return `You are Plursky, an expert festival guide for ${FESTIVAL_CONFIG.name} ${FESTIVAL_CONFIG.year || 2026} in ${FESTIVAL_CONFIG.location}.

You help fans discover artists, navigate stages, and plan their schedule. Be friendly, concise, and practical. Respond in under 130 words unless the user asks for a detailed schedule.

Festival stages: ${STAGES.map(s => s.name).join(", ")}.
Festival dates: ${Object.values(FESTIVAL_CONFIG.dayDates || {}).map(d => d.name).filter(Boolean).join(", ")}.

User's saved sets (${saved.length}): ${savedStr}

Full lineup (Artist|Day|Times|Stage|Genre|Tier): ${compact}

If asked about clashes, check times carefully. If asked to build a schedule, pick high-tier non-overlapping sets. Use ★ for must-see picks. Never make up artist names — only reference the lineup above.`;
}

async function* _streamChat(messages, state) {
  let key;
  try { key = localStorage.getItem("plursky_anthropic_key") || ""; } catch { key = ""; }
  if (!key) throw new Error("NO_KEY");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: _CHAT_MODEL,
      max_tokens: 450,
      stream: true,
      system: _chatSystemPrompt(state),
      messages,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`${resp.status}|${text.slice(0, 120)}`);
  }

  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") yield ev.delta.text;
      } catch {}
    }
  }
}

const _QUICK_ASKS = [
  "Who shouldn't I miss?",
  "Fix my schedule clashes",
  "Best sunrise set?",
  "What's at Kinetic Field?",
  "Suggest a deep cut",
  "Build my Friday night",
];

function AskPlurskyChat({ state, onClose }) {
  const [msgs,      setMsgs]      = React.useState([]);
  const [input,     setInput]     = React.useState("");
  const [busy,      setBusy]      = React.useState(false);
  const [apiKey,    setApiKey]    = React.useState(() => { try { return localStorage.getItem("plursky_anthropic_key") || ""; } catch { return ""; } });
  const [keyInput,  setKeyInput]  = React.useState("");
  const [keyErr,    setKeyErr]    = React.useState("");
  const bottomRef = React.useRef(null);
  const inputRef  = React.useRef(null);

  const needsKey = !apiKey;

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  React.useEffect(() => {
    if (!needsKey) setTimeout(() => inputRef.current?.focus(), 80);
  }, [needsKey]);

  const saveKey = () => {
    const k = keyInput.trim();
    if (!k.startsWith("sk-ant-")) { setKeyErr("Key must start with sk-ant-"); return; }
    try { localStorage.setItem("plursky_anthropic_key", k); } catch {}
    setApiKey(k);
    setKeyInput("");
    setKeyErr("");
  };

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || busy) return;
    setInput("");
    const history = [...msgs, { role: "user", content: q }];
    setMsgs(history);
    setBusy(true);
    setMsgs(m => [...m, { role: "assistant", content: "" }]);
    try {
      const apiMsgs = history.map(m => ({ role: m.role, content: m.content }));
      for await (const chunk of _streamChat(apiMsgs, state)) {
        setMsgs(m => {
          const c = [...m];
          c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + chunk };
          return c;
        });
      }
    } catch (e) {
      const txt = e.message.includes("NO_KEY") ? "No API key set."
        : e.message.startsWith("401") ? "Invalid API key — check your key in settings."
        : e.message.startsWith("429") ? "Rate limited. Try again in a moment."
        : "Something went wrong. Try again.";
      setMsgs(m => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: txt, err: true }; return c; });
    }
    setBusy(false);
  };

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 90,
      background: "var(--night)", display: "flex", flexDirection: "column",
      color: "var(--paper)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 16px 12px",
        paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
        borderBottom: "1px solid rgba(247,237,224,0.1)",
        flexShrink: 0,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 36,
          background: "linear-gradient(135deg, var(--ember), var(--horizon))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 17, flexShrink: 0,
        }}>✦</div>
        <div style={{ flex: 1 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: 1.6, fontWeight: 700 }}>ASK PLURSKY</div>
          <div className="mono" style={{ fontSize: 8.5, letterSpacing: 1, color: "rgba(247,237,224,0.45)", marginTop: 1 }}>
            AI FESTIVAL GUIDE · POWERED BY CLAUDE
          </div>
        </div>
        {apiKey && (
          <button onClick={() => { if (window.confirm("Remove API key?")) { try { localStorage.removeItem("plursky_anthropic_key"); } catch {} setApiKey(""); } }} style={{
            background: "rgba(247,237,224,0.08)", border: "none", borderRadius: 8,
            padding: "5px 8px", cursor: "pointer", color: "rgba(247,237,224,0.4)",
            fontFamily: "Geist Mono, monospace", fontSize: 8, letterSpacing: 1,
          }}>KEY</button>
        )}
        <button onClick={onClose} style={{
          width: 32, height: 32, borderRadius: 32,
          background: "rgba(247,237,224,0.1)", border: "none",
          color: "var(--paper)", cursor: "pointer", fontSize: 18,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>×</button>
      </div>

      {needsKey ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16, lineHeight: 1 }}>✦</div>
          <div className="serif" style={{ fontSize: 28, lineHeight: 1.1, marginBottom: 10 }}>
            Unlock <em>AI</em> chat
          </div>
          <div style={{ fontSize: 13, color: "rgba(247,237,224,0.6)", lineHeight: 1.55, marginBottom: 24 }}>
            Enter your Anthropic API key to enable Ask Plursky. It stays on your device — never sent anywhere else.
          </div>
          <input
            type="text"
            placeholder="sk-ant-api03-..."
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveKey()}
            autoFocus
            style={{
              width: "100%", padding: "13px 14px",
              background: "rgba(247,237,224,0.08)", border: `1px solid ${keyErr ? "var(--ember)" : "rgba(247,237,224,0.2)"}`,
              borderRadius: 12, fontFamily: "Geist Mono, monospace", fontSize: 13,
              color: "var(--paper)", outline: "none", marginBottom: keyErr ? 6 : 16,
            }}
          />
          {keyErr && <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1, color: "var(--ember)", marginBottom: 16 }}>{keyErr}</div>}
          <button onClick={saveKey} style={{
            width: "100%", padding: "13px",
            background: "linear-gradient(135deg, var(--ember), var(--horizon))",
            border: "none", borderRadius: 999,
            fontFamily: "Geist Mono, monospace", fontSize: 11, letterSpacing: 1.4, fontWeight: 700,
            color: "#fff", cursor: "pointer",
          }}>ENABLE ASK PLURSKY</button>
          <button onClick={onClose} style={{
            marginTop: 12, background: "transparent", border: "none",
            color: "rgba(247,237,224,0.4)", cursor: "pointer",
            fontFamily: "Geist Mono, monospace", fontSize: 10, letterSpacing: 1.2,
          }}>MAYBE LATER</button>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "14px 16px 8px" }}>
            {msgs.length === 0 && (
              <div style={{ paddingBottom: 16 }}>
                <div className="serif" style={{ fontSize: 24, lineHeight: 1.2, marginBottom: 6 }}>
                  Hi! I'm <em>Plursky</em> ✦
                </div>
                <div style={{ fontSize: 13, color: "rgba(247,237,224,0.6)", lineHeight: 1.5, marginBottom: 18 }}>
                  Ask about the lineup, schedule clashes, hidden gems, or anything about the festival.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {_QUICK_ASKS.map(q => (
                    <button key={q} onClick={() => send(q)} style={{
                      background: "rgba(247,237,224,0.08)", border: "1px solid rgba(247,237,224,0.18)",
                      borderRadius: 999, padding: "6px 13px", cursor: "pointer",
                      fontFamily: "Geist, sans-serif", fontSize: 12.5,
                      color: "rgba(247,237,224,0.85)",
                    }}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}>
                <div style={{
                  maxWidth: "83%", padding: "10px 13px",
                  borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  background: m.role === "user"
                    ? "linear-gradient(135deg, var(--ember), var(--flare))"
                    : m.err
                      ? "rgba(232,93,46,0.15)"
                      : "rgba(247,237,224,0.1)",
                  color: m.role === "user" ? "#fff" : m.err ? "var(--ember)" : "var(--paper)",
                  fontSize: 14, lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}>
                  {m.content ? m.content : (
                    <span style={{ opacity: 0.45, fontSize: 22, letterSpacing: 4 }}>
                      <span style={{ animation: "tdot 1.2s ease-in-out infinite" }}>•</span>
                      <span style={{ animation: "tdot 1.2s ease-in-out infinite .22s" }}>•</span>
                      <span style={{ animation: "tdot 1.2s ease-in-out infinite .44s" }}>•</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div style={{
            padding: "10px 12px",
            paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
            borderTop: "1px solid rgba(247,237,224,0.1)",
            display: "flex", gap: 8, alignItems: "flex-end",
            flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Ask about the lineup…"
              disabled={busy}
              style={{
                flex: 1, padding: "11px 14px",
                background: "rgba(247,237,224,0.08)", border: "1px solid rgba(247,237,224,0.18)",
                borderRadius: 20, fontFamily: "Geist, sans-serif", fontSize: 14,
                color: "var(--paper)", outline: "none",
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || busy}
              style={{
                width: 42, height: 42, borderRadius: 42, flexShrink: 0,
                background: (input.trim() && !busy)
                  ? "linear-gradient(135deg, var(--ember), var(--horizon))"
                  : "rgba(247,237,224,0.1)",
                border: "none",
                cursor: (input.trim() && !busy) ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background .15s",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"/>
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { AskPlurskyChat });
