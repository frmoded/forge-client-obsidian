---
type: data
content_type: svg
description: hello_svg
---

# English

A small placeholder image evoking the Forge — a hooded smith hammering
sparks at a glowing anvil under floating equations. The original
reference was a raster image (PNG); this body is a hand-drawn SVG
stand-in. Replace the body with a vector-traced version of the source
image when you have one.

# Body

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200">
  <!-- background -->
  <rect width="320" height="200" fill="#0d1726"/>

  <!-- floor -->
  <rect x="0" y="160" width="320" height="40" fill="#1a2336"/>

  <!-- forge glow (right) -->
  <ellipse cx="270" cy="140" rx="36" ry="14" fill="#f59e0b" opacity="0.35"/>
  <rect x="248" y="120" width="44" height="30" rx="2" fill="#1f2a44"/>
  <ellipse cx="270" cy="125" rx="14" ry="6" fill="#fbbf24"/>

  <!-- anvil -->
  <g transform="translate(160 130)">
    <rect x="-30" y="22" width="60" height="14" fill="#3b3b4a"/>
    <polygon points="-44,8 44,8 36,22 -36,22" fill="#4a4a5e"/>
    <rect x="-50" y="0" width="100" height="10" rx="2" fill="#5a5a72"/>
    <!-- glowing schematic on the anvil face -->
    <polygon points="-22,2 22,2 16,8 -16,8" fill="#facc15" opacity="0.55"/>
  </g>

  <!-- hammer -->
  <g transform="translate(160 80) rotate(-25)">
    <rect x="-2" y="0" width="4" height="38" fill="#7c5a3a"/>
    <rect x="-12" y="-8" width="24" height="14" rx="2" fill="#9ca3af"/>
  </g>

  <!-- smith (silhouette) -->
  <g fill="#0a1020" stroke="#0a1020">
    <ellipse cx="160" cy="60" rx="14" ry="16"/>
    <path d="M 138 78 Q 160 70 182 78 L 188 130 Q 160 138 132 130 Z"/>
  </g>

  <!-- sparks -->
  <g fill="#fbbf24">
    <circle cx="180" cy="120" r="1.6"/>
    <circle cx="190" cy="112" r="1.2"/>
    <circle cx="200" cy="124" r="1.6"/>
    <circle cx="146" cy="116" r="1.2"/>
    <circle cx="138" cy="124" r="1.6"/>
    <circle cx="172" cy="108" r="1.2"/>
  </g>

  <!-- floating glyphs (approximation of the equations / code in the source) -->
  <g font-family="serif" fill="#7dd3fc" opacity="0.75" font-size="11">
    <text x="22"  y="40">∫f(x)e^(-2πiξx) dx</text>
    <text x="240" y="40">def light(axis):</text>
    <text x="22"  y="84">E = mc²</text>
    <text x="240" y="84">return linear(grid)</text>
  </g>
</svg>
```
