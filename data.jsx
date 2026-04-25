// Las Vegas 2026 — real lineup by stage (public lineup info, Plursky is an independent companion app)

const FESTIVAL = {
  name: "EDC Las Vegas 2026",
  tagline: "Three nights under the electric sky",
  location: "Las Vegas Motor Speedway · Nevada",
  dates: "May 15–17, 2026",
  year: 2026,
};

// Stage positions on the LVMS infield. The track is E-W elongated (long
// straightaways top + bottom, semicircle turns on left/right ends), so
// kineticFIELD sits along the north straight, basspod along the south
// straight, and cosmic/neon anchor the east + west turns.
const STAGES = [
  { id: "kinetic", name: "Kinetic Field",   short: "KIN", color: "#e85d2e", x: 50, y: 20, size: 1.7, desc: "Mainstage · headliners, sunrise sets" },
  { id: "quantum", name: "Quantum Valley",  short: "QNT", color: "#38bdf8", x: 68, y: 28, size: 1.1, desc: "Trance, psytrance" },
  { id: "bionic",  name: "Bionic Jungle",   short: "BIO", color: "#34d399", x: 28, y: 30, size: 1.0, desc: "House, tech house" },
  { id: "stereo",  name: "Stereo Bloom",    short: "STR", color: "#f472b6", x: 34, y: 40, size: 0.95, desc: "Tech house, underground" },
  { id: "cosmic",  name: "Cosmic Meadow",   short: "CSM", color: "#a78bfa", x: 18, y: 50, size: 1.2, desc: "Open-air · big room, legends" },
  { id: "neon",    name: "Neon Garden",     short: "NEN", color: "#c8452a", x: 82, y: 50, size: 1.05, desc: "House, deep techno" },
  { id: "waste",   name: "Wasteland",       short: "WST", color: "#6f8fb8", x: 30, y: 72, size: 1.0, desc: "Dubstep, bass" },
  { id: "basspod", name: "Basspod",         short: "BAS", color: "#7b3d9a", x: 50, y: 80, size: 1.05, desc: "Dubstep, hard bass" },
  { id: "circuit", name: "Circuit Grounds", short: "CIR", color: "#f59a36", x: 70, y: 72, size: 1.15, desc: "Techno, big room" },
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
];

const AVATAR_START = { x: 50, y: 52 };

const FRIENDS = [
  { id: "f1", name: "Remi",  color: "#34d399", x: 20, y: 24, status: "Bionic Jungle",  avatarTone: "#7c3aed" },
  { id: "f2", name: "Juno",  color: "#38bdf8", x: 74, y: 20, status: "Quantum Valley", avatarTone: "#f472b6" },
  { id: "f3", name: "Kai",   color: "#f472b6", x: 30, y: 34, status: "Stereo Bloom",   avatarTone: "#38bdf8" },
  { id: "f4", name: "Sage",  color: "#f59a36", x: 74, y: 80, status: "Circuit Grounds",avatarTone: "#f59a36" },
];

// Real artists from the announced Las Vegas 2026 lineup, grouped by stage.
// Set times are illustrative schedule placements (7pm–5:30am window) — official set times released closer to the event.
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
  // ---------- KINETIC FIELD ----------
  mk("k1",  "Martin Garrix",           "Big Room / Progressive", "kinetic", 1, "01:45", "03:00", "Dutch headliner. Animals-era anthems to melodic trance."),
  mk("k2",  "Armin van Buuren",        "Trance (Sunrise Set)",   "kinetic", 2, "04:15", "05:30", "ASOT captain. Sunrise trance ceremony."),
  mk("k3",  "Above & Beyond",          "Trance (Sunrise Set)",   "kinetic", 3, "04:15", "05:30", "Group therapy under the desert dawn."),
  mk("k4",  "The Chainsmokers",        "Electro Pop",            "kinetic", 1, "00:30", "01:45"),
  mk("k5",  "Tiësto",                  "Big Room",               "kinetic", 2, "00:30", "01:45"),
  mk("k6",  "John Summit",             "Tech House",             "kinetic", 3, "23:15", "00:30"),
  mk("k7",  "FISHER",                  "Tech House",             "kinetic", 2, "01:45", "03:00"),
  mk("k8",  "Zedd",                    "Electro House",          "kinetic", 3, "21:00", "22:00"),
  mk("k9",  "Kaskade",                 "Progressive House",      "kinetic", 1, "23:15", "00:30"),
  mk("k10", "Charlotte de Witte",      "Techno",                 "kinetic", 2, "23:15", "00:30", "Belgian techno queen, mainstage rarity."),
  mk("k11", "Porter Robinson (DJ Set)","Electronic",             "kinetic", 1, "22:00", "23:15"),
  mk("k12", "Steve Aoki",              "Electro",                "kinetic", 3, "01:45", "03:00"),
  mk("k13", "Sub Focus",               "DnB",                    "kinetic", 2, "21:00", "22:00"),
  mk("k14", "Sofi Tukker",             "House",                  "kinetic", 1, "20:00", "21:00"),
  mk("k15", "Trace",                   "DnB",                    "kinetic", 3, "19:00", "20:00"),
  mk("k16", "Hardwell",                "Big Room",               "kinetic", 1, "04:15", "05:30"),
  mk("k17", "Layton Giordani",         "Techno",                 "kinetic", 3, "20:00", "21:00"),
  mk("k18", "Korolova",                "Melodic Techno",         "kinetic", 2, "19:00", "20:00"),
  mk("k19", "Laidback Luke b2b Chuckie","House",                 "kinetic", 2, "20:00", "21:00"),
  mk("k20", "Argy",                    "Melodic Techno",         "kinetic", 3, "22:00", "23:15"),
  mk("k21", "Funk Tribu",              "Hard Techno",            "kinetic", 2, "03:00", "04:15"),
  mk("k22", "Cloonee",                 "Tech House",             "kinetic", 3, "00:30", "01:45"),
  mk("k23", "Hayla",                   "DnB Vocalist",           "kinetic", 2, "22:00", "23:15"),
  mk("k24", "AR/CO",                   "Live Electronic",        "kinetic", 1, "19:00", "20:00"),

  // ---------- COSMIC MEADOW ----------
  mk("c1",  "The Prodigy",             "Breakbeat / Big Beat",   "cosmic",  2, "00:30", "01:45", "Firestarters. Legendary live set."),
  mk("c2",  "Underworld",              "Electronica",            "cosmic",  1, "23:15", "00:30", "Born Slippy. Two decks, a mic, a legacy."),
  mk("c3",  "Alison Wonderland",       "Future Bass",            "cosmic",  3, "23:15", "00:30"),
  mk("c4",  "San Holo (Riddim Set)",   "Wholesome Riddim",       "cosmic",  2, "01:45", "03:00"),
  mk("c5",  "Seven Lions",             "Melodic Bass",           "cosmic",  1, "00:30", "01:45"),
  mk("c6",  "Dabin",                   "Melodic Bass",           "cosmic",  3, "21:00", "22:00"),
  mk("c7",  "Nostalgix",               "Bass House",             "cosmic",  2, "19:00", "20:00"),
  mk("c8",  "VTSS (In The Round)",     "Techno",                 "cosmic",  3, "01:45", "03:00"),
  mk("c9",  "Snow Strippers",          "Hyperpop / Electronic",  "cosmic",  1, "19:00", "20:00"),
  mk("c10", "Notion",                  "Bass",                   "cosmic",  2, "21:00", "22:00"),
  mk("c11", "Malugi",                  "Techno",                 "cosmic",  1, "20:00", "21:00"),
  mk("c12", "Nico Moreno b2b Holy Priest","Hard Techno",         "cosmic",  3, "00:30", "01:45"),
  mk("c13", "Black Tiger Sex Machine", "Bass House",             "cosmic",  3, "22:00", "23:15"),
  mk("c14", "Jackie Hollander",        "Tech House",             "cosmic",  1, "21:00", "22:00"),
  mk("c15", "Walker & Royce b2b VNSSA","Tech House",             "cosmic",  1, "04:15", "05:30"),
  mk("c16", "Roddy Lima",              "House",                  "cosmic",  3, "20:00", "21:00"),
  mk("c17", "San Pacho",               "Afrohouse",              "cosmic",  2, "22:00", "23:15"),
  mk("c18", "Westend",                 "Tech House",             "cosmic",  1, "01:45", "03:00"),
  mk("c19", "William Black",           "Melodic Bass",           "cosmic",  3, "04:15", "05:30"),
  mk("c20", "Hannah Laing",            "Hard House / Techno",    "cosmic",  2, "04:15", "05:30"),
  mk("c21", "Frost Children",          "Electronic",             "cosmic",  3, "19:00", "20:00"),
  mk("c22", "Interplanetary Criminal", "UK Bass",                "cosmic",  1, "22:00", "23:15"),

  // ---------- CIRCUIT GROUNDS ----------
  mk("cg1", "Peggy Gou b2b Ki/Ki",     "House / Techno",         "circuit", 2, "00:30", "01:45"),
  mk("cg2", "Solomun",                 "Melodic House",          "circuit", 3, "01:45", "03:00"),
  mk("cg3", "Boys Noize",              "Electro",                "circuit", 1, "00:30", "01:45"),
  mk("cg4", "Vintage Culture",         "Melodic House",          "circuit", 2, "23:15", "00:30"),
  mk("cg5", "Kevin de Vries",          "Melodic Techno",         "circuit", 1, "01:45", "03:00"),
  mk("cg6", "Lilly Palmer",            "Techno",                 "circuit", 3, "04:15", "05:30"),
  mk("cg7", "Anna",                    "Techno",                 "circuit", 2, "01:45", "03:00"),
  mk("cg8", "I Hate Models",           "Industrial Techno",      "circuit", 1, "04:15", "05:30"),
  mk("cg9", "Kettama",                 "Rave / Breaks",          "circuit", 3, "00:30", "01:45"),
  mk("cg10","Sammy Virji",             "UK Garage",              "circuit", 2, "20:00", "21:00"),
  mk("cg11","Solomun",                 "Melodic House",          "circuit", 3, "19:00", "20:00"),
  mk("cg12","Nico Moreno",             "Hard Techno",            "circuit", 1, "23:15", "00:30"),
  mk("cg13","Chris Stussy",            "Tech House",             "circuit", 2, "19:00", "20:00"),
  mk("cg14","The Outlaw",              "Hard Techno",            "circuit", 1, "19:00", "20:00"),
  mk("cg15","Bou",                     "DnB",                    "circuit", 3, "21:00", "22:00"),
  mk("cg16","Ray Volpe",               "Dubstep",                "circuit", 2, "22:00", "23:15"),
  mk("cg17","Levity",                  "Melodic Bass",           "circuit", 1, "20:00", "21:00"),
  mk("cg18","Level Up",                "Dubstep",                "circuit", 3, "22:00", "23:15"),
  mk("cg19","Linska",                  "Techno",                 "circuit", 2, "04:15", "05:30"),
  mk("cg20","Wooli",                   "Melodic Bass",           "circuit", 1, "22:00", "23:15"),

  // ---------- NEON GARDEN ----------
  mk("n1",  "Eli Brown",               "Techno",                 "neon",    1, "01:45", "03:00"),
  mk("n2",  "Indira Paganotto",        "Acid Techno",            "neon",    3, "22:00", "23:15"),
  mk("n3",  "Joseph Capriati",         "Techno",                 "neon",    2, "01:45", "03:00"),
  mk("n4",  "Adriatique",              "Melodic Techno",         "neon",    1, "00:30", "01:45"),
  mk("n5",  "Peggy Gou",               "House",                  "neon",    3, "20:00", "21:00"),
  mk("n6",  "DJ Tennis b2b Chloé Caillet","House",               "neon",    2, "22:00", "23:15"),
  mk("n7",  "Mestiza",                 "Electronic",             "neon",    1, "21:00", "22:00"),
  mk("n8",  "Klangkuenstler",          "Techno",                 "neon",    3, "23:15", "00:30"),
  mk("n9",  "Anastazja",               "Trance / Techno",        "neon",    2, "19:00", "20:00"),
  mk("n10", "Ahmed Spins",             "Afrohouse",              "neon",    1, "19:00", "20:00"),
  mk("n11", "Mink",                    "Techno",                 "neon",    3, "01:45", "03:00"),
  mk("n12", "Adiel",                   "Techno",                 "neon",    2, "00:30", "01:45"),
  mk("n13", "Aeon:Mode (Sunrise Set)", "Trance",                 "neon",    3, "04:15", "05:30"),
  mk("n14", "Luciano",                 "Tech House",             "neon",    2, "21:00", "22:00"),
  mk("n15", "Silvie Loto",             "Techno",                 "neon",    1, "04:15", "05:30"),
  mk("n16", "Prospa",                  "Techno",                 "neon",    3, "19:00", "20:00"),
  mk("n17", "Josh Baker b2b Kettama",  "Breaks / House",         "neon",    2, "04:15", "05:30"),
  mk("n18", "Frankie Bones",           "Breakbeat",              "neon",    1, "22:00", "23:15"),
  mk("n19", "9999999999",              "Gabber",                 "neon",    3, "00:30", "01:45"),

  // ---------- QUANTUM VALLEY ----------
  mk("q1",  "Andrew Rayel",            "Trance",                 "quantum", 1, "00:30", "01:45"),
  mk("q2",  "Astrix",                  "Psytrance",              "quantum", 2, "04:15", "05:30"),
  mk("q3",  "Gareth Emery",            "Trance",                 "quantum", 3, "00:30", "01:45"),
  mk("q4",  "Paul Oakenfold",          "Trance",                 "quantum", 1, "22:00", "23:15"),
  mk("q5",  "Paul van Dyk",            "Trance",                 "quantum", 3, "21:00", "22:00"),
  mk("q6",  "Cosmic Gate",             "Trance",                 "quantum", 2, "00:30", "01:45"),
  mk("q7",  "Darude",                  "Trance",                 "quantum", 1, "01:45", "03:00"),
  mk("q8",  "Cristoph",                "Progressive House",      "quantum", 2, "19:00", "20:00"),
  mk("q9",  "Ferry Corsten / Darren Porter","Trance",            "quantum", 3, "19:00", "20:00"),
  mk("q10", "Maria Healy",             "Trance / Techno",        "quantum", 1, "20:00", "21:00"),
  mk("q11", "Innellea",                "Melodic Techno",         "quantum", 2, "20:00", "21:00"),
  mk("q12", "Matty Ralph",             "Trance",                 "quantum", 3, "04:15", "05:30"),
  mk("q13", "Shingo Nakamura",         "Progressive",            "quantum", 1, "19:00", "20:00", "Melodic progressive. Sunset specialist."),
  mk("q14", "Tinlicker (DJ Set)",      "Melodic House",          "quantum", 2, "23:15", "00:30"),
  mk("q15", "Thomas Schumacher",       "Techno",                 "quantum", 3, "01:45", "03:00"),
  mk("q16", "Pegassi",                 "Psytrance",              "quantum", 1, "04:15", "05:30"),
  mk("q17", "Massano",                 "Melodic Techno",         "quantum", 2, "01:45", "03:00"),
  mk("q18", "Billy Gillies",           "Trance",                 "quantum", 1, "23:15", "00:30"),
  mk("q19", "Sarah de Warren",         "Trance Vocalist",        "quantum", 3, "22:00", "23:15"),
  mk("q20", "Cassian",                 "Melodic House",          "quantum", 2, "22:00", "23:15"),

  // ---------- STEREO BLOOM ----------
  mk("s1",  "Chris Lorenzo b2b Bullet Tooth","Bass House",        "stereo", 1, "00:30", "01:45"),
  mk("s2",  "Skream",                  "Dubstep / House",        "stereo", 2, "00:30", "01:45"),
  mk("s3",  "Sidney Charles b2b Bushbaby","Tech House",          "stereo", 3, "00:30", "01:45"),
  mk("s4",  "Wax Motif",               "Bass House",             "stereo", 1, "01:45", "03:00"),
  mk("s5",  "Morgan Seatree",          "Tech House",             "stereo", 2, "21:00", "22:00"),
  mk("s6",  "Josh Baker",              "Tech House",             "stereo", 3, "23:15", "00:30"),
  mk("s7",  "Cid",                     "Tech House",             "stereo", 2, "22:00", "23:15"),
  mk("s8",  "Dreya V",                 "Tech House",             "stereo", 3, "19:00", "20:00"),
  mk("s9",  "Silva Bumpa",             "UK House",               "stereo", 1, "22:00", "23:15"),
  mk("s10", "Noizu",                   "Bass House",             "stereo", 2, "01:45", "03:00"),
  mk("s11", "Omar+",                   "House",                  "stereo", 1, "20:00", "21:00"),
  mk("s12", "Obskür",                  "Tech House",             "stereo", 3, "20:00", "21:00"),
  mk("s13", "Toman",                   "Tech House",             "stereo", 2, "19:00", "20:00"),
  mk("s14", "Luuk van Dijk",           "Tech House",             "stereo", 3, "22:00", "23:15"),
  mk("s15", "Max Dean",                "Tech House",             "stereo", 1, "04:15", "05:30"),
  mk("s16", "Murphy's Law",            "Tech House",             "stereo", 2, "04:15", "05:30"),
  mk("s17", "Abana b2b Juliet Mendoza","Tech House",             "stereo", 3, "01:45", "03:00"),
  mk("s18", "Bolo (Sunrise Set)",      "Tech House",             "stereo", 3, "04:15", "05:30"),

  // ---------- BIONIC JUNGLE ----------
  mk("b1",  "Avalon Emerson",          "Electro / House",        "bionic",  1, "01:45", "03:00"),
  mk("b2",  "The Carry Nation",        "House",                  "bionic",  2, "00:30", "01:45"),
  mk("b3",  "Bashkka b2b Sedef Adasi", "House",                  "bionic",  3, "01:45", "03:00"),
  mk("b4",  "Heidi Lawden b2b Masha Mar","House",                "bionic",  1, "22:00", "23:15"),
  mk("b5",  "Stacy Christine b2b Tiga","House",                  "bionic",  2, "01:45", "03:00"),
  mk("b6",  "Club Angel",              "House",                  "bionic",  1, "20:00", "21:00"),
  mk("b7",  "Kinahau",                 "House",                  "bionic",  3, "22:00", "23:15"),
  mk("b8",  "Massimiliano Pagliara",   "House",                  "bionic",  2, "04:15", "05:30"),
  mk("b9",  "Isabella",                "Techno",                 "bionic",  3, "00:30", "01:45"),
  mk("b10", "Robert Hood",             "Detroit Techno",         "bionic",  1, "04:15", "05:30", "Detroit techno originator."),
  mk("b11", "Player Dave",             "House",                  "bionic",  2, "22:00", "23:15"),
  mk("b12", "Bad Boombox b2b Ollie Lishman","House",             "bionic",  3, "04:15", "05:30"),
  mk("b13", "Salute b2b Chloé Caillet","UK Garage",              "bionic",  1, "00:30", "01:45"),
  mk("b14", "Paramida",                "Disco / House",          "bionic",  3, "20:00", "21:00"),
  mk("b15", "Alves",                   "House",                  "bionic",  2, "20:00", "21:00"),

  // ---------- BASSPOD ----------
  mk("bp1", "Muzz",                    "Dubstep",                "basspod", 1, "00:30", "01:45"),
  mk("bp2", "Peekaboo",                "Dubstep",                "basspod", 2, "00:30", "01:45"),
  mk("bp3", "Virtual Riot",            "Dubstep",                "basspod", 3, "01:45", "03:00"),
  mk("bp4", "Flux Pavilion b2b Funtcase","Dubstep",              "basspod", 1, "01:45", "03:00"),
  mk("bp5", "Adventure Club (Throwback)","Dubstep",              "basspod", 3, "00:30", "01:45"),
  mk("bp6", "Doctor P b2b Flux Pavilion","Dubstep",              "basspod", 2, "22:00", "23:15"),
  mk("bp7", "Ahee b2b Liquid Stranger","Dubstep / Bass",         "basspod", 3, "21:00", "22:00"),
  mk("bp8", "Æon:Mode (Sunrise)",      "Dubstep / Bass",         "basspod", 1, "04:15", "05:30"),
  mk("bp9", "Hamdi",                   "UK Bass",                "basspod", 2, "01:45", "03:00"),
  mk("bp10","Sippy",                   "Dubstep",                "basspod", 1, "19:00", "20:00"),
  mk("bp11","Hybrid Minds",            "Liquid DnB",             "basspod", 3, "19:00", "20:00"),
  mk("bp12","Infekt b2b Samplifire",   "Dubstep",                "basspod", 2, "21:00", "22:00"),
  mk("bp13","Eazybaked",               "Bass",                   "basspod", 3, "04:15", "05:30"),
  mk("bp14","Viperactive",             "Dubstep",                "basspod", 1, "22:00", "23:15"),
  mk("bp15","Mary Droppinz",           "Dubstep",                "basspod", 2, "19:00", "20:00"),
  mk("bp16","Whethan",                 "Electronic",             "basspod", 3, "22:00", "23:15"),
  mk("bp17","Fallen with MC Dino",     "Dubstep",                "basspod", 1, "21:00", "22:00"),
  mk("bp18","Riot",                    "Dubstep",                "basspod", 2, "04:15", "05:30"),

  // ---------- WASTELAND ----------
  mk("w1",  "Subtronics",              "Dubstep",                "waste",   1, "00:30", "01:45"),
  mk("w2",  "Rezz",                    "Mid-tempo Bass",         "waste",   2, "22:00", "23:15"),
  mk("w3",  "Excision",                "Dubstep",                "waste",   3, "23:15", "00:30"),
  mk("w4",  "Sub Zero Project",        "Hardstyle",              "waste",   1, "01:45", "03:00"),
  mk("w5",  "Da Tweekaz",              "Hardstyle",              "waste",   3, "00:30", "01:45"),
  mk("w6",  "Lady Faith b2b LNY TNZ",  "Hardstyle",              "waste",   2, "01:45", "03:00"),
  mk("w7",  "Warface",                 "Hardstyle",              "waste",   3, "19:00", "20:00"),
  mk("w8",  "The Purge",               "Hardstyle",              "waste",   1, "21:00", "22:00"),
  mk("w9",  "Code Black b2b Toneshifterz","Hardstyle",           "waste",   2, "00:30", "01:45"),
  mk("w10", "Dead X",                  "Hard Dance",             "waste",   1, "19:00", "20:00"),
  mk("w11", "DJ Isaac",                "Hardstyle",              "waste",   3, "22:00", "23:15"),
  mk("w12", "Rooler",                  "Hardcore / Uptempo",     "waste",   2, "04:15", "05:30"),
  mk("w13", "Restricted",              "Hardstyle",              "waste",   1, "04:15", "05:30"),
  mk("w14", "The Saints",              "Hardcore",               "waste",   3, "01:45", "03:00"),
  mk("w15", "Mish",                    "Hardstyle",              "waste",   1, "22:00", "23:15"),
  mk("w16", "Vieze Asbak",             "Hardcore",               "waste",   2, "21:00", "22:00"),
  mk("w17", "Cloudy",                  "Hardstyle",              "waste",   3, "20:00", "21:00"),
  mk("w18", "Serafina",                "Hardstyle",              "waste",   2, "19:00", "20:00"),
  mk("w19", "Yosuf",                   "Hardstyle",              "waste",   3, "04:15", "05:30"),
];

const DAYS = [
  { n: 1, label: "FRI", date: "May 15" },
  { n: 2, label: "SAT", date: "May 16" },
  { n: 3, label: "SUN", date: "May 17" },
];

const NOW = {
  currentArtistId: "k11",    // Porter Robinson at Kinetic Field (22:00–23:15 Fri)
  nextArtistId:    "k9",     // Kaskade up next at 23:15
  elapsedMin: 42,
  day: 1,
  time: "22:42",
};

// Live notifications feed
const ALERTS = [
  { id: "n1", kind: "reminder", title: "Porter Robinson in 48 min",    body: "Kinetic Field · 23:30. 7 min walk from here.",       time: "10:42 PM", unread: true },
  { id: "n2", kind: "friend",   title: "Remi just arrived at Bionic",  body: "They're near the east entrance.",                      time: "10:38 PM", unread: true },
  { id: "n3", kind: "safety",   title: "Wind gust alert",              body: "18 mph gusts expected 11:00 PM. Secure lightweight items.", time: "10:15 PM", unread: false },
  { id: "n4", kind: "conflict", title: "Schedule conflict",             body: "Zedd and Subtronics overlap 01:00–01:45.",             time: "09:55 PM", unread: false },
  { id: "n5", kind: "drop",     title: "New set added",                 body: "Surprise b2b Fisher × Chris Lake at Circuit, 02:30.",   time: "09:12 PM", unread: false },
];

// Essentials — safety/info drawer
const ESSENTIALS = [
  { id: "e1", icon: "med",     title: "Medical & Mental Health",  sub: "3 medic tents · 24/7 roamers",   tone: "ember" },
  { id: "e2", icon: "water",   title: "Water Refill Stations",     sub: "9 stations · always free",        tone: "sky" },
  { id: "e3", icon: "shuttle", title: "Shuttles & Rideshare",      sub: "Last shuttle 5:45 AM · Lot E",    tone: "dune" },
  { id: "e4", icon: "lost",    title: "Lost & Found",              sub: "Info booth · Daisy Lane",         tone: "horizon" },
  { id: "e5", icon: "info",    title: "Entry Hours & Policies",    sub: "Gates 4PM–5AM · no re-entry",     tone: "ink" },
  { id: "e6", icon: "consent", title: "Consent & Reporting",       sub: "Tap for anonymous report line",   tone: "ember" },
];

Object.assign(window, { FESTIVAL, STAGES, AMENITIES, AVATAR_START, FRIENDS, ARTISTS, DAYS, NOW, ALERTS, ESSENTIALS });
