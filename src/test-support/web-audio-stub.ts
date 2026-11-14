// 2026-11-13-1214-1 - a Web Audio stand-in for the gadget page tests (happy-dom has none). It knows every node the gadgets' piano voice makes (oscillators, gains with their automation, biquad filters, a noise buffer source, a compressor bus) and records ONE entry
// per NOTE in `osc`: the frequency of the first oscillator of each note (string 1, partial 1 = the pitch the gadget asked for). `all` holds every oscillator started, `nodes` counts what was made.
export interface AudioStub { Ctx: new () => any; osc: number[]; all: number[]; nodes: Record<string, number> }
export function audioStub(): AudioStub {
  const osc: number[] = [], all: number[] = [], nodes: Record<string, number> = { oscillator: 0, gain: 0, biquad: 0, bufferSource: 0, compressor: 0 };
  let onset = false;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  class Ctx {
    currentTime = 0; state = 'running'; destination = {}; sampleRate = 44100;
    createPeriodicWave() { return {}; }
    createGain() { nodes.gain++; return { gain: param(), connect() {} }; }
    createBiquadFilter() { nodes.biquad++; onset = true; return { type: '', frequency: param(), Q: param(), connect() {} }; }
    createBuffer(_c: number, n: number) { return { getChannelData: () => new Float32Array(n) }; }
    createBufferSource() { nodes.bufferSource++; return { buffer: null, connect() {}, start() {}, stop() {} }; }
    createDynamicsCompressor() { nodes.compressor++; return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect() {} }; }
    createOscillator() {
      nodes.oscillator++;
      const mine = onset; onset = false;
      const o = { type: '', frequency: { value: 0 }, setPeriodicWave() {}, connect() {}, start() { all.push(o.frequency.value); if (mine) osc.push(o.frequency.value); }, stop() {} };
      return o;
    }
    resume() {}
  }
  return { Ctx, osc, all, nodes };
}
