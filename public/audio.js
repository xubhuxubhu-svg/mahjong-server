// 音效與背景音樂（全部由程式即時合成，不需音樂檔）
(function (root) {
  let ctx = null, sfxGain = null, musicGain = null, noiseBuf = null;

  let unlock = function () {
    try {
      if (!ctx) {
        ctx = new (root.AudioContext || root.webkitAudioContext)();
        sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(ctx.destination);
        musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(ctx.destination);
        const len = ctx.sampleRate;
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      Music._kick();
    } catch (e) { }
  };

  function osc(dest, type, freq, t, dur, vol, endFreq) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dest, t, dur, vol, ftype, freq, q) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = ftype || 'bandpass'; f.frequency.value = freq || 2000; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // 音效
  function play(kind, opt) {
    if (!ctx) return;
    try {
      const t = ctx.currentTime, D = sfxGain;
      switch (kind) {
        case 'tile': // 別人敲牌
          noise(D, t, 0.05, 0.5, 'bandpass', 2600, 2.5);
          osc(D, 'sine', 1700, t, 0.05, 0.12, 900);
          break;
        case 'slam': // 自己甩牌：清脆＋桌面低沉一震
          noise(D, t, 0.07, 0.8, 'bandpass', 2400, 2);
          osc(D, 'sine', 2100, t, 0.06, 0.18, 1000);
          osc(D, 'sine', 110, t, 0.18, 0.5, 45);
          break;
        case 'tick':
          osc(D, 'sine', (opt && opt.freq) || 1300, t, 0.05, 0.07);
          break;
        case 'rub': // 瞇牌摩擦
          noise(D, t, 0.06, 0.12, 'highpass', 3000, 0.7);
          break;
        case 'claim':
          osc(D, 'triangle', 500, t, 0.22, 0.25, 820);
          noise(D, t, 0.06, 0.4, 'bandpass', 2400, 2);
          break;
        case 'win':
          [523, 659, 784, 1046, 1318].forEach((f, i) => osc(D, 'triangle', f, t + i * 0.1, 0.5, 0.2));
          break;
        case 'thunder': // 報聽雷聲
          noise(D, t, 1.4, 0.9, 'lowpass', 380, 0.8);
          noise(D, t + 0.05, 0.25, 0.6, 'bandpass', 1800, 0.6);
          osc(D, 'sawtooth', 70, t, 0.9, 0.15, 35);
          break;
        case 'boom': // 大台數、瞇到胡牌
          osc(D, 'sine', 140, t, 0.6, 0.7, 38);
          noise(D, t, 0.4, 0.5, 'lowpass', 900, 0.8);
          break;
        case 'flip':
          noise(D, t, 0.04, 0.4, 'bandpass', 3200, 3);
          break;
        case 'bell': // 中馬
          osc(D, 'sine', 1318, t, 0.8, 0.25); osc(D, 'sine', 1976, t, 0.6, 0.12);
          break;
        case 'rise': { // 台數跳字，音高逐步上升
          const f = 440 * Math.pow(2, ((opt && opt.step) || 0) / 12 * 2);
          osc(D, 'square', f, t, 0.09, 0.08); osc(D, 'triangle', f * 2, t, 0.12, 0.06);
          break;
        }
        case 'stamp': // 總台數蓋章
          osc(D, 'sine', 90, t, 0.35, 0.8, 40); noise(D, t, 0.12, 0.7, 'lowpass', 1500, 1);
          [784, 988, 1175, 1568].forEach((f, i) => osc(D, 'triangle', f, t + 0.08 + i * 0.07, 0.45, 0.14));
          break;
        case 'xiang': // 相公
          osc(D, 'sawtooth', 300, t, 0.5, 0.2, 120);
          osc(D, 'square', 200, t + 0.15, 0.4, 0.1, 90);
          break;
        case 'pop':
          osc(D, 'sine', 900, t, 0.08, 0.1, 1400);
          break;
      }
    } catch (e) { }
  }

  // ---------- 背景音樂：平常、緊張、熱血三段 ----------
  const Music = {
    on: false, level: 0, vol: 0.13, step: 0, next: 0, timer: null, pattern: null, bar: 0,
    setOn(b) { this.on = b; this._kick(); },
    setLevel(l) { if (l !== this.level) { this.level = l; this.pattern = null; } },
    _kick() {
      if (!ctx) return;
      const target = this.on ? this.vol : 0;
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.8);
      if (this.on && !this.timer) {
        this.next = ctx.currentTime + 0.1;
        this.timer = setInterval(() => this._schedule(), 60);
      }
    },
    _schedule() {
      if (!ctx) return;
      if (!this.on && musicGain.gain.value < 0.001) { clearInterval(this.timer); this.timer = null; return; }
      const tempo = [78, 104, 140][this.level];
      const eighth = 60 / tempo / 2;
      while (this.next < ctx.currentTime + 0.25) {
        this._play(this.step, this.next, eighth);
        this.next += eighth;
        this.step++;
      }
    },
    _freq(root, scale, deg) {
      const o = Math.floor(deg / scale.length);
      const n = scale[((deg % scale.length) + scale.length) % scale.length];
      return root * Math.pow(2, (n + 12 * o) / 12);
    },
    _newPattern() {
      // 每兩小節產生一段旋律，隨機漫步在五聲音階上
      const len = 16, p = [];
      let d = 5 + Math.floor(Math.random() * 3);
      const rest = [0.45, 0.35, 0.15][this.level];
      for (let i = 0; i < len; i++) {
        if (Math.random() < rest && i % 4 !== 0) { p.push(null); continue; }
        d += [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
        d = Math.max(2, Math.min(11, d));
        p.push(d);
      }
      this.pattern = p;
    },
    _pluck(f, t, vol, dur) { // 類似古箏撥弦
      osc(musicGain, 'triangle', f, t, dur, vol);
      osc(musicGain, 'sine', f * 2, t, dur * 0.6, vol * 0.35);
    },
    _play(step, t, e) {
      const lvl = this.level;
      const i = step % 16;
      if (i === 0 || !this.pattern) { this._newPattern(); this.bar++; }
      const M = musicGain;
      if (lvl === 0) {
        // 平常：宮調五聲，悠閒撥弦＋低音持續
        const root = 261.63, sc = [0, 2, 4, 7, 9];
        if (i === 0 || i === 8) osc(M, 'sine', root / 4 * (i === 8 ? 1.5 : 1), t, e * 8, 0.35);
        const d = this.pattern[i];
        if (d != null && i % 2 === 0) this._pluck(this._freq(root, sc, d), t, 0.28, e * 3);
      } else if (lvl === 1) {
        // 緊張：羽調小調，心跳般低音、木魚
        const root = 220, sc = [0, 3, 5, 7, 10];
        if (i % 4 === 0) { osc(M, 'sine', 55, t, e * 1.5, 0.6, 50); }
        if (i % 4 === 1) { osc(M, 'sine', 55, t, e * 1.2, 0.35, 50); }
        if (i % 2 === 1) noise(M, t, 0.04, 0.25, 'bandpass', 1200, 4);
        const d = this.pattern[i];
        if (d != null && i % 2 === 0) this._pluck(this._freq(root, sc, d - 2), t, 0.22, e * 2.5);
        if (i === 0 && this.bar % 2 === 0) osc(M, 'sawtooth', 110, t, e * 16, 0.05);
      } else {
        // 熱血：快節奏鼓、低音跑動、鑼
        const root = 293.66, sc = [0, 2, 5, 7, 9];
        if (i % 4 === 0) osc(M, 'sine', 120, t, 0.18, 0.9, 40);
        if (i % 8 === 4) noise(M, t, 0.14, 0.6, 'bandpass', 1800, 0.8);
        noise(M, t, 0.03, 0.18, 'highpass', 7000, 0.7);
        const bass = [0, 0, 3, 0, 4, 0, 3, 2][i % 8];
        osc(M, 'square', this._freq(root / 4, sc, bass), t, e * 0.9, 0.16);
        const d = this.pattern[i];
        if (d != null) this._pluck(this._freq(root, sc, d), t, 0.22, e * 1.8);
        if (i === 0 && this.bar % 4 === 1) { osc(M, 'sine', 98, t, 2.5, 0.4, 90); noise(M, t, 2, 0.25, 'bandpass', 600, 1.5); }
      }
    },
  };

  // ---------- 背景音樂檔：大廳循環、牌桌隨機輪播 ----------
  const BGM = {
    base: 'music/',
    lobby: 'lobby.mp3',
    play: ['play1.mp3', 'play2.mp3', 'play3.mp3'],
    on: true, mode: null, el: null, gain: null, vol: 0.55, ducked: false, last: null, fadeT: null,
    _ensureEl() {
      if (this.el) return;
      const el = new Audio();
      el.preload = 'auto';
      el.addEventListener('ended', () => { if (this.mode === 'play') this._next(); });
      this.el = el;
      // 經過音效系統，iPhone 才能調音量
      try {
        const same = new URL(this.base, location.href).origin === location.origin;
        if (ctx && !this.gain && same) {
          const src = ctx.createMediaElementSource(el);
          this.gain = ctx.createGain();
          this.gain.gain.value = 0;
          src.connect(this.gain); this.gain.connect(ctx.destination);
        }
      } catch (e) { this.gain = null; }
    },
    _target() { return this.on && this.mode ? (this.ducked ? this.vol * 0.25 : this.vol) : 0; },
    _applyVol(ms) {
      const target = this._target();
      if (this.gain && ctx) {
        const g = this.gain.gain;
        g.cancelScheduledValues(ctx.currentTime);
        g.setValueAtTime(g.value, ctx.currentTime);
        g.linearRampToValueAtTime(target, ctx.currentTime + (ms || 600) / 1000);
        this.el.volume = 1;
      } else if (this.el) {
        clearInterval(this.fadeT);
        const from = this.el.volume, steps = 12;
        let i = 0;
        this.fadeT = setInterval(() => { i++; this.el.volume = Math.max(0, Math.min(1, from + (target - from) * i / steps)); if (i >= steps) clearInterval(this.fadeT); }, (ms || 600) / steps);
      }
    },
    _load(file, loop) {
      this._ensureEl();
      this.el.loop = !!loop;
      this.el.src = this.base + file;
      this.last = file;
      const pr = this.el.play();
      if (pr && pr.catch) pr.catch(() => { });
      this._applyVol(900);
    },
    _next() {
      const list = this.play.filter(f => f !== this.last);
      this._load(list[Math.floor(Math.random() * list.length)], false);
    },
    // mode：'lobby' 大廳、'play' 牌桌、null 停止
    setMode(m) {
      if (m === this.mode) return;
      this.mode = m;
      if (!ctx) return; // 等使用者第一次點畫面後才開始
      if (!m) { this._applyVol(500); return; }
      if (m === 'lobby') this._load(this.lobby, true);
      else this._next();
    },
    setOn(b) {
      this.on = b;
      if (!ctx) return;
      if (b && this.mode && (!this.el || this.el.paused)) { const m = this.mode; this.mode = null; this.setMode(m); return; }
      this._applyVol(500);
    },
    duck(b) { if (this.ducked !== b) { this.ducked = b; if (ctx) this._applyVol(1200); } },
    _resume() { if (this.mode && (!this.el || this.el.paused || !this.el.src)) { const m = this.mode; this.mode = null; this.setMode(m); } },
  };
  const _unlock0 = unlock;
  unlock = function () { const first = !ctx; _unlock0(); if (ctx && first) BGM._resume(); else if (ctx) BGM._resume(); };

  root.MJAudio = { unlock: () => unlock(), play, music: Music, bgm: BGM, get ready() { return !!ctx; } };
})(typeof self !== 'undefined' ? self : this);
