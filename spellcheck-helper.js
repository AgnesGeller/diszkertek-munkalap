(function (root) {
  "use strict";

  const WORDS = [
    "ágaprítás", "ágyásszegély", "anyagmozgatás", "ásás", "betonozás", "bozótirtás",
    "cserjeültetés", "előkészítés", "ellenőrzés", "elszállítás", "elvégzése", "faültetés",
    "fakivágás", "fenyőkéreg", "földmunka", "fuvarozás", "fűkaszálás", "fűmagvetés",
    "fűnyírás", "gallyazás", "geotextília", "gereblyézés", "gyomirtás", "gyomlálás",
    "gyepszellőztetés", "gyepszőnyeg", "javítás", "kapálás", "karbantartás",
    "kaszálás", "kertépítés", "kertfenntartás", "kertkarbantartás", "kész", "kavics",
    "lombfújás", "lombgyűjtés", "metszés", "mulcsozás", "műtrágyázás", "növényültetés",
    "növényvédelem", "öntözés", "öntözőrendszer", "pázsit", "permetezés", "rakodás",
    "szegélynyírás", "szállítás", "sövény", "sövénynyírás", "talajelőkészítés",
    "telepítés", "területrendezés", "termőföld", "tereprendezés", "térkövezés",
    "tuskómarás", "ültetés", "zöldhulladék"
  ];

  function folded(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("hu-HU");
  }

  function distance(first, second) {
    const a = folded(first);
    const b = folded(second);
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const diagonal = previous;
        previous = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return row[b.length];
  }

  function suggestions(word, extraWords = [], limit = 3) {
    const typed = String(word || "").trim();
    const normalized = folded(typed);
    if (normalized.length < 3 || !/^\p{L}+$/u.test(typed)) return [];
    const candidates = [...new Set([...WORDS, ...extraWords].map(value => String(value || "").trim()).filter(value => /^\p{L}{3,}$/u.test(value)))];
    return candidates
      .filter(candidate => candidate.toLocaleLowerCase("hu-HU") !== typed.toLocaleLowerCase("hu-HU"))
      .map(candidate => {
        const candidateLetters = folded(candidate);
        const suffix = normalized.startsWith(candidateLetters) ? typed.slice(candidate.length) : "";
        const suggestion = suffix && suffix.length <= 4 ? candidate + suffix : candidate;
        return { candidate: suggestion, score: distance(typed, suggestion), sameLetters: folded(suggestion) === normalized };
      })
      .filter(item => item.sameLetters || item.score <= (normalized.length >= 7 ? 2 : 1))
      .sort((first, second) => Number(second.sameLetters) - Number(first.sameLetters) || first.score - second.score || first.candidate.localeCompare(second.candidate, "hu"))
      .slice(0, limit)
      .map(item => /^[A-ZÁÉÍÓÖŐÚÜŰ]/.test(typed) ? item.candidate.charAt(0).toLocaleUpperCase("hu-HU") + item.candidate.slice(1) : item.candidate);
  }

  function wordRange(text, cursor) {
    const value = String(text || "");
    let start = Math.max(0, Math.min(Number(cursor) || 0, value.length));
    while (start > 0 && !/\p{L}/u.test(value[start - 1])) start -= 1;
    let end = start;
    while (start > 0 && /\p{L}/u.test(value[start - 1])) start -= 1;
    while (end < value.length && /\p{L}/u.test(value[end])) end += 1;
    return { start, end, word: value.slice(start, end) };
  }

  function replaceWord(text, range, replacement) {
    const value = String(text || "");
    return value.slice(0, range.start) + replacement + value.slice(range.end);
  }

  const api = { suggestions, wordRange, replaceWord };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MunkalapSpellcheck = api;
})(typeof window === "undefined" ? globalThis : window);
