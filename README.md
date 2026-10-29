# MAREA · Sonificación del Movimiento del Mar

**MAREA** es una instalación audiovisual e interactiva para la web que sonifica el movimiento del agua. Reproduce un video en bucle del océano (`mar.mp4`) y analiza la agitación hidrodinámica en tiempo real para modular y mezclar dinámicamente un paisaje sonoro compuesto por tres capas ambientales.

---

## 🌊 Funcionamiento

La experiencia se basa en una cadena de análisis de visión por computadora y síntesis sonora:

```
Video del Mar → Cuadros a 15 FPS → Análisis de Píxeles Móviles → Índice de Agitación M → Crossfade de Potencia Constante → Mezcla de Audios
```

1. **Detección del Oleaje:** Cada fotograma del video se analiza a 128 × 72 px, extrayendo la luminancia en escala de grises y comparándola con el fotograma previo para identificar los píxeles que cambiaron por el vaivén del agua.
2. **Índice de Agitación ($M$):** La fracción de píxeles activos se normaliza con respecto al *Techo de Agitación* para obtener un valor $M$ entre $0.0$ (calma total) y $1.0$ (oleaje tempestuoso).
3. **Inercia y Suavizado Exponencial:** Un filtro exponencial amortigua ruidos o destellos aislados, dando al sonido el comportamiento inercial propio de la masa de agua.
4. **Mezcla Sonora Dinámica:** Las tres pistas de audio se ejecutan simultáneamente en bucle infinito en la Web Audio API, y sus niveles de volumen (ganancia) se redistribuyen de forma fluida mediante curvas trapezoidales solapadas:
   - **Calma Marina (`sinteRetro.wav`):** Suena a pleno en oleaje bajo ($M$ de 0 a 35%).
   - **Oleaje y Pulso (`corazon.wav`):** Se introduce y domina en agitación intermedia ($M$ de 20 a 75%).
   - **Tempestad y Resonancia (`MRI.mp3`):** Toma protagonismo en agitación extrema y oleaje violento ($M$ de 60 a 100%).

---

## 🎨 Nuevo Diseño y Layout

El proyecto ha sido rediseñado completamente con una estética contemporánea de instalación hidroacústica:
- **Tema Oceánico Abisal:** Vidrio traslúcido oscuro (*dark glassmorphism*), acentos cian y aguamarina bioluminiscentes, y tipografía geométrica moderna (*Outfit* y *JetBrains Mono*).
- **Medidor Radial de Agitación:** Indicador circular animado que refleja en tiempo real el porcentaje de agitación del agua.
- **Mezclador de Paisaje Sonoro:** Paneles dedicados para cada capa con metros VU en vivo, rango de transición y botón para probar cada audio de forma individual (*solo*).
- **Consola Lateral de Calibración:** Ajustes de sensibilidad, techo de movimiento, inercia del agua y tiempo de fundido (*crossfade*).
- **Capas Visuales:**
  - *Video Puro:* Estética natural del mar con partículas de espuma marina.
  - *Flujo de Olas:* Aura bioluminiscente en las zonas de rompiente y corriente.
  - *Visión Máquina:* Visualización de la diferencia binaria de píxeles utilizada por el algoritmo.
- **Visualizador de Espectro:** Osciloscopio inferior en tiempo real que refleja las ondas acústicas del paisaje sonoro resultante.
- **Grabador de Audio Integrado:** Permite capturar la mezcla sonora en vivo y descargarla como archivo de audio.

---

## 🚀 Cómo Iniciar el Proyecto

Los navegadores modernos restringen la carga de archivos de audio locales mediante el protocolo `file://` por políticas de CORS. Para ejecutarlo en tu computadora:

### En Windows (1 Clic)
Haz doble clic en **`iniciar-servidor.bat`**. Se abrirá el servidor local y tu navegador en `http://localhost:8000/`.

### Con PowerShell
```powershell
powershell -ExecutionPolicy Bypass -File servidor.ps1
```

### Con Python (opcional)
```bash
python -m http.server 8000
```
Luego abre `http://localhost:8000/` en Chrome, Edge o Firefox.
