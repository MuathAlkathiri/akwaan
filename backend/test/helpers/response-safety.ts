export function expectSafeResponse(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toMatch(
    /"__v"|"localPath"|stack trace|ffmpeg|shell command|rawProvider|rawPrompt/i,
  );
  expect(serialized).not.toMatch(/\/(Users|home|var\/folders)\//);
}
