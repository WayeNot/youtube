/**
 * Effet Canvas Dynamique (Style Spotify Canvas)
 * Générateur de gradient organique liquide réactif au son
 */
class SpotifyCanvasBackground {
    constructor() {
        this.isEnabled = localStorage.getItem('ytm_spotify_canvas') === 'true';
        this.canvas = null;
        this.ctx = null;
        this.animId = null;
        this.phase = 0;
        this.orbs = [];
        this.initOrbs();
    }

    initOrbs() {
        this.orbs = [
            { x: 0.3, y: 0.3, r: 0.45, color: '#ff0055', vx: 0.002, vy: 0.0015 },
            { x: 0.7, y: 0.4, r: 0.5, color: '#7a00ff', vx: -0.0018, vy: 0.002 },
            { x: 0.5, y: 0.8, r: 0.4, color: '#00d4ff', vx: 0.0015, vy: -0.0017 },
            { x: 0.2, y: 0.7, r: 0.35, color: '#ffaa00', vx: -0.0012, vy: 0.001 }
        ];
    }

    init() {
        let el = document.getElementById('spotify-canvas-bg');
        if (!el) {
            el = document.createElement('canvas');
            el.id = 'spotify-canvas-bg';
            el.style.cssText = 'position:fixed; inset:0; width:100%; height:100%; z-index:-1; pointer-events:none; opacity:0; transition:opacity 0.6s ease; filter:blur(40px);';
            document.body.prepend(el);
        }
        this.canvas = el;
        this.ctx = el.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        if (this.isEnabled) {
            this.enable();
        }
    }

    resize() {
        if (!this.canvas) return;
        this.canvas.width = Math.floor(window.innerWidth / 4); // scaled down for maximum silky performance
        this.canvas.height = Math.floor(window.innerHeight / 4);
    }

    enable() {
        this.isEnabled = true;
        localStorage.setItem('ytm_spotify_canvas', 'true');
        if (this.canvas) this.canvas.style.opacity = '0.75';
        if (!this.animId) this.loop();
    }

    disable() {
        this.isEnabled = false;
        localStorage.setItem('ytm_spotify_canvas', 'false');
        if (this.canvas) this.canvas.style.opacity = '0';
        if (this.animId) {
            cancelAnimationFrame(this.animId);
            this.animId = null;
        }
    }

    toggle() {
        if (this.isEnabled) {
            this.disable();
            if (window.App?.showToast) window.App.showToast('Mode Canvas Spotify désactivé');
        } else {
            this.enable();
            if (window.App?.showToast) window.App.showToast('Mode Canvas Spotify activé ! ✨');
        }
    }

    loop() {
        if (!this.isEnabled) return;
        this.draw();
        this.animId = requestAnimationFrame(() => this.loop());
    }

    draw() {
        const ctx = this.ctx;
        if (!ctx || !this.canvas) return;
        const w = this.canvas.width;
        const h = this.canvas.height;

        const audio = window.Player?.getAudioVisualizerData ? window.Player.getAudioVisualizerData() : { bass: 0.5, energy: 0.4 };
        const speed = 1 + audio.energy * 2.5;

        this.phase += 0.015 * speed;

        // Base dark backdrop
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, w, h);

        // Render moving gradient orbs
        for (let orb of this.orbs) {
            orb.x += orb.vx * speed;
            orb.y += orb.vy * speed;

            if (orb.x < 0 || orb.x > 1) orb.vx *= -1;
            if (orb.y < 0 || orb.y > 1) orb.vy *= -1;

            const radius = Math.min(w, h) * (orb.r + audio.bass * 0.15);
            const ox = orb.x * w;
            const oy = orb.y * h;

            const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, radius);
            grad.addColorStop(0, orb.color);
            grad.addColorStop(1, 'rgba(0,0,0,0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(ox, oy, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

window.SpotifyCanvas = new SpotifyCanvasBackground();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.SpotifyCanvas.init());
} else {
    window.SpotifyCanvas.init();
}
