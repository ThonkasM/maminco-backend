const CHAR_MAP: Record<string, string> = {
  á: 'a',
  à: 'a',
  ä: 'a',
  â: 'a',
  ã: 'a',
  é: 'e',
  è: 'e',
  ë: 'e',
  ê: 'e',
  í: 'i',
  ì: 'i',
  ï: 'i',
  î: 'i',
  ó: 'o',
  ò: 'o',
  ö: 'o',
  ô: 'o',
  õ: 'o',
  ú: 'u',
  ù: 'u',
  ü: 'u',
  û: 'u',
  Á: 'A',
  À: 'A',
  Ä: 'A',
  Â: 'A',
  Ã: 'A',
  É: 'E',
  È: 'E',
  Ë: 'E',
  Ê: 'E',
  Í: 'I',
  Ì: 'I',
  Ï: 'I',
  Î: 'I',
  Ó: 'O',
  Ò: 'O',
  Ö: 'O',
  Ô: 'O',
  Õ: 'O',
  Ú: 'U',
  Ù: 'U',
  Ü: 'U',
  Û: 'U',
  ñ: 'n',
  Ñ: 'N',
  ç: 'c',
  Ç: 'C',
  '¿': '?',
  '¡': '!',
  º: 'o',
  ª: 'a',
};

export function sanitizeForPrinter(text: string): string {
  if (!text) return '';
  return text
    .split('')
    .map((char) => CHAR_MAP[char] || char)
    .join('');
}

export function formatDateForPrinter(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
