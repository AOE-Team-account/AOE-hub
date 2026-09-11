import type { LanguageCode } from "@/lib/types";

// Only English and Chinese are supported, but Chinese is offered as two
// separate options (Simplified / Traditional) — three language buttons
// total. Ported from hub-prototype.html's HERO_TEXT.

export interface UiDictionary {
  heroTaglineEyebrow: string;
  heroH1: string; // may contain a <br />
  heroSubhead: string;
  heroSignup: string;
  headerSignup: string;
  heroLogin: string;
  headerLogin: string;
  browsePre: string;
  browseLink: string;
  browsePost: string;
  signupPre: string;
  signupStrong: string;
  heroPullquote: string;
  heroTaglineSmall: string;
}

export const UI_DICTIONARIES: Record<LanguageCode, UiDictionary> = {
  en: {
    heroTaglineEyebrow: "AOEhub (Alpha Omega Education) — for homeschool, unschool, and school families alike",
    heroH1: "Education isn't something you copy.<br />It's something you walk.",
    heroSubhead:
      "A free home for the philosophy, the honest experience, and the curriculum behind education — shared by families who started the walk before you, for families just starting now.",
    heroSignup: "Sign up free",
    headerSignup: "Sign up",
    heroLogin: "Log in",
    headerLogin: "Log in",
    browsePre: "Or just",
    browseLink: "browse the File Board",
    browsePost: " and the Experience Board — no account needed to look around.",
    signupPre: "Want to download a file, post something, or leave a comment?",
    signupStrong: "Sign up or log in — it's free.",
    heroPullquote: '"Education is an atmosphere, a discipline, and a life."',
    heroTaglineSmall:
      "Always free · No ads · No scams · Built by those who've walked this path, are walking it now, and are just starting.",
  },
  "zh-CN": {
    heroTaglineEyebrow: "AOEhub（Alpha Omega Education）— 无论在家自学、非学校教育还是学校教育的家庭都欢迎",
    heroH1: "教育不是用来复制的。<br />它是用来走的路。",
    heroSubhead: "一个免费的家园，分享关于教育的理念、真实的经验和课程 —— 由先走过这条路的家庭分享给刚刚开始的家庭。",
    heroSignup: "免费注册",
    headerSignup: "注册",
    heroLogin: "登录",
    headerLogin: "登录",
    browsePre: "或者直接",
    browseLink: "浏览资源板",
    browsePost: "和经验分享板 —— 无需账号即可查看。",
    signupPre: "想下载文件、发布内容或留言吗？",
    signupStrong: "免费注册或登录。",
    heroPullquote: '"教育是一种氛围、一种纪律、一种生活。"',
    heroTaglineSmall: "永远免费 · 无广告 · 无诈骗 · 由走过这条路、正在走这条路、刚刚开始这条路的人共同建立。",
  },
  "zh-TW": {
    heroTaglineEyebrow: "AOEhub（Alpha Omega Education）— 無論在家自學、非學校教育還是學校教育的家庭都歡迎",
    heroH1: "教育不是用來複製的。<br />它是用來走的路。",
    heroSubhead: "一個免費的家園，分享關於教育的理念、真實的經驗和課程 —— 由先走過這條路的家庭分享給剛剛開始的家庭。",
    heroSignup: "免費註冊",
    headerSignup: "註冊",
    heroLogin: "登入",
    headerLogin: "登入",
    browsePre: "或者直接",
    browseLink: "瀏覽資源板",
    browsePost: "和經驗分享板 —— 無需帳號即可查看。",
    signupPre: "想下載文件、發布內容或留言嗎？",
    signupStrong: "免費註冊或登入。",
    heroPullquote: '"教育是一種氛圍、一種紀律、一種生活。"',
    heroTaglineSmall: "永遠免費 · 無廣告 · 無詐騙 · 由走過這條路、正在走這條路、剛剛開始這條路的人共同建立。",
  },
};

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: "English",
  "zh-CN": "中文（简体）",
  "zh-TW": "中文（繁體）",
};

export const LANGUAGE_ORDER: LanguageCode[] = ["en", "zh-CN", "zh-TW"];
