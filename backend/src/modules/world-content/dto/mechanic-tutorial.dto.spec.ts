import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TutorialScenarioDto } from './mechanic-tutorial.dto';

describe('TutorialScenarioDto publication compatibility', () => {
  it('accepts Bomb follow-up questions needed by the published renderer', () => {
    const dto = plainToInstance(TutorialScenarioDto, {
      kind: 'bomb',
      version: 1,
      prompt: 'السؤال الأول',
      acceptedAnswer: 'الإجابة الأولى',
      nextPrompt: 'السؤال الثاني',
      nextQuestion: {
        prompt: 'السؤال الثاني',
        acceptedAnswer: 'الإجابة الثانية',
      },
      returnQuestion: {
        prompt: 'سؤال العودة',
        acceptedAnswer: 'إجابة العودة',
      },
      startingTeam: 'team-a',
      correctAtSecondsRemaining: 18,
      opponentExpiresAtSecondsRemaining: 0,
    });

    expect(
      validateSync(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toEqual([]);
  });

  it('accepts the persisted Odd Piece hotspot presentation metadata', () => {
    const image = {
      media: { type: 'image', assets: [{ url: '/tutorial.jpg' }] },
      width: 1000,
      height: 500,
      orientation: 'landscape',
      provenance: {
        assetOrigin: 'ai-edited',
        sourceUrl: 'owner-supplied://local-tutorial',
        editedRegion: 'front wheel',
      },
    };
    const dto = plainToInstance(TutorialScenarioDto, {
      kind: 'odd-piece',
      version: 2,
      prompt: 'أين القطعة الدخيلة؟',
      targetVehicleIdentity: 'target',
      targetVehicleLabel: 'target',
      intruderVehicleIdentity: 'intruder',
      intruderVehicleLabel: 'intruder',
      intruderPartIdentity: 'wheel',
      intruderPartLabel: 'العجلة',
      modifiedImage: image,
      originalImage: image,
      hotspot: {
        polygon: [
          { x: 0.2, y: 0.2 },
          { x: 0.4, y: 0.2 },
          { x: 0.4, y: 0.4 },
        ],
        tolerance: 0.02,
      },
      wrongPoint: { x: 0.8, y: 0.8 },
      correctPoint: { x: 0.3, y: 0.3 },
      tutorialRevealMode: 'hotspot-detail',
      tutorialMediaDisclosure: 'معاينة تعليمية محلية.',
      team1Tap: { x: 0.8, y: 0.8 },
      team2Tap: { x: 0.3, y: 0.3 },
    });

    expect(
      validateSync(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toEqual([]);
  });
});
