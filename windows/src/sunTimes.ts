// Sunrise/sunset for the "sunset" theme mode. No API, no geolocation prompt —
// just a coarse regional lookup from a Thai postal code (first digit) plus
// the standard NOAA/"sunrise equation" solar position formula (the same
// algorithm behind the widely-used suncalc library). Precision to the minute
// isn't the goal here — knowing "is it roughly day or night" is.

const rad = Math.PI / 180
const DAY_MS = 1000 * 60 * 60 * 24
const J1970 = 2440588
const J2000 = 2451545
const OBLIQUITY = rad * 23.4397

function toJulian(date: Date) { return date.valueOf() / DAY_MS - 0.5 + J1970 }
function fromJulian(j: number) { return new Date((j + 0.5 - J1970) * DAY_MS) }
function toDays(date: Date) { return toJulian(date) - J2000 }

function declination(l: number) {
  return Math.asin(Math.sin(l) * Math.sin(OBLIQUITY))
}
function solarMeanAnomaly(d: number) { return rad * (357.5291 + 0.98560028 * d) }
function eclipticLongitude(M: number) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
  const P = rad * 102.9372
  return M + C + P + Math.PI
}
function julianCycle(d: number, lw: number) { return Math.round(d - 0.0009 - lw / (2 * Math.PI)) }
function approxTransit(Ht: number, lw: number, n: number) { return 0.0009 + (Ht + lw) / (2 * Math.PI) + n }
function solarTransitJ(ds: number, M: number, L: number) {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)
}
function hourAngle(h: number, phi: number, d: number) {
  return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)))
}

// Standard sunrise/sunset angle: -0.833° accounts for atmospheric refraction
// and the sun's apparent radius (the moment the upper limb touches the horizon).
const H0 = -0.833 * rad

export function getSunTimes(date: Date, lat: number, lng: number): { sunrise: Date; sunset: Date } {
  const lw = rad * -lng
  const phi = rad * lat
  const d = toDays(date)
  const n = julianCycle(d, lw)
  const ds = approxTransit(0, lw, n)
  const M = solarMeanAnomaly(ds)
  const L = eclipticLongitude(M)
  const dec = declination(L)
  const Jnoon = solarTransitJ(ds, M, L)

  const w = hourAngle(H0, phi, dec)
  const a = approxTransit(w, lw, n)
  const Jset = solarTransitJ(a, M, L)
  const Jrise = Jnoon - (Jset - Jnoon)

  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset) }
}

// Coarse region lookup by the postal code's leading digit — good enough for
// "is it day or night here", not a real geocoder. Representative city per
// region rather than a full postal database.
const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  '1': { lat: 13.7563, lng: 100.5018 },  // Bangkok & Central
  '2': { lat: 13.3611, lng: 101.1000 },  // East (Chonburi/Rayong)
  '3': { lat: 14.9799, lng: 102.0977 },  // Lower Isaan (Nakhon Ratchasima)
  '4': { lat: 16.4419, lng: 102.8360 },  // Upper Isaan (Khon Kaen/Udon)
  '5': { lat: 18.7883, lng: 98.9853 },   // North (Chiang Mai)
  '6': { lat: 16.8211, lng: 100.2659 },  // Lower North (Phitsanulok)
  '7': { lat: 13.5990, lng: 99.3220 },   // West (Kanchanaburi/Ratchaburi)
  '8': { lat: 9.1382, lng: 99.3215 },    // Upper South (Surat Thani)
  '9': { lat: 7.0084, lng: 100.4747 },   // Lower South (Hat Yai/Songkhla)
}
const DEFAULT_COORDS = REGION_COORDS['1'] // Bangkok, if the code doesn't parse

export function coordsForPostalCode(postalCode: string): { lat: number; lng: number } {
  const digit = postalCode.trim()[0]
  return REGION_COORDS[digit] ?? DEFAULT_COORDS
}

export function isDaytime(postalCode: string, now: Date = new Date()): boolean {
  const { lat, lng } = coordsForPostalCode(postalCode)
  const { sunrise, sunset } = getSunTimes(now, lat, lng)
  return now >= sunrise && now < sunset
}
