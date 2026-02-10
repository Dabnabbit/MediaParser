/**
 * ParticleEffects — reusable canvas-based particle system.
 *
 * Usage:
 *   window.particles.confetti(el)    // spinning rectangles
 *   window.particles.fireworks(el)   // radial burst with trails
 *   window.particles.fart(el)        // noxious gas cloud
 *   window.particles.burst(el)       // random pick
 *   window.particles.shatter({cx,cy}) // metallic shard burst (lock unlock)
 *
 * Directional:
 *   window.particles.trail(src, tgt) // glowing dots fly from source → target
 *
 * Sound-only (no visuals):
 *   window.particles.successSound()  // ascending two-tone chime
 *   window.particles.failSound()     // "nah-uh" buzzer
 *   window.particles.notifySound()   // soft attention ding
 *
 * Each call creates a short-lived fullscreen canvas overlay,
 * runs physics via requestAnimationFrame, then cleans itself up.
 */
class ParticleEffects {
    constructor() {
        this.defaults = {
            colors: ['#ef4444', '#f59e0b', '#fbbf24', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#fff'],
        };
        this._audioCtx = null;
        this.muted = false;

        // Browsers require AudioContext creation during a direct user gesture.
        // Use capture phase so this fires BEFORE any button handler that triggers effects.
        const initAudio = () => {
            if (!this._audioCtx) {
                try { this._audioCtx = new AudioContext(); } catch {}
            }
            document.removeEventListener('click', initAudio, true);
            document.removeEventListener('keydown', initAudio, true);
        };
        document.addEventListener('click', initAudio, { capture: true, once: true });
        document.addEventListener('keydown', initAudio, { capture: true, once: true });
    }

    // ── Public API ─────────────────────────────────────────

    /** Spinning confetti rectangles bursting from el */
    confetti(el, opts = {}) {
        if (!opts.mute && !this.muted) this._popSound();
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

        // Single confetti ball emoji — nudged up to visually center on button
        particles.push({
            x: cx, y: cy - 16,
            vx: 0, vy: -8,
            size: 30,
            emoji: '\uD83C\uDF8A',
            color: '#fff',
            opacity: 1,
            spin: 0,
            spinRate: (Math.random() - 0.5) * 60,
            shape: 'emoji',
            noGravity: true,
        });

        this._animate(particles, {
            gravity: 500,
            fadeRate: 0.7,
            drag: 0.5,
            trailLen: 0,
        });
    }

    /** Radial firework burst with glowing trails from el */
    fireworks(el, opts = {}) {
        if (!opts.mute && !this.muted) this._crackleSound();
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

        // Sparkles emoji — nudged up to visually center on button
        particles.push({
            x: cx, y: cy - 6,
            vx: 0, vy: 0,
            size: 28,
            emoji: '\u2728',
            color: '#fff',
            opacity: 1,
            spin: 0,
            spinRate: 0,
            shape: 'emoji',
            noGravity: true,
        });

        this._animate(particles, {
            gravity: 200,
            fadeRate: 0.5,
            drag: 0.8,
            trailLen: 28,
        });
    }

    /** Noxious gas cloud puffing out from el */
    fart(el, opts = {}) {
        if (!opts.mute && !this.muted) this._fartSound();
        const { cx, cy } = this._center(el);
        const count = opts.count || 12;
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

        // One big turd emoji floating above the cloud
        const turds = [];
        {
            const delay = 0.15;
            turds.push({
                x: cx,
                y: cy - 16,
                vx: (Math.random() - 0.5) * 10,
                vy: -6,
                size: 28 + Math.random() * 4,
                emoji: '\uD83D\uDCA9',
                peak: 0.5,
                opacity: 0,
                phase: Math.random() * Math.PI * 2,
                spin: 0,
                spinRate: (Math.random() - 0.5) * 90,
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

            // Update + draw turds
            for (const t of turds) {
                t.age += dt;
                if (t.age < 0) { alive = true; continue; }

                const peak = t.peak;
                if (t.age < 0.2) {
                    t.opacity = t.age / 0.2 * peak;
                } else {
                    t.opacity -= dt * 0.25;
                }
                if (t.opacity <= 0 && t.age > 0.2) continue;
                alive = true;

                // Same swirl physics as puffs
                const swirl = 20;
                const freq = 4 + (t.phase % 3);
                t.x += t.vx * dt + Math.sin(t.age * freq + t.phase) * swirl * dt;
                t.y += t.vy * dt + Math.cos(t.age * freq + t.phase) * swirl * 0.6 * dt;
                t.vy += 8 * dt;
                t.vx *= (1 - dt * 1.2);
                t.spin += t.spinRate * dt;

                ctx.save();
                ctx.globalAlpha = Math.max(0, t.opacity);
                ctx.translate(t.x, t.y);
                ctx.rotate(t.spin * Math.PI / 180);
                ctx.font = `${Math.round(t.size)}px serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                ctx.shadowBlur = 6;
                ctx.fillText(t.emoji, 0, 0);
                ctx.shadowBlur = 0;
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

    /** Random pick between confetti and fireworks */
    burst(el, opts = {}) {
        // TODO: restore randomizer after gas puff tuning
        this.fart(el, opts);
    }

    /** Metallic shatter burst — lock icon unlock effect */
    shatter(el, opts = {}) {
        if (!opts.mute && !this.muted) this._latchSound();
        const { cx, cy } = this._center(el);
        const metalColors = ['#c0c0c0', '#ffd700', '#888888', '#ffffff'];
        const count = 10 + Math.floor(Math.random() * 5); // 10-14

        const particles = [];
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.8;
            const speed = 40 + Math.random() * 60;
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 80,
                w: 2 + Math.random() * 2,
                h: 3 + Math.random() * 3,
                color: metalColors[Math.floor(Math.random() * metalColors.length)],
                opacity: 1,
                spin: 0,
                spinRate: (Math.random() - 0.5) * 900,
                shape: 'rect',
            });
        }

        // Open lock emoji — pops up briefly and fades
        particles.push({
            x: cx, y: cy - 8,
            vx: 0, vy: -15,
            size: 20,
            emoji: '\uD83D\uDD13',
            color: '#fff',
            opacity: 1,
            spin: 0,
            spinRate: 0,
            shape: 'emoji',
            noGravity: true,
        });

        this._animate(particles, {
            gravity: 300,
            fadeRate: 1.0,
            drag: 0.5,
            trailLen: 0,
        });
    }

    /** Standalone ascending two-tone success chime (no visuals) */
    successSound() {
        if (!this.muted) this._successSound();
    }

    /** Standalone "nah-uh" buzzer fail sound (no visuals) */
    failSound() {
        if (!this.muted) this._failSound();
    }

    /** Soft notification ding — draws attention without alarm */
    notifySound() {
        if (!this.muted) this._notifySound();
    }

    /** Particles that fly from a source element toward a target element */
    trail(sourceEl, targetEl, opts = {}) {
        const src = this._center(sourceEl);
        const tgt = this._center(targetEl);
        const count = opts.count || 6;
        const color = opts.color || '#f59e0b';

        const canvas = this._createCanvas();
        const ctx = canvas.getContext('2d');

        const particles = [];
        for (let i = 0; i < count; i++) {
            const delay = i * 0.04;
            const spread = 15;
            particles.push({
                x: src.cx + (Math.random() - 0.5) * spread,
                y: src.cy + (Math.random() - 0.5) * spread,
                targetX: tgt.cx,
                targetY: tgt.cy,
                progress: 0,
                speed: 1.8 + Math.random() * 0.8,
                size: 2 + Math.random() * 2,
                color,
                opacity: 0,
                delay,
                age: -delay,
                // Curve offset for arc path
                curveX: (Math.random() - 0.5) * 80,
                curveY: -30 - Math.random() * 40,
            });
        }

        let last = performance.now();
        const tick = (now) => {
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            let alive = false;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (const p of particles) {
                p.age += dt;
                if (p.age < 0) { alive = true; continue; }

                p.progress = Math.min(p.progress + dt * p.speed, 1);
                // Ease-in-out
                const t = p.progress < 0.5
                    ? 2 * p.progress * p.progress
                    : 1 - Math.pow(-2 * p.progress + 2, 2) / 2;

                // Quadratic bezier: source → control point → target
                const cpx = (p.x + p.targetX) / 2 + p.curveX;
                const cpy = (p.y + p.targetY) / 2 + p.curveY;
                const px = (1-t)*(1-t)*p.x + 2*(1-t)*t*cpx + t*t*p.targetX;
                const py = (1-t)*(1-t)*p.y + 2*(1-t)*t*cpy + t*t*p.targetY;

                // Fade in quickly, fade out near end
                p.opacity = t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1;

                if (p.progress >= 1) continue;
                alive = true;

                ctx.save();
                ctx.globalAlpha = p.opacity * 0.9;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 8;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(px, py, p.size, 0, Math.PI * 2);
                ctx.fill();
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

    // ── Internals ──────────────────────────────────────────

    /** Get center point — accepts a DOM element or raw {cx, cy} coordinates */
    _center(elOrPos) {
        if (!elOrPos.getBoundingClientRect) return elOrPos;
        const rect = elOrPos.getBoundingClientRect();
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
                if (!p.noGravity) p.vy += gravity * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.spin += p.spinRate * dt;
                p.opacity -= dt * fadeRate;
                p.vx *= (1 - dt * drag);
                p.vy *= (1 - dt * drag * 0.3);
                if (p.opacity > 0) {
                    alive = true;
                    if (trailLen && p.shape !== 'emoji') {
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
                } else if (p.shape === 'emoji') {
                    ctx.font = `${p.size}px serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    // Dark halo to pop against any background
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                    ctx.shadowBlur = 6;
                    ctx.fillText(p.emoji, 0, 0);
                    ctx.shadowBlur = 0;
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

    // ── Sound effects (Web Audio API) ─────────────────────

    /** Get shared AudioContext, resuming if suspended */
    _getAudioCtx() {
        try {
            if (!this._audioCtx) this._audioCtx = new AudioContext();
            if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
            return this._audioCtx;
        } catch { return null; }
    }

    /** Confetti — short white noise pop/snap */
    _popSound() {
        const ctx = this._getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        const duration = 0.08;

        // White noise buffer
        const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

        const src = ctx.createBufferSource();
        src.buffer = buf;

        // Bandpass to give it a snappy pop character
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1200;
        bp.Q.value = 0.8;

        // Sharp attack, fast decay
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.6, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        src.connect(bp).connect(gain).connect(ctx.destination);
        src.start(now);
        src.stop(now + duration);
    }

    /** Fireworks — crackle burst with sparkle tail */
    _crackleSound() {
        const ctx = this._getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;

        // Initial pop — punchy noise burst
        const burstDur = 0.08;
        const buf = ctx.createBuffer(1, ctx.sampleRate * burstDur, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

        const src = ctx.createBufferSource();
        src.buffer = buf;

        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1500;

        const burstGain = ctx.createGain();
        burstGain.gain.setValueAtTime(0.7, now);
        burstGain.gain.exponentialRampToValueAtTime(0.001, now + burstDur);

        src.connect(hp).connect(burstGain).connect(ctx.destination);
        src.start(now);
        src.stop(now + burstDur);

        // Crackle — staggered micro noise pops
        for (let i = 0; i < 8; i++) {
            const popDur = 0.015 + Math.random() * 0.025;
            const popBuf = ctx.createBuffer(1, ctx.sampleRate * popDur, ctx.sampleRate);
            const popData = popBuf.getChannelData(0);
            for (let j = 0; j < popData.length; j++) popData[j] = Math.random() * 2 - 1;

            const popSrc = ctx.createBufferSource();
            popSrc.buffer = popBuf;

            const popHp = ctx.createBiquadFilter();
            popHp.type = 'highpass';
            popHp.frequency.value = 800 + Math.random() * 3000;

            const popGain = ctx.createGain();
            const delay = 0.2 + Math.random() * 0.35;
            popGain.gain.setValueAtTime(0.25 + Math.random() * 0.35, now + delay);
            popGain.gain.exponentialRampToValueAtTime(0.001, now + delay + popDur);

            popSrc.connect(popHp).connect(popGain).connect(ctx.destination);
            popSrc.start(now + delay);
            popSrc.stop(now + delay + popDur);
        }

        // Sizzle tail — sustained high-freq noise that fades out
        const sizzleDur = 0.5;
        const sizzleBuf = ctx.createBuffer(1, ctx.sampleRate * sizzleDur, ctx.sampleRate);
        const sizzleData = sizzleBuf.getChannelData(0);
        for (let i = 0; i < sizzleData.length; i++) sizzleData[i] = Math.random() * 2 - 1;

        const sizzleSrc = ctx.createBufferSource();
        sizzleSrc.buffer = sizzleBuf;

        const sizzleHp = ctx.createBiquadFilter();
        sizzleHp.type = 'highpass';
        sizzleHp.frequency.value = 6000;

        const sizzleGain = ctx.createGain();
        const sizzleDelay = 0.2;
        sizzleGain.gain.setValueAtTime(0.001, now + sizzleDelay);
        sizzleGain.gain.linearRampToValueAtTime(0.12, now + sizzleDelay + 0.05);
        sizzleGain.gain.exponentialRampToValueAtTime(0.001, now + sizzleDelay + sizzleDur);

        sizzleSrc.connect(sizzleHp).connect(sizzleGain).connect(ctx.destination);
        sizzleSrc.start(now + sizzleDelay);
        sizzleSrc.stop(now + sizzleDelay + sizzleDur);
    }

    /** Fart — low oscillator sweep with filtered noise texture */
    _fartSound() {
        const ctx = this._getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        const duration = 0.35 + Math.random() * 0.15;

        // Low oscillator with downward frequency sweep
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const startFreq = 90 + Math.random() * 30;
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(startFreq * 0.5, now + duration);

        // Slight pitch wobble for realism
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 6 + Math.random() * 8;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 8;
        lfo.connect(lfoGain).connect(osc.frequency);
        lfo.start(now);
        lfo.stop(now + duration);

        // Lowpass to soften the sawtooth
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 500;
        lp.Q.value = 3;

        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.001, now);
        oscGain.gain.linearRampToValueAtTime(0.45, now + 0.04);
        oscGain.gain.setValueAtTime(0.45, now + duration * 0.5);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(lp).connect(oscGain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration);

        // Noise layer for texture
        const noiseDur = duration * 0.8;
        const buf = ctx.createBuffer(1, ctx.sampleRate * noiseDur, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = buf;

        const noiseBp = ctx.createBiquadFilter();
        noiseBp.type = 'bandpass';
        noiseBp.frequency.value = 200;
        noiseBp.Q.value = 0.8;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.001, now);
        noiseGain.gain.linearRampToValueAtTime(0.25, now + 0.05);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDur);

        noiseSrc.connect(noiseBp).connect(noiseGain).connect(ctx.destination);
        noiseSrc.start(now);
        noiseSrc.stop(now + noiseDur);
    }

    /** Latch release — short metallic click + brief resonant ping */
    _latchSound() {
        const ctx = this._getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;

        // Mechanical click — very short bandpassed noise burst
        const clickDur = 0.025;
        const buf = ctx.createBuffer(1, ctx.sampleRate * clickDur, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

        const src = ctx.createBufferSource();
        src.buffer = buf;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2800;
        bp.Q.value = 1.5;

        const clickGain = ctx.createGain();
        clickGain.gain.setValueAtTime(0.001, now);
        clickGain.gain.linearRampToValueAtTime(0.35, now + 0.003);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + clickDur);

        src.connect(bp).connect(clickGain).connect(ctx.destination);
        src.start(now);
        src.stop(now + clickDur);

        // Metallic ping — brief sine tone that rings out quickly
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 3200;

        const pingGain = ctx.createGain();
        const pingStart = now + 0.01;
        const pingDur = 0.06;
        pingGain.gain.setValueAtTime(0.001, pingStart);
        pingGain.gain.linearRampToValueAtTime(0.15, pingStart + 0.005);
        pingGain.gain.exponentialRampToValueAtTime(0.001, pingStart + pingDur);

        osc.connect(pingGain).connect(ctx.destination);
        osc.start(pingStart);
        osc.stop(pingStart + pingDur);
    }

    /** Notify — soft single ding to draw attention */
    _notifySound() {
        const ctx = this._getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;

        // Gentle sine ding — single tone, softer than success
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 660;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2000;

        const gain = ctx.createGain();
        const dur = 0.15;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(lp).connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + dur);
    }

    /** Success — quick ascending two-tone chime */
    _successSound() {
        const ctx = this._getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;

        // Bright ascending two-pulse — same square-wave family as fail
        const notes = [520, 780]; // C5 → G5, upbeat
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = freq;

            // Lowpass softens the square but keeps it brighter than fail
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 1800;

            const gain = ctx.createGain();
            const start = now + i * 0.12;
            const dur = 0.1;
            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.25, start + 0.01);
            gain.gain.setValueAtTime(0.25, start + dur - 0.025);
            gain.gain.exponentialRampToValueAtTime(0.001, start + dur + 0.06);

            osc.connect(lp).connect(gain).connect(ctx.destination);
            osc.start(start);
            osc.stop(start + dur + 0.06);
        });
    }

    /** Fail — "nah-uh" double buzzer */
    _failSound() {
        const ctx = this._getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;

        // "Nah-uh" buzzer — two short low pulses
        for (let i = 0; i < 2; i++) {
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = 185;

            // Lowpass to take the harsh edge off the square wave
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 600;

            const gain = ctx.createGain();
            const start = now + i * 0.14;
            const dur = 0.09;
            gain.gain.setValueAtTime(0.001, start);
            gain.gain.linearRampToValueAtTime(0.3, start + 0.01);
            gain.gain.setValueAtTime(0.3, start + dur - 0.02);
            gain.gain.linearRampToValueAtTime(0.001, start + dur);

            osc.connect(lp).connect(gain).connect(ctx.destination);
            osc.start(start);
            osc.stop(start + dur);
        }
    }
}

window.particles = new ParticleEffects();
