/**
 * CrossTrainer 3D - PWA de Entrenamiento de Cruz Blanca (CFOP)
 * Motor 3D en Three.js, Algoritmo BFS para Cruz Óptima y Evaluador en Tiempo Real.
 */

// ==========================================================================
// 1. CONFIGURACIÓN GLOBAL Y CONSTANTES (WCA Western Color Scheme)
// ==========================================================================

// Colores oficiales (Hex)
const COLORS = {
  U: 0xffd500, // Amarillo (Top)
  D: 0xffffff, // Blanco (Bottom - Cruz)
  F: 0x009e60, // Verde (Front)
  B: 0x0051ba, // Azul (Back)
  L: 0xff5800, // Naranja (Left)
  R: 0xc41e3a, // Rojo (Right)
  INNER: 0x111116 // Plástico interior negro
};

// Las 4 aristas blancas de la cruz
const WHITE_EDGES = [
  { id: 'DF', colors: ['D', 'F'], name: 'Blanco-Verde' },
  { id: 'DR', colors: ['D', 'R'], name: 'Blanco-Rojo' },
  { id: 'DB', colors: ['D', 'B'], name: 'Blanco-Azul' },
  { id: 'DL', colors: ['D', 'L'], name: 'Blanco-Naranja' }
];

// Movimientos válidos Singmaster
const MOVE_NAMES = ['U', "U'", 'U2', 'D', "D'", 'D2', 'L', "L'", 'L2', 'R', "R'", 'R2', 'F', "F'", 'F2', 'B', "B'", 'B2'];

// ==========================================================================
// 2. REPRODUCTOR DE SONIDO SINTETIZADO (Web Audio API - 100% Offline)
// ==========================================================================

class AudioSynth {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  playTurnSound() {
    if (!this.enabled) return;
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  playSuccessSound() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.2, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.25);
    });
  }
}

const soundEngine = new AudioSynth();

// ==========================================================================
// 3. MOTOR LÓGICO DEL CUBO Y BUSCADOR ÓPTIMO BFS
// ==========================================================================

class LogicalCube {
  constructor() {
    this.reset();
  }

  reset() {
    // 12 Posiciones de aristas en el cubo
    // 0:UF, 1:UR, 2:UB, 3:UL, 4:FL, 5:FR, 6:BR, 7:BL, 8:DF, 9:DR, 10:DB, 11:DL
    // Cada posición tiene 2 posibles orientaciones (0 = orientada primaria, 1 = invertida)
    
    // Representamos las 4 aristas blancas por su índice actual de posición (0-11) y orientación (0-1)
    // 0: DF (Blanco-Verde), 1: DR (Blanco-Rojo), 2: DB (Blanco-Azul), 3: DL (Blanco-Naranja)
    this.edges = [
      { pos: 8, ori: 0 },  // DF resuelta
      { pos: 9, ori: 0 },  // DR resuelta
      { pos: 10, ori: 0 }, // DB resuelta
      { pos: 11, ori: 0 }  // DL resuelta
    ];
  }

  clone() {
    const copy = new LogicalCube();
    copy.edges = this.edges.map(e => ({ pos: e.pos, ori: e.ori }));
    return copy;
  }

  // Comprueba si las 4 aristas blancas forman la cruz resuelta en D
  isCrossSolved() {
    return this.edges[0].pos === 8 && this.edges[0].ori === 0 &&
           this.edges[1].pos === 9 && this.edges[1].ori === 0 &&
           this.edges[2].pos === 10 && this.edges[2].ori === 0 &&
           this.edges[3].pos === 11 && this.edges[3].ori === 0;
  }

  // Genera un hash string único del estado de las 4 aristas
  getHash() {
    return this.edges.map(e => `${e.pos}:${e.ori}`).join('|');
  }

  // Aplica una transformación de movimiento de cara a las aristas
  applyMove(move) {
    const baseMove = move[0];
    const turns = move.endsWith('2') ? 2 : (move.endsWith("'") ? 3 : 1);
    
    for (let t = 0; t < turns; t++) {
      this.edges.forEach(e => {
        const res = LogicalCube.transformEdge(e.pos, e.ori, baseMove);
        e.pos = res.pos;
        e.ori = res.ori;
      });
    }
  }

  // Tabla de permutación y orientación para cada cara (U, D, L, R, F, B)
  static transformEdge(pos, ori, move) {
    // Definición de permutaciones de aristas y cambio de orientación por movimiento
    switch (move) {
      case 'U': {
        const perm = { 0: 1, 1: 2, 2: 3, 3: 0 };
        return { pos: perm[pos] !== undefined ? perm[pos] : pos, ori: ori };
      }
      case 'D': {
        const perm = { 8: 11, 11: 10, 10: 9, 9: 8 };
        return { pos: perm[pos] !== undefined ? perm[pos] : pos, ori: ori };
      }
      case 'L': {
        const perm = { 3: 4, 4: 11, 11: 7, 7: 3 };
        // L cambia orientación en aristas U/D cuando pasan a F/B o viceversa
        let newOri = ori;
        if ([3, 4, 11, 7].includes(pos)) {
          // Permutación de posición y cambio de orientación en L
          if (pos === 3 || pos === 11) newOri = 1 - ori;
          else if (pos === 4 || pos === 7) newOri = 1 - ori;
        }
        return { pos: perm[pos] !== undefined ? perm[pos] : pos, ori: newOri };
      }
      case 'R': {
        const perm = { 1: 6, 6: 9, 9: 5, 5: 1 };
        let newOri = ori;
        if ([1, 6, 9, 5].includes(pos)) {
          if (pos === 1 || pos === 9) newOri = 1 - ori;
          else if (pos === 6 || pos === 5) newOri = 1 - ori;
        }
        return { pos: perm[pos] !== undefined ? perm[pos] : pos, ori: newOri };
      }
      case 'F': {
        const perm = { 0: 5, 5: 8, 8: 4, 4: 0 };
        let newOri = ori;
        if ([0, 5, 8, 4].includes(pos)) {
          newOri = 1 - ori; // Movimiento F invierte orientación de aristas
        }
        return { pos: perm[pos] !== undefined ? perm[pos] : pos, ori: newOri };
      }
      case 'B': {
        const perm = { 2: 7, 7: 10, 10: 6, 6: 2 };
        let newOri = ori;
        if ([2, 7, 10, 6].includes(pos)) {
          newOri = 1 - ori; // Movimiento B invierte orientación de aristas
        }
        return { pos: perm[pos] !== undefined ? perm[pos] : pos, ori: newOri };
      }
      default:
        return { pos, ori };
    }
  }

  // Algoritmo BFS para encontrar la Solución Óptima de la Cruz (≤ 8 movimientos)
  static findOptimalCross(cubeState) {
    if (cubeState.isCrossSolved()) return [];

    const queue = [{ state: cubeState.clone(), path: [] }];
    const visited = new Set();
    visited.add(cubeState.getHash());

    while (queue.length > 0) {
      const { state, path } = queue.shift();

      if (path.length >= 8) continue; // La cruz se resuelve en máximo 8 movimientos

      for (const move of MOVE_NAMES) {
        // Evitar movimientos redundantes consecutivos (ej: U U, U U', L L)
        if (path.length > 0) {
          const lastMove = path[path.length - 1];
          if (lastMove[0] === move[0]) continue;
        }

        const nextState = state.clone();
        nextState.applyMove(move);

        if (nextState.isCrossSolved()) {
          return [...path, move];
        }

        const hash = nextState.getHash();
        if (!visited.has(hash)) {
          visited.add(hash);
          queue.push({ state: nextState, path: [...path, move] });
        }
      }
    }
    return [];
  }
}

// ==========================================================================
// 4. RENDERIZADOR 3D EN THREE.JS (Cubo de 27 Cubies Biselados)
// ==========================================================================

class Cube3DRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.cubies = [];
    this.animating = false;
    this.init();
  }

  init() {
    // Escena, Cámara y Renderer
    this.scene = new THREE.Scene();
    
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(4.5, 4, 5.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // OrbitControls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 15;
    this.controls.minDistance = 3;

    // Iluminación
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight1.position.set(10, 15, 10);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-10, -15, -10);
    this.scene.add(dirLight2);

    // Crear los 27 cubitos
    this.createCubeMesh();

    // Evento Resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Loop de Animación
    this.animate();
  }

  createCubeMesh() {
    // Limpiar cubies existentes
    this.cubies.forEach(c => this.scene.remove(c));
    this.cubies = [];

    const spacing = 1.02; // Pequeña separación estética entre cubitos

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const materials = [
            new THREE.MeshStandardMaterial({ color: x === 1 ? COLORS.R : COLORS.INNER, roughness: 0.2 }), // Right (+X)
            new THREE.MeshStandardMaterial({ color: x === -1 ? COLORS.L : COLORS.INNER, roughness: 0.2 }), // Left (-X)
            new THREE.MeshStandardMaterial({ color: y === 1 ? COLORS.U : COLORS.INNER, roughness: 0.2 }), // Top (+Y)
            new THREE.MeshStandardMaterial({ color: y === -1 ? COLORS.D : COLORS.INNER, roughness: 0.2 }), // Bottom (-Y)
            new THREE.MeshStandardMaterial({ color: z === 1 ? COLORS.F : COLORS.INNER, roughness: 0.2 }), // Front (+Z)
            new THREE.MeshStandardMaterial({ color: z === -1 ? COLORS.B : COLORS.INNER, roughness: 0.2 })  // Back (-Z)
          ];

          const geometry = new THREE.BoxGeometry(0.96, 0.96, 0.96);
          const cubie = new THREE.Mesh(geometry, materials);
          cubie.position.set(x * spacing, y * spacing, z * spacing);
          cubie.userData = { initialX: x, initialY: y, initialZ: z };
          
          this.scene.add(cubie);
          this.cubies.push(cubie);
        }
      }
    }
  }

  // Animación de rotación de cara en 3D
  rotateLayer(move, duration = 200) {
    return new Promise((resolve) => {
      if (this.animating) {
        resolve();
        return;
      }
      this.animating = true;

      const { axis, layerValue, angle } = this.getMoveParams(move);
      const pivot = new THREE.Group();
      this.scene.add(pivot);

      // Seleccionar cubies que pertenecen a la capa
      const selectedCubies = this.cubies.filter(cubie => {
        const pos = cubie.position;
        if (axis === 'x') return Math.abs(pos.x - layerValue) < 0.2;
        if (axis === 'y') return Math.abs(pos.y - layerValue) < 0.2;
        if (axis === 'z') return Math.abs(pos.z - layerValue) < 0.2;
        return false;
      });

      // Adjuntar cubies al pivote temporal
      selectedCubies.forEach(cubie => pivot.add(cubie));

      const startTime = performance.now();

      const animateTurn = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing cúbico suave
        const easeProgress = progress < 0.5 
          ? 4 * progress * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        pivot.rotation[axis] = angle * easeProgress;

        if (progress < 1) {
          requestAnimationFrame(animateTurn);
        } else {
          // Finalizar rotación: re-adjuntar a la escena y actualizar posiciones
          pivot.rotation[axis] = angle;
          pivot.updateMatrixWorld();

          selectedCubies.forEach(cubie => {
            cubie.applyMatrix4(pivot.matrix);
            // Redondear posiciones para evitar desvíos flotantes
            cubie.position.x = Math.round(cubie.position.x * 100) / 100;
            cubie.position.y = Math.round(cubie.position.y * 100) / 100;
            cubie.position.z = Math.round(cubie.position.z * 100) / 100;
            this.scene.add(cubie);
          });

          this.scene.remove(pivot);
          this.animating = false;
          resolve();
        }
      };

      requestAnimationFrame(animateTurn);
    });
  }

  getMoveParams(move) {
    const base = move[0];
    const isPrime = move.includes("'");
    const isDouble = move.includes("2");

    let angleMultiplier = isDouble ? 2 : 1;
    if (isPrime) angleMultiplier *= -1;

    switch (base) {
      case 'U': return { axis: 'y', layerValue: 1.02, angle: -Math.PI / 2 * angleMultiplier };
      case 'D': return { axis: 'y', layerValue: -1.02, angle: Math.PI / 2 * angleMultiplier };
      case 'R': return { axis: 'x', layerValue: 1.02, angle: -Math.PI / 2 * angleMultiplier };
      case 'L': return { axis: 'x', layerValue: -1.02, angle: Math.PI / 2 * angleMultiplier };
      case 'F': return { axis: 'z', layerValue: 1.02, angle: -Math.PI / 2 * angleMultiplier };
      case 'B': return { axis: 'z', layerValue: -1.02, angle: Math.PI / 2 * angleMultiplier };
      // Rotaciones de cubo entero
      case 'y': return { axis: 'y', layerValue: 0, angle: -Math.PI / 2 * angleMultiplier };
      case 'x': return { axis: 'x', layerValue: 0, angle: -Math.PI / 2 * angleMultiplier };
      case 'z': return { axis: 'z', layerValue: 0, angle: -Math.PI / 2 * angleMultiplier };
      default: return { axis: 'y', layerValue: 0, angle: 0 };
    }
  }

  setCameraView(viewName) {
    let targetPos = new THREE.Vector3(4.5, 4, 5.5);
    if (viewName === 'top') targetPos.set(0, 7, 0.1);
    if (viewName === 'front') targetPos.set(0, 1.5, 6.5);
    if (viewName === 'bottom') targetPos.set(0, -7, 0.1); // Vista de Cruz abajo

    const startPos = this.camera.position.clone();
    const startTime = performance.now();

    const animateCam = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / 300, 1);
      this.camera.position.lerpVectors(startPos, targetPos, progress);
      this.controls.update();

      if (progress < 1) requestAnimationFrame(animateCam);
    };

    requestAnimationFrame(animateCam);
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// ==========================================================================
// 5. GESTOR PRINCIPAL DE LA APLICACIÓN Y UI
// ==========================================================================

class AppManager {
  constructor() {
    this.currentLevel = 1;
    this.currentScramble = '';
    this.userMoves = [];
    this.logicalCube = new LogicalCube();
    this.scrambleCubeState = new LogicalCube();
    this.optimalSolution = [];
    
    // Estadísticas
    this.stats = {
      solved: 0,
      optimalCount: 0,
      totalMoves: 0,
      streak: 0
    };

    // Temporizador de Inspección
    this.inspectionTime = 15.0;
    this.inspectionTimer = null;
    this.isInspecting = false;

    this.init();
  }

  async init() {
    // Inicializar Motor 3D
    this.renderer3D = new Cube3DRenderer('canvas-container');

    // Registrar Eventos UI
    this.bindEvents();

    // Generar primer ejercicio
    this.generateExercise();

    // Registrar Service Worker para PWA
    this.registerServiceWorker();
  }

  bindEvents() {
    // Selección de Nivel
    document.querySelectorAll('.level-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
        const target = e.currentTarget;
        target.classList.add('active');
        this.currentLevel = parseInt(target.dataset.level);
        this.generateExercise();
      });
    });

    // Botón Nueva Mezcla
    document.getElementById('btn-new-scramble').addEventListener('click', () => {
      this.generateExercise();
    });

    // Botón Copiar Mezcla
    document.getElementById('btn-copy-scramble').addEventListener('click', () => {
      navigator.clipboard.writeText(this.currentScramble);
      alert('¡Mezcla copiada al portapapeles!');
    });

    // Botones de Movimiento Virtual
    document.querySelectorAll('.move-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const move = e.currentTarget.dataset.move;
        const isPrimeChecked = document.getElementById('chk-prime-modifier').checked;
        
        let finalMove = move;
        if (isPrimeChecked && !move.includes('2') && !move.includes("'")) {
          finalMove = move + "'";
        }
        
        this.executeUserMove(finalMove);
      });
    });

    // Botón Deshacer
    document.getElementById('btn-undo-move').addEventListener('click', () => {
      this.undoLastMove();
    });

    // Botón Reiniciar
    document.getElementById('btn-clear-moves').addEventListener('click', () => {
      this.resetUserMoves();
    });

    // Botones Vista Cámara
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const view = e.currentTarget.id.replace('btn-view-', '');
        this.renderer3D.setCameraView(view);
      });
    });

    // Botón Reproducir Solución Óptima
    document.getElementById('btn-replay-optimal').addEventListener('click', () => {
      this.replayOptimalSolution();
    });

    // Teclado Físico (Singmaster Notation: U, D, L, R, F, B + Shift para prime)
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key.toUpperCase();
      if (['U', 'D', 'L', 'R', 'F', 'B'].includes(key)) {
        const move = e.shiftKey ? key + "'" : key;
        this.executeUserMove(move);
      }
    });

    // Modal Ayuda
    document.getElementById('btn-help').addEventListener('click', () => {
      document.getElementById('help-modal').classList.remove('hidden');
    });
    document.getElementById('btn-close-modal').addEventListener('click', () => {
      document.getElementById('help-modal').classList.add('hidden');
    });
    document.getElementById('btn-modal-ok').addEventListener('click', () => {
      document.getElementById('help-modal').classList.add('hidden');
    });

    // Sonido Toggle
    document.getElementById('btn-sound').addEventListener('click', (e) => {
      soundEngine.enabled = !soundEngine.enabled;
      e.currentTarget.textContent = soundEngine.enabled ? '🔊' : '🔇';
    });

    // Reset Cámara
    document.getElementById('btn-reset-cam').addEventListener('click', () => {
      this.renderer3D.setCameraView('front');
    });
  }

  // Genera un ejercicio progresivo según el nivel seleccionado
  generateExercise() {
    this.userMoves = [];
    this.updateUserMovesUI();
    document.getElementById('eval-results').classList.add('hidden');
    document.getElementById('eval-placeholder').classList.remove('hidden');
    document.getElementById('cross-status-badge').className = 'cross-status-badge incomplete';
    document.getElementById('cross-status-text').textContent = '❌ Cruz Incompleta';

    // Crear mezcla según nivel de dificultad
    const targetMoveCount = this.currentLevel === 1 ? 2 : (this.currentLevel === 2 ? 4 : (this.currentLevel === 3 ? 6 : 8));
    this.currentScramble = this.generateScrambleForLevel(targetMoveCount);
    
    document.getElementById('scramble-display').textContent = this.currentScramble;

    // Aplicar mezcla a los cubos lógicos y 3D
    this.logicalCube.reset();
    this.renderer3D.createCubeMesh();

    const scrambleMoves = this.currentScramble.split(' ');
    scrambleMoves.forEach(move => {
      this.logicalCube.applyMove(move);
    });

    // Guardar estado mezclado para reiniciar si se requiere
    this.scrambleCubeState = this.logicalCube.clone();

    // Aplicar giros 3D sin animación para preparar el ejercicio
    scrambleMoves.forEach(move => {
      const { axis, layerValue, angle } = this.renderer3D.getMoveParams(move);
      const pivot = new THREE.Group();
      this.renderer3D.scene.add(pivot);

      const selectedCubies = this.renderer3D.cubies.filter(c => {
        const pos = c.position;
        if (axis === 'x') return Math.abs(pos.x - layerValue) < 0.2;
        if (axis === 'y') return Math.abs(pos.y - layerValue) < 0.2;
        if (axis === 'z') return Math.abs(pos.z - layerValue) < 0.2;
        return false;
      });

      selectedCubies.forEach(c => pivot.add(c));
      pivot.rotation[axis] = angle;
      pivot.updateMatrixWorld();

      selectedCubies.forEach(c => {
        c.applyMatrix4(pivot.matrix);
        c.position.x = Math.round(c.position.x * 100) / 100;
        c.position.y = Math.round(c.position.y * 100) / 100;
        c.position.z = Math.round(c.position.z * 100) / 100;
        this.renderer3D.scene.add(c);
      });
      this.renderer3D.scene.remove(pivot);
    });

    // Calcular Solución Óptima con BFS
    this.optimalSolution = LogicalCube.findOptimalCross(this.logicalCube);

    // Actualizar Rastreador de Inspección de Aristas
    this.updateEdgeTrackerUI();

    // Reiniciar Temporizador de Inspección WCA (15 segundos)
    this.startInspectionTimer();
  }

  generateScrambleForLevel(targetLength) {
    const moves = ['U', "U'", 'U2', 'D', "D'", 'D2', 'L', "L'", 'L2', 'R', "R'", 'R2', 'F', "F'", 'F2', 'B', "B'", 'B2'];
    let scramble = [];
    let testCube = new LogicalCube();

    for (let i = 0; i < targetLength; i++) {
      let move;
      do {
        move = moves[Math.floor(Math.random() * moves.length)];
      } while (scramble.length > 0 && scramble[scramble.length - 1][0] === move[0]);

      scramble.push(move);
      testCube.applyMove(move);
    }
    return scramble.join(' ');
  }

  async executeUserMove(move) {
    if (this.renderer3D.animating) return;

    soundEngine.playTurnSound();
    
    // Registrar movimiento si no es solo una rotación de cubo
    if (!['x', 'y', 'z'].includes(move[0])) {
      this.userMoves.push(move);
      this.updateUserMovesUI();
    }

    // Aplicar a lógica y a Three.js
    this.logicalCube.applyMove(move);
    await this.renderer3D.rotateLayer(move, 180);

    // Verificar si la Cruz está resuelta
    if (this.logicalCube.isCrossSolved()) {
      this.onCrossSolved();
    } else {
      this.updateEdgeTrackerUI();
    }
  }

  undoLastMove() {
    if (this.userMoves.length === 0) return;
    const lastMove = this.userMoves.pop();
    this.updateUserMovesUI();

    // Calcular movimiento inverso
    let inverseMove = lastMove;
    if (lastMove.includes("'")) inverseMove = lastMove[0];
    else if (!lastMove.includes("2")) inverseMove = lastMove[0] + "'";

    this.logicalCube.applyMove(inverseMove);
    this.renderer3D.rotateLayer(inverseMove, 150);
  }

  resetUserMoves() {
    this.userMoves = [];
    this.updateUserMovesUI();
    this.logicalCube = this.scrambleCubeState.clone();
    this.renderer3D.createCubeMesh();
    
    // Re-aplicar mezcla
    const scrambleMoves = this.currentScramble.split(' ');
    scrambleMoves.forEach(move => {
      const { axis, layerValue, angle } = this.renderer3D.getMoveParams(move);
      const pivot = new THREE.Group();
      this.renderer3D.scene.add(pivot);

      const selectedCubies = this.renderer3D.cubies.filter(c => {
        const pos = c.position;
        if (axis === 'x') return Math.abs(pos.x - layerValue) < 0.2;
        if (axis === 'y') return Math.abs(pos.y - layerValue) < 0.2;
        if (axis === 'z') return Math.abs(pos.z - layerValue) < 0.2;
        return false;
      });

      selectedCubies.forEach(c => pivot.add(c));
      pivot.rotation[axis] = angle;
      pivot.updateMatrixWorld();

      selectedCubies.forEach(c => {
        c.applyMatrix4(pivot.matrix);
        c.position.x = Math.round(c.position.x * 100) / 100;
        c.position.y = Math.round(c.position.y * 100) / 100;
        c.position.z = Math.round(c.position.z * 100) / 100;
        this.renderer3D.scene.add(c);
      });
      this.renderer3D.scene.remove(pivot);
    });

    document.getElementById('eval-results').classList.add('hidden');
    document.getElementById('eval-placeholder').classList.remove('hidden');
  }

  onCrossSolved() {
    soundEngine.playSuccessSound();

    // Actualizar Banner
    const badge = document.getElementById('cross-status-badge');
    badge.className = 'cross-status-badge solved';
    document.getElementById('cross-status-text').textContent = '✨ ¡CRUZ RESUELTA!';

    // Actualizar Estadísticas
    this.stats.solved++;
    this.stats.totalMoves += this.userMoves.length;

    const isOptimal = this.userMoves.length <= this.optimalSolution.length;
    if (isOptimal) {
      this.stats.optimalCount++;
      this.stats.streak++;
    } else {
      this.stats.streak = 0;
    }

    this.updateStatsUI();

    // Mostrar Evaluación y Comparación con Solución Óptima
    this.renderEvaluationSection();
  }

  renderEvaluationSection() {
    document.getElementById('eval-placeholder').classList.add('hidden');
    const evalResults = document.getElementById('eval-results');
    evalResults.classList.remove('hidden');

    const userCount = this.userMoves.length;
    const optCount = this.optimalSolution.length;

    document.getElementById('res-user-count').textContent = userCount;
    document.getElementById('res-optimal-count').textContent = optCount;
    document.getElementById('optimal-moves-sequence').textContent = this.optimalSolution.join(' ') || '(Resuelta directamete)';

    // Asignar Calificación de Estrellas
    const starsEl = document.getElementById('rating-stars');
    const titleEl = document.getElementById('rating-title');

    if (userCount <= optCount) {
      starsEl.textContent = '⭐ ⭐ ⭐';
      titleEl.textContent = '¡Resolución Perfecta y Óptima!';
    } else if (userCount <= optCount + 2) {
      starsEl.textContent = '⭐ ⭐';
      titleEl.textContent = '¡Buena Cruz! Casi Óptima';
    } else {
      starsEl.textContent = '⭐';
      titleEl.textContent = 'Cruz Completada (Se puede optimizar)';
    }

    // Generar Consejos Dinámicos de Fingertricks
    const tipsList = document.getElementById('feedback-tips-list');
    tipsList.innerHTML = '';

    const tips = [];

    if (userCount > optCount) {
      tips.push(`Hiciste ${userCount} movimientos. El algoritmo BFS encontró una vía de solo ${optCount} giros.`);
    } else {
      tips.push('¡Excelente visualización! Lograste el número mínimo absoluto de giros.');
    }

    // Analizar movimientos de la cara D
    const dMoves = this.userMoves.filter(m => m.startsWith('D'));
    if (dMoves.length > 0) {
      tips.push('📌 **Fingertrick D**: Procura hacer los giros D/D\' con el dedo anular de la mano correspondiente sin mover los pulgares de la cara frontal.');
    }

    // Analizar si se usó la cara U innecesariamente
    const uMoves = this.userMoves.filter(m => m.startsWith('U'));
    if (uMoves.length > 2) {
      tips.push('💡 **Consejo CFOP**: Evita rotar la cara superior (U) excesivamente para la cruz. Intenta colocar las aristas directamente en su posición relativa.');
    }

    tips.push('👁️ **Previsualización**: Durante la inspección de 15s, planifica los primeros 3 a 4 movimientos enteros antes de tocar el cubo.');

    tips.forEach(tip => {
      const li = document.createElement('li');
      li.innerHTML = tip;
      tipsList.appendChild(li);
    });
  }

  async replayOptimalSolution() {
    this.resetUserMoves();
    await new Promise(r => setTimeout(r, 400));

    for (const move of this.optimalSolution) {
      await this.executeUserMove(move);
      await new Promise(r => setTimeout(r, 250));
    }
  }

  updateUserMovesUI() {
    const container = document.getElementById('user-moves-history');
    document.getElementById('user-move-count').textContent = this.userMoves.length;

    if (this.userMoves.length === 0) {
      container.innerHTML = '<span class="empty-hint">Ejecuta movimientos para armar la cruz abajo...</span>';
      return;
    }

    container.innerHTML = '';
    this.userMoves.forEach(move => {
      const chip = document.createElement('span');
      chip.className = 'move-chip';
      chip.textContent = move;
      container.appendChild(chip);
    });

    container.scrollTop = container.scrollHeight;
  }

  updateEdgeTrackerUI() {
    const posNames = ['UF', 'UR', 'UB', 'UL', 'FL', 'FR', 'BR', 'BL', 'DF', 'DR', 'DB', 'DL'];
    
    WHITE_EDGES.forEach((edge, idx) => {
      const currentEdgeData = this.logicalCube.edges[idx];
      const posName = posNames[currentEdgeData.pos];
      const oriStr = currentEdgeData.ori === 0 ? 'Bien Orientada' : 'Volteada (Flipped)';
      
      const posEl = document.getElementById(`pos-${edge.id}`);
      if (posEl) {
        posEl.textContent = `${posName} (${oriStr})`;
        posEl.style.color = currentEdgeData.pos >= 8 && currentEdgeData.ori === 0 ? '#10b981' : '#f59e0b';
      }
    });
  }

  updateStatsUI() {
    document.getElementById('stat-solved').textContent = this.stats.solved;
    const rate = this.stats.solved > 0 ? Math.round((this.stats.optimalCount / this.stats.solved) * 100) : 0;
    document.getElementById('stat-optimal-rate').textContent = `${rate}%`;
    const avg = this.stats.solved > 0 ? (this.stats.totalMoves / this.stats.solved).toFixed(1) : '0.0';
    document.getElementById('stat-avg-moves').textContent = avg;
    document.getElementById('stat-streak').textContent = this.stats.streak;
  }

  startInspectionTimer() {
    clearInterval(this.inspectionTimer);
    this.inspectionTime = 15.0;
    const clockEl = document.getElementById('inspection-clock');
    clockEl.textContent = '15.0s';
    clockEl.style.color = '#10b981';

    this.inspectionTimer = setInterval(() => {
      this.inspectionTime -= 0.1;
      if (this.inspectionTime <= 0) {
        this.inspectionTime = 0;
        clearInterval(this.inspectionTimer);
        clockEl.textContent = '0.0s (¡A resolver!)';
        clockEl.style.color = '#f43f5e';
      } else {
        clockEl.textContent = `${this.inspectionTime.toFixed(1)}s`;
        if (this.inspectionTime < 5.0) clockEl.style.color = '#f43f5e';
      }
    }, 100);
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
          .then(reg => console.log('CrossTrainer PWA Service Worker registrado con éxito:', reg.scope))
          .catch(err => console.log('Error al registrar Service Worker:', err));
      });
    }
  }
}

// Inicializar la aplicación asegurando que Three.js y OrbitControls se hayan cargado
document.addEventListener('DOMContentLoaded', () => {
  const initAppWithRetry = (retries = 50) => {
    if (window.THREE && window.THREE.OrbitControls) {
      window.app = new AppManager();
    } else if (retries > 0) {
      setTimeout(() => initAppWithRetry(retries - 1), 100);
    } else {
      console.error('No se pudo cargar Three.js desde CDN. Verifica la conexión a internet.');
    }
  };
  initAppWithRetry();
});

