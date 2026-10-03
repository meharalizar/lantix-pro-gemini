export const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'],
  ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
  ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
].map(([code, name]) => ({ code, name }))

export const normalizeState = (value) => {
  if (typeof value !== 'string') return ''
  const input = value.trim().toLowerCase()
  return US_STATES.find((state) => state.code.toLowerCase() === input || state.name.toLowerCase() === input)?.code || ''
}

export const readLocation = (body, existing = {}) => {
  const city = typeof (body.city ?? existing.city) === 'string' ? (body.city ?? existing.city).trim() : ''
  const state = normalizeState(body.state ?? existing.state)
  if (!city || city.length > 100) return { error: 'Enter a city (1–100 characters)' }
  if (!state) return { error: 'Select one of the 50 US states' }
  return { city, state }
}

// Major US city centroids for fast, privacy-preserving client-side proximity detection
export const MAJOR_US_CITIES = [
  { city: 'Boston', state: 'MA', lat: 42.3601, lon: -71.0589 },
  { city: 'New York', state: 'NY', lat: 40.7128, lon: -74.0060 },
  { city: 'Philadelphia', state: 'PA', lat: 39.9526, lon: -75.1652 },
  { city: 'Washington', state: 'DC', lat: 38.9072, lon: -77.0369 },
  { city: 'Atlanta', state: 'GA', lat: 33.7490, lon: -84.3880 },
  { city: 'Miami', state: 'FL', lat: 25.7617, lon: -80.1918 },
  { city: 'Orlando', state: 'FL', lat: 28.5383, lon: -81.3792 },
  { city: 'Nashville', state: 'TN', lat: 36.1627, lon: -86.7816 },
  { city: 'Chicago', state: 'IL', lat: 41.8781, lon: -87.6298 },
  { city: 'Detroit', state: 'MI', lat: 42.3314, lon: -83.0458 },
  { city: 'Minneapolis', state: 'MN', lat: 44.9778, lon: -93.2650 },
  { city: 'Dallas', state: 'TX', lat: 32.7767, lon: -96.7970 },
  { city: 'Houston', state: 'TX', lat: 29.7604, lon: -95.3698 },
  { city: 'Austin', state: 'TX', lat: 30.2672, lon: -97.7431 },
  { city: 'Denver', state: 'CO', lat: 39.7392, lon: -104.9903 },
  { city: 'Las Vegas', state: 'NV', lat: 36.1699, lon: -115.1398 },
  { city: 'Phoenix', state: 'AZ', lat: 33.4484, lon: -112.0740 },
  { city: 'Los Angeles', state: 'CA', lat: 34.0522, lon: -118.2437 },
  { city: 'San Francisco', state: 'CA', lat: 37.7749, lon: -122.4194 },
  { city: 'Seattle', state: 'WA', lat: 47.6062, lon: -122.3321 },
  { city: 'Portland', state: 'OR', lat: 45.5152, lon: -122.6784 },
  { city: 'New Orleans', state: 'LA', lat: 29.9511, lon: -90.0715 },
]

export function findNearestMajorCity(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  let nearest = null
  let minDistance = Infinity
  for (const c of MAJOR_US_CITIES) {
    // Equirectangular approximation for fast city distance
    const dLat = (c.lat - lat) * (Math.PI / 180)
    const dLon = (c.lon - lon) * (Math.PI / 180)
    const x = dLon * Math.cos(((c.lat + lat) / 2) * (Math.PI / 180))
    const y = dLat
    const d = Math.sqrt(x * x + y * y) * 6371 // km
    if (d < minDistance) {
      minDistance = d
      nearest = c
    }
  }
  return nearest
}

