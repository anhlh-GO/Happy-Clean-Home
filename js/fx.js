// Lightweight particles standing in for the Unity ParticleSystems (Effect_water, Effect_grass, Effect_star, vfx_hint).
'use strict';

class FX {
  constructor() {
    this.parts = [];
    this.node = new E.Node({ n: 'FX', r: [0, 0, 1, 1, 0, 0, 0, 0, 0.5, 0.5] });
    this.node.customDraw = (ctx, alpha) => this.draw(ctx, alpha);
  }
  stopEmitters() {}
  spawn(o) { if (this.parts.length < 700) this.parts.push(Object.assign({ t: 0, life: 1, vx: 0, vy: 0, g: 0, s0: 1, s1: 1, a0: 1, a1: 0, rot: 0, vr: 0, blend: 'source-over' }, o)); }
  emit(kind, node) {
    const [x, y] = node.worldPos();
    const R = Math.random;
    if (kind === 'water') {
      for (let i = 0; i < 3; i++) this.spawn({ img: R() < 0.5 ? 'Eff_UI_water_010' : 'Eff_UI_water_033', x: x + (R() - 0.5) * 30, y: y + (R() - 0.5) * 30, vx: (R() - 0.5) * 360, vy: 80 + R() * 260, g: -1300, life: 0.45 + R() * 0.3, size: 30 + R() * 30, s1: 0.5, a0: 0.9 });
      if (R() < 0.4) this.spawn({ img: 'Eff_UI_smoke_001', x, y, vx: (R() - 0.5) * 60, vy: 40, life: 0.6, size: 90, s0: 0.6, s1: 1.4, a0: 0.35 });
    } else if (kind === 'spray') {
      for (let i = 0; i < 2; i++) this.spawn({ img: 'Eff_UI_smoke_001', x: x + (R() - 0.5) * 20, y: y + (R() - 0.5) * 20, vx: (R() - 0.5) * 120, vy: (R() - 0.5) * 120, life: 0.6 + R() * 0.3, size: 80 + R() * 40, s0: 0.4, s1: 1.5, a0: 0.45 });
    } else if (kind === 'grass' || kind === 'dust') {
      if (R() < 0.6) this.spawn({ img: kind === 'grass' ? 'Eff_UI_Object_004' : 'Eff_UI_Object_003', x: x + (R() - 0.5) * 40, y, vx: (R() - 0.5) * 300, vy: 120 + R() * 200, g: -1100, life: 0.5 + R() * 0.3, size: 26 + R() * 20, vr: (R() - 0.5) * 12, a0: 1 });
    }
  }
  starBurst(x, y) {
    const R = Math.random;
    for (let i = 0; i < 26; i++) {
      const a = R() * Math.PI * 2, sp = 300 + R() * 650;
      this.spawn({ img: R() < 0.5 ? 'T_Star_019' : '25_spark_01', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: -500, life: 1.0 + R() * 0.6, size: 50 + R() * 60, vr: (R() - 0.5) * 6, s1: 0.3, a0: 1, blend: 'lighter' });
    }
    this.spawn({ img: 'T_Glow_021', x, y, life: 0.7, size: 900, s0: 0.3, s1: 1.2, a0: 0.9, blend: 'lighter' });
    this.spawn({ img: 'Flare_005', x, y, life: 0.8, size: 700, s0: 0.2, s1: 1.4, a0: 0.8, blend: 'lighter', vr: 1 });
  }
  sparkleAt(x, y) {
    this.spawn({ img: '25_spark_01', x, y, life: 0.5 + Math.random() * 0.3, size: 40 + Math.random() * 40, s0: 0.3, s1: 1, a0: 1, blend: 'lighter', vr: 3 });
  }
  hint(node) {
    if (Math.random() > 0.08) return;
    const c = node.rectWorldCenter();
    const w = node.w * 0.4, h = node.h * 0.4;
    this.spawn({ img: '25_spark_01', x: c[0] + (Math.random() - 0.5) * w, y: c[1] + (Math.random() - 0.5) * h, life: 0.9, size: 46, s0: 0.2, s1: 1, a0: 0.9, blend: 'lighter', vr: 2 });
  }
  update(dt) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.t += dt;
      if (p.t >= p.life) { ps.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }
  draw(ctx, alpha) {
    const v = E.view;
    for (const p of this.parts) {
      const im = E.img[p.img];
      if (!im) continue;
      const k = p.t / p.life;
      const s = (p.s0 + (p.s1 - p.s0) * k) * p.size;
      ctx.setTransform(v[0], v[1], v[2], v[3], v[4], v[5]);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, -1);
      ctx.globalAlpha = alpha * (p.a0 + (p.a1 - p.a0) * k);
      ctx.globalCompositeOperation = p.blend;
      const ar = im.height / im.width;
      ctx.drawImage(im, -s / 2, (-s * ar) / 2, s, s * ar);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
window.FX = FX;
