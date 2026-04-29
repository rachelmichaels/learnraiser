const SHEET_NAME = 'Form Responses 1'

function doGet(request) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME)

  if (!sheet) {
    return responseFor(request, { donations: [], error: `Sheet "${SHEET_NAME}" was not found.` })
  }

  const values = sheet.getDataRange().getValues()

  if (values.length < 2) {
    return responseFor(request, { donations: [] })
  }

  const headers = values.shift()
  const donations = values
    .filter((row) => row.some(Boolean))
    .map((row) => {
      const record = Object.fromEntries(headers.map((header, index) => [String(header).trim(), row[index]]))

      return {
        timestamp: toIsoString(pickField(record, ['Timestamp'], (key) => key.toLowerCase().includes('timestamp'))),
        name: String(
          pickField(record, ['Name', 'Donor name', 'Full name'], (key) => {
            const lowerKey = key.toLowerCase()
            return lowerKey.includes('name') && !lowerKey.includes('show') && !lowerKey.includes('display')
          }) || 'Anonymous',
        ).trim(),
        team: String(
          pickField(record, ['Team', 'Team Page', 'Group', 'Organization'], (key) => key.toLowerCase().includes('team')) ||
            'Independent',
        ).trim(),
        minutes: parseMinutes(
          pickField(record, ['Minutes', 'Minutes spent'], (key) => key.toLowerCase().includes('minute')),
        ),
        message: String(
          pickField(record, ['Message', 'Comment', 'Notes'], (key) => {
            const lowerKey = key.toLowerCase()
            return lowerKey.includes('message') || lowerKey.includes('comment') || lowerKey.includes('note')
          }) || '',
        ).trim(),
        showName: normalizeShowName(
          pickField(record, ['Show my name?', 'Display name', 'Visible'], (key) => {
            const lowerKey = key.toLowerCase()
            return (
              (lowerKey.includes('show') && lowerKey.includes('name')) ||
              lowerKey.includes('anonymous') ||
              lowerKey.includes('public')
            )
          }),
        ),
      }
    })
    .filter((donation) => donation.minutes > 0)

  return responseFor(request, { donations })
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

  const match = String(value || '').match(/\d+(\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function normalizeShowName(value) {
  if (value === undefined || value === null || value === '') {
    return true
  }

  return !['no', 'false', 'anonymous', 'hide'].includes(String(value).trim().toLowerCase())
}

function toIsoString(value) {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (!value) {
    return ''
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

function responseFor(request, payload) {
  const callback = request && request.parameter && request.parameter.callback

  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(payload)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT)
  }

  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON)
}
