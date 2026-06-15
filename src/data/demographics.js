export const foreignResidentTypeOrder = [
  '외국국적동포',
  '기타외국인',
  '외국인주민자녀(출생)',
  '외국인근로자',
  '결혼이민자',
  '한국국적취득자',
  '유학생'
];

export const ageGroupOrder = [
  ...Array.from({ length: 14 }, (_, index) => `${index * 5}-${index * 5 + 4}세`),
  '70세 이상'
];
