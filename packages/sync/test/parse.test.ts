import { describe, expect, it } from 'vitest';
import { highLow, int, normalizeName, num, ordinal, str, toOrdinal, yesNo } from '../src/parse.ts';

describe('ordinal', () => {
  it('parses the ordinal strings the Finishes sheet uses', () => {
    expect(ordinal('1st')).toBe(1);
    expect(ordinal('2nd')).toBe(2);
    expect(ordinal('3rd')).toBe(3);
    expect(ordinal('11th')).toBe(11);
    expect(ordinal('12th')).toBe(12);
  });

  it('treats a blank finish as unknown rather than as last place', () => {
    // Every 2024 row has a blank `Playoff` value. Coercing that to 0 or to the
    // bottom of the table would invent a result the commissioner never entered.
    expect(ordinal('')).toBeNull();
    expect(ordinal(null)).toBeNull();
    expect(ordinal('   ')).toBeNull();
  });

  it('accepts a bare number, since the sheet is inconsistent', () => {
    expect(ordinal(4)).toBe(4);
    expect(ordinal('7')).toBe(7);
  });

  it('refuses to guess at anything else', () => {
    expect(() => ordinal('first')).toThrow(/1st/);
    expect(() => ordinal('T-3rd')).toThrow();
  });
});

describe('toOrdinal', () => {
  it('formats integers back for display, including the teens', () => {
    expect(toOrdinal(1)).toBe('1st');
    expect(toOrdinal(2)).toBe('2nd');
    expect(toOrdinal(3)).toBe('3rd');
    expect(toOrdinal(4)).toBe('4th');
    expect(toOrdinal(11)).toBe('11th');
    expect(toOrdinal(12)).toBe('12th');
    expect(toOrdinal(13)).toBe('13th');
    expect(toOrdinal(21)).toBe('21st');
    expect(toOrdinal(null)).toBe('—');
  });

  it('round-trips every place a 12-team league can finish in', () => {
    for (let place = 1; place <= 12; place += 1) {
      expect(ordinal(toOrdinal(place))).toBe(place);
    }
  });
});

describe('num', () => {
  it('reads scores, including the artefacts of a hand-maintained sheet', () => {
    expect(num('112.34')).toBeCloseTo(112.34);
    expect(num(98.5)).toBe(98.5);
    expect(num('1,234.5')).toBeCloseTo(1234.5);
    expect(num('$45')).toBe(45);
    expect(num('(12.5)')).toBeCloseTo(-12.5); // parenthesised negative
    expect(num('-3.25')).toBeCloseTo(-3.25);
  });

  it('treats Excel error values and blanks as missing', () => {
    expect(num('')).toBeNull();
    expect(num('-')).toBeNull();
    expect(num('#N/A')).toBeNull();
    expect(num('#DIV/0!')).toBeNull();
    expect(num(null)).toBeNull();
  });

  it('raises on text where a score belongs', () => {
    expect(() => num('n/a ish')).toThrow(/Expected a number/);
  });

  it('truncates rather than rounds when an int is wanted', () => {
    expect(int('3.9')).toBe(3);
    expect(int('-3.9')).toBe(-3);
  });
});

describe('yesNo', () => {
  it('reads the YES/NO spellings the sheets use', () => {
    expect(yesNo('YES')).toBe(true);
    expect(yesNo('yes')).toBe(true);
    expect(yesNo('Y')).toBe(true);
    expect(yesNo('NO')).toBe(false);
    expect(yesNo('n')).toBe(false);
    expect(yesNo('')).toBeNull();
  });

  it('raises on an unrecognised value instead of reading it as false', () => {
    // `Game Played` drives whether a row counts as a played game. Silently
    // reading "MAYBE" as false would quietly drop games from every total.
    expect(() => yesNo('MAYBE')).toThrow(/Expected YES or NO/);
  });
});

describe('highLow', () => {
  it('reads the HIGH/LOW markers as flags', () => {
    // Verified against the workbook: these columns hold the literal words, and
    // `Sea Hi` is set on exactly 102 rows — one per team-season.
    expect(highLow('HIGH')).toBe(true);
    expect(highLow('LOW')).toBe(true);
    expect(highLow('high')).toBe(true);
  });

  it('treats blank as "not a high or low" rather than unknown', () => {
    expect(highLow('')).toBe(false);
    expect(highLow(null)).toBe(false);
  });

  it('raises on an unexpected value instead of reading it as false', () => {
    expect(() => highLow('MEDIUM')).toThrow(/HIGH/);
  });
});

describe('num — sentinel dashes', () => {
  it('treats an en-dash or em-dash as no value, not as text', () => {
    // The workbook uses an en-dash (–) in one points cell. It is not the ASCII
    // hyphen, so it would otherwise fail as unparseable text.
    expect(num('\u2013')).toBeNull();
    expect(num('\u2014')).toBeNull();
    expect(num('-')).toBeNull();
  });

  it('treats Excel error values as no value', () => {
    expect(num('#VALUE!')).toBeNull();
    expect(num('#REF!')).toBeNull();
  });
});

describe('normalizeName', () => {
  it('folds case, spacing and punctuation so alias lookup is forgiving', () => {
    expect(normalizeName('Joe G.')).toBe(normalizeName('joe g'));
    expect(normalizeName("GREGG O'CONNOR")).toBe(normalizeName('Gregg OConnor'));
    expect(normalizeName('  Jimmie   Perkins ')).toBe('jimmie perkins');
  });

  it('keeps genuinely different people apart', () => {
    // The whole point: normalisation must not merge the two Perkinses.
    expect(normalizeName('Jim')).not.toBe(normalizeName('Jimmie'));
    expect(normalizeName('Josh')).not.toBe(normalizeName('Yisha'));
  });
});

describe('str', () => {
  it('collapses whitespace and treats empty as null', () => {
    expect(str('  a   b ')).toBe('a b');
    expect(str('')).toBeNull();
    expect(str('   ')).toBeNull();
  });
});
