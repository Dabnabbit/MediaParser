/**
 * ParticleEffects — reusable canvas-based particle system.
 *
 * Usage:
 *   window.particles.confetti(el)    // spinning rectangles
 *   window.particles.fireworks(el)   // radial burst with trails
 *   window.particles.fart(el)        // noxious gas cloud
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
                size: 1.5 + Math.random() * 2,
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
            trailLen: 28,
        });
    }

    /** Noxious gas cloud puffing out from el */
    fart(el, opts = {}) {
        const { cx, cy } = this._center(el);
        const count = opts.count || 18;
        // Greens are wispy/transparent, browns are denser/opaque
        const palette = opts.colors || [
            { color: '#4ade80', peak: 0.4,  solid: 0,    scale: 1.5 },
            { color: '#22c55e', peak: 0.4,  solid: 0,    scale: 1.5 },
            { color: '#a3e635', peak: 0.35, solid: 0,    scale: 1.4 },
            { color: '#bbf7d0', peak: 0.3,  solid: 0,    scale: 1.6 },
            { color: '#65a30d', peak: 0.45, solid: 0.15, scale: 1.3 },
            { color: '#8b7d3c', peak: 0.7,  solid: 0.6,  scale: 1 },
            { color: '#7c6f3e', peak: 0.65, solid: 0.55, scale: 1 },
            { color: '#6b7220', peak: 0.6,  solid: 0.45, scale: 1 },
            { color: '#9a8c5a', peak: 0.65, solid: 0.55, scale: 1 },
            { color: '#5c5a2e', peak: 0.7,  solid: 0.6,  scale: 1 },
        ];

        const canvas = this._createCanvas();
        const ctx = canvas.getContext('2d');

        // Heavy gas puffs — spread wide, sink to floor
        const puffs = [];
        for (let i = 0; i < count; i++) {
            const delay = Math.random() * 0.5;
            const side = Math.random() < 0.5 ? -1 : 1;
            const speed = 20 + Math.random() * 40;
            const pick = palette[Math.floor(Math.random() * palette.length)];
            puffs.push({
                x: cx + (Math.random() - 0.5) * 16,
                y: cy + Math.random() * 6,
                vx: side * speed,
                vy: -4 + Math.random() * 6,                // barely any vertical — drift level
                radius: (8 + Math.random() * 10) * pick.scale,
                maxRadius: (30 + Math.random() * 40) * pick.scale,
                color: pick.color,
                peak: pick.peak,
                solid: pick.solid,
                opacity: 0,
                phase: Math.random() * Math.PI * 2,
                delay,
                age: -delay,
            });
        }

        // A few small wisps that escape upward (always faint greens)
        const wisps = [];
        for (let i = 0; i < 4; i++) {
            const delay = Math.random() * 0.3;
            const wispColors = ['#4ade80', '#a3e635', '#bbf7d0'];
            wisps.push({
                x: cx + (Math.random() - 0.5) * 20,
                y: cy,
                vx: (Math.random() - 0.5) * 25,
                vy: -(8 + Math.random() * 12),
                radius: 4 + Math.random() * 6,
                maxRadius: 12 + Math.random() * 10,
                color: wispColors[Math.floor(Math.random() * wispColors.length)],
                peak: 0.15,
                solid: 0,
                opacity: 0,
                phase: Math.random() * Math.PI * 2,
                delay,
                age: -delay,
            });
        }

        // Stink-line squiggles rising from the cloud
        const stinkLines = [];
        for (let i = 0; i < 5; i++) {
            stinkLines.push({
                x: cx + (Math.random() - 0.5) * 50,
                y: cy,
                opacity: 0,
                delay: 0.3 + Math.random() * 0.6,
                age: -(0.3 + Math.random() * 0.6),
                speed: 15 + Math.random() * 20,
                wobble: (Math.random() - 0.5) * 30,
                height: 12 + Math.random() * 18,
            });
        }

        let last = performance.now();
        const tick = (now) => {
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            let alive = false;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Update + draw all cloud particles (puffs + wisps)
            const allClouds = [...puffs, ...wisps];
            for (const p of allClouds) {
                p.age += dt;
                if (p.age < 0) { alive = true; continue; }

                // Fade in to per-particle peak, fade out slowly
                const peak = p.peak || 0.4;
                if (p.age < 0.15) {
                    p.opacity = p.age / 0.15 * peak;
                } else {
                    p.opacity -= dt * 0.25;
                }

                if (p.opacity <= 0 && p.age > 0.15) continue;
                alive = true;

                // Turbulent spiral — each puff orbits its own path
                const swirl = 25;
                const freq = 5 + (p.phase % 3);           // varied spin speeds
                p.x += p.vx * dt + Math.sin(p.age * freq + p.phase) * swirl * dt;
                p.y += p.vy * dt + Math.cos(p.age * freq + p.phase) * swirl * 0.6 * dt;
                p.vy += 8 * dt; // very light gravity — gas hangs in the air
                // Horizontal velocity decays (gas settles)
                p.vx *= (1 - dt * 1.2);

                // Expand
                p.radius = Math.min(p.radius + dt * 40, p.maxRadius);

                // Draw puff — solid core size varies per particle
                const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
                grad.addColorStop(0, p.color);
                if (p.solid > 0) grad.addColorStop(p.solid, p.color);
                grad.addColorStop(1, 'transparent');
                ctx.globalAlpha = Math.max(0, p.opacity);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
            }

            // Update + draw stink lines
            for (const s of stinkLines) {
                s.age += dt;
                if (s.age < 0) { alive = true; continue; }

                if (s.age < 0.2) {
                    s.opacity = s.age / 0.2 * 0.6;
                } else {
                    s.opacity -= dt * 0.4;
                }
                if (s.opacity <= 0 && s.age > 0.2) continue;
                alive = true;

                s.y -= s.speed * dt;

                ctx.globalAlpha = Math.max(0, s.opacity);
                ctx.strokeStyle = '#4ade80';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                const baseY = s.y;
                ctx.moveTo(s.x, baseY);
                // Wavy S-curve
                ctx.bezierCurveTo(
                    s.x + s.wobble, baseY - s.height * 0.33,
                    s.x - s.wobble, baseY - s.height * 0.66,
                    s.x + s.wobble * 0.5, baseY - s.height
                );
                ctx.stroke();
            }

            if (alive) {
                requestAnimationFrame(tick);
            } else {
                canvas.remove();
            }
        };
        requestAnimationFrame(tick);
    }

    /** Random pick between confetti and fireworks */
    burst(el, opts = {}) {
        const roll = Math.random();
        if (roll < 0.4) {
            this.confetti(el, opts);
        } else if (roll < 0.8) {
            this.fireworks(el, opts);
        } else {
            this.fart(el, opts);
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
                        ctx.globalAlpha = p.opacity * frac * frac * 0.4;
                        ctx.fillStyle = p.color;
                        ctx.beginPath();
                        ctx.arc(p.trail[t].x, p.trail[t].y, p.size * (0.1 + frac * 0.9), 0, Math.PI * 2);
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
                    // Soft glow halo
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                    ctx.fillStyle = '#fff';
                    ctx.fill();
                    // Color corona
                    ctx.shadowBlur = 0;
                    ctx.globalAlpha = p.opacity * 0.6;
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size * 2.5, 0, Math.PI * 2);
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
