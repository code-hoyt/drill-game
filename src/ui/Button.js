// Simple pixel button with tap and press-and-hold support (touch friendly).
import { FONT_KEY } from '../systems/PixelFont.js';

export class Button {
  constructor(scene, x, y, w, h, label, opts = {}) {
    this.scene = scene;
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.color = opts.color ?? 0x3a4058;
    this.pressColor = opts.pressColor ?? 0x5a6488;
    this.enabled = true;
    this.visible = true;
    this.dimmed = false; // looks disabled but still receives taps (e.g. locked throttle)
    this.pressed = false;
    this.progress = 0; // 0..1 optional fill bar
    this.pointerId = null;
    this.opts = opts;
    this.depth = opts.depth ?? 50;
    this.gfx = scene.add.graphics().setDepth(this.depth);
    this.text = scene.add.bitmapText(x + w / 2, y + h / 2, FONT_KEY, label, opts.size ?? 6).setOrigin(0.5).setDepth(this.depth + 1);
    this.zone = scene.add.zone(x, y, w, h).setOrigin(0).setInteractive().setDepth(this.depth + 2);
    this.zone.on('pointerdown', (p) => {
      if (!this.enabled) return;
      this.pressed = true; this.pointerId = p.id;
      opts.onDown?.(); opts.onTap?.();
      this.draw();
    });
    const release = (p) => {
      if (!this.pressed || (p && this.pointerId !== null && p.id !== this.pointerId)) return;
      this.pressed = false; this.pointerId = null;
      opts.onUp?.();
      this.draw();
    };
    this.zone.on('pointerup', release);
    this.zone.on('pointerout', release);
    this._release = release;
    this._gameout = () => release();
    scene.input.on('pointerup', release);
    scene.input.on('gameout', this._gameout);
    this.draw();
  }

  setLabel(t) { if (this.text.text !== t) this.text.setText(t); return this; }
  setEnabled(v) {
    if (this.enabled === v) return this;
    this.enabled = v;
    if (!v && this.pressed) { this.pressed = false; this.pointerId = null; this.opts.onUp?.(); }
    this.draw();
    return this;
  }
  setDimmed(v) { if (this.dimmed !== v) { this.dimmed = v; this.draw(); } return this; }
  setProgress(p) { if (Math.abs(p - this.progress) > 0.01) { this.progress = p; this.draw(); } return this; }
  setVisible(v) {
    if (this.visible === v) return this;
    this.visible = v;
    this.gfx.setVisible(v); this.text.setVisible(v);
    v ? this.zone.setInteractive() : this.zone.disableInteractive();
    if (!v && this.pressed) { this.pressed = false; this.pointerId = null; this.opts.onUp?.(); }
    return this;
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.scene.input.off('pointerup', this._release);
    this.scene.input.off('gameout', this._gameout);
    this.gfx.destroy(); this.text.destroy(); this.zone.destroy();
  }

  draw() {
    if (this.dead) return;
    const g = this.gfx, { x, y, w, h } = this;
    g.clear();
    g.fillStyle(0x0b0b10, 1).fillRect(x, y, w, h);
    const off = !this.enabled || this.dimmed;
    g.fillStyle(off ? 0x2a2c36 : this.pressed ? this.pressColor : this.color, 1).fillRect(x + 1, y + 1, w - 2, h - 2);
    if (this.progress > 0) g.fillStyle(0xffd23f, 0.55).fillRect(x + 1, y + 1, Math.round((w - 2) * this.progress), h - 2);
    if (!this.pressed) g.fillStyle(0xffffff, this.enabled ? 0.18 : 0.05).fillRect(x + 1, y + 1, w - 2, 1);
    else g.fillStyle(0x000000, 0.25).fillRect(x + 1, y + 1, w - 2, 1);
    this.text.setTint(off ? 0x6a6c78 : 0xffffff);
    this.text.y = Math.round(y + h / 2 + (this.pressed ? 1 : 0));
  }
}
