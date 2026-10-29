# Capas Sonoras Ambientales de MAREA

Esta carpeta contiene los tres audios ambientales que componen la experiencia hidroacústica en función de la agitación del agua:

1. **`sinteRetro.wav`** — **Calma Marina**
   - Sonido ambiental etéreo y continuo. Suena a pleno cuando el mar está sereno o en calma (M: 0% – 35%).
2. **`corazon.wav`** — **Oleaje y Pulso**
   - Latido rítmico y pulso acuático. Se introduce cuando el oleaje cobra fuerza y vigor (M: 20% – 75%).
3. **`MRI.mp3`** — **Tempestad y Resonancia**
   - Resonancia profunda y turbulenta. Domina cuando el agua experimenta oleaje violento o máxima agitación (M: 60% – 100%).

   ## Créditos de los sonidos

| N° | Archivo | Autor | Fuente | Licencia |
|---|---|---|---|---|
| 1. | Retro Synth Single Note | Roloxi | [freesound.org](https://freesound.org/s/683116/) | Creative Commons 0 |
| 2. | Heartbeat pumping | BrainClaim | [freesound.org](https://freesound.org/s/848139/) | Creative Commons 0 |
| 3. | Facility alarm 1 | Jamesy_Jacks_Random_Sounds | [freesound.org](https://freesound.org/s/749338/) | Creative Commons 0 |

Todos los audios se reproducen en bucle continuo y de manera simultánea en la Web Audio API; el movimiento del mar modula únicamente sus ganancias de forma suave y sin cortes gracias a una rampa de crossfade de potencia constante.
