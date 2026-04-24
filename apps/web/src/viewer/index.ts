import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const DEG2RAD = Math.PI / 180;

export interface GroundStressField {
  colors: number[];
  columns: number;
  depthM: number;
  rows: number;
  valuesPa: number[];
  widthM: number;
}

export interface GroundStressVolumeLayer extends GroundStressField {
  opacity: number;
  yM: number;
}

export interface StressFlowPath {
  axis: "xz" | "yz";
  groundY: number;
  horizontalM: number;
  offsetM: number;
  pointY: number;
  topY: number;
}

export interface ViewerProbeCoordinate {
  label: string;
  value: number;
}

export interface ViewerVector3Like {
  x: number;
  y: number;
  z: number;
}

export interface ViewerCameraPose {
  position: ViewerVector3Like;
  target: ViewerVector3Like;
}

export interface ViewerSectionPlane {
  domain: "ground" | "specimen";
  normal: ViewerVector3Like;
  origin: ViewerVector3Like;
  title: string;
  uAxis: ViewerVector3Like;
  uLabel: string;
  uMaxM: number;
  uMinM: number;
  vAxis: ViewerVector3Like;
  vLabel: string;
  vMaxM: number;
  vMinM: number;
}

export interface ViewerProbe {
  clientX: number;
  clientY: number;
  coords: ViewerProbeCoordinate[];
  domain: "ground" | "specimen";
  localPoint: THREE.Vector3;
  modelPoint: THREE.Vector3;
  plane: ViewerSectionPlane;
  selectableSection: boolean;
  surfaceNormal: THREE.Vector3;
}

export interface ViewerState {
  cameraPose: ViewerCameraPose | null;
  depthM: number;
  groundStressField: GroundStressField | null;
  groundStressVolumeLayers: GroundStressVolumeLayer[] | null;
  heightM: number;
  highlightedSectionPoint: ViewerVector3Like | null;
  rotationXDeg: number;
  rotationYDeg: number;
  sectionBottomColorCss: string;
  sectionGradientMode: "uniform" | "vertical";
  sectionTopColorCss: string;
  sectionUniformColorCss: string;
  showReferenceFigure: boolean;
  showReferenceHouse: boolean;
  showGround: boolean;
  showGroundVolume: boolean;
  selectedSectionPlane: ViewerSectionPlane | null;
  showSection: boolean;
  showSky: boolean;
  stressFlowPath: StressFlowPath | null;
  theme: "dark" | "light";
  volumeBottomColorCss: string;
  volumeSliceCount: number;
  volumeTopColorCss: string;
  widthM: number;
}

export interface ConcreteStressViewerOptions {
  container: HTMLElement;
  onCameraChange?(cameraPose: ViewerCameraPose): void;
  onProbe?(probe: ViewerProbe): void;
  onProbeLeave?(): void;
  onProbeSelect?(probe: ViewerProbe | null): void;
}

export interface ConcreteStressViewer {
  dispose(): void;
  resetCamera(): void;
  update(nextState: Partial<ViewerState>): void;
}

function createGroundTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  context.fillStyle = "#7b8e61";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 900; index += 1) {
    const x = (Math.sin(index * 13.73) * 0.5 + 0.5) * canvas.width;
    const y = (Math.cos(index * 9.21) * 0.5 + 0.5) * canvas.height;
    const radius = 8 + (Math.sin(index * 4.17) * 0.5 + 0.5) * 28;
    const tone = index % 3 === 0 ? "rgba(116, 132, 84, 0.22)" : "rgba(148, 120, 82, 0.18)";

    context.fillStyle = tone;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  for (let lineIndex = 0; lineIndex < 180; lineIndex += 1) {
    const startX = (Math.sin(lineIndex * 7.13) * 0.5 + 0.5) * canvas.width;
    const startY = (Math.cos(lineIndex * 5.43) * 0.5 + 0.5) * canvas.height;
    const length = 12 + (Math.sin(lineIndex * 2.91) * 0.5 + 0.5) * 38;

    context.strokeStyle = "rgba(171, 149, 105, 0.12)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(startX + length, startY + length * 0.18);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 12, 128, 128, 108);

  gradient.addColorStop(0, "rgba(18, 28, 38, 0.42)");
  gradient.addColorStop(0.48, "rgba(18, 28, 38, 0.18)");
  gradient.addColorStop(1, "rgba(18, 28, 38, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createMountainShape(seed) {
  const shape = new THREE.Shape();
  const ridgePoints = 18;

  shape.moveTo(-0.5, -0.5);

  for (let index = 0; index <= ridgePoints; index += 1) {
    const x = -0.5 + index / ridgePoints;
    const y =
      -0.18 +
      Math.sin((index + seed) * 0.84) * 0.22 +
      Math.sin((index + seed * 1.9) * 1.61) * 0.08 +
      Math.cos((index + seed * 0.7) * 0.53) * 0.06;
    shape.lineTo(x, Math.min(0.48, y));
  }

  shape.lineTo(0.5, -0.5);
  shape.closePath();
  return shape;
}

function createMountainRidge(seed, color) {
  return new THREE.Mesh(
    new THREE.ShapeGeometry(createMountainShape(seed)),
    new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      metalness: 0,
      roughness: 1,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
    })
  );
}

function createCloudCluster() {
  const cloud = new THREE.Group();

  for (let index = 0; index < 5; index += 1) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 18),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.78,
        roughness: 0.95,
        metalness: 0,
        depthWrite: false,
      })
    );
    puff.position.set(
      (index - 2) * 1.05,
      Math.sin(index * 0.9) * 0.22,
      Math.cos(index * 0.8) * 0.35
    );
    puff.scale.set(1.25, 0.72, 0.9);
    cloud.add(puff);
  }

  return cloud;
}

function createOrientedCylinder(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radiusTop: number,
  radiusBottom: number,
  radialSegments: number,
  material: THREE.Material
) {
  const direction = to.clone().sub(from);
  const length = Math.max(direction.length(), 1e-6);
  const center = from.clone().add(to).multiplyScalar(0.5);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments, 3),
    material
  );

  mesh.position.copy(center);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createReferenceTree() {
  const tree = new THREE.Group();
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x755233,
    metalness: 0,
    roughness: 0.94,
  });
  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: 0x5f8d43,
    metalness: 0,
    roughness: 0.96,
    flatShading: true,
  });
  const trunkParts: THREE.Mesh[] = [];
  const foliageParts: THREE.Mesh[] = [];

  const trunkLower = createOrientedCylinder(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 7.4, 0),
    0.34,
    0.58,
    20,
    trunkMaterial
  );
  trunkLower.name = "tree-trunk";
  tree.add(trunkLower);
  trunkParts.push(trunkLower);

  const trunkUpper = createOrientedCylinder(
    new THREE.Vector3(0, 7.0, 0),
    new THREE.Vector3(0.12, 9.2, -0.08),
    0.2,
    0.32,
    18,
    trunkMaterial
  );
  trunkUpper.name = "tree-trunk";
  tree.add(trunkUpper);
  trunkParts.push(trunkUpper);

  const branchDescriptors = [
    { from: [0.08, 6.8, 0.02], to: [1.8, 8.1, 0.9], top: 0.08, bottom: 0.16 },
    { from: [-0.05, 7.3, -0.04], to: [-1.9, 8.7, -0.5], top: 0.07, bottom: 0.15 },
    { from: [0.04, 7.7, 0.06], to: [1.2, 9.1, -1.3], top: 0.06, bottom: 0.13 },
    { from: [-0.06, 7.9, 0.04], to: [-1.4, 9.35, 1.15], top: 0.06, bottom: 0.12 },
    { from: [0.02, 8.1, -0.05], to: [0.95, 9.55, 1.5], top: 0.05, bottom: 0.11 },
    { from: [-0.02, 8.0, 0.03], to: [-0.95, 9.4, -1.55], top: 0.05, bottom: 0.11 },
  ];

  branchDescriptors.forEach(function (descriptor) {
    const branch = createOrientedCylinder(
      new THREE.Vector3(...descriptor.from),
      new THREE.Vector3(...descriptor.to),
      descriptor.top,
      descriptor.bottom,
      12,
      trunkMaterial
    );
    branch.name = "tree-branch";
    tree.add(branch);
    trunkParts.push(branch);
  });

  for (let index = 0; index < 26; index += 1) {
    const azimuth = (index / 26) * Math.PI * 2;
    const heightBand = Math.floor(index / 7);
    const radius = 1.6 + (Math.sin(index * 1.73) * 0.5 + 0.5) * 1.35;
    const y = 7.2 + heightBand * 0.72 + Math.sin(index * 0.91) * 0.42;
    const offsetX = Math.cos(azimuth) * radius;
    const offsetZ = Math.sin(azimuth) * radius * 0.92;
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.88 + (index % 4) * 0.18, 2),
      foliageMaterial
    );

    blob.position.set(offsetX, y, offsetZ);
    blob.scale.set(
      1.05 + (index % 3) * 0.18,
      0.92 + ((index + 1) % 3) * 0.16,
      0.96 + ((index + 2) % 3) * 0.14
    );
    blob.rotation.set(index * 0.21, index * 0.37, index * 0.17);
    blob.castShadow = true;
    blob.receiveShadow = true;
    blob.name = "tree-foliage";
    tree.add(blob);
    foliageParts.push(blob);
  }

  tree.userData = {
    foliageParts,
    trunkParts,
  };
  return tree;
}

function mapVolumeCoords(localPoint, state) {
  return [
    { label: "x", value: localPoint.x + state.widthM / 2 },
    { label: "y", value: localPoint.y + state.heightM / 2 },
    { label: "z", value: localPoint.z + state.depthM / 2 },
  ];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function replaceGeometry(object, geometry) {
  if (object.geometry) {
    object.geometry.dispose();
  }
  object.geometry = geometry;
}

function setSolidGeometryColor(geometry, color) {
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);

  for (let index = 0; index < positions.count; index += 1) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function setGeometryColors(geometry, colors) {
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
}

function toVector3(vectorLike: ViewerVector3Like) {
  return new THREE.Vector3(vectorLike.x, vectorLike.y, vectorLike.z);
}

function toVector3Like(vector: THREE.Vector3): ViewerVector3Like {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  };
}

function getPlaneCenter(plane: ViewerSectionPlane) {
  const origin = toVector3(plane.origin);
  const uAxis = toVector3(plane.uAxis);
  const vAxis = toVector3(plane.vAxis);
  const uMid = (plane.uMinM + plane.uMaxM) * 0.5;
  const vMid = (plane.vMinM + plane.vMaxM) * 0.5;

  return origin.add(uAxis.multiplyScalar(uMid)).add(vAxis.multiplyScalar(vMid));
}

function applyPlaneTransform(
  object: THREE.Object3D,
  plane: ViewerSectionPlane,
  centerOverride?: THREE.Vector3
) {
  const uAxis = toVector3(plane.uAxis).normalize();
  const vAxis = toVector3(plane.vAxis).normalize();
  const normal = toVector3(plane.normal).normalize();
  const rotationMatrix = new THREE.Matrix4().makeBasis(uAxis, vAxis, normal);

  object.quaternion.setFromRotationMatrix(rotationMatrix);
  object.position.copy(centerOverride || getPlaneCenter(plane));
}

function copyPlaneWithExtents(
  plane: ViewerSectionPlane,
  uMinM: number,
  uMaxM: number,
  vMinM: number,
  vMaxM: number
): ViewerSectionPlane {
  return {
    ...plane,
    uMaxM,
    uMinM,
    vMaxM,
    vMinM,
  };
}

function setVerticalGradientGeometryColor(geometry, heightM, bottomColor, topColor) {
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    const normalized = clamp((positions.getY(index) + heightM / 2) / Math.max(heightM, 1e-6), 0, 1);
    color.copy(bottomColor).lerp(topColor, normalized);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function disposeGroupChildren(group) {
  while (group.children.length) {
    const child = group.children.pop();
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(function (material) {
          material.dispose();
        });
      } else {
        child.material.dispose();
      }
    }
  }
}

export function createConcreteStressViewer(
  options: ConcreteStressViewerOptions
): ConcreteStressViewer {
  const container = options.container;
  const onCameraChange = options.onCameraChange || function () {};
  const onProbe = options.onProbe || function () {};
  const onProbeLeave = options.onProbeLeave || function () {};
  const onProbeSelect = options.onProbeSelect || function () {};

  if (!container) {
    throw new Error("createConcreteStressViewer requires a container element.");
  }

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "viewer-canvas-element";
  container.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd4e4f6, 6, 38);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
  camera.position.set(1.9, 1.35, 2.8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.target.set(0, 0.32, 0);
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.addEventListener("start", function () {
    renderer.domElement.classList.add("is-dragging");
  });
  controls.addEventListener("end", function () {
    renderer.domElement.classList.remove("is-dragging");
  });

  const hemisphereLight = new THREE.HemisphereLight(0xf7fbff, 0x6f8a68, 1.65);
  scene.add(hemisphereLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
  keyLight.position.set(5, 6, 3);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1536, 1536);
  keyLight.shadow.bias = -0.00012;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 30;
  keyLight.shadow.camera.left = -8;
  keyLight.shadow.camera.right = 8;
  keyLight.shadow.camera.top = 8;
  keyLight.shadow.camera.bottom = -8;
  scene.add(keyLight);
  scene.add(keyLight.target);

  const fillLight = new THREE.DirectionalLight(0xcde5ff, 0.42);
  fillLight.position.set(-4, 3, -5);
  scene.add(fillLight);

  const environmentGroup = new THREE.Group();
  scene.add(environmentGroup);

  const groundTexture = createGroundTexture();
  groundTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const shadowTexture = createShadowTexture();

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 28),
    new THREE.MeshBasicMaterial({
      depthWrite: false,
      side: THREE.BackSide,
      transparent: true,
      vertexColors: true,
    })
  );
  setVerticalGradientGeometryColor(
    skyDome.geometry,
    2,
    new THREE.Color(0xf7ecce),
    new THREE.Color(0x9ecbff)
  );
  skyDome.renderOrder = 0;
  environmentGroup.add(skyDome);

  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: 0xffd878,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    })
  );
  const sunDisc = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: 0xfff1b5,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
    })
  );
  environmentGroup.add(sunGlow);
  environmentGroup.add(sunDisc);

  const mountainsGroup = new THREE.Group();
  const mountainDescriptors = [];
  for (let index = 0; index < 8; index += 1) {
    const mesh = createMountainRidge(index + 1, index % 2 === 0 ? 0x8ca0a5 : 0x748993);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mountainsGroup.add(mesh);
    mountainDescriptors.push({
      angle: (index / 8) * Math.PI * 2,
      heightFactor: 0.8 + (index % 3) * 0.18,
      mesh,
      radiusFactor: index % 2 === 0 ? 1.0 : 1.18,
      widthFactor: 0.85 + (index % 4) * 0.16,
    });
  }
  environmentGroup.add(mountainsGroup);

  const cloudsGroup = new THREE.Group();
  const cloudDescriptors = [];
  for (let index = 0; index < 6; index += 1) {
    const cloud = createCloudCluster();
    cloudsGroup.add(cloud);
    cloudDescriptors.push({
      angle: 0.45 + index * 0.92,
      cluster: cloud,
      heightFactor: 2.2 + (index % 3) * 0.24,
      radiusFactor: 0.72 + (index % 2) * 0.14,
      scaleFactor: 0.18 + index * 0.018,
    });
  }
  environmentGroup.add(cloudsGroup);

  const groundPlane = new THREE.Mesh(
    new THREE.CircleGeometry(1, 80),
    new THREE.MeshStandardMaterial({
      color: 0xf2eee2,
      map: groundTexture,
      metalness: 0,
      roughness: 0.96,
      side: THREE.FrontSide,
    })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.renderOrder = 0;
  groundPlane.receiveShadow = true;
  environmentGroup.add(groundPlane);

  const groundStressMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      depthWrite: false,
      opacity: 0.74,
      side: THREE.FrontSide,
      transparent: true,
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    })
  );
  groundStressMesh.rotation.x = -Math.PI / 2;
  groundStressMesh.renderOrder = 1;
  groundStressMesh.visible = false;
  groundStressMesh.receiveShadow = true;
  environmentGroup.add(groundStressMesh);

  const groundVolumeGroup = new THREE.Group();
  environmentGroup.add(groundVolumeGroup);

  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      alphaMap: shadowTexture,
      color: 0x102033,
      depthWrite: false,
      opacity: 0.28,
      transparent: true,
    })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.renderOrder = 2;
  environmentGroup.add(contactShadow);

  const referenceTree = createReferenceTree();
  referenceTree.renderOrder = 2;
  environmentGroup.add(referenceTree);

  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const specimenGroup = new THREE.Group();
  worldGroup.add(specimenGroup);

  const volumeSlicesGroup = new THREE.Group();
  specimenGroup.add(volumeSlicesGroup);

  const prismMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
    vertexColors: true,
  });
  const prismMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), prismMaterial);
  prismMesh.renderOrder = 1;
  prismMesh.castShadow = true;
  prismMesh.receiveShadow = true;
  specimenGroup.add(prismMesh);

  const shadowCasterMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
  });
  shadowCasterMaterial.colorWrite = false;
  const shadowCasterMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shadowCasterMaterial);
  shadowCasterMesh.castShadow = true;
  shadowCasterMesh.receiveShadow = false;
  specimenGroup.add(shadowCasterMesh);

  const prismEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(prismMesh.geometry),
    new THREE.LineBasicMaterial({
      color: 0x102033,
      transparent: true,
      opacity: 0.22,
    })
  );
  prismEdges.renderOrder = 2;
  specimenGroup.add(prismEdges);

  const selectionBracketMaterial = new THREE.LineBasicMaterial({
    color: 0x2b6bff,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
  });
  const selectionBrackets = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    selectionBracketMaterial
  );
  selectionBrackets.visible = false;
  selectionBrackets.renderOrder = 6;
  specimenGroup.add(selectionBrackets);

  const sectionMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
    depthTest: false,
    vertexColors: true,
  });
  const sectionPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sectionMaterial);
  sectionPlane.renderOrder = 3;
  worldGroup.add(sectionPlane);

  const sectionOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(sectionPlane.geometry),
    new THREE.LineBasicMaterial({
      color: 0x102033,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    })
  );
  sectionOutline.renderOrder = 4;
  worldGroup.add(sectionOutline);

  const previewSectionMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const previewSectionPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), previewSectionMaterial);
  previewSectionPlane.visible = false;
  previewSectionPlane.renderOrder = 3;
  worldGroup.add(previewSectionPlane);

  const previewSectionOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(previewSectionPlane.geometry),
    new THREE.LineBasicMaterial({
      color: 0x2b6bff,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
    })
  );
  previewSectionOutline.visible = false;
  previewSectionOutline.renderOrder = 4;
  worldGroup.add(previewSectionOutline);

  const sectionNormal = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(),
    0.5,
    0x2b6bff,
    0.12,
    0.06
  );
  sectionNormal.line.material.transparent = true;
  sectionNormal.line.material.opacity = 0.9;
  sectionNormal.cone.material.transparent = true;
  sectionNormal.cone.material.opacity = 0.9;
  sectionNormal.renderOrder = 4;
  worldGroup.add(sectionNormal);

  const hoverCrosshair = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: 0x2b6bff,
      transparent: true,
      opacity: 0.92,
    })
  );
  hoverCrosshair.visible = false;
  hoverCrosshair.renderOrder = 7;
  worldGroup.add(hoverCrosshair);

  const sectionPointMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 18, 18),
    new THREE.MeshBasicMaterial({
      color: 0x2fcc71,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      depthTest: false,
    })
  );
  sectionPointMarker.visible = false;
  sectionPointMarker.renderOrder = 8;
  worldGroup.add(sectionPointMarker);

  const stressFlowGroup = new THREE.Group();
  stressFlowGroup.visible = false;
  worldGroup.add(stressFlowGroup);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerInside = false;
  let hasFramed = false;
  let currentGroundLevel = -0.25;
  let currentMaxDimension = 1;
  let currentSceneExtent = 1;
  let currentState: ViewerState = {
    cameraPose: null,
    widthM: 1.0,
    depthM: 1.0,
    heightM: 10.0,
    highlightedSectionPoint: null,
    rotationXDeg: 18,
    rotationYDeg: -28,
    sectionBottomColorCss: "rgb(229, 57, 53)",
    sectionGradientMode: "uniform",
    sectionTopColorCss: "rgb(63, 125, 255)",
    sectionUniformColorCss: "rgb(88, 210, 199)",
    showReferenceFigure: false,
    showReferenceHouse: false,
    volumeBottomColorCss: "rgb(229, 57, 53)",
    volumeTopColorCss: "rgb(63, 125, 255)",
    volumeSliceCount: 15,
    showSection: false,
    showGround: true,
    showGroundVolume: true,
    showSky: false,
    stressFlowPath: null,
    theme: "light",
    groundStressField: null,
    groundStressVolumeLayers: null,
    selectedSectionPlane: null,
  };

  function getCameraPose(): ViewerCameraPose {
    return {
      position: toVector3Like(camera.position),
      target: toVector3Like(controls.target),
    };
  }

  function applyCameraPose(cameraPose: ViewerCameraPose) {
    camera.position.copy(toVector3(cameraPose.position));
    controls.target.copy(toVector3(cameraPose.target));
    hasFramed = true;
    clampCameraAboveGround();
    controls.update();
  }

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function updateCameraEnvelope(sceneExtent: number) {
    currentSceneExtent = sceneExtent;
    currentMaxDimension = sceneExtent;
    camera.near = Math.max(0.005, sceneExtent / 120);
    camera.far = Math.max(48, sceneExtent * 72);
    camera.updateProjectionMatrix();
    controls.minDistance = sceneExtent * 0.42;
    controls.maxDistance = sceneExtent * 14;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;

    const desiredDistance = sceneExtent * 1.4;
    const currentDistance = camera.position.distanceTo(controls.target);

    if (!hasFramed || currentDistance > desiredDistance * 2.2 || currentDistance < desiredDistance * 0.45) {
      const direction = camera.position
        .clone()
        .sub(controls.target)
        .normalize();
      if (direction.lengthSq() < 1e-6) {
        direction.set(0.62, 0.42, 0.66).normalize();
      }
      controls.target.set(0, currentState.heightM * 0.22, 0);
      camera.position.copy(controls.target.clone().add(direction.multiplyScalar(desiredDistance)));
      hasFramed = true;
    }

    clampCameraAboveGround();
    controls.update();
  }

  function resetCamera() {
    hasFramed = false;
    updateCameraEnvelope(currentSceneExtent);
    onCameraChange(getCameraPose());
  }

  function getGroundPlaneExtents() {
    const maxDimension = Math.max(currentState.widthM, currentState.depthM, currentState.heightM, 0.15);

    return {
      depthM: currentState.groundStressField ? currentState.groundStressField.depthM : maxDimension * 4,
      widthM: currentState.groundStressField ? currentState.groundStressField.widthM : maxDimension * 4,
    };
  }

  function createSectionPlaneFromHit(
    modelPoint: THREE.Vector3,
    surfaceNormal: THREE.Vector3
  ): ViewerSectionPlane {
    const extents = getGroundPlaneExtents();
    const absNormal = {
      x: Math.abs(surfaceNormal.x),
      y: Math.abs(surfaceNormal.y),
      z: Math.abs(surfaceNormal.z),
    };
    const makePlane = function (
      domain: "ground" | "specimen",
      title: string,
      origin: THREE.Vector3,
      uAxis: THREE.Vector3,
      uMinM: number,
      uMaxM: number,
      uLabel: string,
      vAxis: THREE.Vector3,
      vMinM: number,
      vMaxM: number,
      vLabel: string
    ): ViewerSectionPlane {
      return {
        domain,
        normal: toVector3Like(uAxis.clone().cross(vAxis).normalize()),
        origin: toVector3Like(origin),
        title,
        uAxis: toVector3Like(uAxis.normalize()),
        uLabel,
        uMaxM,
        uMinM,
        vAxis: toVector3Like(vAxis.normalize()),
        vLabel,
        vMaxM,
        vMinM,
      };
    };

    if (absNormal.y >= absNormal.x && absNormal.y >= absNormal.z) {
      if (modelPoint.y <= currentGroundLevel + 0.02) {
        return makePlane(
          "ground",
          "Ground plan section",
          modelPoint,
          new THREE.Vector3(1, 0, 0),
          -extents.widthM / 2 - modelPoint.x,
          extents.widthM / 2 - modelPoint.x,
          "x",
          new THREE.Vector3(0, 0, 1),
          -extents.depthM / 2 - modelPoint.z,
          extents.depthM / 2 - modelPoint.z,
          "z"
        );
      }

      return makePlane(
        "specimen",
        "Top plan section",
        modelPoint,
        new THREE.Vector3(1, 0, 0),
        -currentState.widthM / 2 - modelPoint.x,
        currentState.widthM / 2 - modelPoint.x,
        "x",
        new THREE.Vector3(0, 0, 1),
        -currentState.depthM / 2 - modelPoint.z,
        currentState.depthM / 2 - modelPoint.z,
        "z"
      );
    }

    if (absNormal.x >= absNormal.z) {
      const inwardNormalX = -Math.sign(surfaceNormal.x) || 1;
      return makePlane(
        "specimen",
        "XZ normal section",
        modelPoint,
        new THREE.Vector3(inwardNormalX, 0, 0),
        0,
        inwardNormalX > 0 ? currentState.widthM / 2 - modelPoint.x : modelPoint.x + currentState.widthM / 2,
        "n",
        new THREE.Vector3(0, 0, 1),
        -currentState.depthM / 2 - modelPoint.z,
        currentState.depthM / 2 - modelPoint.z,
        "z"
      );
    }

    const inwardNormalZ = -Math.sign(surfaceNormal.z) || 1;
    return makePlane(
      "specimen",
      "XZ normal section",
      modelPoint,
      new THREE.Vector3(0, 0, inwardNormalZ),
      0,
      inwardNormalZ > 0 ? currentState.depthM / 2 - modelPoint.z : modelPoint.z + currentState.depthM / 2,
      "n",
      new THREE.Vector3(1, 0, 0),
      -currentState.widthM / 2 - modelPoint.x,
      currentState.widthM / 2 - modelPoint.x,
      "x"
    );
  }

  function getHoverCrosshairAxes(surfaceNormal: THREE.Vector3) {
    const normal = surfaceNormal.clone().normalize();
    let verticalAxis = new THREE.Vector3(0, 1, 0);

    if (Math.abs(normal.dot(verticalAxis)) > 0.92) {
      verticalAxis = new THREE.Vector3(0, 0, 1);
    } else {
      verticalAxis.sub(normal.clone().multiplyScalar(normal.dot(verticalAxis))).normalize();
    }

    const horizontalAxis = normal.clone().cross(verticalAxis).normalize();

    return {
      horizontalAxis,
      verticalAxis,
    };
  }

  function getHoverCrosshairSize(worldPoint: THREE.Vector3) {
    return clamp(
      (() => {
        const distanceToCamera = camera.position.distanceTo(worldPoint);
        const remPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const viewHeightM =
          2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * Math.max(distanceToCamera, 0.01);
        const worldPerPixel = viewHeightM / Math.max(renderer.domElement.clientHeight, 1);
        return worldPerPixel * remPx * 0.7;
      })(),
      0.03,
      Math.max(0.08, currentMaxDimension * 0.08)
    );
  }

  function updateHoverCrosshair(probe: ViewerProbe) {
    const { horizontalAxis, verticalAxis } = getHoverCrosshairAxes(probe.surfaceNormal);
    const halfSize = getHoverCrosshairSize(probe.modelPoint) * 0.5;
    const center = probe.modelPoint.clone();
    const geometry = new THREE.BufferGeometry().setFromPoints([
      center.clone().add(horizontalAxis.clone().multiplyScalar(-halfSize)),
      center.clone().add(horizontalAxis.clone().multiplyScalar(halfSize)),
      center.clone().add(verticalAxis.clone().multiplyScalar(-halfSize)),
      center.clone().add(verticalAxis.clone().multiplyScalar(halfSize)),
    ]);

    replaceGeometry(hoverCrosshair, geometry);
    hoverCrosshair.visible = true;
  }

  function updateSectionGeometry(state) {
    const showSection = Boolean(state.showSection && state.selectedSectionPlane);
    const sectionTopColor = new THREE.Color(
      state.sectionTopColorCss || state.sectionUniformColorCss || state.volumeTopColorCss
    );
    const sectionBottomColor = new THREE.Color(
      state.sectionBottomColorCss || state.sectionUniformColorCss || state.volumeBottomColorCss
    );
    const sectionUniformColor = new THREE.Color(
      state.sectionUniformColorCss || state.sectionBottomColorCss || state.sectionTopColorCss
    );

    const visiblePlane = showSection && state.selectedSectionPlane ? state.selectedSectionPlane : null;

    if (!showSection || !state.selectedSectionPlane || !visiblePlane) {
      sectionPlane.visible = false;
      sectionOutline.visible = false;
      sectionNormal.visible = false;
      sectionPointMarker.visible = Boolean(state.highlightedSectionPoint && state.selectedSectionPlane);
      if (state.highlightedSectionPoint) {
        sectionPointMarker.position.copy(toVector3(state.highlightedSectionPoint));
      }
      return;
    }

    const planeWidth = Math.max(visiblePlane.uMaxM - visiblePlane.uMinM, 0.02);
    const planeHeight = Math.max(visiblePlane.vMaxM - visiblePlane.vMinM, 0.02);

    replaceGeometry(sectionPlane, new THREE.PlaneGeometry(planeWidth, planeHeight));
    replaceGeometry(sectionOutline, new THREE.EdgesGeometry(sectionPlane.geometry));

    if (state.sectionGradientMode === "vertical") {
      setVerticalGradientGeometryColor(
        sectionPlane.geometry,
        planeHeight,
        sectionBottomColor,
        sectionTopColor
      );
    } else {
      setSolidGeometryColor(sectionPlane.geometry, sectionUniformColor);
    }

    applyPlaneTransform(sectionPlane, visiblePlane);
    applyPlaneTransform(sectionOutline, visiblePlane);
    sectionPlane.visible = showSection;
    sectionOutline.visible = showSection;

    const sectionCenter = getPlaneCenter(visiblePlane);
    const sectionNormalVector = toVector3(visiblePlane.normal).normalize();
    sectionNormal.position.copy(sectionCenter);
    sectionNormal.setDirection(sectionNormalVector);
    sectionNormal.setLength(Math.max(planeWidth, planeHeight) * 0.22, 0.12, 0.06);
    sectionNormal.visible = false;

    if (state.highlightedSectionPoint) {
      const markerPoint = toVector3(state.highlightedSectionPoint);
      const markerOffset = sectionNormalVector.clone().multiplyScalar(0.003 * currentMaxDimension);
      sectionPointMarker.position.copy(markerPoint.add(markerOffset));
      sectionPointMarker.scale.setScalar(Math.max(0.7, Math.min(1.4, currentMaxDimension * 0.9)));
      sectionPointMarker.visible = true;
    } else {
      sectionPointMarker.visible = false;
    }
  }

  function updatePreviewSection(probe: ViewerProbe | null) {
    if (!probe) {
      previewSectionPlane.visible = false;
      previewSectionOutline.visible = false;
      hoverCrosshair.visible = false;
      return;
    }

    previewSectionPlane.visible = false;
    previewSectionOutline.visible = false;

    if (probe.plane.domain === "specimen") {
      const planeWidth = Math.max(probe.plane.uMaxM - probe.plane.uMinM, 0.02);
      const planeHeight = Math.max(probe.plane.vMaxM - probe.plane.vMinM, 0.02);
      const planeInset = probe.surfaceNormal.clone().normalize().multiplyScalar(-0.008 * currentMaxDimension);

      replaceGeometry(previewSectionPlane, new THREE.PlaneGeometry(planeWidth, planeHeight));
      replaceGeometry(previewSectionOutline, new THREE.EdgesGeometry(previewSectionPlane.geometry));
      applyPlaneTransform(previewSectionPlane, probe.plane, getPlaneCenter(probe.plane).add(planeInset));
      applyPlaneTransform(previewSectionOutline, probe.plane, getPlaneCenter(probe.plane).add(planeInset));
      previewSectionPlane.visible = false;
      previewSectionOutline.visible = true;
    }

    updateHoverCrosshair(probe);
  }

  function updatePrismGeometry(state) {
    replaceGeometry(prismMesh, new THREE.BoxGeometry(state.widthM, state.heightM, state.depthM));
    replaceGeometry(shadowCasterMesh, new THREE.BoxGeometry(state.widthM, state.heightM, state.depthM));
    setVerticalGradientGeometryColor(
      prismMesh.geometry,
      state.heightM,
      new THREE.Color(state.volumeBottomColorCss),
      new THREE.Color(state.volumeTopColorCss)
    );
    prismMaterial.opacity = state.showSection ? 0.26 : 0.34;
    replaceGeometry(prismEdges, new THREE.EdgesGeometry(prismMesh.geometry));

    specimenGroup.rotation.set(0, 0, 0);
  }

  function updateSelectionBrackets(state) {
    if (!state.selectedSectionPlane) {
      selectionBrackets.visible = false;
      return;
    }

    const halfWidth = state.widthM * 0.5;
    const halfHeight = state.heightM * 0.5;
    const halfDepth = state.depthM * 0.5;
    const cornerLength = Math.max(Math.min(state.widthM, state.heightM, state.depthM) * 0.18, 0.07);
    const inset = Math.max(currentMaxDimension * 0.006, 0.01);
    const points: THREE.Vector3[] = [];
    const addCorner = function (x: number, y: number, z: number) {
      const sx = Math.sign(x) || 1;
      const sy = Math.sign(y) || 1;
      const sz = Math.sign(z) || 1;
      const corner = new THREE.Vector3(
        x + sx * inset,
        y + sy * inset,
        z + sz * inset
      );

      points.push(corner, corner.clone().add(new THREE.Vector3(-sx * cornerLength, 0, 0)));
      points.push(corner, corner.clone().add(new THREE.Vector3(0, -sy * cornerLength, 0)));
      points.push(corner, corner.clone().add(new THREE.Vector3(0, 0, -sz * cornerLength)));
    };

    [-halfWidth, halfWidth].forEach(function (x) {
      [-halfHeight, halfHeight].forEach(function (y) {
        [-halfDepth, halfDepth].forEach(function (z) {
          addCorner(x, y, z);
        });
      });
    });

    replaceGeometry(selectionBrackets, new THREE.BufferGeometry().setFromPoints(points));
    selectionBrackets.visible = true;
  }

  function updateEnvironment(state) {
    const maxDimension = Math.max(state.widthM, state.depthM, state.heightM, 0.15);
    const groundLevel = -state.heightM * 0.5;
    const groundWidth = state.groundStressField ? state.groundStressField.widthM : maxDimension * 4;
    const groundDepth = state.groundStressField ? state.groundStressField.depthM : maxDimension * 4;
    const groundScale = Math.max(groundWidth, groundDepth);
    const skyScale = maxDimension * 22;
    const sunDirection = new THREE.Vector3(-0.9, 0.82, -0.42).normalize();
    const horizonRadius = maxDimension * 16;
    currentGroundLevel = groundLevel;
    currentMaxDimension = maxDimension;
    currentSceneExtent = Math.max(maxDimension * 1.85, 1.9);

    scene.fog.near = horizonRadius * 0.48;
    scene.fog.far = horizonRadius * 1.38;

    skyDome.visible = Boolean(state.showSky);
    skyDome.scale.setScalar(skyScale);
    skyDome.position.set(0, maxDimension * 2.1, 0);

    const sunPosition = sunDirection.clone().multiplyScalar(horizonRadius * 0.78);
    sunDisc.visible = Boolean(state.showSky);
    sunGlow.visible = Boolean(state.showSky);
    sunDisc.position.copy(sunPosition);
    sunDisc.scale.setScalar(maxDimension * 1.8);
    sunGlow.position.copy(sunPosition);
    sunGlow.scale.setScalar(maxDimension * 4.6);

    keyLight.position.copy(sunDirection.clone().multiplyScalar(horizonRadius * 0.64));
    keyLight.target.position.set(0, groundLevel + state.heightM * 0.38, 0);
    keyLight.shadow.camera.left = -maxDimension * 4.2;
    keyLight.shadow.camera.right = maxDimension * 4.2;
    keyLight.shadow.camera.top = maxDimension * 4.2;
    keyLight.shadow.camera.bottom = -maxDimension * 4.2;
    keyLight.shadow.camera.far = maxDimension * 18;
    keyLight.shadow.camera.updateProjectionMatrix();

    mountainsGroup.visible = Boolean(state.showSky);
    mountainDescriptors.forEach(function (descriptor, index) {
      const ridgeHeight = maxDimension * (3.6 + descriptor.heightFactor * 1.5);
      const ridgeWidth = maxDimension * (8.2 + descriptor.widthFactor * 4.2);
      const ridgeRadius = horizonRadius * descriptor.radiusFactor;
      const mesh = descriptor.mesh;

      mesh.scale.set(ridgeWidth, ridgeHeight, 1);
      mesh.position.set(
        Math.cos(descriptor.angle) * ridgeRadius,
        groundLevel + ridgeHeight * 0.5 - maxDimension * (0.12 + (index % 2) * 0.08),
        Math.sin(descriptor.angle) * ridgeRadius
      );
      mesh.lookAt(0, groundLevel + ridgeHeight * 0.22, 0);
    });

    cloudsGroup.visible = Boolean(state.showSky);
    cloudDescriptors.forEach(function (descriptor) {
      const radius = horizonRadius * descriptor.radiusFactor;
      const y = groundLevel + maxDimension * descriptor.heightFactor;

      descriptor.cluster.position.set(
        Math.cos(descriptor.angle) * radius,
        y,
        Math.sin(descriptor.angle) * radius
      );
      descriptor.cluster.scale.setScalar(maxDimension * (1.1 + descriptor.scaleFactor));
    });

    groundPlane.visible = Boolean(state.showGround);
    groundPlane.scale.setScalar(groundScale * 0.82);
    groundPlane.position.set(0, groundLevel, 0);
    groundTexture.repeat.set(
      Math.max(4, groundWidth / Math.max(state.widthM, 0.15)),
      Math.max(4, groundDepth / Math.max(state.depthM, 0.15))
    );

    contactShadow.visible = Boolean(state.showGround);
    contactShadow.position.set(0, groundLevel + maxDimension * 0.003, 0);
    contactShadow.scale.set(
      state.widthM * 2.8 + state.heightM * 0.15,
      state.depthM * 2.8 + state.heightM * 0.15,
      1
    );

    referenceTree.visible = Boolean(state.showGround);
    referenceTree.position.set(-7.4, groundLevel, -13.1);
    referenceTree.rotation.y = 0.68;

  }

  function updateTheme(state) {
    const isDark = state.theme === "dark";
    const groundMaterial = groundPlane.material as THREE.MeshStandardMaterial;
    const contactShadowMaterial = contactShadow.material as THREE.MeshBasicMaterial;
    const prismLineMaterial = prismEdges.material as THREE.LineBasicMaterial;
    const sectionLineMaterial = sectionOutline.material as THREE.LineBasicMaterial;

    scene.fog.color.set(isDark ? 0x0f1826 : 0xd4e4f6);
    renderer.toneMappingExposure = isDark ? 0.9 : 1;
    hemisphereLight.color.set(isDark ? 0x5e85c1 : 0xf7fbff);
    hemisphereLight.groundColor.set(isDark ? 0x213322 : 0x6f8a68);
    hemisphereLight.intensity = isDark ? 0.72 : 1.65;
    keyLight.color.set(isDark ? 0xbfcfff : 0xffffff);
    keyLight.intensity = isDark ? 0.82 : 1.05;
    fillLight.color.set(isDark ? 0x35547a : 0xcde5ff);
    fillLight.intensity = isDark ? 0.28 : 0.42;
    groundMaterial.color.set(isDark ? 0x394031 : 0xf2eee2);
    prismLineMaterial.color.set(isDark ? 0xc7d3e3 : 0x102033);
    prismLineMaterial.opacity = isDark ? 0.28 : 0.22;
    sectionLineMaterial.color.set(isDark ? 0xe7f0ff : 0x102033);
    selectionBracketMaterial.color.set(isDark ? 0xaed0ff : 0x2b6bff);
    (previewSectionOutline.material as THREE.LineBasicMaterial).color.set(isDark ? 0x88b4ff : 0x2b6bff);
    (hoverCrosshair.material as THREE.LineBasicMaterial).color.set(isDark ? 0xb7d1ff : 0x2b6bff);
    sectionNormal.line.material.color.set(isDark ? 0x88b4ff : 0x2b6bff);
    sectionNormal.cone.material.color.set(isDark ? 0x88b4ff : 0x2b6bff);
    contactShadowMaterial.opacity = isDark ? 0.38 : 0.28;
    setVerticalGradientGeometryColor(
      skyDome.geometry,
      2,
      new THREE.Color(isDark ? 0x111b2c : 0xf7ecce),
      new THREE.Color(isDark ? 0x253c62 : 0x9ecbff)
    );
    sunGlow.material.color.set(isDark ? 0xa8b7ff : 0xffd878);
    sunGlow.material.opacity = isDark ? 0.16 : 0.28;
    sunDisc.material.color.set(isDark ? 0xd8deff : 0xfff1b5);
    sunDisc.material.opacity = isDark ? 0.72 : 0.96;

    mountainDescriptors.forEach(function (descriptor, index) {
      const material = descriptor.mesh.material as THREE.MeshStandardMaterial;
      material.color.set(isDark ? (index % 2 === 0 ? 0x29364a : 0x202d40) : index % 2 === 0 ? 0x8ca0a5 : 0x748993);
      material.opacity = isDark ? 0.88 : 0.96;
    });
    cloudsGroup.traverse(function (child) {
      const material = child.material as THREE.MeshStandardMaterial | undefined;

      if (material && "color" in material) {
        material.color.set(isDark ? 0xd7e2ff : 0xffffff);
        material.opacity = isDark ? 0.42 : 0.78;
      }
    });

    const referenceTreeData = referenceTree.userData as {
      foliageParts?: THREE.Mesh[];
      trunkParts?: THREE.Mesh[];
    };

    referenceTreeData.trunkParts?.forEach(function (part) {
      const material = part.material as THREE.MeshStandardMaterial;
      material.color.set(isDark ? 0x5d4735 : 0x755233);
      material.roughness = isDark ? 0.98 : 0.94;
    });
    referenceTreeData.foliageParts?.forEach(function (part, index) {
      const material = part.material as THREE.MeshStandardMaterial;
      material.color.set(
        isDark
          ? index % 2 === 0
            ? 0x415d36
            : 0x4b6a3c
          : index % 2 === 0
            ? 0x5f8d43
            : 0x6d9b4e
      );
      material.roughness = isDark ? 0.98 : 0.96;
    });
  }

  function clampCameraAboveGround() {
    const targetFloor = currentGroundLevel + currentMaxDimension * 0.14;
    const cameraFloor = currentGroundLevel + currentMaxDimension * 0.08;

    if (controls.target.y < targetFloor) {
      controls.target.y = targetFloor;
    }

    if (camera.position.y < cameraFloor) {
      camera.position.y = cameraFloor;
    }
  }

  function updateVolumeSlices(state) {
    const bottomColor = new THREE.Color(state.volumeBottomColorCss);
    const topColor = new THREE.Color(state.volumeTopColorCss);
    const aspectRatio =
      state.heightM / Math.max(Math.min(state.widthM, state.depthM), Math.max(state.heightM, 0.15) * 0.04);
    const requestedSliceCount = state.volumeSliceCount || 15;
    const sliceCount = Math.max(7, Math.min(22, Math.round(Math.max(requestedSliceCount, aspectRatio * 1.4))));

    disposeGroupChildren(volumeSlicesGroup);

    for (let index = 0; index < sliceCount; index += 1) {
      const normalized = (index + 1) / (sliceCount + 1);
      const sliceColor = bottomColor.clone().lerp(topColor, normalized);
      const slice = new THREE.Mesh(
        new THREE.PlaneGeometry(state.widthM, state.depthM),
        new THREE.MeshBasicMaterial({
          color: sliceColor,
          depthWrite: false,
          opacity: 0.1,
          side: THREE.DoubleSide,
          transparent: true,
        })
      );
      slice.rotation.x = -Math.PI / 2;
      slice.position.y = -state.heightM / 2 + normalized * state.heightM;
      slice.renderOrder = 2;
      volumeSlicesGroup.add(slice);
    }
  }

  function updateGroundStressField(state) {
    const field = state.groundStressField;

    if (!state.showGround || !field) {
      groundStressMesh.visible = false;
      return;
    }

    replaceGeometry(
      groundStressMesh,
      new THREE.PlaneGeometry(
        field.widthM,
        field.depthM,
        Math.max(1, field.columns - 1),
        Math.max(1, field.rows - 1)
      )
    );
    setGeometryColors(groundStressMesh.geometry, field.colors);
    groundStressMesh.position.set(0, -state.heightM * 0.5 + Math.max(state.heightM, 0.15) * 0.006, 0);
    groundStressMesh.visible = true;
  }

  function updateGroundStressVolume(state) {
    disposeGroupChildren(groundVolumeGroup);

    if (!state.showGround || !state.showGroundVolume || !state.groundStressVolumeLayers?.length) {
      groundVolumeGroup.visible = false;
      return;
    }

    groundVolumeGroup.visible = true;

    state.groundStressVolumeLayers.forEach(function (layer, index) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(
          layer.widthM,
          layer.depthM,
          Math.max(1, layer.columns - 1),
          Math.max(1, layer.rows - 1)
        ),
        new THREE.MeshBasicMaterial({
          depthWrite: false,
          opacity: layer.opacity,
          side: THREE.DoubleSide,
          transparent: true,
          vertexColors: true,
        })
      );
      setGeometryColors(mesh.geometry, layer.colors);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, layer.yM, 0);
      mesh.renderOrder = 1 + index * 0.01;
      groundVolumeGroup.add(mesh);
    });
  }

  function updateStressFlowPath(state) {
    disposeGroupChildren(stressFlowGroup);

    if (!state.stressFlowPath) {
      stressFlowGroup.visible = false;
      return;
    }

    stressFlowGroup.visible = true;

    const horizontalAxis = state.stressFlowPath.axis === "xz" ? "x" : "z";
    const anchor = new THREE.Vector3(
      horizontalAxis === "x" ? state.stressFlowPath.horizontalM : state.stressFlowPath.offsetM,
      state.stressFlowPath.pointY,
      horizontalAxis === "x" ? state.stressFlowPath.offsetM : state.stressFlowPath.horizontalM
    );
    const topPoint = new THREE.Vector3(anchor.x, state.stressFlowPath.topY, anchor.z);
    const basePoint = new THREE.Vector3(anchor.x, -state.heightM / 2, anchor.z);
    const groundPoint = new THREE.Vector3(anchor.x, state.stressFlowPath.groundY, anchor.z);
    const spreadOffset = Math.max(Math.max(state.widthM, state.depthM) * 0.28, 0.14);
    const leftGroundPoint =
      horizontalAxis === "x"
        ? new THREE.Vector3(anchor.x - spreadOffset, groundPoint.y, anchor.z)
        : new THREE.Vector3(anchor.x, groundPoint.y, anchor.z - spreadOffset);
    const rightGroundPoint =
      horizontalAxis === "x"
        ? new THREE.Vector3(anchor.x + spreadOffset, groundPoint.y, anchor.z)
        : new THREE.Vector3(anchor.x, groundPoint.y, anchor.z + spreadOffset);
    const isDark = state.theme === "dark";
    const flowColor = new THREE.Color(isDark ? 0x8db5ff : 0x2b6bff);

    const pathMaterial = new THREE.LineBasicMaterial({
      color: flowColor,
      transparent: true,
      opacity: 0.92,
    });
    const pathGeometry = new THREE.BufferGeometry().setFromPoints([topPoint, anchor, basePoint, groundPoint]);
    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
    pathLine.renderOrder = 5;
    stressFlowGroup.add(pathLine);

    [
      { direction: new THREE.Vector3(0, -1, 0), origin: topPoint, length: Math.max(state.heightM * 0.18, 0.18) },
      {
        direction: leftGroundPoint.clone().sub(basePoint).normalize(),
        origin: basePoint,
        length: leftGroundPoint.distanceTo(basePoint),
      },
      {
        direction: rightGroundPoint.clone().sub(basePoint).normalize(),
        origin: basePoint,
        length: rightGroundPoint.distanceTo(basePoint),
      },
    ].forEach(function (descriptor) {
      const arrow = new THREE.ArrowHelper(
        descriptor.direction,
        descriptor.origin,
        descriptor.length,
        flowColor.getHex(),
        Math.min(0.22, descriptor.length * 0.28),
        Math.min(0.12, descriptor.length * 0.14)
      );
      arrow.line.material.transparent = true;
      arrow.line.material.opacity = 0.88;
      arrow.cone.material.transparent = true;
      arrow.cone.material.opacity = 0.96;
      stressFlowGroup.add(arrow);
    });

    const pointMarker = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(Math.min(state.widthM, state.depthM) * 0.12, 0.03), 18, 18),
      new THREE.MeshBasicMaterial({
        color: isDark ? 0x54d0bf : 0x0f9f8f,
      })
    );
    pointMarker.position.copy(anchor);
    pointMarker.renderOrder = 6;
    stressFlowGroup.add(pointMarker);
  }

  function toProbePayload(event, hit): ViewerProbe {
    const isGroundHit = hit.object === groundStressMesh || hit.object === groundPlane;
    const pointInSpecimen = specimenGroup.worldToLocal(hit.point.clone());
    const modelPoint = hit.point.clone();
    const localNormal = hit.face?.normal
      ? hit.face.normal.clone().transformDirection(
        isGroundHit
          ? (hit.object === groundPlane ? groundPlane.matrixWorld : groundStressMesh.matrixWorld)
          : prismMesh.matrixWorld
      )
      : new THREE.Vector3(0, 1, 0);
    const coords = isGroundHit
      ? [
          { label: "x", value: hit.point.x },
          { label: "y", value: hit.point.y },
          { label: "z", value: hit.point.z },
        ]
      : mapVolumeCoords(pointInSpecimen, currentState);

    return {
      clientX: event.clientX,
      clientY: event.clientY,
      coords,
      domain: isGroundHit ? "ground" : "specimen",
      modelPoint,
      plane: createSectionPlaneFromHit(modelPoint, localNormal),
      selectableSection: true,
      localPoint: pointInSpecimen,
      surfaceNormal: localNormal,
    };
  }

  function updateHoverFromEvent(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hitTargets = [prismMesh];

    if (groundStressMesh.visible) {
      hitTargets.push(groundStressMesh);
    } else if (groundPlane.visible) {
      hitTargets.push(groundPlane);
    }

    const hit = raycaster.intersectObjects(hitTargets, false)[0];

    if (!hit) {
      updatePreviewSection(null);
      onProbeLeave();
      return;
    }

    const probe = toProbePayload(event, hit);
    updatePreviewSection(probe);
    onProbe(probe);
  }

  function handlePointerMove(event) {
    pointerInside = true;
    updateHoverFromEvent(event);
  }

  function handlePointerLeave() {
    pointerInside = false;
    updatePreviewSection(null);
    onProbeLeave();
  }

  function handlePointerDown(event) {
    updateHoverFromEvent(event);
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hitTargets = [prismMesh];

    if (groundStressMesh.visible) {
      hitTargets.push(groundStressMesh);
    } else if (groundPlane.visible) {
      hitTargets.push(groundPlane);
    }

    const hit = raycaster.intersectObjects(hitTargets, false)[0];

    if (!hit) {
      return;
    }

    const probe = toProbePayload(event, hit);

    if (probe.domain !== "specimen") {
      return;
    }

    onProbeSelect(probe);
  }

  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
  renderer.domElement.addEventListener("pointerdown", handlePointerDown);

  controls.addEventListener("change", function () {
    clampCameraAboveGround();

    if (pointerInside) {
      updatePreviewSection(null);
      onProbeLeave();
    }

    onCameraChange(getCameraPose());
  });

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  function renderLoop() {
    controls.update();
    clampCameraAboveGround();
    renderer.render(scene, camera);
    window.requestAnimationFrame(renderLoop);
  }

  renderLoop();

  return {
    resetCamera,
    update(nextState) {
      currentState = { ...currentState, ...nextState };
      if (nextState.cameraPose) {
        applyCameraPose(nextState.cameraPose);
      }
      updateEnvironment(currentState);
      updateTheme(currentState);
      updateGroundStressField(currentState);
      updateGroundStressVolume(currentState);
      updateStressFlowPath(currentState);
      updatePrismGeometry(currentState);
      updateSelectionBrackets(currentState);
      updateVolumeSlices(currentState);
      updateSectionGeometry(currentState);
      updateCameraEnvelope(currentSceneExtent);
    },
    dispose() {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      disposeGroupChildren(environmentGroup);
      disposeGroupChildren(groundVolumeGroup);
      disposeGroupChildren(stressFlowGroup);
      disposeGroupChildren(volumeSlicesGroup);
      shadowTexture.dispose();
      groundTexture.dispose();
      renderer.dispose();
    },
  };
}
