export function playSuccessChime() {
  try {
    const AudioContextClass = window.AudioContext;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = frequency;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, now + index * 0.09);
      gain.gain.linearRampToValueAtTime(0.12, now + index * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.09 + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + index * 0.09);
      osc.stop(now + index * 0.09 + 0.52);
    });
  } catch {
    // 现场设备禁用音频时，不影响主流程。
  }
}
