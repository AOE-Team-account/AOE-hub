export function Logo() {
  return (
    <svg className="logo-mark" width="110" height="92" viewBox="0 0 120 100" fill="none">
      <path
        className="logo-book"
        d="M6,88 Q30,74 60,86 Q90,74 114,88 L114,94 Q90,82 60,92 Q30,82 6,94 Z"
        fill="var(--card)"
        stroke="var(--text)"
        strokeWidth="2"
      />
      <path
        className="logo-tree-l"
        d="M8,46 C6,38 12,30 20,31 C21,23 30,19 37,24 C43,18 53,21 54,29 C61,28 66,35 63,42 C67,46 64,53 58,53 L14,53 C7,53 4,50 8,46 Z"
        fill="var(--text)"
      />
      <rect className="logo-tree-l" x="33" y="52" width="4" height="34" fill="var(--text)" />
      <path
        className="logo-tree-r"
        d="M112,46 C114,38 108,30 100,31 C99,23 90,19 83,24 C77,18 67,21 66,29 C59,28 54,35 57,42 C53,46 56,53 62,53 L106,53 C113,53 116,50 112,46 Z"
        fill="var(--text)"
      />
      <rect className="logo-tree-r" x="83" y="52" width="4" height="34" fill="var(--text)" />
      <path className="stem" d="M60,86 L60,54" stroke="#3F6B4F" strokeWidth="2.5" strokeLinecap="round" />
      <path className="leaf leaf-l" d="M60,60c-6-1.5-9-7.5-7.5-12 6,0.5 9,6 7.5,12z" fill="#5C8B6C" />
      <path className="leaf leaf-r" d="M60,56c6-1.5 9-7 7.5-11.5-6,0.5-9,6-7.5,11.5z" fill="#6FA37E" />
    </svg>
  );
}
