Now the math. Two tones close in frequency don't just sound rough together — their combined waveform has a predictable, provable shape: a fast oscillation whose *amplitude itself* rises and falls. That slow rise-and-fall is a **beat**, and it falls straight out of one trig identity.

## The identity

For any angle α and offset δ:

$$\sin(\alpha) + \sin(\alpha + \delta) = 2\cos\left(\frac{\delta}{2}\right)\sin\left(\alpha + \frac{\delta}{2}\right)$$

Two sines added together become a *product* instead: a sine (the fast part) scaled by a cosine (the slow part). That's the entire mechanism behind beats.

## Applying it to two tones

Let the two tones be $\sin(2\pi f_1 t)$ and $\sin(2\pi f_2 t)$. Set $\alpha = 2\pi f_1 t$ and $\delta = 2\pi(f_2 - f_1)t$ — the phase gap between them, growing with time. Substituting into the identity above:

$$\sin(2\pi f_1 t) + \sin(2\pi f_2 t) = \underbrace{2\cos(\pi \Delta f\, t)}_{\text{envelope}} \cdot \underbrace{\sin(2\pi f_{avg}\, t)}_{\text{carrier}}$$

where $\Delta f = f_2 - f_1$ and $f_{avg} = (f_1 + f_2)/2$. The carrier oscillates at the fast, audible average frequency; the envelope oscillates at the much slower difference frequency $\Delta f$ — that's the beat. Perceived loudness follows $|\cos|$, so the ear hears the amplitude swell and fade $\Delta f$ times per second.

## [[ugly|C4 and D♭4]], worked out

$f_1 = 261.63$ Hz (C4), $f_2 = 277.18$ Hz (D♭4), so $\Delta f \approx 15.55$ Hz — a beat roughly every 64 ms, fast enough to hear as roughness rather than distinct pulses. The combined signal, envelope and all:

![[notes/resources/images/ugly_combined.svg]]

That pulsing envelope is exactly $2\cos(\pi \Delta f\, t)$ from the derivation above — not an approximation, the literal closed-form shape of the sum.
