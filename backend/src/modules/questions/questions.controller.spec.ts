import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { AdminQuestionsController } from './questions.controller';

describe('AdminQuestionsController image actions', () => {
  const mutations = {
    uploadImage: jest.fn(),
    removeImage: jest.fn(),
  };
  const controller = new AdminQuestionsController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    mutations as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('requires the Admin role at the controller boundary', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminQuestionsController)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('rejects an upload with a missing multipart file', async () => {
    try {
      await controller.uploadImage('question-1', undefined);
      throw new Error('Expected uploadImage to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'QUESTION_IMAGE_FILE_REQUIRED',
      });
    }
    expect(mutations.uploadImage).not.toHaveBeenCalled();
  });
});
