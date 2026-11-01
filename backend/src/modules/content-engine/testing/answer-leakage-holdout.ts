/**
 * Held-out questions for the answer-leakage rules, written after those rules
 * were finished and never used to tune them. `kind` says what a fair reader
 * would call the leak. Results are pinned in `answer-leakage.holdout.spec.ts`.
 */
export interface LeakageCase {
  id: string;
  prompt: string;
  /** A correct option label, or a Closest target. */
  answer: string | number;
  others?: string[];
  kind?: string;
}

const CLUBS = ['الفتح', 'الرائد', 'التعاون'];

export const LEAKY_HOLDOUT: LeakageCase[] = [
  {
    id: 'L01',
    kind: 'exact',
    prompt: 'أي نادٍ لعب له كريستيانو بقميص النصر الأصفر؟',
    answer: 'النصر',
    others: CLUBS,
  },
  {
    id: 'L02',
    kind: 'exact',
    prompt: 'في أي مدينة يقع ملعب مدينة جدة الرياضية؟',
    answer: 'جدة',
    others: ['الرياض', 'الدمام', 'أبها'],
  },
  {
    id: 'L03',
    kind: 'exact',
    prompt: 'ما لون قميص الفريق الأزرق؟',
    answer: 'الأزرق',
    others: ['الأحمر', 'الأصفر', 'الأخضر'],
  },
  {
    id: 'L04',
    kind: 'attached',
    prompt: 'مع من لعب نجم برشلونة السابق في الكامب نو؟',
    answer: 'برشلونة',
    others: ['ريال مدريد', 'ليفربول', 'ميلان'],
  },
  {
    id: 'L05',
    kind: 'inflected',
    prompt: 'أي فريق يشجعه الأهلاويون؟',
    answer: 'الأهلي',
    others: ['الهلال', 'النصر', 'الاتحاد'],
  },
  {
    id: 'L06',
    kind: 'inflected',
    prompt: 'أي منتخب يمثله اللاعبون السعوديون؟',
    answer: 'السعودية',
    others: ['مصر', 'المغرب', 'قطر'],
  },
  {
    id: 'L07',
    kind: 'inflected',
    prompt: 'ما اسم القرصان صاحب القبعة القشية؟',
    answer: 'قبعة القش',
    others: ['اللحية البيضاء', 'الشعر الأحمر', 'اللحية السوداء'],
  },
  {
    id: 'L08',
    kind: 'grammar',
    prompt: 'ما هي اللاعبة التي فازت بالكرة الذهبية؟',
    answer: 'أليكسيا',
    others: ['ميسي', 'رونالدو', 'مودريتش'],
  },
  {
    id: 'L09',
    kind: 'grammar',
    prompt: 'أي هذه الكلمات جمع؟',
    answer: 'كتب',
    others: ['كتاب', 'قلم', 'باب'],
  },
  {
    id: 'L10',
    kind: 'trivial',
    prompt: 'أي الأرقام التالية زوجي؟',
    answer: '4',
    others: ['3', '5', '7'],
  },
  {
    id: 'L11',
    kind: 'self-clue',
    prompt: 'ما عاصمة مصر المعروفة بقربها من أهرامات الجيزة؟',
    answer: 'القاهرة',
    others: ['الإسكندرية', 'الأقصر', 'أسوان'],
  },
  {
    id: 'L12',
    kind: 'partial',
    prompt: 'من مؤسس مايكروسوفت بيل غيتس مع بول آلن؟',
    answer: 'بيل غيتس',
    others: ['ستيف جوبز', 'إيلون ماسك', 'جيف بيزوس'],
  },
  {
    id: 'L13',
    kind: 'partial',
    prompt: 'أي جزيرة وقعت فيها معركة جزيرة الكعكة؟',
    answer: 'جزيرة الكعكة',
    others: ['جزيرة السماء', 'جزيرة الأسماك', 'جزيرة وانو'],
  },
  { id: 'L14', kind: 'number', prompt: 'كم يساوي العدد ٩٦؟', answer: 96 },
  {
    id: 'L15',
    kind: 'number',
    prompt: 'شارك اثنان وثلاثون منتخبًا، كم منتخبًا شارك؟',
    answer: 32,
  },
  {
    id: 'L16',
    kind: 'number',
    prompt: 'يتسع الملعب لـ 62,000 متفرج، كم متفرجًا يتسع؟',
    answer: 62000,
  },
  {
    id: 'L17',
    kind: 'arithmetic',
    prompt: 'لعب 20 مباراة بمعدل هدفين في كل مباراة، كم هدفًا سجل؟',
    answer: 40,
  },
  {
    id: 'L18',
    kind: 'arithmetic',
    prompt: 'باع 15 تذكرة بسعر 20 ريالًا لكل تذكرة، كم ريالًا جمع؟',
    answer: 300,
  },
  {
    id: 'L19',
    kind: 'arithmetic',
    prompt: 'إذا كان نصف العدد 48، فما العدد؟',
    answer: 96,
  },
  {
    id: 'L20',
    kind: 'arithmetic',
    prompt: 'بدأ الفريق بـ 100 نقطة وخسر 30، كم نقطة بقيت؟',
    answer: 70,
  },
  {
    id: 'L21',
    kind: 'arithmetic',
    prompt:
      'فاز في 31 مباراة وتعادل في 3، بثلاث نقاط للفوز ونقطة للتعادل، كم نقطة جمع؟',
    answer: 96,
  },
  {
    id: 'L22',
    kind: 'arithmetic',
    prompt: 'كم يومًا في ثلاثة أسابيع وأربعة أيام؟',
    answer: 25,
  },
];

export const CLEAN_HOLDOUT: LeakageCase[] = [
  { id: 'C01', prompt: 'كم نقطة جمع الهلال في موسم 2023–24؟', answer: 96 },
  { id: 'C02', prompt: 'كم هدفًا سجل ميسي في كأس العالم 2022؟', answer: 7 },
  { id: 'C03', prompt: 'في أي عام تأسس نادي الهلال؟', answer: 1957 },
  { id: 'C04', prompt: 'كم منتخبًا شارك في كأس العالم 2026؟', answer: 48 },
  { id: 'C05', prompt: 'كم لاعبًا يبدأ المباراة لكل فريق؟', answer: 11 },
  {
    id: 'C06',
    prompt: 'كم كيلومترًا يبلغ طول حلبة جدة لسباق فورمولا 1؟',
    answer: 6,
  },
  {
    id: 'C07',
    prompt: 'كم مرة فازت البرازيل بكأس العالم من أصل 22 نسخة؟',
    answer: 5,
  },
  { id: 'C08', prompt: 'كم ثانية يستغرق سباق 100 متر تقريبًا؟', answer: 10 },
  { id: 'C09', prompt: 'كم مقعدًا يتسع ملعب الجوهرة في جدة؟', answer: 62000 },
  {
    id: 'C10',
    prompt: 'كم بطولة حققها الاتحاد خلال مئة عام من تاريخه؟',
    answer: 40,
  },
  {
    id: 'C11',
    prompt: 'من هداف الدوري السعودي موسم 2018–19؟',
    answer: 'حمدالله',
    others: ['السومة', 'قوميز', 'جوليانو'],
  },
  {
    id: 'C12',
    prompt: 'أي نادٍ فاز بدوري أبطال آسيا 2021؟',
    answer: 'الهلال',
    others: ['النصر', 'الاتحاد', 'الأهلي'],
  },
  {
    id: 'C13',
    prompt: 'من مدرب منتخب الأرجنتين في مونديال 2022؟',
    answer: 'سكالوني',
    others: ['مارتينو', 'سامباولي', 'مارادونا'],
  },
  {
    id: 'C14',
    prompt: 'ما لون بطاقة الطرد في كرة القدم؟',
    answer: 'أحمر',
    others: ['أصفر', 'أزرق', 'أخضر'],
  },
  {
    id: 'C15',
    prompt: 'أي دولة استضافت مونديال 2022؟',
    answer: 'قطر',
    others: ['روسيا', 'البرازيل', 'ألمانيا'],
  },
  {
    id: 'C16',
    prompt: 'ما اسم سفينة طاقم قبعة القش الثانية؟',
    answer: 'ثاوزند صني',
    others: ['ميري', 'ريد فورس', 'موبي ديك'],
  },
  {
    id: 'C17',
    prompt: 'من اللاعب الذي يلقب بالظاهرة؟',
    answer: 'رونالدو نازاريو',
    others: ['ليونيل ميسي', 'زين الدين زيدان', 'تييري هنري'],
  },
  {
    id: 'C18',
    prompt: 'ما هي الدولة التي تقع فيها مدينة نيوم؟',
    answer: 'السعودية',
    others: ['مصر', 'الأردن', 'الإمارات'],
  },
  {
    id: 'C19',
    prompt: 'أي مدينة تستضيف سباق فورمولا 1 السعودي؟',
    answer: 'جدة',
    others: ['الرياض', 'الدمام', 'مكة'],
  },
  {
    id: 'C20',
    prompt: 'من سجل هدف الفوز على الأرجنتين في مونديال 2022؟',
    answer: 'سالم الدوسري',
    others: ['ياسر الشهراني', 'فراس البريكان', 'صالح الشهري'],
  },
  {
    id: 'C21',
    prompt: 'في أي قارة تقع البرازيل؟',
    answer: 'أمريكا الجنوبية',
    others: ['أوروبا', 'آسيا', 'أفريقيا'],
  },
  {
    id: 'C22',
    prompt: 'ما البطولة التي حققها الأهلي في آسيا عام 2025؟',
    answer: 'دوري أبطال آسيا للنخبة',
    others: ['كأس الملك', 'السوبر السعودي', 'كأس العالم للأندية'],
  },
];
