(() => {
  "use strict";

  // Helper de selección de elementos DOM
  const $ = (id) => document.getElementById(id);

  // ==========================================================================
  // Configuración y Parámetros Hidrodinámicos
  // ==========================================================================
  const CONFIG = {
    sens: 8,         // Umbral de brillo por píxel (base: 28; con mar.mp4 se calibró en 8)
    top: 0.12,       // Techo: % de píxeles en movimiento que vale M = 1 (igual que la base)
    smooth: 1.2,     // Suavizado exponencial de M en segundos
    fps: 15,         // Frecuencia de análisis de movimiento (igual que la base)
    fade: 1.2,       // Duración del fundido / crossfade entre pistas en segundos
    volume: 0.75,    // Volumen maestro (0 - 1)
    view: "video",   // Modo de visualización: "video" | "aura" | "mask"
    particles: true, // Partículas de espuma marina bioluminiscente
    src: "mar",      // Fuente: "mar" | "cam" | "file"
    simulate: false, // Modo simulación manual para pruebas
    simVal: 0.5      // Valor manual cuando simulate = true
  };

  // Definición de las 3 capas sonoras ambientales
  const TRACKS = [
    {
      id: "calma",
      nombre: "Calma Marina",
      subtitulo: "sinteRetro.wav · Marea baja",
      archivos: ["sonidos/sinteRetro.wav"],
      rango: [-1.0, -1.0, 0.20, 0.35],
      color: "#00cfff",
      cardId: "cardCalma",
      gainId: "gainCalma",
      meterId: "meterCalma"
    },
    {
      id: "agitacion",
      nombre: "Oleaje y Pulso",
      subtitulo: "corazon.wav · Movimiento vivo",
      archivos: ["sonidos/corazon.wav", "sonidos/corazón.wav"],
      rango: [0.20, 0.35, 0.60, 0.75],
      color: "#42e07a",
      cardId: "cardAgitacion",
      gainId: "gainAgitacion",
      meterId: "meterAgitacion"
    },
    {
      id: "tempestad",
      nombre: "Tempestad y Resonancia",
      subtitulo: "MRI.mp3 · Oleaje violento",
      archivos: ["sonidos/MRI.mp3"],
      rango: [0.60, 0.75, 2.0, 2.0],
      color: "#ff9a3c",
      cardId: "cardTempestad",
      gainId: "gainTempestad",
      meterId: "meterTempestad"
    }
  ];

  // Estado del motor de telemetría y mezcla
  const ENGINE = {
    rawM: 0,            // Agitación instantánea bruta [0, 1]
    smoothM: 0,         // Agitación suavizada [0, 1]
    changedFrac: 0,     // Fracción de superficie con movimiento [0, 1]
    changedPixels: 0,   // Cantidad absoluta de píxeles móviles
    weights: [1, 0, 0], // Ganancia calculada para cada pista
    dominantTrack: 0,
    previewTrack: -1,   // Si es >= 0, sólo suena esa pista para pruebas
    previewTimer: 0,
    isTainted: false    // Si el navegador bloqueó getImageData por file://
  };

  // Notificaciones emergentes / Toast
  let toastTimer = null;
  function showToast(msg) {
    const el = $("oceanToast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  // ==========================================================================
  // Motor de Video y Control de Reproducción
  // ==========================================================================
  const video = $("oceanVideo") || document.createElement("video");
  let camStream = null;
  let videoBlobUrl = null;

  function ensureVideoPlayback() {
    video.muted = true;
    if (video.paused) {
      video.play().then(() => {
        updatePlayPauseUI();
      }).catch((e) => {
        updatePlayPauseUI();
      });
    }
  }

  function updatePlayPauseUI() {
    const isPaused = video.paused;
    $("vidPlayIcon").textContent = isPaused ? "▶" : "❚❚";
    $("vidPlayStatus").textContent = isPaused ? "Reanudar" : "En reproducción";
    $("teleVidState").textContent = isPaused ? "Pausado" : "Activo";
    $("teleVidState").style.color = isPaused ? "var(--storm-rose)" : "var(--seafoam)";
  }

  video.addEventListener("play", updatePlayPauseUI);
  video.addEventListener("pause", updatePlayPauseUI);
  video.addEventListener("timeupdate", () => {
    const cur = video.currentTime || 0;
    const dur = video.duration || 18;
    const formatTime = (t) => {
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      return `${m}:${String(s).padStart(2, "0")}`;
    };
    $("vidTime").textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
  });

  $("btnVidPlayPause").addEventListener("click", (e) => {
    e.stopPropagation();
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    updatePlayPauseUI();
  });

  // Reanudar video ante cualquier interacción en el escenario
  $("stage").addEventListener("click", () => {
    if (video.paused) {
      video.play().catch(() => {});
    }
  });

  document.addEventListener("click", () => {
    if (video.paused) {
      video.play().then(() => updatePlayPauseUI()).catch(() => {});
    }
  }, { passive: true });

  function stopCamStream() {
    if (camStream) {
      camStream.getTracks().forEach(t => t.stop());
      camStream = null;
    }
  }

  function loadSeaVideo() {
    stopCamStream();
    CONFIG.src = "mar";
    updateSourceButtons();

    video.srcObject = null;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");

    if (videoBlobUrl) {
      video.src = videoBlobUrl;
    } else {
      // 1. Asigna mar.mp4 inmediatamente para inicio sin retardo
      video.src = "mar.mp4";

      // 2. En paralelo, precarga mar.mp4 en un Blob en RAM.
      // Esto elimina peticiones Range por red y evita cierres de socket (WinError 10054).
      fetch("mar.mp4")
        .then(res => {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.blob();
        })
        .then(blob => {
          videoBlobUrl = URL.createObjectURL(blob);
          const curTime = video.currentTime || 0;
          const wasPlaying = !video.paused;
          video.src = videoBlobUrl;
          video.currentTime = curTime;
          if (wasPlaying) video.play().catch(() => {});
        })
        .catch(() => {
          // Si fetch falla (ej. file://), continúa con streaming normal
        });
    }

    video.play().then(() => {
      updatePlayPauseUI();
      $("footerInfo").textContent = "mar.mp4 · Bucle continuo";
      showToast("Reproduciendo mar.mp4 en bucle");
    }).catch((e) => {
      console.warn("Autoplay bloqueado a la espera de interacción:", e);
      updatePlayPauseUI();
    });
  }

  async function startCamera() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("API de cámara no disponible");
      }
      stopCamStream();
      video.pause();
      video.removeAttribute("src");

      camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 } },
        audio: false
      });
      video.srcObject = camStream;
      await video.play();

      CONFIG.src = "cam";
      updateSourceButtons();
      $("footerInfo").textContent = "Fuente: Cámara web en vivo";
      showToast("Cámara web activada");
    } catch (err) {
      showToast("No se pudo acceder a la cámara (requiere HTTPS o localhost)");
      loadSeaVideo();
    }
  }

  function updateSourceButtons() {
    $("btnSrcSea").classList.toggle("active", CONFIG.src === "mar");
    $("btnSrcCam").classList.toggle("active", CONFIG.src === "cam");
    $("btnSrcFile").classList.toggle("active", CONFIG.src === "file");
  }

  $("btnSrcSea").addEventListener("click", loadSeaVideo);
  $("btnSrcCam").addEventListener("click", startCamera);
  $("btnSrcFile").addEventListener("click", () => $("videoFileInput").click());

  $("videoFileInput").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    stopCamStream();
    video.srcObject = null;
    video.src = URL.createObjectURL(file);
    video.loop = true;
    try {
      await video.play();
      CONFIG.src = "file";
      updateSourceButtons();
      $("footerInfo").textContent = "Fuente: " + file.name;
      showToast("Cargado: " + file.name);
    } catch (_) {
      showToast("Error al reproducir el video seleccionado");
    }
    e.target.value = "";
  });

  // ==========================================================================
  // Motor de Audio Web (Web Audio API)
  // ==========================================================================
  let audioCtx = null;
  let masterGain = null;
  let masterAnalyser = null;
  let compressor = null;
  let recDestination = null;
  let audioSources = [];
  let audioGainNodes = [];
  let isAudioReady = false;

  async function initAudioEngine() {
    ensureVideoPlayback();

    if (audioCtx) {
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      updateSoundButtonState();
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = CONFIG.volume;

    compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 8;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.08;

    masterAnalyser = audioCtx.createAnalyser();
    masterAnalyser.fftSize = 512;
    masterAnalyser.smoothingTimeConstant = 0.85;

    recDestination = audioCtx.createMediaStreamDestination();

    // Cadena: Pistas -> Gains individuales -> MasterGain -> Compresor -> Analizador -> Salida / Grabador
    masterGain.connect(compressor);
    compressor.connect(masterAnalyser);
    masterAnalyser.connect(audioCtx.destination);
    compressor.connect(recDestination);

    await loadAllTracks();
    updateSoundButtonState();
  }

  async function loadBufferFromPaths(paths) {
    for (const p of paths) {
      try {
        const resp = await fetch(p);
        if (!resp.ok) continue;
        const arrayBuf = await resp.arrayBuffer();
        return await audioCtx.decodeAudioData(arrayBuf);
      } catch (_) {
        // Prueba la siguiente ruta alternativa
      }
    }
    return null;
  }

  async function loadAllTracks() {
    showToast("Cargando capas sonoras del mar...");
    audioSources = [];
    audioGainNodes = [];

    let loadedCount = 0;
    for (let i = 0; i < TRACKS.length; i++) {
      const track = TRACKS[i];
      const buf = await loadBufferFromPaths(track.archivos);

      if (!buf) {
        console.warn("No se pudo cargar la pista:", track.nombre, track.archivos);
        audioGainNodes[i] = null;
        continue;
      }

      const srcNode = audioCtx.createBufferSource();
      srcNode.buffer = buf;
      srcNode.loop = true;

      const gainNode = audioCtx.createGain();
      gainNode.gain.value = (i === 0 ? CONFIG.volume : 0.0001);

      srcNode.connect(gainNode);
      gainNode.connect(masterGain);
      srcNode.start(0);

      audioSources[i] = srcNode;
      audioGainNodes[i] = gainNode;
      loadedCount++;
    }

    isAudioReady = true;
    showToast(loadedCount === TRACKS.length ? "Audios oceánicos listos" : `Cargados ${loadedCount} de ${TRACKS.length} audios`);
  }

  function isSoundRunning() {
    return audioCtx && audioCtx.state === "running";
  }

  function updateSoundButtonState() {
    const running = isSoundRunning();
    const btn = $("soundToggleBtn");
    btn.setAttribute("aria-pressed", String(running));
    $("soundToggleTxt").textContent = running ? "Silenciar" : "Activar Sonido";
    $("soundLiveBadge").textContent = running ? "EN VIVO" : "EN PAUSA";
    $("soundLiveBadge").style.color = running ? "var(--seafoam)" : "var(--text-dim)";
  }

  $("soundToggleBtn").addEventListener("click", async () => {
    if (!audioCtx) {
      await initAudioEngine();
    } else {
      if (audioCtx.state === "running") {
        await audioCtx.suspend();
      } else {
        await audioCtx.resume();
      }
      updateSoundButtonState();
    }
    ensureVideoPlayback();
  });

  $("startAudioBtn").addEventListener("click", async () => {
    await initAudioEngine();
    $("audioPrompt").classList.add("fade-out");
  });

  // Ponderación trapezoidal solapada para el crossfade suave
  function calcTrapezoidWeight(x, [a, b, c, d]) {
    if (x < a || x > d) return 0;
    if (x < b) return (x - a) / (b - a);
    if (x <= c) return 1;
    return (d - x) / (d - c);
  }

  // Actualización dinámica de las ganancias del mezclador
  function updateAudioMix() {
    if (ENGINE.previewTrack >= 0) {
      // Modo Solo / Vista previa de pista
      for (let i = 0; i < TRACKS.length; i++) {
        ENGINE.weights[i] = (i === ENGINE.previewTrack) ? 1 : 0;
        if (audioCtx && isAudioReady && audioGainNodes[i]) {
          const target = (i === ENGINE.previewTrack) ? 0.95 : 0.0001;
          audioGainNodes[i].gain.setTargetAtTime(target, audioCtx.currentTime, 0.08);
        }
      }
      ENGINE.dominantTrack = ENGINE.previewTrack;
      return;
    }

    // Calcula pesos teóricos en base al índice M suavizado
    const M = CONFIG.simulate ? CONFIG.simVal : ENGINE.smoothM;
    const rawWeights = TRACKS.map(t => calcTrapezoidWeight(M, t.rango));
    const sum = rawWeights.reduce((a, b) => a + b, 0) || 1;

    let maxWeight = -1;
    let dominant = 0;

    for (let i = 0; i < TRACKS.length; i++) {
      // Raíz cuadrada: crossfade de potencia constante para no perder volumen al mezclar
      const w = Math.sqrt(rawWeights[i] / sum);
      ENGINE.weights[i] = w;

      if (w > maxWeight) {
        maxWeight = w;
        dominant = i;
      }

      if (audioCtx && isAudioReady && audioGainNodes[i]) {
        const rampTime = Math.max(0.1, CONFIG.fade / 3);
        audioGainNodes[i].gain.setTargetAtTime(w * 0.95, audioCtx.currentTime, rampTime);
      }
    }

    ENGINE.dominantTrack = dominant;
  }

  // Previsualización de pista individual (botón Probar)
  document.querySelectorAll(".preview-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.dataset.track);
      if (!isSoundRunning()) {
        await initAudioEngine();
      }
      if (ENGINE.previewTrack === idx) {
        ENGINE.previewTrack = -1;
        clearTimeout(ENGINE.previewTimer);
        btn.textContent = "Probar";
      } else {
        document.querySelectorAll(".preview-btn").forEach(b => b.textContent = "Probar");
        btn.textContent = "Detener";
        ENGINE.previewTrack = idx;
        clearTimeout(ENGINE.previewTimer);
        ENGINE.previewTimer = setTimeout(() => {
          ENGINE.previewTrack = -1;
          btn.textContent = "Probar";
        }, 4000);
      }
    });
  });

  // ==========================================================================
  // Motor de Análisis de Movimiento (Visión Hidrodinámica Multi-Frame)
  // ==========================================================================
  const PW = 128, PH = 72;
  const procCanvas = document.createElement("canvas");
  procCanvas.width = PW;
  procCanvas.height = PH;
  const pctx = procCanvas.getContext("2d", { willReadFrequently: true });

  // Igual que en el repositorio base (oir-la-luz): se compara cada fotograma con el anterior,
  // se cuentan los píxeles cuyo brillo cambió más que el umbral y esa fracción de TODA la imagen es la
  // métrica de movimiento. M = fracción / techo, suavizada exponencialmente.
  let prevLuma = null;
  let lastVidTime = -1;
  let pendingDt = 0;
  const motionMask = new Uint8Array(PW * PH);
  const particles = [];

  function smoothTowards(target, dt) {
    const alpha = 1 - Math.exp(-dt / Math.max(0.1, CONFIG.smooth));
    ENGINE.smoothM += (target - ENGINE.smoothM) * alpha;
  }

  function analyzeMotion(dt) {
    if (CONFIG.simulate) {
      ENGINE.rawM = CONFIG.simVal;
      ENGINE.smoothM = CONFIG.simVal;
      ENGINE.changedFrac = CONFIG.simVal * CONFIG.top;
      ENGINE.changedPixels = Math.round(ENGINE.changedFrac * PW * PH);
      updateAudioMix();
      return;
    }

    if (video.readyState < 2 || video.paused) {
      // Video en pausa o cargando: no hay movimiento nuevo, M decae suavemente
      ENGINE.rawM = 0;
      smoothTowards(0, dt);
      prevLuma = null;
      updateAudioMix();
      return;
    }

    // Si el navegador todavía no entregó un fotograma nuevo, comparar daría diferencia 0
    // y M caería a calma artificialmente: se acumula el tiempo y se espera al siguiente.
    pendingDt += dt;
    const t = video.currentTime;
    if (t === lastVidTime) return;
    // El bucle de mar.mp4 salta de ~18.9 s a 0 s: ese cambio de imagen no es oleaje.
    const wrapped = t < lastVidTime;
    lastVidTime = t;
    const stepDt = Math.min(0.5, pendingDt);
    pendingDt = 0;

    let imgData;
    try {
      pctx.drawImage(video, 0, 0, PW, PH);
      imgData = pctx.getImageData(0, 0, PW, PH);
    } catch (err) {
      if (!ENGINE.isTainted) {
        ENGINE.isTainted = true;
        console.warn("Navegador bloqueó lectura de video por file://. Activando advertencia y simulación.", err);
        $("protocolWarning").hidden = false;
        CONFIG.simulate = true;
        $("chkSimulate").checked = true;
        $("simSliderRow").hidden = false;
      }
      return;
    }

    const data = imgData.data;
    const gray = new Uint8Array(PW * PH);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
      gray[i] = (data[j] * 0.3 + data[j + 1] * 0.59 + data[j + 2] * 0.11) | 0;
    }

    if (prevLuma && !wrapped) {
      const thr = CONFIG.sens;
      let changed = 0;
      for (let i = 0; i < gray.length; i++) {
        const df = Math.abs(gray[i] - prevLuma[i]);
        motionMask[i] = df > thr ? Math.min(255, df) : 0;
        if (motionMask[i]) changed++;
      }

      // Fracción de TODA la imagen que cambió (métrica del modo Mar del repositorio base)
      ENGINE.changedPixels = changed;
      ENGINE.changedFrac = changed / (PW * PH);
      // Normaliza: "techo" = % de píxeles en movimiento que vale M = 1
      ENGINE.rawM = Math.min(1, ENGINE.changedFrac / Math.max(0.005, CONFIG.top));
      // Suavizado exponencial: el ruido de un fotograma casi no mueve M
      smoothTowards(ENGINE.rawM, stepDt);

      // Partículas de espuma sobre los píxeles en movimiento
      if (CONFIG.particles && changed > 0 && particles.length < 240) {
        const p = Math.min(0.35, 50 / Math.max(1, changed));
        for (let y = 0; y < PH; y += 2) {
          for (let x = 0; x < PW; x += 2) {
            const idx = y * PW + x;
            if (motionMask[idx] && Math.random() < p) {
              const k = Math.min(1, (motionMask[idx] - thr) / 60);
              particles.push({
                x: (x + Math.random()) / PW,
                y: (y + Math.random()) / PH,
                vx: (Math.random() - 0.5) * 0.012,
                vy: -0.012 - Math.random() * 0.02,
                life: 1.0,
                decay: 1.1 + Math.random() * 1.3,
                size: 1.2 + k * 2.8,
                hue: k > 0.6 ? "#ffffff" : "#bff3ff"
              });
            }
          }
        }
      }
    }

    prevLuma = gray;
    updateAudioMix();
  }

  // ==========================================================================
  // Renderizado en Lienzo Principal (Stage Canvas)
  // ==========================================================================
  const viewCanvas = $("viewCanvas");
  const vctx = viewCanvas.getContext("2d");

  // Máscara intermedia para modo visión máquina
  const maskC = document.createElement("canvas");
  maskC.width = PW;
  maskC.height = PH;
  const mctx = maskC.getContext("2d");
  const maskImgData = mctx.createImageData(PW, PH);

  function fitCanvas(c) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    return dpr;
  }

  function renderView(dt) {
    const dpr = fitCanvas(viewCanvas);
    const W = viewCanvas.width;
    const H = viewCanvas.height;

    // Fondo abisal
    vctx.fillStyle = "#0a4a78";
    vctx.fillRect(0, 0, W, H);

    // Ajuste de relación de aspecto del video (letterbox / pillarbox centrado)
    const vidAspect = (video.videoWidth || 16) / (video.videoHeight || 9);
    let bw = W, bh = W / vidAspect;
    if (bh > H) {
      bh = H;
      bw = H * vidAspect;
    }
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;

    if (CONFIG.view === "mask") {
      // Visión máquina: píxeles activos detectados con gradiente
      for (let i = 0; i < PW * PH; i++) {
        const j = i * 4;
        const m = motionMask[i];
        if (m) {
          const k = Math.min(1, (m - CONFIG.sens) / 60);
          maskImgData.data[j] = Math.round(0 + 255 * k);      // R
          maskImgData.data[j + 1] = Math.round(207 + 48 * k); // G
          maskImgData.data[j + 2] = 255;                     // B
          maskImgData.data[j + 3] = 255;
        } else {
          maskImgData.data[j] = 10;
          maskImgData.data[j + 1] = 74;
          maskImgData.data[j + 2] = 120;
          maskImgData.data[j + 3] = 255;
        }
      }
      mctx.putImageData(maskImgData, 0, 0);
      vctx.imageSmoothingEnabled = false;
      vctx.drawImage(maskC, bx, by, bw, bh);
      vctx.imageSmoothingEnabled = true;

    } else {
      // Modo Video Puro o Flujo de Olas
      if (video.readyState >= 2) {
        vctx.drawImage(video, bx, by, bw, bh);
      }

      if (CONFIG.view === "aura") {
        // Tinte de energía oceánica en zonas agitadas
        const auraAlpha = Math.min(0.45, ENGINE.smoothM * 0.5);
        if (auraAlpha > 0.02) {
          vctx.fillStyle = `rgba(0, 207, 255, ${auraAlpha.toFixed(3)})`;
          vctx.fillRect(bx, by, bw, bh);
        }
      }
    }

    // Renderizado de partículas de espuma marina
    if (CONFIG.particles && CONFIG.view !== "mask") {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= p.decay * dt;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        const px = bx + p.x * bw;
        const py = by + p.y * bh;
        const radius = p.size * dpr * p.life;

        vctx.fillStyle = p.hue;
        vctx.globalAlpha = p.life * 0.8;
        vctx.beginPath();
        vctx.arc(px, py, radius, 0, Math.PI * 2);
        vctx.fill();
      }
      vctx.globalAlpha = 1.0;
    }
  }

  // ==========================================================================
  // Visualizador de Audio Inferior (Osciloscopio / Espectro)
  // ==========================================================================
  const audioVisCanvas = $("audioVisualizerCanvas");
  const actx = audioVisCanvas.getContext("2d");
  const timeData = new Uint8Array(512);

  function renderAudioVisualizer() {
    const dpr = fitCanvas(audioVisCanvas);
    const W = audioVisCanvas.width;
    const H = audioVisCanvas.height;
    actx.clearRect(0, 0, W, H);

    actx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    actx.lineWidth = 1;
    actx.beginPath();
    actx.moveTo(0, H / 2);
    actx.lineTo(W, H / 2);
    actx.stroke();

    if (!isSoundRunning() || !masterAnalyser) {
      actx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      actx.beginPath();
      actx.moveTo(0, H / 2);
      actx.lineTo(W, H / 2);
      actx.stroke();
      return;
    }

    masterAnalyser.getByteTimeDomainData(timeData);

    const grad = actx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.5, "#b8f5c4");
    grad.addColorStop(1, "#ffd9a8");

    actx.strokeStyle = grad;
    actx.lineWidth = 2 * dpr;
    actx.beginPath();

    const sliceWidth = W / timeData.length;
    let x = 0;

    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 128.0;
      const y = (v * H) / 2;

      if (i === 0) {
        actx.moveTo(x, y);
      } else {
        actx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    actx.stroke();
  }

  // ==========================================================================
  // Actualización de Telemetría e Interfaz de Usuario
  // ==========================================================================
  function updateUI() {
    const M = CONFIG.simulate ? CONFIG.simVal : ENGINE.smoothM;
    const raw = CONFIG.simulate ? CONFIG.simVal : ENGINE.rawM;
    const pct = Math.round(M * 100);

    // 1. Radial Gauge
    $("gaugePct").textContent = pct;
    const maxDash = 314.159; // 2 * PI * 50
    const offset = maxDash - (maxDash * Math.min(1, Math.max(0, M)));
    $("gaugeFill").style.strokeDashoffset = offset.toFixed(2);

    let stateColor = "#00cfff";
    let stateName = "Calma Serena";

    if (M < 0.35) {
      stateColor = "#00cfff";
      stateName = "Calma Serena";
    } else if (M < 0.70) {
      stateColor = "#42e07a";
      stateName = "Oleaje Moderado";
    } else {
      stateColor = "#ff9a3c";
      stateName = "Mar Tempestuoso";
    }

    $("gaugeFill").style.stroke = stateColor;
    $("chipState").textContent = stateName;
    $("chipState").style.borderColor = stateColor;
    $("chipState").style.color = stateColor;

    // Header Pill
    $("statusLabel").textContent = stateName;
    $("statusMetric").textContent = `M: ${pct}%`;
    $("statusDot").style.backgroundColor = stateColor;
    $("statusDot").style.boxShadow = `0 0 10px ${stateColor}`;

    // Telemetría HUD
    $("teleMs").textContent = M.toFixed(2);
    $("teleRaw").textContent = raw.toFixed(2);
    $("teleArea").textContent = (ENGINE.changedFrac * 100).toFixed(1) + " %";
    $("teleDominantTrack").textContent = TRACKS[ENGINE.dominantTrack].nombre;
    $("teleDominantTrack").style.color = TRACKS[ENGINE.dominantTrack].color;

    $("teleBarFill").style.width = pct + "%";
    $("teleBarMarker").style.left = Math.min(100, Math.round(raw * 100)) + "%";

    // Cursor del Mezclador (Crossfade)
    $("cfCursor").style.left = Math.min(99, pct) + "%";

    // 2. Metros y Tarjetas de Capas Sonoras
    for (let i = 0; i < TRACKS.length; i++) {
      const t = TRACKS[i];
      const w = ENGINE.weights[i];
      const gainPct = Math.round(w * 100);

      const cardEl = $(t.cardId);
      const gainEl = $(t.gainId);
      const meterEl = $(t.meterId);

      if (gainEl) gainEl.textContent = gainPct + "%";
      if (meterEl) meterEl.style.width = gainPct + "%";
      if (cardEl) {
        cardEl.classList.toggle("active", w > 0.08);
      }
    }
  }

  // ==========================================================================
  // Enlace de Controles de la Consola
  // ==========================================================================

  // Sensibilidad
  $("slSens").addEventListener("input", (e) => {
    CONFIG.sens = Number(e.target.value);
    $("outSens").textContent = CONFIG.sens;
  });

  // Techo
  $("slTop").addEventListener("input", (e) => {
    CONFIG.top = Number(e.target.value) / 100;
    $("outTop").textContent = e.target.value + " %";
  });

  // Inercia / Suavizado
  $("slSmooth").addEventListener("input", (e) => {
    CONFIG.smooth = Number(e.target.value) / 10;
    $("outSmooth").textContent = CONFIG.smooth.toFixed(1) + " s";
  });

  // Fundido
  $("slFade").addEventListener("input", (e) => {
    CONFIG.fade = Number(e.target.value) / 10;
    $("outFade").textContent = CONFIG.fade.toFixed(1) + " s";
  });

  // Simulación manual
  $("chkSimulate").addEventListener("change", (e) => {
    CONFIG.simulate = e.target.checked;
    $("simSliderRow").hidden = !CONFIG.simulate;
    showToast(CONFIG.simulate ? "Modo simulación manual activado" : "Análisis de video activado");
  });

  $("slSimVal").addEventListener("input", (e) => {
    CONFIG.simVal = Number(e.target.value) / 100;
    $("outSimVal").textContent = e.target.value + " %";
  });

  // Descartar aviso de protocolo
  $("btnDismissWarning").addEventListener("click", () => {
    $("protocolWarning").hidden = true;
  });

  // Selector de Modo de Visualización
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      CONFIG.view = btn.dataset.view;
    });
  });

  // Partículas
  $("chkParticles").addEventListener("change", (e) => {
    CONFIG.particles = e.target.checked;
    if (!CONFIG.particles) particles.length = 0;
  });

  // Volumen Maestro
  $("slVolume").addEventListener("input", (e) => {
    CONFIG.volume = Number(e.target.value) / 100;
    $("outVolume").textContent = e.target.value + " %";
    if (masterGain && audioCtx) {
      masterGain.gain.setTargetAtTime(CONFIG.volume, audioCtx.currentTime, 0.05);
    }
  });

  // Toggle Consola Lateral
  $("toggleConsoleBtn").addEventListener("click", () => {
    const consoleEl = $("controlConsole");
    const stageEl = $("stage");
    const isCollapsed = consoleEl.classList.toggle("collapsed");
    consoleEl.classList.toggle("open-mobile");
    stageEl.classList.toggle("full-stage", isCollapsed);
    $("toggleConsoleBtn").setAttribute("aria-expanded", String(!isCollapsed));
  });

  // Pantalla Completa
  $("fsBtn").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (_) {
      showToast("Pantalla completa no disponible");
    }
  });

  // Atajos de teclado
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      $("soundToggleBtn").click();
    } else if (e.key === "f" || e.key === "F") {
      $("fsBtn").click();
    } else if (e.key === "m" || e.key === "M") {
      $("toggleConsoleBtn").click();
    } else if (e.key === "1") {
      document.querySelector('[data-view="video"]').click();
    } else if (e.key === "2") {
      document.querySelector('[data-view="aura"]').click();
    } else if (e.key === "3") {
      document.querySelector('[data-view="mask"]').click();
    }
  });

  // ==========================================================================
  // Grabador de Mezcla de Audio
  // ==========================================================================
  let mediaRecorder = null;
  let isRecording = false;
  let recChunks = [];
  let recBlob = null;
  let recStartTime = 0;
  let recInterval = null;

  function pickSupportedMime() {
    if (!window.MediaRecorder) return null;
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus"
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  $("btnRecord").addEventListener("click", async () => {
    if (!isSoundRunning()) {
      await initAudioEngine();
    }
    if (!recDestination) {
      showToast("Activa el audio para poder grabar");
      return;
    }

    if (!isRecording) {
      const mime = pickSupportedMime();
      if (mime === null) {
        showToast("Tu navegador no soporta MediaRecorder para audio");
        return;
      }

      recChunks = [];
      mediaRecorder = new MediaRecorder(recDestination.stream, mime ? { mimeType: mime } : undefined);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        recBlob = new Blob(recChunks, { type: mediaRecorder.mimeType || "audio/webm" });
        $("btnDownloadRec").disabled = false;
        showToast("Grabación lista para descargar");
      };

      mediaRecorder.start(250);
      isRecording = true;
      recStartTime = performance.now();

      $("btnRecord").classList.add("recording");
      $("btnRecordTxt").textContent = "Detener";
      $("btnDownloadRec").disabled = true;

      recInterval = setInterval(() => {
        const elapsed = Math.floor((performance.now() - recStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = String(elapsed % 60).padStart(2, "0");
        $("recTimeTxt").textContent = `${mins}:${secs}`;
      }, 500);

      showToast("Grabando paisaje sonoro...");
    } else {
      mediaRecorder.stop();
      isRecording = false;
      clearInterval(recInterval);
      $("btnRecord").classList.remove("recording");
      $("btnRecordTxt").textContent = "Grabar Mezcla";
    }
  });

  $("btnDownloadRec").addEventListener("click", () => {
    if (!recBlob) return;
    const url = URL.createObjectURL(recBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marea-paisaje-mar-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast("Descargando grabación");
  });

  // ==========================================================================
  // Bucle Principal de Animación
  // ==========================================================================
  let lastTime = performance.now();
  let analysisAccum = 0;

  function mainLoop(now) {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    analysisAccum += dt;
    if (analysisAccum >= 1 / CONFIG.fps) {
      const stepDt = analysisAccum;
      analysisAccum = 0;
      analyzeMotion(stepDt);
      updateUI();
    }

    renderView(dt);
    renderAudioVisualizer();

    requestAnimationFrame(mainLoop);
  }

  // Inicio de la aplicación
  loadSeaVideo();
  requestAnimationFrame(mainLoop);

})();
