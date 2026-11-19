(() => {
  'use strict';

  const trackStart = 26.5;
  const context = new AudioContext();

  function resumeMusic() {
    if (context.state === 'running') return;
    context.resume().catch(() => {});
  }

  async function loadTrack() {
    try {
      const response = await fetch('Theme%20of%20Mitsuha.mp3');
      if (!response.ok) throw new Error(`Soundtrack request failed (${response.status})`);
      return await context.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      console.warn('Unable to load the soundtrack.', error);
    }
  }

  const bufferReady = loadTrack();
  window.addEventListener('bouquet-start', async () => {
    // Resume while the click's activation is still available.
    resumeMusic();
    const buffer = await bufferReady;
    if (!buffer || buffer.duration <= trackStart) return;

    const track = context.createBufferSource();
    track.buffer = buffer;
    track.loop = true;
    track.loopStart = trackStart;
    track.connect(context.destination);
    track.start(0, trackStart);

    window.addEventListener('pageshow', resumeMusic);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) resumeMusic();
    });
  }, { once: true });
})();
