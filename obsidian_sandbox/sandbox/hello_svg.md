---
type: data
content_type: svg
description: "A vector illustration of the Forge — a dimly lit forge with a glowing anvil, neon haze, and floating code/equation glyphs. Used as a smoke-test for the svg content_type. The body is real SVG markup (filters, gradients, paths) — the plugin embeds it directly into the output panel."
---

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <filter id="hazeBlur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="20" />
    </filter>
    <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blurred" />
      <feMerge>
        <feMergeNode in="blurred" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="electricEdgeGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blurred" />
      <feMerge>
        <feMergeNode in="blurred" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="artifactGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blurred" />
      <feMerge>
        <feMergeNode in="blurred" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <linearGradient id="skyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#050810" />
      <stop offset="50%" stop-color="#0a1928" />
      <stop offset="100%" stop-color="#1a2f44" />
    </linearGradient>
    <linearGradient id="hazeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ff0080" />
      <stop offset="100%" stop-color="#00d4ff" />
    </linearGradient>
    <linearGradient id="anvilGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1a1a1a" />
      <stop offset="100%" stop-color="#000000" />
    </linearGradient>
    <radialGradient id="wetFloorReflection" cx="500" cy="900" r="150" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ff8c1a" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#ff8c1a" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="lightStreamGradient" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffcc00" stop-opacity="1" />
      <stop offset="100%" stop-color="#ffcc00" stop-opacity="0" />
    </linearGradient>
  </defs>

  <rect width="1024" height="1024" fill="url(#skyGradient)" />

  <rect x="0" y="512" width="1024" height="150" fill="url(#hazeGradient)" opacity="0.15" filter="url(#hazeBlur)" />

  <path d="M0,662 L50,600 L100,662 L150,620 L200,662 L220,640 L260,662 L300,580 L340,662 L380,630 L420,662 L450,610 L480,662 L510,645 L540,662 L570,625 L600,662 L630,605 L660,662 L690,640 L720,662 L750,615 L780,662 L810,635 L840,662 L880,590 L920,662 L960,630 L1024,662 L1024,768 L0,768 Z" fill="#000000" />
  <path d="M100,662 L150,550 L200,662 Z" fill="#000000" />
  <path d="M824,662 L874,550 L924,662 Z" fill="#000000" />
  <rect x="60" y="630" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="120" y="610" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="180" y="640" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="240" y="620" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="300" y="600" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="360" y="610" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="420" y="630" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="480" y="620" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="540" y="640" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="600" y="620" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="660" y="610" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="720" y="630" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="780" y="620" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="840" y="600" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="900" y="610" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="960" y="620" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="150" y="580" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="170" y="590" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="874" y="580" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <rect x="854" y="590" width="1" height="1" fill="#ffcc66" opacity="0.6" />
  <line x1="50" y1="100" x2="52" y2="108" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 50 100)" />
  <line x1="150" y1="200" x2="152" y2="210" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 150 200)" />
  <line x1="250" y1="300" x2="252" y2="312" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 250 300)" />
  <line x1="350" y1="400" x2="352" y2="408" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 350 400)" />
  <line x1="450" y1="500" x2="452" y2="510" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 450 500)" />
  <line x1="550" y1="600" x2="552" y2="612" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 550 600)" />
  <line x1="650" y1="50" x2="652" y2="58" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 650 50)" />
  <line x1="750" y1="150" x2="752" y2="160" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 750 150)" />
  <line x1="850" y1="250" x2="852" y2="262" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 850 250)" />
  <line x1="950" y1="350" x2="952" y2="358" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 950 350)" />
  <line x1="100" y1="450" x2="102" y2="460" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 100 450)" />
  <line x1="200" y1="550" x2="202" y2="562" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 200 550)" />
  <line x1="300" y1="650" x2="302" y2="658" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 300 650)" />
  <line x1="400" y1="100" x2="402" y2="110" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 400 100)" />
  <line x1="500" y1="200" x2="502" y2="212" stroke="#88aabb" stroke-width="0.5" opacity="0.4" transform="rotate(20 500 200)" />
  <rect x="230" y="610" width="12" height="40" fill="#ff0080" opacity="0.7" filter="url(#neonGlow)" />
  <rect x="360" y="600" width="12" height="40" fill="#00d4ff" opacity="0.7" filter="url(#neonGlow)" />
  <rect x="490" y="590" width="12" height="40" fill="#ff8c1a" opacity="0.7" filter="url(#neonGlow)" />
  <rect x="620" y="600" width="12" height="40" fill="#ff0080" opacity="0.7" filter="url(#neonGlow)" />
  <rect x="750" y="610" width="12" height="40" fill="#00d4ff" opacity="0.7" filter="url(#neonGlow)" />
  <rect x="0" y="768" width="1024" height="256" fill="#0a0a0a" />
  <rect x="0" y="768" width="1024" height="256" fill="url(#wetFloorReflection)" />

  <path d="M480,820 L520,820 L540,880 L460,880 Z" fill="#000000" />
  <circle cx="500" cy="810" r="15" fill="#000000" />
  <path d="M490,830 L470,860" fill="#000000" />
  <path d="M510,830 L530,860" fill="#000000" />
  <path d="M400,850 L600,850 L620,950 L380,950 L360,930 L400,850 Z" fill="url(#anvilGradient)" stroke="#00d4ff" stroke-width="1.5" filter="url(#electricEdgeGlow)" />

  <g transform="translate(460, 810) scale(0.8)" filter="url(#artifactGlow)">
    <path d="M50 0 L10 20 L0 60 L30 100 L70 100 L100 60 L90 20 Z" stroke="#ffcc00" stroke-width="1" fill="none" />
    <path d="M10 20 L50 40 L90 20 M0 60 L50 60 L100 60 M30 100 L50 80 L70 100" stroke="#ffcc00" stroke-width="1" fill="none" />
    <path d="M50 0 L50 40 L50 60 L50 80 L50 100" stroke="#ffcc00" stroke-width="1" fill="none" />
    <path d="M10 20 L0 60 L30 100 M90 20 L100 60 L70 100" stroke="#ffcc00" stroke-width="1" fill="none" />
  </g>
  <path d="M500,850 C480,800 450,750 400,700" stroke="url(#lightStreamGradient)" stroke-width="1.5" fill="none" />
  <path d="M500,850 C520,800 550,750 600,700" stroke="url(#lightStreamGradient)" stroke-width="1.5" fill="none" />
  <path d="M500,850 C460,780 400,720 350,650" stroke="url(#lightStreamGradient)" stroke-width="1.25" fill="none" />
  <path d="M500,850 C540,780 600,720 650,650" stroke="url(#lightStreamGradient)" stroke-width="1.25" fill="none" />
  <path d="M500,850 C440,760 350,690 250,600" stroke="url(#lightStreamGradient)" stroke-width="1" fill="none" />
  <path d="M500,850 C560,760 650,690 750,600" stroke="url(#lightStreamGradient)" stroke-width="1" fill="none" />
  <text x="100" y="100" font-family="monospace" font-size="9" fill="#00d4ff" opacity="0.5">compute(x)</text>
  <text x="300" y="150" font-family="monospace" font-size="9" fill="#00d4ff" opacity="0.5">∫f(x)dx</text>
  <text x="500" y="200" font-family="monospace" font-size="9" fill="#00d4ff" opacity="0.5">λ→λ</text>
  <text x="700" y="250" font-family="monospace" font-size="9" fill="#00d4ff" opacity="0.5">forge.snippet</text>
  <text x="900" y="300" font-family="monospace" font-size="9" fill="#00d4ff" opacity="0.5">&gt;&gt;&gt; _</text>
  <text x="150" y="350" font-family="monospace" font-size="9" fill="#00d4ff" opacity="0.5" transform="rotate(5 150 350)">for i in range(n):</text>
  <text x="350" y="400" font-family="monospace" font-size="9" fill="#00d4ff" opacity="0.5" transform="rotate(-5 350 400)">yield data</text>
  <text x="550" y="450" font-family="monospace" font-size="9" fill="#00d4ff" opacity="0.5">connect()</text>
  <text x="750" y="500" font-family="monospace" font-size="9" fill="#00d4ff" opacity="0.5" transform="rotate(3 750 500)">import *</text>
  <text x="512" y="50" font-family="sans-serif" font-weight=" condensed" font-size="14" fill="#ffffff" opacity="0.8" letter-spacing="8" text-anchor="middle">FORGE</text>
</svg>

```
