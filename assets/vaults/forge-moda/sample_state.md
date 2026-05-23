---
type: data
content_type: json
read_only: true
description: Sample initial ParticleState for go's snapshot-default fallback. 20 water particles + 5 ink particles in an 800x600 chamber at tick 0.
---

# English

A known starting ParticleState used by go as the fallback when no prior snapshot exists. Roughly 20 water particles and 5 ink particles randomly distributed in an 800x600 chamber, tick=0, all at medium speed. Intended for /compute go preview/exploration; not used by the live `/moda/init` path.

# Body

```json
{"__dataclass__": "forge.moda.types.ParticleState", "fields": {"tick": 0, "ids": {"__ndarray__": true, "dtype": "int64", "shape": [25], "data": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]}, "types": {"__ndarray__": true, "dtype": "object", "shape": [25], "data": ["water", "water", "water", "water", "water", "water", "water", "water", "water", "water", "water", "water", "water", "water", "water", "water", "water", "water", "water", "water", "ink", "ink", "ink", "ink", "ink"]}, "xs": {"__ndarray__": true, "dtype": "float64", "shape": [25], "data": [500.08, 717.77, 620.55, 180.17, 240.13, 698.84, 4.21, 656.98, 637.66, 374.35, 242.43, 222.74, 203.9, 356.06, 403.64, 442.8, 796.4, 634.13, 497.74, 791.17, 172.25, 128.17, 490.03, 35.15, 28.54]}, "ys": {"__ndarray__": true, "dtype": "float64", "shape": [25], "data": [308.93, 279.72, 550.3, 377.54, 308.47, 298.12, 148.51, 7.08, 115.44, 415.22, 120.36, 221.72, 2.24, 498.03, 92.68, 160.56, 528.2, 305.87, 508.29, 383.83, 445.06, 54.9, 324.69, 304.66, 522.8]}, "headings": {"__ndarray__": true, "dtype": "float64", "shape": [25], "data": [2.2699, 3.7585, 0.3723, 2.4356, 2.0297, 0.9437, 5.1292, 2.3841, 6.1497, 3.707, 3.8017, 4.0087, 4.2503, 0.9474, 2.7666, 1.5052, 2.529, 0.6076, 6.081, 1.3509, 4.2208, 1.8876, 5.492, 4.1608, 0.827]}, "speeds": {"__ndarray__": true, "dtype": "float64", "shape": [25], "data": [50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0]}, "masses": {"__ndarray__": true, "dtype": "object", "shape": [25], "data": ["medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium", "medium"]}, "width": 800.0, "height": 600.0}}
```
