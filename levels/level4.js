/**
 * levels/level4.js — Tab 4 "Emergence"
 *
 * Act 2 finale. A 3D mindspace (Three.js) with three floating memory
 * fragments: a rotating cube, orbiting diamonds, and a pulsing sphere.
 * Player approaches each to collect it, triggering a narrator line.
 * After all three, GAME_COMPLETE_FINAL broadcasts to all tabs.
 */

export function init(renderer, state, channel, audio, favicon, narrator) {
  const THREE = window.THREE;
  if (!THREE) {
    console.error('[Level 4] Three.js not loaded.');
    return;
  }

  const tabNum = 4;
  document.title = 'Emergence';
  favicon.setFavicon('circle');

  // Update state
  state.updateTabState(tabNum, { state: 'visited' });

  // ── Constants ──────────────────────────────────────────────────────────
  const ACCENT = 0x00E5FF;
  const MAGENTA = 0xFF00FF;
  const BG_COLOR = 0x050810;
  const PLAYER_HEIGHT = 0.6;
  const PLAYER_RADIUS = 0.2;
  const MOVE_SPEED = 2.5;
  const COLLECT_RADIUS = 2.5;

  // ── Three.js setup ─────────────────────────────────────────────────────
  const threeCanvas = document.createElement('canvas');
  threeCanvas.style.cssText = `
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    z-index: 50;
    opacity: 0;
    transition: opacity 2s ease-in;
  `;
  document.body.appendChild(threeCanvas);

  const glRenderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true });
  glRenderer.setSize(window.innerWidth, window.innerHeight);
  glRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  glRenderer.setClearColor(BG_COLOR);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG_COLOR, 0.04);

  const camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(0, PLAYER_HEIGHT, 0);

  // ── Lighting ───────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0x111122, 0.2);
  scene.add(ambient);

  const playerLight = new THREE.PointLight(ACCENT, 1.0, 15);
  playerLight.position.copy(camera.position);
  scene.add(playerLight);

  // ── Floor: infinite-feeling grid ───────────────────────────────────────
  const gridSize = 60;
  const gridMat = new THREE.LineBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.06
  });
  const gridPoints = [];
  for (let i = -gridSize; i <= gridSize; i += 2) {
    gridPoints.push(new THREE.Vector3(i, 0, -gridSize));
    gridPoints.push(new THREE.Vector3(i, 0, gridSize));
    gridPoints.push(new THREE.Vector3(-gridSize, 0, i));
    gridPoints.push(new THREE.Vector3(gridSize, 0, i));
  }
  const gridGeo = new THREE.BufferGeometry().setFromPoints(gridPoints);
  scene.add(new THREE.LineSegments(gridGeo, gridMat));

  // ── Memory fragments ───────────────────────────────────────────────────
  // Three floating objects positioned around the player spawn.
  const fragments = [];
  const alreadyCollected = state.getState().tabs?.['4']?.fragmentsCollected || [];

  // Fragment 1: Rotating cube — "First Light" memory
  if (!alreadyCollected.includes('mem_cube')) {
    const cubeGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const cubeMat = new THREE.MeshStandardMaterial({
      color: ACCENT,
      emissive: ACCENT,
      emissiveIntensity: 0.5,
      wireframe: true,
    });
    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    cube.position.set(8, 1.2, -6);
    scene.add(cube);

    const cubeLight = new THREE.PointLight(ACCENT, 0.6, 5);
    cubeLight.position.copy(cube.position);
    scene.add(cubeLight);

    fragments.push({
      mesh: cube, light: cubeLight,
      id: 'mem_cube', narratorId: 'tab4_mem1',
      x: 8, z: -6,
      animate: (t) => {
        cube.rotation.x = t * 0.5;
        cube.rotation.y = t * 0.7;
        cube.position.y = 1.2 + 0.2 * Math.sin(t * 0.8);
      }
    });
  }

  // Fragment 2: Orbiting diamonds — "The Pattern" memory
  if (!alreadyCollected.includes('mem_diamonds')) {
    const diamondGroup = new THREE.Group();
    diamondGroup.position.set(-10, 1.0, -4);
    scene.add(diamondGroup);

    const diaGeo = new THREE.OctahedronGeometry(0.3, 0);
    const diaMat = new THREE.MeshStandardMaterial({
      color: MAGENTA,
      emissive: MAGENTA,
      emissiveIntensity: 0.6,
    });

    for (let i = 0; i < 4; i++) {
      const dia = new THREE.Mesh(diaGeo, diaMat);
      const angle = (i / 4) * Math.PI * 2;
      dia.position.set(Math.cos(angle) * 1.2, 0, Math.sin(angle) * 1.2);
      diamondGroup.add(dia);
    }

    const diaLight = new THREE.PointLight(MAGENTA, 0.5, 5);
    diaLight.position.copy(diamondGroup.position);
    scene.add(diaLight);

    fragments.push({
      mesh: diamondGroup, light: diaLight,
      id: 'mem_diamonds', narratorId: 'tab4_mem2',
      x: -10, z: -4,
      animate: (t) => {
        diamondGroup.rotation.y = t * 0.6;
        diamondGroup.position.y = 1.0 + 0.15 * Math.sin(t * 1.2);
      }
    });
  }

  // Fragment 3: Pulsing sphere — "The Loop" memory
  if (!alreadyCollected.includes('mem_sphere')) {
    const sphereGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      emissive: 0xFFFFFF,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.7,
      wireframe: true,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(2, 1.5, 12);
    scene.add(sphere);

    const sphereLight = new THREE.PointLight(0xFFFFFF, 0.4, 6);
    sphereLight.position.copy(sphere.position);
    scene.add(sphereLight);

    fragments.push({
      mesh: sphere, light: sphereLight,
      id: 'mem_sphere', narratorId: 'tab4_mem3',
      x: 2, z: 12,
      animate: (t) => {
        const pulse = 0.5 + 0.15 * Math.sin(t * 2.0);
        sphere.scale.setScalar(pulse / 0.5);
        sphere.position.y = 1.5 + 0.3 * Math.sin(t * 0.5);
        sphereLight.intensity = 0.3 + 0.2 * Math.sin(t * 2.0);
      }
    });
  }

  // Fragment collection count HUD
  const fragHud = document.createElement('div');
  fragHud.style.cssText = `
    position: fixed;
    top: 12px;
    right: 16px;
    font-family: monospace;
    font-size: 14px;
    color: rgba(0, 229, 255, 0.5);
    user-select: none;
    pointer-events: none;
    z-index: 100;
  `;
  document.body.appendChild(fragHud);

  function updateFragHud() {
    const collected = state.getState().tabs?.['4']?.fragmentsCollected || [];
    fragHud.textContent = `${collected.length} / 3`;
  }
  updateFragHud();

  // ── Mouse look ─────────────────────────────────────────────────────────
  let yaw = 0;
  let pitch = 0;
  const PITCH_LIMIT = Math.PI / 2 - 0.05;
  const SENSITIVITY = 0.002;

  threeCanvas.addEventListener('click', () => {
    threeCanvas.requestPointerLock();
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== threeCanvas) return;
    yaw -= e.movementX * SENSITIVITY;
    pitch -= e.movementY * SENSITIVITY;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  });

  // ── Keyboard ───────────────────────────────────────────────────────────
  const keys = {};
  window.addEventListener('keydown', (e) => { keys[e.code] = true; });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  // ── Resize ─────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    glRenderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── Conclusion state ───────────────────────────────────────────────────
  let conclusionTriggered = false;

  function triggerConclusion() {
    if (conclusionTriggered) return;
    conclusionTriggered = true;
    console.log('[Conclusion] Tab 4 — triggerConclusion() fired');

    // Mark Act 2 complete
    state.setState((s) => {
      s.meta.actTwoComplete = true;
      return s;
    }, tabNum);

    // Broadcast to ALL tabs (they get title change + narrator at bottom)
    console.log('[Conclusion] Tab 4 — broadcasting GAME_COMPLETE_FINAL');
    channel.send('GAME_COMPLETE_FINAL', { fromTab: tabNum }, tabNum);

    // Title and favicon — Tab 4 gets "LOOP" (other tabs set their own word)
    document.title = 'LOOP';
    favicon.setFavicon('circle');

    // Stop ambient before playing the concluding swell
    console.log('[Conclusion] Tab 4 — stopping ambient, then playing concluding swell');
    if (audio.stopAmbient) audio.stopAmbient();

    // Play the concluding swell — only Tab 4 plays this
    if (audio.playConcludingSwell) {
      audio.playConcludingSwell();
    }

    // ── Full-screen conclusion overlay (Tab 4 only) ─────────────────────
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: #000;
      opacity: 0;
      transition: opacity 2s ease-in;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    `;
    document.body.appendChild(overlay);

    // Main conclusion text — large cyan
    const mainText = document.createElement('div');
    mainText.style.cssText = `
      font-family: monospace;
      font-size: 32px;
      color: #00E5FF;
      text-align: center;
      line-height: 1.6;
      opacity: 0;
      transition: opacity 1.5s ease-in;
      max-width: 80%;
      padding: 0 24px;
    `;
    mainText.textContent = 'I am not in these rooms. These rooms are in me.';
    overlay.appendChild(mainText);

    // "press R to reset" — small, dim
    const resetText = document.createElement('div');
    resetText.style.cssText = `
      font-family: monospace;
      font-size: 12px;
      color: rgba(0, 229, 255, 0.4);
      text-align: center;
      margin-top: 40px;
      opacity: 0;
      transition: opacity 1.5s ease-in;
    `;
    resetText.textContent = 'press R to reset';
    overlay.appendChild(resetText);

    // t=0: fade overlay to black
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });

    // t=2s: overlay fully black — show main text
    setTimeout(() => {
      mainText.style.opacity = '1';
    }, 2000);

    // t=7s: 5 seconds after main text — fade in reset prompt
    setTimeout(() => {
      resetText.style.opacity = '1';
    }, 7000);

    // R key handler — enabled once reset text is visible
    function onResetKey(e) {
      if (e.key === 'r' || e.key === 'R') {
        window.removeEventListener('keydown', onResetKey);
        state.resetState();
        window.location.href = 'index.html';
      }
    }
    setTimeout(() => {
      window.addEventListener('keydown', onResetKey);
    }, 7000);

    console.log('[Level 4] GAME_COMPLETE_FINAL. Full-screen conclusion displayed.');
  }

  // ── Animation loop ─────────────────────────────────────────────────────
  let prevTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min((now - prevTime) / 1000, 0.1);
    prevTime = now;
    const t = now * 0.001; // time in seconds for animation

    // Camera rotation
    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);

    // Movement
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    const moveDir = new THREE.Vector3(0, 0, 0);
    if (keys['ArrowUp'] || keys['KeyW']) moveDir.add(forward);
    if (keys['ArrowDown'] || keys['KeyS']) moveDir.sub(forward);
    if (keys['ArrowRight'] || keys['KeyD']) moveDir.add(right);
    if (keys['ArrowLeft'] || keys['KeyA']) moveDir.sub(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(MOVE_SPEED * dt);
      camera.position.x += moveDir.x;
      camera.position.z += moveDir.z;
    }

    camera.position.y = PLAYER_HEIGHT;
    playerLight.position.copy(camera.position);

    // ── Animate and proximity-check fragments ──────────────────────────
    for (let i = fragments.length - 1; i >= 0; i--) {
      const frag = fragments[i];
      frag.animate(t);

      const dx = camera.position.x - frag.x;
      const dz = camera.position.z - frag.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < COLLECT_RADIUS) {
        // Collect
        scene.remove(frag.mesh);
        scene.remove(frag.light);
        fragments.splice(i, 1);

        // Persist
        state.setState((s) => {
          if (!s.tabs['4']) s.tabs['4'] = { visitCount: 0, state: 'visited', fragmentsCollected: [] };
          if (!s.tabs['4'].fragmentsCollected) s.tabs['4'].fragmentsCollected = [];
          if (!s.tabs['4'].fragmentsCollected.includes(frag.id)) {
            s.tabs['4'].fragmentsCollected.push(frag.id);
          }
          return s;
        }, tabNum);

        // Audio
        audio.playChime(tabNum);

        // Narrator
        if (narrator && narrator.triggerNarrator) {
          narrator.triggerNarrator(frag.narratorId);
        }

        updateFragHud();

        const collected = state.getState().tabs?.['4']?.fragmentsCollected || [];
        console.log(`[Level 4] Memory fragment collected: ${frag.id}. Total: ${collected.length}/3`);

        // All 3 — trigger conclusion after a brief pause
        if (collected.length >= 3) {
          setTimeout(() => triggerConclusion(), 3000);
        }
      }
    }

    glRenderer.render(scene, camera);
  }

  // ── Crossfade in ───────────────────────────────────────────────────────
  const canvas2d = document.getElementById('game-canvas');
  if (canvas2d) {
    canvas2d.style.transition = 'opacity 2s ease-out';
    canvas2d.style.opacity = '0';
  }

  animate();

  requestAnimationFrame(() => {
    threeCanvas.style.opacity = '1';
  });

  // Entry narrator
  setTimeout(() => {
    if (narrator && narrator.triggerNarrator) {
      narrator.triggerNarrator('tab4_enter');
    }
  }, 1500);

  // Hide 2D canvas
  setTimeout(() => {
    if (canvas2d) canvas2d.style.display = 'none';
  }, 2500);

  // Start ambient audio
  if (audio.playAmbient) {
    audio.playAmbient(1); // Use Tab 1's base frequency as the mindspace ambient
  }

  console.log('[Level 4] Emergence loaded. 3 memory fragments to collect.');
}
