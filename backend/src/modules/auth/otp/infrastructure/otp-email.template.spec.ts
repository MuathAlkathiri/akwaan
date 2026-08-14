import {
  OTP_EMAIL_LAYOUT,
  otpEmailHtml,
  otpEmailPreheader,
  otpEmailSubject,
  otpEmailText,
} from './otp-email.template';

const CODE = '123456';
const FIVE_MINUTES = 300;

const html = () => otpEmailHtml(CODE, FIVE_MINUTES);

describe('OTP email — code rendering', () => {
  it('renders all six digits', () => {
    const markup = html();
    for (const digit of CODE.split('')) {
      expect(markup).toContain(`>${digit}</td>`);
    }
  });

  /**
   * The production bug: on a phone the sixth digit wrapped to a second line.
   * These assertions are about structure, because structure is what makes
   * wrapping impossible — a `<tr>` does not reflow its cells at any width.
   */
  describe('the six digits cannot wrap', () => {
    it('places every digit in one table row', () => {
      const markup = html();
      const codeTable = markup.slice(
        markup.indexOf('dir="ltr" align="center"'),
        markup.indexOf('استخدم هذا الرمز'),
      );
      // Six fixed-width cells, all inside the one row opened by the code table.
      expect(codeTable.match(/width="40"/g)).toHaveLength(6);
      const outerRowStart = codeTable.indexOf('<tr>');
      const outerRowEnd = codeTable.indexOf(
        '</tr>',
        codeTable.lastIndexOf('width="40"'),
      );
      expect(outerRowStart).toBeGreaterThanOrEqual(0);
      // Every digit cell falls between that row's open and close tags.
      expect(outerRowEnd).toBeGreaterThan(codeTable.lastIndexOf('width="40"'));
    });

    it('marks the code container nowrap', () => {
      expect(html()).toContain('white-space:nowrap');
    });

    it('uses no flexbox or grid for the code', () => {
      // Both are unreliable across email clients and were never the mechanism.
      const markup = html();
      expect(markup).not.toContain('display:flex');
      expect(markup).not.toContain('display:grid');
    });

    it.each([320, 375, 390, 430])('fits within a %spx viewport', (width) => {
      // Six cells plus gaps, against the width left after 16px of outer
      // padding and 8px around the code cell, on each side.
      const usable = width - 48;
      expect(OTP_EMAIL_LAYOUT.codeRowWidth).toBeLessThanOrEqual(usable);
    });

    it('keeps the whole row comfortably under the narrowest phone', () => {
      expect(OTP_EMAIL_LAYOUT.codeRowWidth).toBe(264);
      expect(OTP_EMAIL_LAYOUT.codeRowWidth).toBeLessThan(320 - 48);
    });
  });
});

describe('OTP email — direction and structure', () => {
  it('is an RTL Arabic document', () => {
    const markup = html();
    expect(markup).toContain('<html lang="ar" dir="rtl"');
    expect(markup).toContain('charset="utf-8"');
  });

  it('renders the code block left-to-right inside the RTL message', () => {
    expect(html()).toContain('dir="ltr"');
  });

  it('uses table layout with inline styles only', () => {
    const markup = html();
    expect(markup).toContain('role="presentation"');
    // A stripped <style> block would take the whole design with it.
    expect(markup).not.toContain('<style');
    expect(markup).not.toContain('</script>');
  });

  it('needs no images or web fonts to look correct', () => {
    const markup = html();
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('fonts.googleapis');
    expect(markup).toContain('Arial');
  });

  it('uses the intended fixed dark palette', () => {
    const markup = html();
    expect(markup).toContain('#15131c');
    expect(markup).toContain('#20223a');
    expect(markup).toContain('#242640');
    expect(markup).toContain('#f5f1e8');
    expect(markup).toContain('#bbb6ce');
    expect(markup).toContain('#d8d1ee');
    expect(markup).toContain('#777189');
  });

  it('does not advertise client-selected light/dark variants', () => {
    const markup = html();
    expect(markup).not.toContain('color-scheme');
    expect(markup).not.toContain('supported-color-schemes');
    expect(markup).not.toContain('@media');
  });

  it('duplicates critical backgrounds as legacy HTML attributes', () => {
    const markup = html();
    expect(markup).toContain('<body bgcolor="#15131c"');
    expect(markup).toContain('bgcolor="#20223a"');
    expect(markup).toContain('bgcolor="#242640"');
    expect(markup).toContain('background-color:#15131c');
    expect(markup).toContain('background-color:#20223a');
    expect(markup).toContain('background-color:#242640');
  });

  it('carries the required Arabic copy and a subtle footer', () => {
    const markup = html();
    expect(markup).toContain('أكوان');
    expect(markup).toContain('رمز الدخول الخاص بك');
    expect(markup).toContain('ينتهي هذا الرمز خلال 5 دقائق.');
    expect(markup).toContain(
      'إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان.',
    );
    expect(markup).toContain('© أكوان');
  });

  it('never asks the recipient to reply', () => {
    expect(html()).not.toContain('رد على');
  });
});

describe('OTP email — nothing to track', () => {
  it('contains no links, pixels, or attachments', () => {
    const markup = html();
    expect(markup).not.toContain('<a ');
    // No URLs at all: nothing for click tracking to rewrite.
    expect(markup).not.toContain('http://');
    expect(markup).not.toContain('https://');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('<script');
  });

  it('adds no marketing or list headers to the body', () => {
    const markup = html();
    expect(markup.toLowerCase()).not.toContain('unsubscribe');
    expect(markup).not.toContain('utm_');
  });
});

describe('OTP email — subject, preheader and plain text', () => {
  it('keeps the code out of the subject', () => {
    const subject = otpEmailSubject();
    expect(subject).toBe('رمز الدخول إلى أكوان');
    expect(subject).not.toContain(CODE);
  });

  it('keeps the code out of the preheader', () => {
    const preheader = otpEmailPreheader(FIVE_MINUTES);
    expect(preheader).toContain('5 دقائق');
    expect(preheader).not.toContain(CODE);
  });

  it('provides a plain-text alternative carrying the code and expiry', () => {
    const text = otpEmailText(CODE, FIVE_MINUTES);
    expect(text).toContain(`رمزك هو: ${CODE}`);
    expect(text).toContain('ينتهي هذا الرمز خلال 5 دقائق.');
    expect(text).toContain('إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.');
    expect(text).not.toContain('<');
  });

  it('describes the real expiry rather than a hardcoded five minutes', () => {
    expect(otpEmailHtml(CODE, 600)).toContain('10 دقائق');
    expect(otpEmailText(CODE, 60)).toContain('دقيقة واحدة');
  });
});

describe('OTP email — secrets', () => {
  it('embeds no provider key or configuration', () => {
    const markup = html() + otpEmailText(CODE, FIVE_MINUTES);
    expect(markup).not.toContain('re_');
    expect(markup).not.toMatch(/RESEND|API_KEY|Bearer/i);
  });
});
