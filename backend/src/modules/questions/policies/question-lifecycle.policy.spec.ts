import { BadRequestException } from '@nestjs/common';
import { QuestionLifecyclePolicy } from './question-lifecycle.policy';

describe('QuestionLifecyclePolicy', () => {
  const policy = new QuestionLifecyclePolicy();

  it.each(['draft', 'approved', 'published', 'archived', 'rejected'])(
    'accepts the existing %s status',
    (status) => expect(() => policy.assertKnownStatus(status)).not.toThrow(),
  );

  it('rejects an unknown transition target with a stable code', () => {
    try {
      policy.assertKnownStatus('unknown');
      fail('Expected the policy to reject the status');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'INVALID_QUESTION_STATUS_TRANSITION',
      });
    }
  });
});
