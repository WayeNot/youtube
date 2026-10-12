/**
 * Visualiseur Audio WebGL 3D Réactif (Three.js & Canvas 3D)
 * Modes :
 * 1. "neon_sphere" : Sphère géodésique cyberpunk palpitant sur les basses
 * 2. "cyber_tunnel" : Tunnel de distorsion stellaire à vitesse réactive
 * 3. "synthwave_grid" : Grille retrowave 3D avec pics fréquentiels
 */
class Visualizer3DManager {
    constructor() {
        this.isOpen = false;
        this.currentMode = 'neon_sphere';
        this.canvas = null;
        this.ctx = null;
        this.animId = null;
        this.rotation = 0;
        this.starField = [];
        this.particles = [];
        this.initStars();
    }

    initStars() {
        this.starField = [];
        for (let i = 0; i < 200; i++) {
            this.starField.push({
                x: (Math.random() - 0.5) * 1200,
                y: (Math.random() - 0.5) * 1200,
                z: Math.random() * 1000 + 1,
                size: Math.random() * 2 + 1,
                color: ['#00ffff', '#ff007f', '#ffea00', '#9d00ff'][Math.floor(Math.random() * 4)]
            });
        }
    }

    open() {
        const modal = document.getElementById('modal-visualizer-3d');
        if (!modal) return;
        this.isOpen = true;
        modal.classList.remove('hidden');
        this.canvas = document.getElementById('visualizer-3d-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.resize();
            window.addEventListener('resize', this._resizeHandler = () => this.resize());
            this.updateTrackInfo();
            this.startLoop();
        }
        if (window.App?.showToast) window.App.showToast('Visualiseur 3D activé 🔮');
    }

    close() {
        const modal = document.getElementById('modal-visualizer-3d');
        if (modal) modal.classList.add('hidden');
        this.isOpen = false;
        if (this.animId) cancelAnimationFrame(this.animId);
        if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    }

    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    }

    setMode(mode) {
        this.currentMode = mode;
        document.querySelectorAll('.vis-theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
        });
    }

    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    updateTrackInfo() {
        const titleEl = document.getElementById('vis-track-title');
        const artistEl = document.getElementById('vis-track-artist');
        const coverEl = document.getElementById('vis-track-cover');
        const track = window.Player?.currentTrack;
        if (track) {
            if (titleEl) titleEl.textContent = track.title;
            if (artistEl) artistEl.textContent = track.artist;
            if (coverEl) coverEl.src = track.thumbnail;
        }
    }

    startLoop() {
        const render = () => {
            if (!this.isOpen) return;
            this.drawFrame();
            this.animId = requestAnimationFrame(render);
        };
        this.animId = requestAnimationFrame(render);
    }

    drawFrame() {
        const ctx = this.ctx;
        if (!ctx || !this.canvas) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        const audioData = window.Player?.getAudioVisualizerData ? window.Player.getAudioVisualizerData() : { bass: 0.5, mid: 0.4, treble: 0.3, energy: 0.4 };
        const { bass, mid, treble, energy } = audioData;

        // Dark background with subtle reactive glow
        ctx.fillStyle = `rgba(8, 8, 14, 0.28)`;
        ctx.fillRect(0, 0, w, h);

        this.rotation += 0.01 + energy * 0.03;

        if (this.currentMode === 'neon_sphere') {
            this.renderNeonSphere(ctx, cx, cy, bass, mid, treble, energy);
        } else if (this.currentMode === 'cyber_tunnel') {
            this.renderCyberTunnel(ctx, cx, cy, w, h, bass, energy);
        } else if (this.currentMode === 'synthwave_grid') {
            this.renderSynthwaveGrid(ctx, cx, cy, w, h, bass, mid, energy);
        }

        // Draw frequency mini-bar at bottom
        this.drawFrequencyBar(ctx, w, h, audioData);
    }

    // 1. NEON SPHERE
    renderNeonSphere(ctx, cx, cy, bass, mid, treble, energy) {
        const radius = Math.min(cx, cy) * 0.38 * (1 + bass * 0.45);
        const points = 36;
        const rings = 12;

        ctx.save();
        ctx.translate(cx, cy);

        // Core glow aura
        const gradient = ctx.createRadialGradient(0, 0, 10, 0, 0, radius * 1.5);
        gradient.addColorStop(0, `rgba(255, 0, 120, ${0.4 + bass * 0.5})`);
        gradient.addColorStop(0.5, `rgba(0, 240, 255, ${0.2 + treble * 0.3})`);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 3D Rotating Rings
        for (let r = 0; r < rings; r++) {
            const rProgress = r / rings;
            const rRadius = radius * Math.sin(rProgress * Math.PI);
            const yOffset = radius * Math.cos(rProgress * Math.PI) * Math.sin(this.rotation * 0.5);

            ctx.beginPath();
            for (let i = 0; i <= points; i++) {
                const angle = (i / points) * Math.PI * 2 + this.rotation + r;
                const noise = Math.sin(angle * 6 + this.rotation * 2) * (15 * bass) + Math.cos(angle * 4) * (10 * treble);
                const x = (rRadius + noise) * Math.cos(angle);
                const y = ((rRadius + noise) * Math.sin(angle) * 0.45) + yOffset;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = `hsl(${(this.rotation * 40 + r * 25) % 360}, 100%, ${65 + bass * 25}%)`;
            ctx.lineWidth = 1.5 + bass * 2;
            ctx.shadowBlur = 12 * (1 + energy);
            ctx.shadowColor = ctx.strokeStyle;
            ctx.stroke();
        }
        ctx.restore();
    }

    // 2. CYBER TUNNEL
    renderCyberTunnel(ctx, cx, cy, w, h, bass, energy) {
        ctx.save();
        // Starfield particles flying towards camera
        for (let star of this.starField) {
            star.z -= 4 + energy * 25;
            if (star.z <= 1) {
                star.z = 1000;
                star.x = (Math.random() - 0.5) * w;
                star.y = (Math.random() - 0.5) * h;
            }
            const k = 250 / star.z;
            const px = star.x * k + cx;
            const py = star.y * k + cy;
            if (px >= 0 && px <= w && py >= 0 && py <= h) {
                const size = Math.max(0.8, (1 - star.z / 1000) * 4 * (1 + bass));
                ctx.fillStyle = star.color;
                ctx.beginPath();
                ctx.arc(px, py, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Polygon concentric tunnel rings
        const numRings = 10;
        for (let r = 0; r < numRings; r++) {
            const z = (r * 100 - (this.rotation * 300) % 100);
            const scale = Math.max(0.1, 800 / (z + 200));
            const side = 6; // Hexagon
            ctx.beginPath();
            for (let i = 0; i <= side; i++) {
                const a = (i / side) * Math.PI * 2 + this.rotation * 0.2;
                const d = 120 * scale * (1 + bass * 0.3);
                const x = cx + Math.cos(a) * d;
                const y = cy + Math.sin(a) * d;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = `hsl(${(r * 35 + this.rotation * 60) % 360}, 100%, 60%)`;
            ctx.lineWidth = Math.max(1, 3 * scale);
            ctx.shadowBlur = 15;
            ctx.shadowColor = ctx.strokeStyle;
            ctx.stroke();
        }
        ctx.restore();
    }

    // 3. SYNTHWAVE GRID
    renderSynthwaveGrid(ctx, cx, cy, w, h, bass, mid, energy) {
        const horizon = cy + 40;

        // Glowing Synthwave Sun
        ctx.save();
        const sunRadius = Math.min(w, h) * 0.22 * (1 + bass * 0.2);
        const sunGrad = ctx.createLinearGradient(cx, horizon - sunRadius * 2, cx, horizon);
        sunGrad.addColorStop(0, '#ffe600');
        sunGrad.addColorStop(0.6, '#ff0066');
        sunGrad.addColorStop(1, '#6600cc');
        ctx.fillStyle = sunGrad;
        ctx.shadowBlur = 30 * (1 + energy);
        ctx.shadowColor = '#ff0077';
        ctx.beginPath();
        ctx.arc(cx, horizon - 10, sunRadius, Math.PI, 0, false);
        ctx.fill();

        // Sun scanlines
        ctx.fillStyle = 'rgba(8, 8, 14, 0.9)';
        for (let s = 0; s < 7; s++) {
            const sy = horizon - 10 - (s * (sunRadius / 8)) - 4;
            const sh = 2 + s * 1.5;
            ctx.fillRect(cx - sunRadius - 10, sy, sunRadius * 2 + 20, sh);
        }
        ctx.restore();

        // 3D Perspective Grid
        ctx.save();
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.4 + mid * 0.6})`;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00f0ff';

        // Vertical lines
        const numV = 20;
        for (let i = -numV; i <= numV; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + i * 15, horizon);
            ctx.lineTo(cx + i * 120, h);
            ctx.stroke();
        }

        // Horizontal moving lines
        const numH = 14;
        const offsetH = (this.rotation * 40) % 25;
        for (let j = 0; j < numH; j++) {
            const t = Math.pow((j * 25 + offsetH) / (numH * 25), 2.2);
            const y = horizon + t * (h - horizon);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawFrequencyBar(ctx, w, h, audioData) {
        const raw = audioData.raw;
        const barY = h - 30;
        ctx.save();
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#ff0055';

        if (raw && raw.length > 0) {
            const count = Math.min(raw.length, 64);
            const barW = (w / count) - 2;
            for (let i = 0; i < count; i++) {
                const val = raw[i] / 255;
                const barH = val * 60;
                ctx.fillStyle = `hsl(${(i * 5 + this.rotation * 50) % 360}, 100%, 65%)`;
                ctx.fillRect(i * (barW + 2), barY - barH, barW, barH);
            }
        }
        ctx.restore();
    }
}

window.Visualizer3D = new Visualizer3DManager();
