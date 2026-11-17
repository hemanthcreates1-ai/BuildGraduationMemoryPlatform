import { EXPECTED_STUDENT_COUNT, normalizeRollNumber, ROLL_NUMBER_PATTERN } from '../constants'

export type RosterRow = { roll: string; pin: string; line: number }
export type RosterReport = {
  ok: boolean
  header: { roll: string; pin: string } | null
  rows: RosterRow[]
  errors: string[]
  warnings: string[]
}

const ROLL_HEADERS = [
  'roll_number',
  'rollnumber',
  'roll',
  'roll no',
  'roll_no',
  'rollno',
  'roll number',
  'hall_ticket',
  'hallticket',
  'hall ticket',
]
const PIN_HEADERS = ['pin', 'pins', 'password', 'passcode', 'pin_code', 'pincode', 'code']

/** Minimal RFC 4180 line parser (quoted fields, escaped quotes). */
function parseLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"'
        index++
      } else if (char === '"') {
        quoted = false
      } else {
        current += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}

/**
 * Validates pins.csv exactly as required: real headers, exactly 84 records, no duplicates,
 * no missing or malformed values. Credentials are never changed; whitespace around a cell is
 * reported as a warning so the administrator can see it.
 */
export function parseRosterCsv(text: string): RosterReport {
  const errors: string[] = []
  const warnings: string[] = []
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
  const headerCells = parseLine(lines[0] ?? '').map((cell) => cell.trim())
  const normalized = headerCells.map((cell) => cell.toLowerCase())
  const rollIndex = normalized.findIndex((cell) => ROLL_HEADERS.includes(cell))
  const pinIndex = normalized.findIndex((cell) => PIN_HEADERS.includes(cell))
  if (rollIndex === -1 || pinIndex === -1) {
    errors.push(
      `Could not find roll-number and PIN columns in the header row (found: ${headerCells.join(', ') || 'nothing'}).`,
    )
    return { ok: false, header: null, rows: [], errors, warnings }
  }
  const header = { roll: headerCells[rollIndex]!, pin: headerCells[pinIndex]! }

  const rows: RosterRow[] = []
  const seen = new Map<string, RosterRow>()
  lines.slice(1).forEach((raw, offset) => {
    const line = offset + 2
    if (!raw.trim()) return
    const cells = parseLine(raw)
    if (cells.length !== headerCells.length) {
      errors.push(`Line ${line}: expected ${headerCells.length} columns but found ${cells.length}.`)
      return
    }
    const rawRoll = cells[rollIndex] ?? ''
    const rawPin = cells[pinIndex] ?? ''
    const roll = normalizeRollNumber(rawRoll)
    const pin = rawPin.trim()
    if (!roll) {
      errors.push(`Line ${line}: missing roll number.`)
      return
    }
    if (!ROLL_NUMBER_PATTERN.test(roll)) {
      errors.push(`Line ${line}: "${rawRoll}" is not a valid roll number.`)
      return
    }
    if (!pin) {
      errors.push(`Line ${line}: missing PIN for ${roll}.`)
      return
    }
    if (rawPin !== pin)
      warnings.push(`Line ${line}: spaces around the PIN for ${roll} were ignored.`)
    if (pin.length > 64) errors.push(`Line ${line}: the PIN for ${roll} is unusually long.`)
    if (pin.length < 4)
      warnings.push(
        `${roll}: PIN has only ${pin.length} character(s) — leading zeros may have been lost in a spreadsheet.`,
      )
    const previous = seen.get(roll)
    if (previous) {
      errors.push(
        previous.pin === pin
          ? `Duplicate roll number ${roll} on lines ${previous.line} and ${line}.`
          : `Conflicting PINs for ${roll} on lines ${previous.line} and ${line}.`,
      )
      return
    }
    const row = { roll, pin, line }
    seen.set(roll, row)
    rows.push(row)
  })

  if (rows.length !== EXPECTED_STUDENT_COUNT) {
    errors.push(
      `Expected exactly ${EXPECTED_STUDENT_COUNT} students but found ${rows.length} valid records.`,
    )
  }
  return { ok: errors.length === 0, header, rows, errors, warnings }
}
