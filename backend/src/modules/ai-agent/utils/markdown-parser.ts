export type ParsedKnowledge = {
  raw: string;
  sections: Record<string, string>;
};

export function parseKnowledgeMarkdown(markdown: string): ParsedKnowledge {
  const sections: Record<string, string> = {};
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let currentHeading = 'Overview';
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join('\n').trim();

    if (content) {
      sections[currentHeading] = content;
    }

    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+?)\s*$/);

    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      continue;
    }

    buffer.push(line);
  }

  flush();

  return {
    raw: markdown.trim(),
    sections,
  };
}
