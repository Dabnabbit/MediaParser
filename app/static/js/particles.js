/**
 * ParticleEffects — reusable canvas-based particle system.
 *
 * Usage:
 *   window.particles.confetti(el)    // spinning rectangles
 *   window.particles.fireworks(el)   // radial burst with trails
 *   window.particles.burst(el)       // random pick
 *
 * Each call creates a short-lived fullscreen canvas overlay,
 * runs physics via requestAnimationFrame, then cleans itself up.
 */
class ParticleEffects {
    constructor() {
        this.defaults = {
            colors: ['#ef4444', '#f59e0b', '#fbbf24', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#fff'],
        };
    }

    // ── Public API ─────────────────────────────────────────

    /** Spinning confetti rectangles bursting from el */
    confetti(el, opts = {}) {
        const { cx, cy } = this._center(el);
        const colors = opts.colors || this.defaults.colors;
        const count = opts.count || 32;

        const particles = [];
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.6;
            const speed = 80 + Math.random() * 120;
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 180,
                w: 3 + Math.random() * 5,
                h: 6 + Math.random() * 8,
                color: colors[Math.floor(Math.random() * colors.length)],
                opacity: 1,
                spin: 0,
                spinRate: (Math.random() - 0.5) * 720,
                shape: 'rect',
            });
        }

        this._animate(particles, {
            gravity: 500,
            fadeRate: 0.7,
            drag: 0.5,
            trailLen: 0,
        });
    }

    /** Radial firework burst with glowing trails from el */
    fireworks(el, opts = {}) {
        const { cx, cy } = this._center(el);
        const colors = opts.colors || this.defaults.colors;
        const count = opts.count || 36;

        // Pick 2-3 shell colors for cohesion
        const shellColors = [];
        for (let c = 0; c < 2 + Math.floor(Math.random() * 2); c++)
            shellColors.push(colors[Math.floor(Math.random() * colors.length)]);

        const particles = [];
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.3;
            const speed = 100 + Math.random() * 80;
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 160,
                size: 3 + Math.random() * 3,
                color: shellColors[Math.floor(Math.random() * shellColors.length)],
                opacity: 1,
                spin: 0,
                spinRate: 0,
                shape: 'circle',
            });
        }

        this._animate(particles, {
            gravity: 200,
            fadeRate: 0.5,
            drag: 0.8,
            trailLen: 16,
        });
    }

    /** Random pick between confetti and fireworks */
    burst(el, opts = {}) {
        if (Math.random() < 0.5) {
            this.confetti(el, opts);
        } else {
            this.fireworks(el, opts);
        }
    }

    // ── Internals ──────────────────────────────────────────

    /** Get center point of an element */
    _center(el) {
        const rect = el.getBoundingClientRect();
        return {
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
        };
    }

    /** Create a fullscreen canvas overlay */
    _createCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10000;';
        document.body.appendChild(canvas);
        return canvas;
    }

    /** Run the physics + render loop for a set of particles */
    _animate(particles, { gravity, fadeRate, drag, trailLen }) {
        const canvas = this._createCanvas();
        const ctx = canvas.getContext('2d');

        let last = performance.now();
        const tick = (now) => {
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;

            // Update physics
            let alive = false;
            for (const p of particles) {
                if (p.opacity <= 0) continue;
                p.vy += gravity * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.spin += p.spinRate * dt;
                p.opacity -= dt * fadeRate;
                p.vx *= (1 - dt * drag);
                p.vy *= (1 - dt * drag * 0.3);
                if (p.opacity > 0) {
                    alive = true;
                    if (trailLen) {
                        if (!p.trail) p.trail = [];
                        p.trail.push({ x: p.x, y: p.y });
                        if (p.trail.length > trailLen) p.trail.shift();
                    }
                }
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw trails (behind particles)
            if (trailLen) {
                for (const p of particles) {
                    if (p.opacity <= 0 || !p.trail) continue;
                    for (let t = 0; t < p.trail.length; t++) {
                        const frac = (t + 1) / p.trail.length;
                        ctx.globalAlpha = p.opacity * frac * 0.6;
                        ctx.fillStyle = p.color;
                        ctx.beginPath();
                        ctx.arc(p.trail[t].x, p.trail[t].y, p.size * (0.3 + frac * 0.7), 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            // Draw particles
            for (const p of particles) {
                if (p.opacity <= 0) continue;
                ctx.save();
                ctx.globalAlpha = p.opacity;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.spin * Math.PI / 180);

                if (p.shape === 'circle') {
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                    ctx.fillStyle = p.color;
                    ctx.fill();
                } else {
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                }
                ctx.restore();
            }

            if (alive) {
                requestAnimationFrame(tick);
            } else {
                canvas.remove();
            }
        };
        requestAnimationFrame(tick);
    }
}

window.particles = new ParticleEffects();
