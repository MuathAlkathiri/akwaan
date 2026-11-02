import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';

/**
 * The rules for a `between-anchors` Closest slider, in one place so the importer
 * and the screen cannot disagree.
 *
 * Anchor quality is a judgement no rule can make, so it is not made here: a
 * human curates the bank, and an anchor is only ever chosen from it. What stays
 * checkable is structural: both anchors come from the bank, they bracket the
 * target, and neither gives it away.
 */

export const CLOSEST_ANCHOR_LABEL_MAX = 80;

export interface ClosestAnchorChoice {
  labelAr: string;
  /** The anchor's real position on the scale. */
  value: number;
}

export interface ClosestAnchorIssue {
  code:
    | 'CLOSEST_ANCHOR_REQUIRED'
    | 'CLOSEST_ANCHOR_INVALID'
    | 'CLOSEST_ANCHOR_NOT_IN_BANK'
    | 'CLOSEST_ANCHOR_VALUE_MISMATCH'
    | 'CLOSEST_TARGET_NOT_BRACKETED'
    | 'CLOSEST_ANCHOR_LEAKS_TARGET';
  message: string;
}

const westernDigits = (value: string): string =>
  value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

const numbersIn = (label: string): number[] =>
  (westernDigits(label).match(/\d+(?:[,،٬]\d{3})*(?:\.\d+)?/g) ?? []).map(
    (value) => Number(value.replace(/[,،٬]/g, '')),
  );

/** Does this label carry the target itself? */
export const anchorLabelLeaksTarget = (
  label: string,
  target: number,
): boolean => numbersIn(label).includes(target);

const sameLabel = (a: string, b: string): boolean =>
  normalizeAnswer(a) === normalizeAnswer(b);

/**
 * Checks one anchored scale. With no `bank`, only what the slider itself can
 * prove is checked; the bank-backed rules need a bank to read.
 */
export const closestAnchorIssues = (input: {
  leftAnchor: unknown;
  rightAnchor: unknown;
  min: number;
  max: number;
  target: number;
  bank?: readonly ClosestAnchorChoice[];
}): ClosestAnchorIssue[] => {
  const left =
    typeof input.leftAnchor === 'string' ? input.leftAnchor.trim() : '';
  const right =
    typeof input.rightAnchor === 'string' ? input.rightAnchor.trim() : '';
  if (!left || !right) {
    return [
      {
        code: 'CLOSEST_ANCHOR_REQUIRED',
        message: 'a between-anchors slider needs both anchors',
      },
    ];
  }

  const issues: ClosestAnchorIssue[] = [];
  if (
    sameLabel(left, right) ||
    left.length > CLOSEST_ANCHOR_LABEL_MAX ||
    right.length > CLOSEST_ANCHOR_LABEL_MAX
  ) {
    issues.push({
      code: 'CLOSEST_ANCHOR_INVALID',
      message: `anchors must be distinct and at most ${CLOSEST_ANCHOR_LABEL_MAX} characters`,
    });
  }

  if (input.bank) {
    const find = (label: string) =>
      input.bank!.find((anchor) => sameLabel(anchor.labelAr, label));
    const leftChoice = find(left);
    const rightChoice = find(right);
    for (const [label, choice] of [
      [left, leftChoice],
      [right, rightChoice],
    ] as const) {
      if (!choice) {
        issues.push({
          code: 'CLOSEST_ANCHOR_NOT_IN_BANK',
          message: `"${label}" is not in this World's anchor bank`,
        });
      }
    }
    if (
      (leftChoice && leftChoice.value !== input.min) ||
      (rightChoice && rightChoice.value !== input.max)
    ) {
      issues.push({
        code: 'CLOSEST_ANCHOR_VALUE_MISMATCH',
        message: 'the range must be the real values of its two anchors',
      });
    }
  }

  if (!(input.min < input.target && input.target < input.max)) {
    issues.push({
      code: 'CLOSEST_TARGET_NOT_BRACKETED',
      message: `target ${input.target} must sit strictly between the anchors (${input.min}, ${input.max})`,
    });
  }

  for (const label of [left, right]) {
    if (anchorLabelLeaksTarget(label, input.target)) {
      issues.push({
        code: 'CLOSEST_ANCHOR_LEAKS_TARGET',
        message: `the anchor "${label}" states the target`,
      });
    }
  }
  return issues;
};
