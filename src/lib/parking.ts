// Parking/broker detection from NS hostnames. Pure module.
//
// A domain delegated to one of these nameservers is monetized-parked or
// listed on a sales lander — and the provider name itself is the signal
// ("parked at Sedo" tells you where to go make an offer).

export interface ParkingMatch {
  provider: string;
  /** The nameserver that matched. */
  ns: string;
}

const PATTERNS: Array<[RegExp, string]> = [
  [/(^|\.)atom\.com$/, "Atom.com"],
  [/(^|\.)afternic\.com$/, "Afternic"],
  [/(^|\.)sedoparking\.com$/, "Sedo"],
  [/(^|\.)sedo\.com$/, "Sedo"],
  [/(^|\.)bodis\.com$/, "Bodis"],
  [/(^|\.)dan\.com$/, "Dan.com"],
  [/(^|\.)undeveloped\.com$/, "Dan.com"],
  [/(^|\.)above\.com$/, "Above.com"],
  [/(^|\.)parkingcrew\.net$/, "ParkingCrew"],
  [/(^|\.)parklogic\.com$/, "ParkLogic"],
  [/(^|\.)cashparking\.com$/, "GoDaddy CashParking"],
  [/(^|\.)uniregistrymarket\.link$/, "Uniregistry Market"],
];

export function detectParking(nsHosts: string[]): ParkingMatch | null {
  for (const raw of nsHosts) {
    const ns = raw.toLowerCase().replace(/\.$/, "");
    for (const [re, provider] of PATTERNS) {
      if (re.test(ns)) return { provider, ns };
    }
  }
  return null;
}
