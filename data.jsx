// Las Vegas 2026 — real lineup by stage (public lineup info, Plursky is an independent companion app)

// ─────────────────────────────────────────────────────────────
// FESTIVAL_CONFIG
// ─────────────────────────────────────────────────────────────
// Single source of truth for everything festival-specific. Drop
// in another festival's config (Coachella, Tomorrowland, Burning
// Man, etc.) and the entire app re-skins for it. Phase 1 of the
// multi-festival rollout — Phase 2 will introduce a FESTIVALS
// registry + a switcher UI.
const FESTIVAL_CONFIG = {
  // ── Identity ──
  id:           "edc-lv-2026",
  name:         "EDC Las Vegas 2026",
  shortName:    "EDC LV 2026",
  brand:        "EDC",
  tagline:      "Three nights under the electric sky",
  location:     "Las Vegas Motor Speedway · Nevada",
  locationShort:"Las Vegas Motor Speedway",
  dates:        "May 15–17, 2026",
  year:         2026,

  // ── Timing (all instants in UTC ms) ──
  startMs: Date.UTC(2026, 4, 16, 0, 0, 0),  // May 15 17:00 PDT (gates open day 1)
  endMs:   Date.UTC(2026, 4, 18, 12, 0, 0), // May 18 05:00 PDT (sunday close)
  tz:      "America/Los_Angeles",
  tzAbbr:  "PDT",
  utcOffsetHours: -7,

  // Festival day n → calendar date + UTC midnight anchor (used to
  // convert HH:MM clock-times to absolute Date instances)
  dayDates: {
    1: { y: 2026, m: 4, d: 15, name: "Friday",   short: "FRI",
         midnightUtc: Date.UTC(2026, 4, 15, 7, 0, 0) },
    2: { y: 2026, m: 4, d: 16, name: "Saturday", short: "SAT",
         midnightUtc: Date.UTC(2026, 4, 16, 7, 0, 0) },
    3: { y: 2026, m: 4, d: 17, name: "Sunday",   short: "SUN",
         midnightUtc: Date.UTC(2026, 4, 17, 7, 0, 0) },
  },

  // Sunrise / sunset per festival day (clock time in tz)
  sunTimes: {
    1: { rise: "05:36", set: "19:34" },
    2: { rise: "05:35", set: "19:35" },
    3: { rise: "05:34", set: "19:36" },
  },

  // Last-shuttle cutoff per night (clock time in tz)
  lastShuttleHHMM: "05:45",

  // ── Geography ──
  // FESTIVAL_CONFIG.gps is the EDC build centroid (~270m north of the
  // tri-oval geometric center because EDC extends into the LVMS dirt
  // area north of the north turn). 0.5mi radius covers the full
  // festival footprint including South Lot rideshare.
  gps: { lat: 36.27370, lng: -115.0125, onSiteRadiusMi: 0.5 },

  // Rideshare pickup zone (universal-link target for Uber/Lyft)
  rideshareGps: {
    lat: 36.258,
    lng: -115.011,
    label: "South Lot · Rideshare Pickup",
    note:  "Drivers can't enter the venue. Walk south through the rideshare gate.",
  },

  // ── LVMS canonical geometry ──
  // Las Vegas Motor Speedway: 1.500 mi (2.414 km) tri-oval, long axis
  // ~N-S, frontstretch (start/finish) on the south side, 20° banking
  // in turns / 9° on straights. Facility GPS center per Wikipedia /
  // public records: 36.2713 N, -115.0111 W. EDC's festival footprint
  // includes the infield + the dirt area north of the north turn.
  venue: {
    name: "Las Vegas Motor Speedway",
    address: "7000 N Las Vegas Blvd, Las Vegas, NV 89115",
    trackLengthMi: 1.5,
    trackShape: "tri-oval",
    bankingTurnsDeg: 20,
    bankingStraightsDeg: 9,
    // Tri-oval bounding box (paved track only)
    ovalBounds:    { north: 36.27520, south: 36.26790, west: -115.01700, east: -115.00540 },
    ovalCenter:    { lat: 36.27155,   lng: -115.01120 },
    // Full EDC build footprint (oval + dirt extension + south lots)
    festivalBounds:{ north: 36.27780, south: 36.26720, west: -115.01740, east: -115.00500 },
  },

  // ⚠ PROVISIONAL anchors — pending official 2026 EDC site map
  // (Insomniac typically releases ~2 weeks before the festival).
  // Update these once the 2026 map drops; the affine transform in
  // map.jsx auto-retunes the whole GPS→SVG projection.
  gpsAnchors: [
    { stageId: "kinetic", lat: 36.27512, lng: -115.0118 },
    { stageId: "cosmic",  lat: 36.27370, lng: -115.0148 },
    { stageId: "basspod", lat: 36.27075, lng: -115.0123 },
  ],

  // ── Weather ──
  // NWS endpoint for US festivals (free, keyless). For non-US
  // festivals, swap to OpenWeatherMap or another provider and the
  // useNwsForecast hook can branch on this URL pattern.
  weatherEndpoint: "https://api.weather.gov/points/36.27,-115.01",

  // ── Defaults ──
  mainStageId: "kinetic",
};

// Backwards-compat alias — older code reads `FESTIVAL.name` etc.
// Eventually we can delete this and make every consumer read from
// FESTIVAL_CONFIG directly.
const FESTIVAL = FESTIVAL_CONFIG;

// ─────────────────────────────────────────────────────────────
// FESTIVALS_REGISTRY (Phase 2)
// ─────────────────────────────────────────────────────────────
// All festivals the platform knows about. Currently only EDC LV
// 2026 has full data (STAGES + ARTISTS + AMENITIES). The rest are
// "preview" entries — visible in the festival switcher as "Coming
// soon" so users see the platform's roadmap, but not selectable
// until their data layer is filled in.
const FESTIVALS_REGISTRY = [
  {
    config: FESTIVAL_CONFIG,
    available: true,
    accent: "#e85d2e",
    emoji: "🌵",
    region: "North America",
  },
];

// Read the user's chosen festival from localStorage. Defaults to the
// first registered festival. Switching festivals reloads the page so
// the new FESTIVAL_CONFIG takes effect cleanly.
function getActiveFestivalId() {
  try {
    const stored = localStorage.getItem("active_festival_id");
    if (stored && FESTIVALS_REGISTRY.find(f => f.config.id === stored && f.available)) return stored;
  } catch {}
  return FESTIVALS_REGISTRY[0].config.id;
}
function setActiveFestivalAndReload(id) {
  try { localStorage.setItem("active_festival_id", id); } catch {}
  window.location.reload();
}

// Stage positions on the LVMS infield. The track is E-W elongated (long
// straightaways top + bottom, semicircle turns on left/right ends), so
// kineticFIELD sits along the north straight, basspod along the south
// straight, and cosmic/neon anchor the east + west turns.
//
// Stage colours mirror the official EDC poster's zone palette:
//   kineticFIELD    — ember red (mainstage)
//   quantumVALLEY   — sky cyan (trance)
//   bionicJUNGLE    — teal (jungle/house)
//   stereoBLOOM     — green
//   cosmicMEADOW    — yellow
//   neonGARDEN      — hot pink
//   wasteLAND       — orange (desert)
//   bassPOD         — royal blue
//   circuitGROUNDS  — navy blue (paired blue zone with bassPOD)
// Stage x/y coords are calibrated to Insomniac's official EDC LV 2025
// site map (north-up orientation, 0-100 SVG grid). Constrained to fit
// inside the tri-oval infield (inner radius ~31 around 50,50). When the
// 2026 map drops, just update these 9 x/y pairs and the GPS affine in
// FESTIVAL_CONFIG.gpsAnchors and the whole projection re-tunes.
const STAGES = [
  { id: "kinetic", name: "Kinetic Field",   short: "KIN", color: "#e85d2e", x: 50, y: 22, size: 1.7,  desc: "Mainstage · headliners, sunrise sets",
    vibe: "Sunrise Cathedral",  vibeNote: "Park here for the sunrise set. Mainstage scale, screen on screen, and the only place worth standing still.",  peak: "03:00–05:30" },
  { id: "quantum", name: "Quantum Valley",  short: "QNT", color: "#38bdf8", x: 70, y: 26, size: 1.1,
    vibe: "Trance Family",      vibeNote: "Hands up for ten hours straight. ASOT crowd, melodic, weeping at 4 AM.",                                       peak: "01:00–05:00",
    desc: "Trance, psytrance" },
  { id: "bionic",  name: "Bionic Jungle",   short: "BIO", color: "#14b8a6", x: 24, y: 26, size: 1.0,
    vibe: "Underground Forest", vibeNote: "Tucked, leafy, intimate. Where tastemakers go between mainstage acts.",                                        peak: "00:00–04:00",
    desc: "House, tech house" },
  { id: "stereo",  name: "Stereo Bloom",    short: "STR", color: "#22c55e", x: 38, y: 40, size: 0.95,
    vibe: "Deepest Crowd",      vibeNote: "Smaller stage, heavier heads. Tech house with a real ear in the crowd.",                                       peak: "23:30–03:30",
    desc: "Tech house, underground" },
  { id: "cosmic",  name: "Cosmic Meadow",   short: "CSM", color: "#fbbf24", x: 14, y: 52, size: 1.2,
    vibe: "Wide-Open Vibe",     vibeNote: "Open-air, art cars, room to breathe. Best stage to wander in and out of.",                                     peak: "22:00–02:00",
    desc: "Open-air · big room, legends" },
  { id: "neon",    name: "Neon Garden",     short: "NEN", color: "#ec4899", x: 80, y: 50, size: 1.05,
    vibe: "House Heads HQ",     vibeNote: "If you came for house, this is the room. Long blends, deep selectors, tightest crowd of the night.",            peak: "00:00–04:30",
    desc: "House, deep techno" },
  { id: "waste",   name: "Wasteland",       short: "WST", color: "#f97316", x: 30, y: 72, size: 1.0,
    vibe: "Hard Dance Pit",     vibeNote: "Hardstyle, hardcore, raw. Bring earplugs you actually trust. The only stage where the BPM never drops.",        peak: "23:00–04:00",
    desc: "Dubstep, bass" },
  { id: "basspod", name: "Basspod",         short: "BAS", color: "#2563eb", x: 48, y: 80, size: 1.05,
    vibe: "Loudest Drops",      vibeNote: "Dubstep, riddim, headbang central. Kicks you can feel in your sternum from a quarter-mile out.",                peak: "23:00–03:30",
    desc: "Dubstep, hard bass" },
  { id: "circuit", name: "Circuit Grounds", short: "CIR", color: "#1e40af", x: 68, y: 72, size: 1.15,
    vibe: "Techno Vault",       vibeNote: "Industrial techno temple. Drifters from Berghain feel at home. Lasers cut through fog like blades.",            peak: "01:00–05:00",
    desc: "Techno, big room" },
];

const AMENITIES = [
  { id: "a1", type: "water",  label: "Hydration",   x: 40, y: 40 },
  { id: "a2", type: "water",  label: "Hydration",   x: 60, y: 60 },
  { id: "a3", type: "water",  label: "Hydration",   x: 62, y: 38 },
  { id: "a4", type: "food",   label: "Rainbow Bazaar",  x: 45, y: 48 },
  { id: "a5", type: "med",    label: "Medic",       x: 55, y: 25 },
  { id: "a6", type: "med",    label: "Medic",       x: 32, y: 70 },
  { id: "a7", type: "toilet", label: "Restrooms",   x: 35, y: 58 },
  { id: "a8", type: "toilet", label: "Restrooms",   x: 65, y: 68 },
  { id: "a9", type: "art",    label: "Daisy Lane",  x: 50, y: 50 },
  { id: "a10",type: "info",   label: "Info / Lost", x: 55, y: 45 },

  // Phone-charging banks. EDC publishes "battery charging stations" on the
  // Amenities page without exact coords, so these track the obvious crowd
  // arteries (Rainbow Road + each major stage plaza).
  { id: "ch1", type: "charge", label: "Charging — Rainbow Road",  x: 50, y: 55 },
  { id: "ch2", type: "charge", label: "Charging — Kinetic Plaza", x: 48, y: 26 },
  { id: "ch3", type: "charge", label: "Charging — Quantum Walk",  x: 64, y: 34 },
  { id: "ch4", type: "charge", label: "Charging — Cosmic Walk",   x: 16, y: 56 },
  { id: "ch5", type: "charge", label: "Charging — Basspod Plaza", x: 52, y: 76 },
  { id: "ch6", type: "charge", label: "Charging — Circuit Plaza", x: 68, y: 70 },

  // Mobile Charging Lockers (Insomniac's official locker partner). 5 banks:
  // GA on Rainbow Road, three VIP-only at stage VIPs, one inside Passport
  // Lounge. Each contains a universal iPhone+Android charger.
  // Source: secure.mobilecharginglockers.com — EDC LV 2026 listings.
  { id: "lk1", type: "locker", label: "Lockers — Main Merch (GA)",      x: 50, y: 52, tier: "GA",       price: "$30 day · $90 / 3-day" },
  { id: "lk2", type: "locker", label: "Lockers — VIP Kinetic",          x: 48, y: 18, tier: "VIP",      price: "$90 · sold out" },
  { id: "lk3", type: "locker", label: "Lockers — VIP Circuit Grounds",  x: 72, y: 70, tier: "VIP",      price: "$90 / 3-day" },
  { id: "lk4", type: "locker", label: "Lockers — VIP Basspod",          x: 52, y: 78, tier: "VIP",      price: "$90 / 3-day" },
  { id: "lk5", type: "locker", label: "Lockers — Passport Lounge",      x: 78, y: 42, tier: "Passport", price: "$25 day · $75 / 3-day" },
];

const AVATAR_START = { x: 50, y: 52 };

const FRIENDS = [];

// Real artists + official set times from EDC Las Vegas 2026 schedule
// (festivaldust.com lineup release, May 2026). Stages outside the 9
// stages we render (Beatbox Art Car / Forest House / YeeDC / Casa
// Bacardi / Insomniac Fridays) are omitted.
const gradFor = (stageId) => {
  const s = STAGES.find(st => st.id === stageId);
  return `linear-gradient(135deg, ${s.color}, #1a0a28)`;
};

const mk = (id, name, genre, stage, day, start, end, bio) => {
  const h = parseInt(start.split(':')[0]);
  // tier: 3=headliner (23:00-05:59), 2=prime time (21:00-22:59), 1=opener (19:00-20:59)
  const tier = (h < 6 || h >= 23) ? 3 : (h >= 21) ? 2 : 1;
  return {
    id, name, genre, country: "—", stage, day, start, end, tier,
    img: `linear-gradient(135deg, ${STAGES.find(s=>s.id===stage).color}, #1a0a28)`,
    bio: bio || "Playing EDC Las Vegas 2026."
  };
};

const ARTISTS = [
  // ─────────────────────────── KINETIC FIELD ───────────────────────────
  // FRI
  mk("k1",  "Laidback Luke b2b Chuckie","House",                 "kinetic", 1, "19:00", "20:00"),
  mk("k2",  "Korolova",                "Melodic Techno",         "kinetic", 1, "20:00", "21:00"),
  mk("k3",  "Argy",                    "Melodic Techno",         "kinetic", 1, "21:00", "22:00"),
  mk("k4",  "Chris Lorenzo",           "Bass House",             "kinetic", 1, "22:07", "23:15"),
  mk("k5",  "Sofi Tukker",             "House",                  "kinetic", 1, "23:19", "00:30"),
  mk("k6",  "The Chainsmokers",        "Electro Pop",            "kinetic", 1, "00:32", "01:42"),
  mk("k7",  "FISHER",                  "Tech House",             "kinetic", 1, "01:47", "02:57"),
  mk("k8",  "Porter Robinson (DJ Set)","Electronic",             "kinetic", 1, "03:01", "04:11"),
  mk("k9",  "Charlotte de Witte",      "Techno",                 "kinetic", 1, "04:14", "05:29", "Belgian techno queen, mainstage rarity."),
  // SAT
  mk("k10", "AR/CO",                   "Live Electronic",        "kinetic", 2, "19:00", "20:00"),
  mk("k11", "Hayla",                   "DnB Vocalist",           "kinetic", 2, "20:00", "21:00"),
  mk("k12", "Sub Focus",               "DnB",                    "kinetic", 2, "21:00", "22:00"),
  mk("k13", "Steve Aoki",              "Electro",                "kinetic", 2, "22:07", "23:15"),
  mk("k14", "Hardwell",                "Big Room",               "kinetic", 2, "23:19", "00:29"),
  mk("k15", "John Summit",             "Tech House",             "kinetic", 2, "00:32", "01:42"),
  mk("k16", "Subtronics",              "Dubstep",                "kinetic", 2, "01:47", "02:57"),
  mk("k17", "Kaskade",                 "Progressive House",      "kinetic", 2, "03:01", "04:11"),
  mk("k18", "Above & Beyond (Sunrise Set)","Trance",             "kinetic", 2, "04:14", "05:29", "Group therapy under the desert dawn."),
  // SUN
  mk("k19", "Trace",                   "DnB",                    "kinetic", 3, "19:00", "20:00"),
  mk("k20", "Ship Wrek",               "Bass",                   "kinetic", 3, "20:00", "21:00"),
  mk("k21", "Layton Giordani",         "Techno",                 "kinetic", 3, "21:00", "22:00"),
  mk("k22", "Funk Tribu",              "Hard Techno",            "kinetic", 3, "22:07", "23:15"),
  mk("k23", "GRiZ b2b Wooli",          "Bass / Funk",            "kinetic", 3, "23:19", "00:29"),
  mk("k24", "Zedd",                    "Electro House",          "kinetic", 3, "00:32", "01:42"),
  mk("k25", "Martin Garrix",           "Big Room / Progressive", "kinetic", 3, "01:47", "02:57", "Dutch headliner. Animals-era anthems to melodic trance."),
  mk("k26", "Cloonee",                 "Tech House",             "kinetic", 3, "03:01", "04:11"),
  mk("k27", "Armin van Buuren (Sunrise Set)","Trance",           "kinetic", 3, "04:14", "05:29", "ASOT captain. Sunrise trance ceremony."),

  // ─────────────────────────── CIRCUIT GROUNDS ─────────────────────────
  // FRI
  mk("cg1", "1991",                    "DnB",                    "circuit", 1, "19:00", "20:00"),
  mk("cg2", "Bou",                     "DnB",                    "circuit", 1, "20:00", "21:00"),
  mk("cg3", "Nico Moreno",             "Hard Techno",            "circuit", 1, "21:00", "22:00"),
  mk("cg4", "I Hate Models",           "Industrial Techno",      "circuit", 1, "22:00", "23:15"),
  mk("cg5", "Levity",                  "Melodic Bass",           "circuit", 1, "23:15", "00:25"),
  mk("cg6", "Wooli",                   "Melodic Bass",           "circuit", 1, "00:25", "01:35"),
  mk("cg7", "The Outlaw",              "Hard Techno",            "circuit", 1, "01:35", "02:35"),
  mk("cg8", "Holy Priest",             "Hard Techno",            "circuit", 1, "02:35", "03:30"),
  mk("cg9", "Ray Volpe",               "Dubstep",                "circuit", 1, "03:30", "04:30"),
  mk("cg10","Level Up",                "Dubstep",                "circuit", 1, "04:30", "05:30"),
  // SAT
  mk("cg11","DJ Mandy",                "House",                  "circuit", 2, "19:00", "20:00"),
  mk("cg12","RØZ",                     "House",                  "circuit", 2, "20:00", "21:15"),
  mk("cg13","Kettama",                 "Rave / Breaks",          "circuit", 2, "21:15", "22:45"),
  mk("cg14","Sammy Virji",             "UK Garage",              "circuit", 2, "22:45", "00:15"),
  mk("cg15","Tiësto",                  "Big Room",               "circuit", 2, "00:15", "01:45"),
  mk("cg16","Peggy Gou b2b Ki/Ki",     "House / Techno",         "circuit", 2, "01:45", "03:15"),
  mk("cg17","Boys Noize",              "Electro",                "circuit", 2, "03:15", "04:30"),
  mk("cg18","Lilly Palmer",            "Techno",                 "circuit", 2, "04:30", "05:30"),
  // SUN
  mk("cg19","Linska",                  "Techno",                 "circuit", 3, "19:00", "20:30"),
  mk("cg20","ANNA",                    "Techno",                 "circuit", 3, "20:30", "22:00"),
  mk("cg21","Beltran",                 "Tech House",             "circuit", 3, "22:00", "23:30"),
  mk("cg22","Chris Stussy",            "Tech House",             "circuit", 3, "23:30", "01:00"),
  mk("cg23","Solomun",                 "Melodic House",          "circuit", 3, "01:00", "02:30"),
  mk("cg24","Vintage Culture",         "Melodic House",          "circuit", 3, "02:30", "04:00"),
  mk("cg25","Kevin de Vries",          "Melodic Techno",         "circuit", 3, "04:00", "05:30"),

  // ─────────────────────────── NEON GARDEN ─────────────────────────────
  // FRI
  mk("n1",  "Anastazja",               "Trance / Techno",        "neon",    1, "19:00", "20:30"),
  mk("n2",  "Mestiza",                 "Electronic",             "neon",    1, "20:30", "22:00"),
  mk("n3",  "DJ Tennis b2b Chloé Caillet","House",               "neon",    1, "22:00", "23:30"),
  mk("n4",  "Peggy Gou",               "House",                  "neon",    1, "23:30", "01:00"),
  mk("n5",  "Adriatique",              "Melodic Techno",         "neon",    1, "01:00", "02:30"),
  mk("n6",  "Joseph Capriati",         "Techno",                 "neon",    1, "02:30", "04:00"),
  mk("n7",  "Eli Brown",               "Techno",                 "neon",    1, "04:00", "05:30"),
  // SAT
  mk("n8",  "Mink",                    "Techno",                 "neon",    2, "19:00", "20:30"),
  mk("n9",  "Silvie Loto",             "Techno",                 "neon",    2, "20:30", "22:00"),
  mk("n10", "Ahmed Spins",             "Afrohouse",              "neon",    2, "22:00", "23:30"),
  mk("n11", "Luciano",                 "Tech House",             "neon",    2, "23:30", "01:30"),
  mk("n12", "Prospa",                  "House",                  "neon",    2, "01:30", "03:30"),
  mk("n13", "Josh Baker b2b Kettama b2b Prospa","Breaks / House","neon",    2, "03:30", "05:30"),
  // SUN
  mk("n14", "Bad Beat",                "Techno",                 "neon",    3, "19:00", "20:15"),
  mk("n21", "Frankie Bones",           "Breakbeat",              "neon",    3, "20:15", "21:30"),
  mk("n15", "Adiel",                   "Techno",                 "neon",    3, "21:30", "22:50"),
  mk("n16", "DJ Gigola",               "Techno",                 "neon",    3, "22:50", "00:10"),
  mk("n20", "999999999",               "Hard Techno / Gabber",   "neon",    3, "00:10", "01:30"),
  mk("n17", "Indira Paganotto",        "Acid Techno",            "neon",    3, "01:30", "02:50"),
  mk("n18", "Ki/Ki",                   "Trance / Techno",        "neon",    3, "02:50", "04:10"),
  mk("n19", "Klangkuenstler",          "Techno",                 "neon",    3, "04:10", "05:30"),

  // ─────────────────────────── COSMIC MEADOW ───────────────────────────
  // FRI
  mk("c2",  "Jackie Hollander",        "Tech House",             "cosmic",  1, "19:00", "19:55"),
  mk("c3",  "Roddy Lima",              "House",                  "cosmic",  1, "19:55", "20:55"),
  mk("c4",  "Westend",                 "Tech House",             "cosmic",  1, "20:55", "21:55"),
  mk("c5",  "Walker & Royce b2b VNSSA","Tech House",             "cosmic",  1, "21:55", "22:55"),
  mk("c6",  "Underworld",              "Electronica",            "cosmic",  1, "23:10", "00:10", "Born Slippy. Two decks, a mic, a legacy."),
  mk("c7",  "Meduza",                  "House",                  "cosmic",  1, "00:25", "01:45"),
  mk("c8",  "Notion",                  "Bass",                   "cosmic",  1, "01:47", "02:47"),
  mk("c9",  "MPH",                     "Bass House",             "cosmic",  1, "02:47", "04:02"),
  mk("c10", "San Pacho",               "Afrohouse",              "cosmic",  1, "04:02", "05:30"),
  // SAT
  mk("c11", "Frost Children",          "Electronic",             "cosmic",  2, "19:00", "20:15"),
  mk("c12", "Hannah Laing",            "Hard House / Techno",    "cosmic",  2, "20:15", "21:25"),
  mk("c13", "Snow Strippers",          "Hyperpop / Electronic",  "cosmic",  2, "21:25", "22:15"),
  mk("c14", "VTSS (In The Round)",     "Techno",                 "cosmic",  2, "22:15", "23:30"),
  mk("c15", "The Prodigy",             "Breakbeat / Big Beat",   "cosmic",  2, "23:35", "00:35", "Firestarters. Legendary live set."),
  mk("c16", "BUNT. (In The Round)",    "Folktronica",            "cosmic",  2, "00:40", "02:10"),
  mk("c17", "Interplanetary Criminal", "UK Bass",                "cosmic",  2, "02:10", "03:30"),
  mk("c18", "Malugi",                  "Techno",                 "cosmic",  2, "03:30", "04:30"),
  mk("c19", "DJ Gigola b2b MCR-T",     "Techno",                 "cosmic",  2, "04:30", "05:30"),
  // SUN
  mk("c20", "Gravagerz",               "Bass",                   "cosmic",  3, "19:00", "20:00"),
  mk("c21", "Nostalgix",               "Bass House",             "cosmic",  3, "20:00", "21:00"),
  mk("c22", "William Black",           "Melodic Bass",           "cosmic",  3, "21:00", "22:00"),
  mk("c23", "San Holo (Wholesome Riddim Set)","Melodic Bass",    "cosmic",  3, "22:00", "23:00"),
  mk("c24", "Dabin",                   "Melodic Bass",           "cosmic",  3, "23:00", "00:05"),
  mk("c25", "Alison Wonderland",       "Future Bass",            "cosmic",  3, "00:05", "01:05"),
  mk("c26", "Seven Lions",             "Melodic Bass",           "cosmic",  3, "01:05", "02:20"),
  mk("c27", "Restricted",              "Hardstyle",              "cosmic",  3, "02:20", "03:20"),
  mk("c28", "Black Tiger Sex Machine", "Bass House",             "cosmic",  3, "03:20", "04:30"),
  mk("c29", "Nico Moreno b2b Holy Priest","Hard Techno",         "cosmic",  3, "04:30", "05:30"),

  // ─────────────────────────── BIONIC JUNGLE ───────────────────────────
  // FRI
  mk("b2",  "Stacy Christine",         "House",                  "bionic",  1, "19:00", "20:00"),
  mk("b3",  "The Carry Nation",        "House",                  "bionic",  1, "20:00", "21:30"),
  mk("b4",  "Massimiliano Pagliara",   "House",                  "bionic",  1, "21:30", "23:00"),
  mk("b5",  "Paramida",                "Disco / House",          "bionic",  1, "23:00", "00:30"),
  mk("b6",  "Salute b2b Chloé Caillet","UK Garage",              "bionic",  1, "00:30", "02:30"),
  mk("b7",  "Robert Hood",             "Detroit Techno",         "bionic",  1, "02:30", "04:00", "Detroit techno originator."),
  mk("b8",  "Avalon Emerson",          "Electro / House",        "bionic",  1, "04:00", "05:30"),
  // SAT
  mk("b9",  "Spray",                   "House",                  "bionic",  2, "20:00", "21:00"),
  mk("b10", "Bashkka b2b Sedef Adasi", "House",                  "bionic",  2, "21:00", "22:30"),
  mk("b11", "HAAi b2b Luke Alessi",    "House",                  "bionic",  2, "22:30", "00:00"),
  mk("b12", "MCR-T",                   "Techno",                 "bionic",  2, "00:00", "01:15"),
  mk("b13", "Bad Boombox b2b Ollie Lishman","House",             "bionic",  2, "01:15", "02:30"),
  mk("b14", "Benwal",                  "House",                  "bionic",  2, "02:30", "03:30"),
  mk("b15", "Baugruppe90",             "Techno",                 "bionic",  2, "03:30", "04:30"),
  mk("b16", "Club Angel",              "House",                  "bionic",  2, "04:30", "05:30"),
  // SUN
  mk("b17", "Alves",                   "House",                  "bionic",  3, "19:00", "20:30"),
  mk("b18", "Isabella",                "Techno",                 "bionic",  3, "20:30", "22:30"),
  mk("b19", "Kinahau",                 "House",                  "bionic",  3, "22:30", "00:00"),
  mk("b20", "Tiga",                    "Electro / House",        "bionic",  3, "00:00", "01:30"),
  mk("b21", "DJ Tennis b2b Red Axes",  "House",                  "bionic",  3, "01:30", "03:30"),
  mk("b22", "Beltran b2b Simas",       "Tech House",             "bionic",  3, "03:30", "05:30"),

  // ─────────────────────────── QUANTUM VALLEY ──────────────────────────
  // FRI
  mk("q1",  "Sarah de Warren",         "Trance Vocalist",        "quantum", 1, "19:00", "20:00"),
  mk("q2",  "Matty Ralph",             "Trance",                 "quantum", 1, "20:00", "21:00"),
  mk("q3",  "Cold Blue",               "Trance",                 "quantum", 1, "21:00", "22:00"),
  mk("q4",  "Pegassi",                 "Psytrance",              "quantum", 1, "22:00", "23:00"),
  mk("q5",  "Darude",                  "Trance",                 "quantum", 1, "23:00", "00:00"),
  mk("q6",  "Cosmic Gate",             "Trance",                 "quantum", 1, "00:00", "01:00"),
  mk("q7",  "Gareth Emery",            "Trance",                 "quantum", 1, "01:00", "02:00"),
  mk("q8",  "Ilan Bluestone",          "Trance",                 "quantum", 1, "02:00", "03:00"),
  mk("q9",  "Paul van Dyk",            "Trance",                 "quantum", 1, "03:00", "04:00"),
  mk("q10", "Darren Porter",           "Trance",                 "quantum", 1, "04:00", "05:30"),
  // SAT
  mk("q11", "Maria Healy",             "Trance / Techno",        "quantum", 2, "19:00", "20:30"),
  mk("q12", "Superstrings",            "Trance",                 "quantum", 2, "20:30", "21:30"),
  mk("q13", "Billy Gillies",           "Trance",                 "quantum", 2, "21:30", "22:30"),
  mk("q14", "Paul Oakenfold",          "Trance",                 "quantum", 2, "22:30", "23:30"),
  mk("q15", "Andrew Rayel",            "Trance",                 "quantum", 2, "23:30", "00:30"),
  mk("q16", "Maddix",                  "Big Room / Techno",      "quantum", 2, "00:30", "01:30"),
  mk("q17", "Mathame",                 "Melodic Techno",         "quantum", 2, "01:30", "02:30"),
  mk("q18", "Astrix",                  "Psytrance",              "quantum", 2, "02:30", "03:30"),
  mk("q19", "T78",                     "Acid Techno",            "quantum", 2, "03:30", "04:30"),
  mk("q20", "Thomas Schumacher",       "Techno",                 "quantum", 2, "04:30", "05:30"),
  // SUN
  mk("q21", "Warung",                  "Melodic House",          "quantum", 3, "19:00", "20:00"),
  mk("q22", "Shingo Nakamura",         "Progressive",            "quantum", 3, "20:00", "21:00", "Melodic progressive. Sunset specialist."),
  mk("q23", "Rebūke",                  "Techno",                 "quantum", 3, "21:00", "22:00"),
  mk("q24", "Cristoph",                "Progressive House",      "quantum", 3, "22:00", "23:00"),
  mk("q25", "Eli & Fur",               "Melodic House",          "quantum", 3, "23:00", "00:00"),
  mk("q26", "Tinlicker (DJ Set)",      "Melodic House",          "quantum", 3, "00:00", "01:00"),
  mk("q27", "Cassian",                 "Melodic House",          "quantum", 3, "01:00", "02:15"),
  mk("q28", "Massano",                 "Melodic Techno",         "quantum", 3, "02:15", "03:30"),
  mk("q29", "Innellea",                "Melodic Techno",         "quantum", 3, "03:30", "04:30"),
  mk("q30", "Kream",                   "Melodic House",          "quantum", 3, "04:30", "05:30"),

  // ─────────────────────────── WASTELAND ───────────────────────────────
  // FRI
  mk("w1",  "Dømina",                  "Hardstyle",              "waste",   1, "19:00", "20:30"),
  mk("w2",  "Serafina",                "Hardstyle",              "waste",   1, "20:30", "21:30"),
  mk("w3",  "Johannes Schuster",       "Hardstyle",              "waste",   1, "21:30", "22:30"),
  mk("w4",  "Adrian Mills",            "Hardstyle",              "waste",   1, "22:30", "23:30"),
  mk("w5",  "Cloudy",                  "Hardstyle",              "waste",   1, "23:30", "00:30"),
  mk("w6",  "Kuko",                    "Hardstyle",              "waste",   1, "00:30", "01:30"),
  mk("w7",  "Gravedgr",                "Hardstyle",              "waste",   1, "01:30", "02:30"),
  mk("w8",  "Rebekah",                 "Industrial Techno",      "waste",   1, "02:30", "03:30"),
  mk("w9",  "Dyen",                    "Hardstyle",              "waste",   1, "03:30", "04:30"),
  mk("w10", "Stan Christ",             "Hardstyle",              "waste",   1, "04:30", "05:30"),
  // SAT
  mk("w11", "Cutdwn",                  "Hardstyle",              "waste",   2, "19:00", "20:30"),
  mk("w12", "Dead X",                  "Hard Dance",             "waste",   2, "20:30", "21:30"),
  mk("w13", "The Saints",              "Hardcore",               "waste",   2, "21:30", "22:30"),
  mk("w14", "Rob Gee b2b Lenny Dee",   "Hardcore",               "waste",   2, "22:30", "23:30"),
  mk("w15", "Lady Faith b2b LNY TNZ",  "Hardstyle",              "waste",   2, "23:30", "00:30"),
  mk("w16", "Audiofreq b3b Code Black b3b Toneshifterz","Hardstyle","waste",2, "00:30", "01:30"),
  mk("w17", "Da Tweekaz",              "Hardstyle",              "waste",   2, "01:30", "02:30"),
  mk("w18", "Lil Texas",               "Hardcore",               "waste",   2, "02:30", "03:30"),
  mk("w19", "Mish",                    "Hardstyle",              "waste",   2, "03:30", "04:30"),
  mk("w30", "Alyssa Jolee",            "Hardstyle",              "waste",   2, "04:30", "05:30"),
  // SUN
  mk("w20", "Sihk",                    "Hardstyle",              "waste",   3, "19:00", "20:30"),
  mk("w21", "Clawz",                   "Hardstyle",              "waste",   3, "20:30", "21:30"),
  mk("w22", "The Purge",               "Hardstyle",              "waste",   3, "21:30", "22:30"),
  mk("w23", "Yosuf",                   "Hardstyle",              "waste",   3, "22:30", "23:30"),
  mk("w24", "DJ Isaac",                "Hardstyle",              "waste",   3, "23:30", "00:30"),
  mk("w25", "Vieze Asbak",             "Hardcore",               "waste",   3, "00:30", "01:30"),
  mk("w26", "Sub Zero Project",        "Hardstyle",              "waste",   3, "01:30", "02:30"),
  mk("w27", "Rooler",                  "Hardcore / Uptempo",     "waste",   3, "02:30", "03:30"),
  mk("w28", "Warface",                 "Hardstyle",              "waste",   3, "03:30", "04:30"),
  mk("w29", "Madgrrl b2b Vessel",      "Hardstyle",              "waste",   3, "04:30", "05:30"),

  // ─────────────────────────── STEREO BLOOM ────────────────────────────
  // FRI
  mk("s1",  "Abana b2b Juliet Mendoza","Tech House",             "stereo",  1, "19:00", "20:00"),
  mk("s2",  "Slamm",                   "Tech House",             "stereo",  1, "20:00", "21:00"),
  mk("s3",  "Luuk van Dijk",           "Tech House",             "stereo",  1, "21:00", "22:15"),
  mk("s4",  "Omar+",                   "House",                  "stereo",  1, "22:15", "23:30"),
  mk("s5",  "Luke Dean",               "Tech House",             "stereo",  1, "23:30", "00:45"),
  mk("s6",  "Josh Baker",              "Tech House",             "stereo",  1, "00:45", "02:00"),
  mk("s7",  "Max Dean",                "Tech House",             "stereo",  1, "02:00", "03:15"),
  mk("s8",  "Obskür",                  "Tech House",             "stereo",  1, "03:15", "04:30"),
  mk("s9",  "Toman",                   "Tech House",             "stereo",  1, "04:30", "05:30"),
  // SAT
  mk("s10", "Slugg",                   "Tech House",             "stereo",  2, "19:00", "20:00"),
  mk("s11", "Discip",                  "Tech House",             "stereo",  2, "21:00", "22:00"),
  mk("s12", "Omnom",                   "Bass House",             "stereo",  2, "22:00", "23:15"),
  mk("s13", "Noizu",                   "Bass House",             "stereo",  2, "23:15", "00:30"),
  mk("s14", "Wax Motif",               "Bass House",             "stereo",  2, "00:30", "01:45"),
  mk("s15", "Cid",                     "Tech House",             "stereo",  2, "01:45", "03:00"),
  mk("s16", "HNTR",                    "Bass House",             "stereo",  2, "03:00", "04:15"),
  mk("s17", "Bolo (Sunrise Set)",      "Tech House",             "stereo",  2, "04:15", "05:30"),
  // SUN
  mk("s18", "KLO",                     "Tech House",             "stereo",  3, "19:00", "20:00"),
  mk("s19", "Murphy's Law",            "Tech House",             "stereo",  3, "20:00", "21:15"),
  mk("s20", "Sidney Charles b2b Bushbaby","Tech House",          "stereo",  3, "21:15", "22:30"),
  mk("s21", "Skream",                  "Dubstep / House",        "stereo",  3, "22:30", "23:45"),
  mk("s22", "Hamdi",                   "UK Bass",                "stereo",  3, "23:45", "01:00"),
  mk("s23", "Chris Lorenzo b2b Bullet Tooth","Bass House",       "stereo",  3, "01:00", "02:15"),
  mk("s24", "Silva Bumpa",             "UK House",               "stereo",  3, "02:15", "03:30"),
  mk("s25", "Morgan Seatree",          "Tech House",             "stereo",  3, "03:30", "04:30"),
  mk("s26", "Lu.Re",                   "Tech House",             "stereo",  3, "04:30", "05:30"),

  // ─────────────────────────── BASSPOD ─────────────────────────────────
  // FRI
  mk("bp21","Riot",                    "Dubstep",                "basspod", 1, "19:00", "19:50"),
  mk("bp22","Heyz",                    "Dubstep",                "basspod", 1, "19:50", "20:40"),
  mk("bp23","Muzz",                    "Dubstep",                "basspod", 1, "20:40", "21:30"),
  mk("bp24","Gorillat",                "Dubstep",                "basspod", 1, "21:30", "22:30"),
  mk("bp25","Ghengar",                 "Dubstep",                "basspod", 1, "22:30", "23:30"),
  mk("bp26","Deathpact",               "Dubstep",                "basspod", 1, "23:30", "00:30"),
  mk("bp27","ATLiens",                 "Dubstep",                "basspod", 1, "00:30", "01:30"),
  mk("bp28","Kai Wachi",               "Dubstep",                "basspod", 1, "01:30", "02:30"),
  mk("bp29","Adventure Club (Throwback Set)","Dubstep",          "basspod", 1, "02:30", "03:30"),
  mk("bp30","Culture Shock",           "DnB",                    "basspod", 1, "03:30", "04:30"),
  mk("bp31","Cyclops",                 "Dubstep",                "basspod", 1, "04:30", "05:30"),
  // SAT
  mk("bp1", "Fallen with MC Dino",     "Dubstep",                "basspod", 2, "19:00", "19:50"),
  mk("bp2", "Avello b2b Dennett",      "Dubstep",                "basspod", 2, "19:50", "20:40"),
  mk("bp3", "Viperactive",             "Dubstep",                "basspod", 2, "20:40", "21:30"),
  mk("bp4", "Hybrid Minds",            "Liquid DnB",             "basspod", 2, "21:30", "22:30"),
  mk("bp5", "YDG",                     "Dubstep",                "basspod", 2, "22:30", "23:30"),
  mk("bp6", "Delta Heavy",             "DnB",                    "basspod", 2, "23:30", "00:30"),
  mk("bp7", "Getter",                  "Dubstep",                "basspod", 2, "00:30", "01:30"),
  mk("bp8", "Eptic b2b Space Laces",   "Dubstep",                "basspod", 2, "01:30", "02:30"),
  mk("bp9", "Doctor P b2b Flux Pavilion b3b Funtcase","Dubstep", "basspod", 2, "02:30", "03:30"),
  mk("bp10","Hol!",                    "Dubstep",                "basspod", 2, "03:30", "04:30"),
  mk("bp11","Mary Droppinz",           "Dubstep",                "basspod", 2, "04:30", "05:30"),
  // SUN
  mk("bp12","Nightstalker with MC Dino","Dubstep",               "basspod", 3, "19:00", "19:50"),
  mk("bp13","Sippy",                   "Dubstep",                "basspod", 3, "19:50", "20:40"),
  mk("bp14","Eazybaked",               "Bass",                   "basspod", 3, "20:40", "21:30"),
  mk("bp15","Infekt b2b Samplifire",   "Dubstep",                "basspod", 3, "21:30", "22:30"),
  mk("bp32","A.M.C w/ Phantom",        "DnB",                    "basspod", 3, "22:30", "23:30"),
  mk("bp16","Virtual Riot",            "Dubstep",                "basspod", 3, "23:30", "00:30"),
  mk("bp17","Peekaboo",                "Dubstep",                "basspod", 3, "00:30", "01:30"),
  mk("bp18","Ahee b2b Liquid Stranger","Dubstep / Bass",         "basspod", 3, "01:30", "02:30"),
  mk("bp19","Whethan",                 "Electronic",             "basspod", 3, "02:30", "03:30"),
  mk("bp20","Boogie T b2b Distinct Motive","Dubstep",            "basspod", 3, "03:30", "04:30"),
  mk("bp33","Æon:Mode (Sunrise Set)",  "Dubstep / Bass",         "basspod", 3, "04:30", "05:30"),
];

const DAYS = [
  { n: 1, label: "FRI", date: "May 15" },
  { n: 2, label: "SAT", date: "May 16" },
  { n: 3, label: "SUN", date: "May 17" },
];

// NOW is a live-computed Proxy — every access reflects the real clock.
// All existing NOW.xxx consumers continue working without any changes.
let _nowCache = null;
let _nowCacheAt = 0;
function _computeNow() {
  const utcNow = Date.now();
  // 30-second cache — fast for repeated accesses in a single render pass
  if (_nowCache && utcNow - _nowCacheAt < 30000) return _nowCache;

  // Current time in festival tz (PDT = UTC-7)
  const localMs = utcNow + FESTIVAL_CONFIG.utcOffsetHours * 3600000;
  const hh = Math.floor(localMs / 3600000) % 24;
  const mm = Math.floor(localMs / 60000) % 60;
  const timeStr = `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;

  // Convert HH:MM to absolute UTC ms for a given festival day.
  // Mirrors toNightMin: times before 08:00 belong to the next calendar day.
  function absMs(day, hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const base = FESTIVAL_CONFIG.dayDates[day]?.midnightUtc;
    if (!base) return Infinity;
    return base + (h < 8 ? 86400000 : 0) + h * 3600000 + m * 60000;
  }

  // Find artists currently on stage
  const liveNow = ARTISTS.filter(a => {
    const s = absMs(a.day, a.start), e = absMs(a.day, a.end);
    return utcNow >= s && utcNow < e;
  });

  // Featured: prefer main stage, then highest tier
  const currentArtist = liveNow.find(a => a.stage === FESTIVAL_CONFIG.mainStageId)
    || [...liveNow].sort((a, b) => (b.tier || 0) - (a.tier || 0))[0]
    || null;

  // Next upcoming
  const nextArtist = ARTISTS
    .filter(a => absMs(a.day, a.start) > utcNow)
    .sort((a, b) => absMs(a.day, a.start) - absMs(b.day, b.start))[0]
    || null;

  const day = currentArtist?.day || nextArtist?.day || 1;
  const elapsedMin = currentArtist
    ? Math.max(0, Math.floor((utcNow - absMs(currentArtist.day, currentArtist.start)) / 60000))
    : 0;

  _nowCache = { day, time: timeStr, currentArtistId: currentArtist?.id || null, nextArtistId: nextArtist?.id || null, elapsedMin };
  _nowCacheAt = utcNow;
  return _nowCache;
}
const NOW = new Proxy({}, { get(_, prop) { return _computeNow()[prop]; } });

// Live notifications feed (populated at runtime from saved sets / crew / safety alerts)
const ALERTS = [];

// Essentials — safety/info drawer
const ESSENTIALS = [
  { id: "e1", icon: "med",     title: "Medical & Mental Health",  sub: "3 medic tents · 24/7 roamers",   tone: "ember" },
  { id: "e2", icon: "water",   title: "Water Refill Stations",     sub: "9 stations · always free",        tone: "sky" },
  { id: "e3", icon: "shuttle", title: "Shuttles & Rideshare",      sub: "Last shuttle 5:45 AM · Lot E",    tone: "dune" },
  { id: "e4", icon: "lost",    title: "Lost & Found",              sub: "Info booth · Daisy Lane",         tone: "horizon" },
  { id: "e5", icon: "info",    title: "Entry Hours & Policies",    sub: "Gates 4PM–5AM · no re-entry",     tone: "ink" },
  { id: "e6", icon: "consent", title: "Consent & Reporting",       sub: "Tap for anonymous report line",   tone: "ember" },
];

Object.assign(window, {
  FESTIVAL, FESTIVAL_CONFIG, STAGES, AMENITIES, AVATAR_START, FRIENDS, ARTISTS,
  DAYS, NOW, ALERTS, ESSENTIALS,
  FESTIVALS_REGISTRY, getActiveFestivalId, setActiveFestivalAndReload,
});
