import { BadRequestException } from '@nestjs/common';
import {
  maskIdentifier,
  normalizeIdentifier,
  normalizeSaudiPhone,
} from './otp-identifier';

describe('Saudi phone normalization', () => {
  // The whole point: one person, one stored identifier, however they type it.
  it.each([
    '0512345678',
    '512345678',
    '+966512345678',
    '00966512345678',
    '966512345678',
    '+966 51 234 5678',
    '05 1234 5678',
    '(+966) 51-234-5678',
    '٠٥١٢٣٤٥٦٧٨',
  ])('maps %s to canonical E.164', (input) => {
    expect(normalizeSaudiPhone(input)).toBe('+966512345678');
  });

  it('treats every written form as the same identifier', () => {
    const forms = ['0512345678', '512345678', '+966512345678'];
    const canonical = new Set(forms.map((form) => normalizeSaudiPhone(form)));
    expect(canonical.size).toBe(1);
  });

  it.each([
    ['0412345678', 'landline prefix'],
    ['051234567', 'too short'],
    ['05123456789', 'too long'],
    ['+15551234567', 'not Saudi'],
  ])('rejects %s (%s)', (input) => {
    expect(() => normalizeSaudiPhone(input)).toThrow(BadRequestException);
  });
});

describe('identifier detection', () => {
  it('detects an email and lowercases it', () => {
    expect(normalizeIdentifier('  User@Example.COM ')).toEqual({
      type: 'email',
      value: 'user@example.com',
    });
  });

  it('detects a phone number', () => {
    expect(normalizeIdentifier('0512345678')).toEqual({
      type: 'phone',
      value: '+966512345678',
    });
  });

  it.each(['', '   ', 'not-an-email', 'a@b', '@example.com', 'user@'])(
    'rejects %p',
    (input) => {
      expect(() => normalizeIdentifier(input)).toThrow(BadRequestException);
    },
  );
});

describe('masking', () => {
  it('hides most of an email', () => {
    const masked = maskIdentifier({
      type: 'email',
      value: 'muath@example.com',
    });
    expect(masked).toBe('m••••@example.com');
    expect(masked).not.toContain('muath');
  });

  it('hides the middle of a phone number', () => {
    expect(maskIdentifier({ type: 'phone', value: '+966512345678' })).toBe(
      '+966••••78',
    );
  });
});
