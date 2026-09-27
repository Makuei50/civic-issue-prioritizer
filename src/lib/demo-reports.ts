/** Generates the 247 prepared demo reports used to populate the priority queue. */

export type DemoReport = {
  reporter_name: string;
  reporter_phone: string;
  text_description: string;
  transcript: string;
  location: string;
  category: string;
  severity_score: number;
  confidence_score: number;
  model_name: string;
  gpu_type: string;
  latency_ms: number;
  status: string;
};

const ISSUES: Array<{ category: string; phrases: string[]; severity: [number, number] }> = [
  {
    category: "Roads",
    severity: [4, 10],
    phrases: [
      "There is a deep pothole in the middle of the road and matatus are swerving into oncoming traffic",
      "The tarmac has collapsed into a wide crater after the rains and cars are getting stuck",
      "A long stretch of road surface has broken up into loose gravel and it is dangerous for bodabodas",
    ],
  },
  {
    category: "Drainage",
    severity: [5, 10],
    phrases: [
      "The drainage is completely blocked and sewage water is flooding across the footpath",
      "Storm water has flooded the road up to knee height and it is not draining at all",
      "An open drain has overflowed and standing water has been sitting here for days",
    ],
  },
  {
    category: "Streetlights",
    severity: [2, 7],
    phrases: [
      "The streetlight on this stretch has been dead for two weeks and the area is pitch dark at night",
      "Three street lamps in a row are not switching on and people are afraid to walk here",
      "A leaning light pole has exposed wiring hanging near the pavement",
    ],
  },
  {
    category: "Waste",
    severity: [3, 8],
    phrases: [
      "Garbage has piled up at the collection point and it has not been picked for over a week",
      "An illegal dumping site has formed on the roadside and the smell is unbearable",
      "Waste is scattered across the walkway and stray dogs are spreading it around",
    ],
  },
  {
    category: "Water Supply",
    severity: [4, 9],
    phrases: [
      "A burst water pipe is leaking continuously into the street and wasting a lot of clean water",
      "There has been no water supply in this area and a mains pipe appears broken near the junction",
      "Water is bubbling up through the road surface from a leaking pipe underneath",
    ],
  },
  {
    category: "Public Safety",
    severity: [3, 9],
    phrases: [
      "A manhole cover is missing and the open hole is right in the pedestrian path",
      "A collapsed boundary wall is leaning over the footpath and could fall on people",
      "The pedestrian footbridge railing has broken away and children use this crossing daily",
    ],
  },
  {
    category: "Traffic Signals",
    severity: [4, 9],
    phrases: [
      "The traffic lights at this junction are not working and vehicles are blocking the whole intersection",
      "The signal only shows amber and drivers are ignoring the crossing completely",
      "Pedestrian crossing signal is dead at a very busy junction near a school",
    ],
  },
];

const LOCATIONS = [
  "Ngong Road near Prestige Plaza",
  "Jogoo Road, Buruburu Phase 2",
  "Thika Road, Roysambu roundabout",
  "Moi Avenue near Nation Centre",
  "Langata Road near Wilson Airport",
  "Waiyaki Way, Westlands exit",
  "Kangundo Road, Kayole Junction",
  "Outer Ring Road, Donholm",
  "Mombasa Road near Cabanas",
  "Kiambu Road near Runda gate",
  "Juja Road, Eastleigh Section 3",
  "Limuru Road, Parklands",
  "Kenyatta Avenue, Nairobi CBD",
  "Magadi Road, Ongata Rongai",
  "Nairobi West, Ushirika Road",
  "Githurai 45 stage",
  "Kawangware 46 market road",
  "Dagoretti Corner",
  "Embakasi, Pipeline Estate",
  "Karen Road near Hardy shops",
  "Kasarani, Mwiki Road",
  "South B, Mukoma Road",
  "Umoja One, Nile Road",
  "Kilimani, Wood Avenue",
];

const NAMES = [
  "Achieng Otieno", "Brian Mwangi", "Caroline Wanjiru", "David Kimani", "Esther Nduta",
  "Felix Omondi", "Grace Njeri", "Hassan Ali", "Irene Chebet", "James Mutua",
  "Kevin Barasa", "Lucy Wambui", "Makuei Geu", "Nancy Atieno", "Oscar Kiptoo",
  "Patricia Mueni", "Quincy Odhiambo", "Rose Kamau", "Samuel Kariuki", "Teresa Aoko",
];

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemoReports(count = 247): DemoReport[] {
  const rand = mulberry(20260927);
  const rows: DemoReport[] = [];

  for (let i = 0; i < count; i += 1) {
    const issue = ISSUES[Math.floor(rand() * ISSUES.length)]!;
    const phrase = issue.phrases[Math.floor(rand() * issue.phrases.length)]!;
    const location = LOCATIONS[Math.floor(rand() * LOCATIONS.length)]!;
    const name = NAMES[Math.floor(rand() * NAMES.length)]!;
    const [lo, hi] = issue.severity;
    const severity = lo + Math.floor(rand() * (hi - lo + 1));
    const confidence = Number((0.45 + rand() * 0.52).toFixed(2));

    rows.push({
      reporter_name: name,
      reporter_phone: `+2547${String(10000000 + Math.floor(rand() * 89999999))}`,
      text_description: phrase,
      transcript: phrase,
      location,
      category: issue.category,
      severity_score: severity,
      confidence_score: Math.min(0.97, confidence),
      model_name: "llama-3.1-nemotron-nano-vl-8b-v1",
      gpu_type: "L40S",
      latency_ms: 700 + Math.floor(rand() * 2300),
      status: "reported",
    });
  }

  return rows;
}
