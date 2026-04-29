import { sampleDonations } from '../data/sampleDonations'

const apiUrl = import.meta.env.VITE_MINUTES_API_URL
const sheetCsvUrl = import.meta.env.VITE_GOOGLE_SHEET_CSV_URL
const useSampleData = import.meta.env.VITE_USE_SAMPLE_DATA === 'true'

export async function getDonations() {
  if (apiUrl) {
    return getJsonDonations(apiUrl)
  }

  if (sheetCsvUrl) {
    return getCsvDonations(sheetCsvUrl)
  }

  return useSampleData
    ? {
        donations: sampleDonations,
        source: 'sample',
      }
    : {
        donations: [],
        source: 'unconfigured',
      }
}

async function getJsonDonations(url) {
  const payload = await loadJson(url)
  const rawDonations = Array.isArray(payload) ? payload : payload.donations || []

  return {
    donations: rawDonations.map(normalizeDonation).filter((donation) => donation.minutes > 0),
    source: 'live',
  }
}

async function loadJson(url) {
  if (isGoogleAppsScriptUrl(url)) {
    return loadJsonp(url)
  }

  try {
    const response = await fetch(withCacheBust(url), { cache: 'no-store' })

    if (!response.ok) {
      throw new Error(`Donation API returned ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    if (!url.includes('script.google.com')) {
      throw error
    }

    return loadJsonp(url)
  }
}

function loadJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `minutesMatchCallback${Date.now()}${Math.floor(Math.random() * 10000)}`
    const script = document.createElement('script')
    const jsonpUrl = new URL(url)
    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('Donation API JSONP request timed out'))
    }, 12000)

    jsonpUrl.searchParams.set('callback', callbackName)
    jsonpUrl.searchParams.set('_', Date.now().toString())

    window[callbackName] = (payload) => {
      cleanup()
      resolve(payload)
    }

    script.src = jsonpUrl.toString()
    script.onerror = () => {
      cleanup()
      reject(new Error('Donation API JSONP request failed'))
    }

    document.head.appendChild(script)

    function cleanup() {
      window.clearTimeout(timeoutId)
      delete window[callbackName]
      script.remove()
    }
  })
}

function isGoogleAppsScriptUrl(url) {
  try {
    const hostname = new URL(url).hostname
    return hostname === 'script.google.com' || hostname.endsWith('.googleusercontent.com')
  } catch {
    return url.includes('script.google.com')
  }
}

async function getCsvDonations(url) {
  const response = await fetch(withCacheBust(url), { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`Donation sheet returned ${response.status}`)
  }

  const csv = await response.text()
  const rows = parseCsv(csv)
  const headers = rows.shift() || []
  const rawDonations = rows
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])))

  return {
    donations: rawDonations.map(normalizeDonation).filter((donation) => donation.minutes > 0),
    source: 'live',
  }
}

function normalizeDonation(record) {
  const minutes = parseMinutes(
    pickField(record, ['minutes', 'Minutes', 'Minutes spent', 'How many minutes did you spend?'], (key) =>
      key.toLowerCase().includes('minute'),
    ),
  )
  const showName = normalizeShowName(
    pickField(record, ['showName', 'Show my name?', 'Visible', 'Display name'], (key) => {
      const lowerKey = key.toLowerCase()
      return (
        (lowerKey.includes('show') && lowerKey.includes('name')) ||
        lowerKey.includes('anonymous') ||
        lowerKey.includes('public')
      )
    }),
  )

  return {
    name:
      String(
        pickField(record, ['name', 'Name', 'Donor', 'Donor name', 'Full name'], (key) => {
          const lowerKey = key.toLowerCase()
          return lowerKey.includes('name') && !lowerKey.includes('show') && !lowerKey.includes('display')
        }) ?? 'Anonymous',
      ).trim() || 'Anonymous',
    team:
      String(
        pickField(record, ['team', 'Team', 'Team Page', 'Group', 'Organization'], (key) =>
          key.toLowerCase().includes('team'),
        ) ??
          'Independent',
      ).trim() || 'Independent',
    minutes,
    message: String(
      pickField(record, ['message', 'Message', 'Comment', 'Notes'], (key) => {
        const lowerKey = key.toLowerCase()
        return lowerKey.includes('message') || lowerKey.includes('comment') || lowerKey.includes('note')
      }) ?? '',
    ).trim(),
    timestamp:
      pickField(record, ['timestamp', 'Timestamp', 'Date', 'Submitted at'], (key) =>
        key.toLowerCase().includes('timestamp'),
      ) ?? '',
    showName,
  }
}

function pickField(record, preferredKeys, keyMatcher) {
  for (const key of preferredKeys) {
    if (record[key] !== undefined && record[key] !== '') {
      return record[key]
    }
  }

  const matchingKey = Object.keys(record).find((key) => keyMatcher(key) && record[key] !== '')
  return matchingKey ? record[matchingKey] : undefined
}

function parseMinutes(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const match = String(value ?? '').match(/\d+(\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function normalizeShowName(value) {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === undefined || value === null || value === '') {
    return true
  }

  return !['no', 'false', 'anonymous', 'hide'].includes(String(value).trim().toLowerCase())
}

function parseCsv(csv) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]
    const nextCharacter = csv[index + 1]

    if (character === '"' && inQuotes && nextCharacter === '"') {
      cell += '"'
      index += 1
    } else if (character === '"') {
      inQuotes = !inQuotes
    } else if (character === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }

      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

function withCacheBust(url) {
  const cacheBustUrl = new URL(url, window.location.origin)
  cacheBustUrl.searchParams.set('_', Date.now().toString())
  return cacheBustUrl.toString()
}
