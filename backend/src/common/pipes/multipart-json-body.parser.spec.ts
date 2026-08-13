import { IsString } from 'class-validator';
import { parseMultipartJsonBody } from './multipart-json-body.parser';

class ExampleDto {
  @IsString()
  question!: string;

  @IsString()
  answer!: string;
}

describe('parseMultipartJsonBody', () => {
  it('does not confuse an application/json question with the multipart envelope', () => {
    expect(
      parseMultipartJsonBody(
        { question: 'ما السؤال؟', answer: 'الإجابة' },
        'question',
        ExampleDto,
      ),
    ).toMatchObject({ question: 'ما السؤال؟', answer: 'الإجابة' });
  });

  it('parses the existing multipart JSON envelope', () => {
    expect(
      parseMultipartJsonBody(
        { question: JSON.stringify({ question: 'Q?', answer: 'A' }) },
        'question',
        ExampleDto,
      ),
    ).toMatchObject({ question: 'Q?', answer: 'A' });
  });
});
