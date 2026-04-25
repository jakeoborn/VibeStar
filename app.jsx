// Main app — iOS frame + routing

function spotifyTokenValid() {
  const token = localStorage.getItem("spotify_token");
  const expires = localStorage.getItem("spotify_expires");
  return !!(token && expires && Date.now() < parseInt(expires));
}

function App() {
  const [state, setState] = React.useState({
    tab: "home",
    saved: ["k9", "k11", "k4", "c5", "w1"],
    spotifyConnected: spotifyTokenValid(),
    artist: null,
    focusStage: null,
    lineupDay: NOW.day,
  });

  let body;
  if (state.artist) body = <ArtistScreen state={state} setState={setState} />;
  else if (state.tab === "home")    body = <HomeScreen    state={state} setState={setState} />;
  else if (state.tab === "map")     body = <MapScreen     state={state} setState={setState} />;
  else if (state.tab === "lineup")  body = <LineupScreen  state={state} setState={setState} />;
  else if (state.tab === "spotify") body = <SpotifyScreen state={state} setState={setState} />;
  else if (state.tab === "me")      body = <MeScreen      state={state} setState={setState} />;

  // status bar tint — dark pane on map, light elsewhere
  const statusBarStyle = state.tab === "map" && !state.artist ? "light" : "dark";

  return (
    <IOSDevice dark={statusBarStyle === "light"}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", paddingTop: 54 }}>
        <div style={{ flex: 1, position: "relative" }}>
          {body}
        </div>
        {!state.artist && (
          <TabBar active={state.tab} onChange={t => setState({ ...state, tab: t })} />
        )}
      </div>
    </IOSDevice>
  );
}

// Keyframes
const styleTag = document.createElement("style");
styleTag.textContent = `
  @keyframes pulse  { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.1); } }
  @keyframes spin   { to { transform: rotate(360deg); } }
  @keyframes tdot   { 0%,60%,100% { transform: translateY(0); opacity: 0.4 } 30% { transform: translateY(-5px); opacity: 1 } }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
`;
document.head.appendChild(styleTag);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
