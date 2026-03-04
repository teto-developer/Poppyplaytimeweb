import * as THREE from 'https://unpkg.com/three@0.169.0/build/three.module.js';

const STORAGE_KEY = 'poppy-map-v2';

const canvas = document.querySelector('#game');
const statusText = document.querySelector('#status');
const tileTypeInput = document.querySelector('#tileType');
const tileSizeInput = document.querySelector('#tileSize');
const tileHeightInput = document.querySelector('#tileHeight');
const mapDataArea = document.querySelector('#mapData');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1020);
scene.fog = new THREE.Fog(0x0a1020, 8, 45);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 1.8, 10);

const hemi = new THREE.HemisphereLight(0x88aaff, 0x120f1f, 0.4);
scene.add(hemi);

const overhead = new THREE.SpotLight(0x99ccff, 35, 50, Math.PI / 7, 0.5, 1.5);
overhead.position.set(0, 7, 3);
overhead.castShadow = true;
overhead.shadow.mapSize.set(1024, 1024);
scene.add(overhead);
scene.add(overhead.target);

const alarm = new THREE.PointLight(0xff2244, 8, 20, 2.2);
alarm.position.set(-6, 2.8, -6);
scene.add(alarm);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: 0x2d3445, roughness: 0.92, metalness: 0.1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x394764, roughness: 0.8 });
function makeWall(x, y, z, sx, sy, sz) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMaterial);
  wall.position.set(x, y, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
}

makeWall(0, 2.5, -22, 40, 5, 1);
makeWall(-20, 2.5, 0, 1, 5, 45);
makeWall(20, 2.5, 0, 1, 5, 45);
makeWall(0, 2.5, 22, 40, 5, 1);

const toyColors = [0xf6d365, 0x84fab0, 0xa18cd1, 0xff9a9e, 0x8fd3f4, 0xfbc2eb];
const grabbables = [];
for (let i = 0; i < 18; i += 1) {
  const toy = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: toyColors[i % toyColors.length],
      roughness: 0.45,
      metalness: 0.3,
      emissive: 0x111111
    })
  );
  const row = Math.floor(i / 6);
  const col = i % 6;
  toy.position.set(-10 + col * 4, 0.7, -14 + row * 7);
  toy.castShadow = true;
  toy.receiveShadow = true;
  scene.add(toy);
  grabbables.push(toy);
}

const editorGroup = new THREE.Group();
scene.add(editorGroup);
const editorTiles = [];

function makeTileMaterial(type) {
  const map = {
    wall: 0x465572,
    crate: 0x845b35,
    column: 0x606c7f,
    light: 0x446677
  };
  return new THREE.MeshStandardMaterial({ color: map[type] ?? 0x5f7089, roughness: 0.7, metalness: 0.2 });
}

function createTile(data) {
  const geoByType = {
    wall: () => new THREE.BoxGeometry(data.size, data.height, 0.8),
    crate: () => new THREE.BoxGeometry(data.size, data.size, data.size),
    column: () => new THREE.CylinderGeometry(data.size * 0.5, data.size * 0.5, data.height, 16),
    light: () => new THREE.CylinderGeometry(0.2, 0.2, data.height, 12)
  };
  const geometry = (geoByType[data.type] ?? geoByType.wall)();
  const mesh = new THREE.Mesh(geometry, makeTileMaterial(data.type));
  mesh.position.set(data.x, data.y, data.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.mapTile = true;
  mesh.userData.mapData = data;
  editorGroup.add(mesh);
  editorTiles.push(mesh);
  grabbables.push(mesh);
}

function clearMap() {
  while (editorTiles.length > 0) {
    const tile = editorTiles.pop();
    editorGroup.remove(tile);
    tile.geometry.dispose();
    tile.material.dispose();
    const index = grabbables.indexOf(tile);
    if (index >= 0) grabbables.splice(index, 1);
  }
}

function getMapJson() {
  return editorTiles.map((tile) => ({ ...tile.userData.mapData }));
}

function saveMap() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getMapJson()));
  updateStatus('マップを保存した');
}

function loadMapFrom(jsonText, silent = false) {
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) throw new Error('array required');
    clearMap();
    parsed.forEach((tile) => createTile(tile));
    if (!silent) updateStatus('マップを読み込んだ');
  } catch {
    if (!silent) updateStatus('マップJSONの読み込みに失敗');
  }
}

function loadSavedMap() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    loadMapFrom(saved, true);
    return;
  }
  [
    { type: 'wall', size: 6, height: 4, x: 0, y: 2, z: -4 },
    { type: 'crate', size: 2, height: 2, x: -4, y: 1, z: -1 },
    { type: 'column', size: 2, height: 5, x: 6, y: 2.5, z: -3 }
  ].forEach(createTile);
}

const player = {
  velocity: new THREE.Vector3(),
  speed: 7,
  dashSpeed: 12,
  jumpForce: 6,
  onGround: true
};

const inputState = {
  moveX: 0,
  moveY: 0,
  lookX: 0,
  lookY: 0,
  dash: false
};

const keys = new Set();
let locked = false;
let yaw = 0;
let pitch = 0;
const pointerSensitivity = 0.002;

const raycaster = new THREE.Raycaster();
let heldObject = null;
let grabLine = null;

function updateStatus(text) {
  statusText.textContent = text;
}

function requestLock() {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  canvas.requestPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  updateStatus(locked ? '探索中... 左クリックでGrabPack' : 'クリックまたはタップして開始');
});

function toggleGrab() {
  if (heldObject) {
    heldObject = null;
    if (grabLine) {
      scene.remove(grabLine);
      grabLine.geometry.dispose();
      grabLine.material.dispose();
      grabLine = null;
    }
    updateStatus('オブジェクトを離した');
    return;
  }

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = raycaster.intersectObjects(grabbables, false)[0];
  if (hit && hit.distance < 11) {
    heldObject = hit.object;
    heldObject.material.emissive?.setHex(0x3344ff);
    updateStatus('GrabPack: 掴み中');
  } else {
    updateStatus('掴めるオブジェクトが見つからない');
  }
}

canvas.addEventListener('click', () => {
  if (!locked) requestLock();
});
window.addEventListener('dblclick', toggleGrab);

document.querySelector('#jumpBtn').addEventListener('click', () => {
  if (player.onGround) {
    player.velocity.y = player.jumpForce;
    player.onGround = false;
  }
});
document.querySelector('#grabBtn').addEventListener('click', toggleGrab);

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space' && player.onGround) {
    player.velocity.y = player.jumpForce;
    player.onGround = false;
  }
  if (e.code === 'KeyE') toggleGrab();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

window.addEventListener('mousemove', (e) => {
  if (!locked) return;
  yaw -= e.movementX * pointerSensitivity;
  pitch -= e.movementY * pointerSensitivity;
  pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
});

function bindTouchPad(elementId, handler) {
  const el = document.querySelector(elementId);
  let active = false;
  let baseX = 0;
  let baseY = 0;

  el.addEventListener('pointerdown', (e) => {
    active = true;
    baseX = e.clientX;
    baseY = e.clientY;
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener('pointermove', (e) => {
    if (!active) return;
    const dx = (e.clientX - baseX) / 60;
    const dy = (e.clientY - baseY) / 60;
    handler(THREE.MathUtils.clamp(dx, -1, 1), THREE.MathUtils.clamp(dy, -1, 1));
  });

  const stop = () => {
    active = false;
    handler(0, 0);
  };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
}

bindTouchPad('#movePad', (x, y) => {
  inputState.moveX = x;
  inputState.moveY = y;
});
bindTouchPad('#lookPad', (x, y) => {
  inputState.lookX = x;
  inputState.lookY = y;
});

const editorRay = new THREE.Raycaster();
function getForwardPlacement(distance = 5) {
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
  return camera.position.clone().add(dir.multiplyScalar(distance));
}

function addTileInFront() {
  const size = Number(tileSizeInput.value) || 2;
  const height = Number(tileHeightInput.value) || 3;
  const pos = getForwardPlacement(6);
  const data = {
    type: tileTypeInput.value,
    size,
    height,
    x: Math.round(pos.x),
    y: tileTypeInput.value === 'crate' ? size / 2 : height / 2,
    z: Math.round(pos.z)
  };
  createTile(data);
  updateStatus('タイルを追加');
}

function removeTargetTile() {
  editorRay.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = editorRay.intersectObjects(editorTiles, false)[0];
  if (!hit) {
    updateStatus('削除対象が見つからない');
    return;
  }
  const tile = hit.object;
  const idx = editorTiles.indexOf(tile);
  if (idx >= 0) editorTiles.splice(idx, 1);
  editorGroup.remove(tile);
  tile.geometry.dispose();
  tile.material.dispose();
  const gIdx = grabbables.indexOf(tile);
  if (gIdx >= 0) grabbables.splice(gIdx, 1);
  updateStatus('タイルを削除');
}

document.querySelector('#addTile').addEventListener('click', addTileInFront);
document.querySelector('#removeTile').addEventListener('click', removeTargetTile);
document.querySelector('#saveMap').addEventListener('click', saveMap);
document.querySelector('#resetMap').addEventListener('click', () => {
  clearMap();
  localStorage.removeItem(STORAGE_KEY);
  updateStatus('マップをリセットした');
});
document.querySelector('#exportMap').addEventListener('click', () => {
  mapDataArea.value = JSON.stringify(getMapJson(), null, 2);
  updateStatus('マップJSONを出力');
});
document.querySelector('#importMap').addEventListener('click', () => {
  loadMapFrom(mapDataArea.value);
});

const clock = new THREE.Clock();

function updateMovement(dt) {
  const move = new THREE.Vector3();
  if (keys.has('KeyW')) move.z -= 1;
  if (keys.has('KeyS')) move.z += 1;
  if (keys.has('KeyA')) move.x -= 1;
  if (keys.has('KeyD')) move.x += 1;

  move.x += inputState.moveX;
  move.z += inputState.moveY;

  if (move.lengthSq() > 0) {
    move.normalize();
    const speed = keys.has('ShiftLeft') || inputState.dash ? player.dashSpeed : player.speed;
    move.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    camera.position.x += move.x * speed * dt;
    camera.position.z += move.z * speed * dt;
  }

  yaw -= inputState.lookX * pointerSensitivity * 25;
  pitch -= inputState.lookY * pointerSensitivity * 25;
  pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
  camera.rotation.set(pitch, yaw, 0, 'YXZ');

  player.velocity.y -= 15 * dt;
  camera.position.y += player.velocity.y * dt;

  if (camera.position.y < 1.8) {
    camera.position.y = 1.8;
    player.velocity.y = 0;
    player.onGround = true;
  }

  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -19, 19);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -21, 21);
}

function updateGrabVisual() {
  if (!heldObject) return;
  const handPos = new THREE.Vector3(0.35, -0.2, -0.8).applyEuler(camera.rotation).add(camera.position);
  const targetPos = new THREE.Vector3(0, 0, -4).applyEuler(camera.rotation).add(camera.position);
  heldObject.position.lerp(targetPos, 0.2);
  heldObject.rotation.y += 0.02;

  if (!grabLine) {
    grabLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([handPos, heldObject.position.clone()]),
      new THREE.LineBasicMaterial({ color: 0x4ea1ff })
    );
    scene.add(grabLine);
  }

  grabLine.geometry.setFromPoints([handPos, heldObject.position.clone()]);
}

function pulseAlarm(t) {
  const pulse = (Math.sin(t * 2.4) + 1) / 2;
  alarm.intensity = 4 + pulse * 5;
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  updateMovement(dt);
  updateGrabVisual();
  pulseAlarm(elapsed);

  grabbables.forEach((obj) => {
    if (obj !== heldObject) {
      obj.material.emissive?.setHex(0x111111);
      const wobble = Math.sin(elapsed * 1.8 + obj.position.x) * 0.002;
      obj.rotation.y += wobble;
    }
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

loadSavedMap();
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
