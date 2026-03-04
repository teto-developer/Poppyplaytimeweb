import * as THREE from 'https://unpkg.com/three@0.169.0/build/three.module.js';

const canvas = document.querySelector('#game');
const statusText = document.querySelector('#status');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1020);
scene.fog = new THREE.Fog(0x0a1020, 8, 42);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 1.8, 8);

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
  new THREE.PlaneGeometry(90, 90),
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

makeWall(0, 2.5, -20, 35, 5, 1);
makeWall(-17, 2.5, -2, 1, 5, 37);
makeWall(17, 2.5, -2, 1, 5, 37);
makeWall(0, 2.5, 16, 35, 5, 1);

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

const player = {
  velocity: new THREE.Vector3(),
  speed: 7,
  dashSpeed: 12,
  jumpForce: 6,
  onGround: true
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
  canvas.requestPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) {
    updateStatus('探索中... 左クリックでGrabPack');
  } else {
    updateStatus('クリックして開始');
  }
});

canvas.addEventListener('click', () => {
  if (!locked) {
    requestLock();
    return;
  }

  if (heldObject) {
    heldObject.userData.releasedAt = performance.now();
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
    heldObject.material.emissive.setHex(0x3344ff);
    updateStatus('GrabPack: 掴み中（もう一度クリックで離す）');
  } else {
    updateStatus('掴めるオブジェクトが見つからない');
  }
});

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space' && player.onGround) {
    player.velocity.y = player.jumpForce;
    player.onGround = false;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

window.addEventListener('mousemove', (e) => {
  if (!locked) return;
  yaw -= e.movementX * pointerSensitivity;
  pitch -= e.movementY * pointerSensitivity;
  pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
});

const clock = new THREE.Clock();

function updateMovement(dt) {
  const move = new THREE.Vector3();
  if (keys.has('KeyW')) move.z -= 1;
  if (keys.has('KeyS')) move.z += 1;
  if (keys.has('KeyA')) move.x -= 1;
  if (keys.has('KeyD')) move.x += 1;

  if (move.lengthSq() > 0) {
    move.normalize();
    const speed = keys.has('ShiftLeft') ? player.dashSpeed : player.speed;
    move.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    camera.position.x += move.x * speed * dt;
    camera.position.z += move.z * speed * dt;
  }

  player.velocity.y -= 15 * dt;
  camera.position.y += player.velocity.y * dt;

  if (camera.position.y < 1.8) {
    camera.position.y = 1.8;
    player.velocity.y = 0;
    player.onGround = true;
  }

  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -15.5, 15.5);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -19.5, 15.5);
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
      obj.material.emissive.setHex(0x111111);
      const wobble = Math.sin(elapsed * 1.8 + obj.position.x) * 0.002;
      obj.rotation.y += wobble;
    }
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
