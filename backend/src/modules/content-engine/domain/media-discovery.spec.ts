import { titleNamesSubject } from './media-discovery';

describe('titleNamesSubject', () => {
  it.each([
    ["N'Golo Kanté 2018.jpg", "N'Golo Kanté"],
    ['Bukayo_Saka_(cropped).jpg', 'Bukayo Saka'],
    ['Stamford Bridge - West Stand.jpg', 'Stamford Bridge (stadium)'],
    ['Leicester City FC stadium.jpg', 'Leicester City F.C.'],
    ['تييري هنري 2010.jpg', 'Thierry Henri'],
  ])('%s names %s', (title, subject) => {
    expect(titleNamesSubject(title, [subject, 'تييري هنري'])).toBe(true);
  });

  it.each([
    ['Common foxes in the snow.jpg', 'Leicester City F.C.'],
    ['Leicester Museum painting.jpg', 'Leicester City F.C.'],
    ['Chelsea v Arsenal 2019.jpg', "N'Golo Kanté"],
  ])('%s does not name %s', (title, subject) => {
    expect(titleNamesSubject(title, [subject, undefined])).toBe(false);
  });

  it('never matches an empty subject', () => {
    expect(titleNamesSubject('anything.jpg', ['', 'F.C.'])).toBe(false);
  });
});
