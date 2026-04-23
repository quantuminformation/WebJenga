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

export interface ViewerProbe {
  clientX: number;
  clientY: number;
  coords: ViewerProbeCoordinate[];
  domain: "ground" | "specimen";
  localPoint: THREE.Vector3;
  modelPoint: THREE.Vector3;
  sectionAxis: "xy" | "xz" | "yz";
  sectionOffsetRatio: number;
}

export interface ViewerState {
  depthM: number;
  groundStressField: GroundStressField | null;
  groundStressVolumeLayers: GroundStressVolumeLayer[] | null;
  heightM: number;
  rotationXDeg: number;
  rotationYDeg: number;
  sectionAxis: "xy" | "xz" | "yz";
  sectionBottomColorCss: string;
  sectionGradientMode: "uniform" | "vertical";
  sectionOffsetRatio: number;
  sectionTopColorCss: string;
  sectionUniformColorCss: string;
  showReferenceFigure: boolean;
  showReferenceHouse: boolean;
  showGround: boolean;
  showGroundVolume: boolean;
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
  onProbe?(probe: ViewerProbe): void;
  onProbeLeave?(): void;
}

export interface ConcreteStressViewer {
  dispose(): void;
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

function createReferenceHouse() {
  const group = new THREE.Group();
  const wallHeight = 3.1;
  const roofHeight = 2.2;
  const houseWidth = 8.4;
  const houseDepth = 6.8;
  const concreteMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfc5cc,
    roughness: 0.96,
    metalness: 0,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0xacb3bb,
    roughness: 0.94,
    metalness: 0,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0x657384,
    roughness: 0.82,
    metalness: 0,
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(houseWidth, wallHeight, houseDepth),
    concreteMaterial
  );
  body.position.y = wallHeight * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roofShape = new THREE.Shape();
  roofShape.moveTo(-houseWidth * 0.56, 0);
  roofShape.lineTo(0, roofHeight);
  roofShape.lineTo(houseWidth * 0.56, 0);
  roofShape.closePath();

  const roofGeometry = new THREE.ExtrudeGeometry(roofShape, {
    bevelEnabled: false,
    depth: houseDepth * 1.06,
    steps: 1,
  });
  roofGeometry.translate(0, wallHeight, -(houseDepth * 1.06) / 2);
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const facadeFeatures = [
    { height: 2.05, width: 0.96, x: -2.05, y: 1.02 },
    { height: 1.2, width: 1.36, x: 1.95, y: 1.82 },
    { height: 1.2, width: 1.36, x: 0.2, y: 1.82 },
  ];
  facadeFeatures.forEach(function (feature) {
    const accent = new THREE.Mesh(
      new THREE.PlaneGeometry(feature.width, feature.height),
      accentMaterial
    );
    accent.position.set(feature.x, feature.y, houseDepth * 0.5 + 0.01);
    group.add(accent);
  });

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(houseWidth, wallHeight + roofHeight, houseDepth)),
    new THREE.LineBasicMaterial({
      color: 0x586473,
      transparent: true,
      opacity: 0.22,
    })
  );
  outline.position.y = (wallHeight + roofHeight) * 0.5;
  group.add(outline);

  return {
    depth: houseDepth,
    group,
    height: wallHeight + roofHeight,
    width: houseWidth,
  };
}

function createReferenceFigure() {
  const group = new THREE.Group();
  const concreteMaterial = new THREE.MeshStandardMaterial({
    color: 0xadb5be,
    roughness: 0.97,
    metalness: 0,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0x7f8995,
    roughness: 0.9,
    metalness: 0,
  });

  const leftLeg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.09, 0.88, 12),
    concreteMaterial
  );
  leftLeg.position.set(-0.09, 0.44, 0);
  leftLeg.castShadow = true;
  leftLeg.receiveShadow = true;
  group.add(leftLeg);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.09;
  group.add(rightLeg);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.18, 0.52, 6, 12),
    concreteMaterial
  );
  torso.position.y = 1.12;
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  const leftArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.06, 0.68, 12),
    accentMaterial
  );
  leftArm.position.set(-0.27, 1.08, 0);
  leftArm.rotation.z = 0.18;
  group.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.27;
  rightArm.rotation.z = -0.18;
  group.add(rightArm);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 20), concreteMaterial);
  head.position.y = 1.69;
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  return {
    depth: 0.34,
    group,
    height: 1.82,
    width: 0.62,
  };
}

const AXIS_CONFIG = {
  xy: {
    label: "XY section",
    normal: new THREE.Vector3(0, 1, 0),
    getSize(state) {
      return { width: state.widthM, height: state.depthM };
    },
    getPosition(state) {
      return new THREE.Vector3(
        0,
        -state.heightM / 2 + state.sectionOffsetRatio * state.heightM,
        0
      );
    },
    setRotation(object) {
      object.rotation.set(-Math.PI / 2, 0, 0);
    },
    mapCoords(localPoint, state) {
      return [
        { label: "x", value: localPoint.x + state.widthM / 2 },
        { label: "z", value: localPoint.y + state.depthM / 2 },
      ];
    },
  },
  xz: {
    label: "XZ section",
    normal: new THREE.Vector3(0, 0, 1),
    getSize(state) {
      return { width: state.widthM, height: state.heightM };
    },
    getPosition(state) {
      return new THREE.Vector3(
        0,
        0,
        -state.depthM / 2 + state.sectionOffsetRatio * state.depthM
      );
    },
    setRotation(object) {
      object.rotation.set(0, 0, 0);
    },
    mapCoords(localPoint, state) {
      return [
        { label: "x", value: localPoint.x + state.widthM / 2 },
        { label: "y", value: localPoint.y + state.heightM / 2 },
      ];
    },
  },
  yz: {
    label: "YZ section",
    normal: new THREE.Vector3(1, 0, 0),
    getSize(state) {
      return { width: state.depthM, height: state.heightM };
    },
    getPosition(state) {
      return new THREE.Vector3(
        -state.widthM / 2 + state.sectionOffsetRatio * state.widthM,
        0,
        0
      );
    },
    setRotation(object) {
      object.rotation.set(0, Math.PI / 2, 0);
    },
    mapCoords(localPoint, state) {
      return [
        { label: "z", value: localPoint.x + state.depthM / 2 },
        { label: "y", value: localPoint.y + state.heightM / 2 },
      ];
    },
  },
};

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
  const onProbe = options.onProbe || function () {};
  const onProbeLeave = options.onProbeLeave || function () {};

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

  const referenceHouse = createReferenceHouse();
  const referenceHouseShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      alphaMap: shadowTexture,
      color: 0x102033,
      depthWrite: false,
      opacity: 0.18,
      transparent: true,
    })
  );
  referenceHouseShadow.rotation.x = -Math.PI / 2;
  referenceHouseShadow.renderOrder = 2;
  environmentGroup.add(referenceHouseShadow);
  const referenceFigure = createReferenceFigure();
  const referenceFigureShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      alphaMap: shadowTexture,
      color: 0x102033,
      depthWrite: false,
      opacity: 0.12,
      transparent: true,
    })
  );
  referenceFigureShadow.rotation.x = -Math.PI / 2;
  referenceFigureShadow.renderOrder = 2;
  environmentGroup.add(referenceFigureShadow);

  const worldGroup = new THREE.Group();
  scene.add(worldGroup);
  worldGroup.add(referenceHouse.group);
  worldGroup.add(referenceFigure.group);

  const specimenGroup = new THREE.Group();
  worldGroup.add(specimenGroup);

  const volumeSlicesGroup = new THREE.Group();
  specimenGroup.add(volumeSlicesGroup);

  const prismMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.62,
    roughness: 0.52,
    metalness: 0,
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

  const sectionMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const sectionPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sectionMaterial);
  sectionPlane.renderOrder = 3;
  specimenGroup.add(sectionPlane);

  const sectionOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(sectionPlane.geometry),
    new THREE.LineBasicMaterial({
      color: 0x102033,
      transparent: true,
      opacity: 0.9,
    })
  );
  sectionOutline.renderOrder = 4;
  specimenGroup.add(sectionOutline);

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
  specimenGroup.add(sectionNormal);

  const hoverMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 20, 20),
    new THREE.MeshBasicMaterial({
      color: 0x2b6bff,
    })
  );
  hoverMarker.visible = false;
  hoverMarker.renderOrder = 5;
  worldGroup.add(hoverMarker);

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
  let currentAxis = AXIS_CONFIG.xy;
  let currentState: ViewerState = {
    widthM: 0.1,
    depthM: 0.1,
    heightM: 1.0,
    sectionAxis: "xy",
    sectionOffsetRatio: 0.5,
    rotationXDeg: 18,
    rotationYDeg: -28,
    sectionBottomColorCss: "rgb(229, 57, 53)",
    sectionGradientMode: "uniform",
    sectionTopColorCss: "rgb(63, 125, 255)",
    sectionUniformColorCss: "rgb(88, 210, 199)",
    showReferenceFigure: true,
    showReferenceHouse: true,
    volumeBottomColorCss: "rgb(229, 57, 53)",
    volumeTopColorCss: "rgb(63, 125, 255)",
    volumeSliceCount: 15,
    showSection: false,
    showGround: true,
    showGroundVolume: true,
    showSky: true,
    stressFlowPath: null,
    theme: "light",
    groundStressField: null,
    groundStressVolumeLayers: null,
  };

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

  function updateSectionGeometry(state) {
    currentAxis = AXIS_CONFIG[state.sectionAxis] || AXIS_CONFIG.xy;
    const showSection = Boolean(state.showSection);

    const planeSize = currentAxis.getSize(state);
    const planePosition = currentAxis.getPosition(state);
    const sectionTopColor = new THREE.Color(
      state.sectionTopColorCss || state.sectionUniformColorCss || state.volumeTopColorCss
    );
    const sectionBottomColor = new THREE.Color(
      state.sectionBottomColorCss || state.sectionUniformColorCss || state.volumeBottomColorCss
    );
    const sectionUniformColor = new THREE.Color(
      state.sectionUniformColorCss || state.sectionBottomColorCss || state.sectionTopColorCss
    );

    replaceGeometry(sectionPlane, new THREE.PlaneGeometry(planeSize.width, planeSize.height));
    replaceGeometry(sectionOutline, new THREE.EdgesGeometry(sectionPlane.geometry));

    if (state.sectionGradientMode === "vertical") {
      setVerticalGradientGeometryColor(
        sectionPlane.geometry,
        planeSize.height,
        sectionBottomColor,
        sectionTopColor
      );
    } else {
      setSolidGeometryColor(sectionPlane.geometry, sectionUniformColor);
    }

    currentAxis.setRotation(sectionPlane);
    currentAxis.setRotation(sectionOutline);

    sectionPlane.position.copy(planePosition);
    sectionOutline.position.copy(planePosition);
    sectionPlane.visible = showSection;
    sectionOutline.visible = showSection;

    sectionNormal.position.copy(planePosition);
    sectionNormal.setDirection(currentAxis.normal.clone());
    sectionNormal.setLength(Math.max(planeSize.width, planeSize.height) * 0.46, 0.12, 0.06);
    sectionNormal.visible = showSection;
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
    replaceGeometry(prismEdges, new THREE.EdgesGeometry(prismMesh.geometry));

    specimenGroup.rotation.set(0, 0, 0);
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
    const houseWidth = referenceHouse.width;
    const houseDepth = referenceHouse.depth;
    const houseHeight = referenceHouse.height;
    const houseOffsetX =
      state.widthM * 0.5 + houseWidth * 0.5 + 1.8;
    const houseOffsetZ =
      Math.max(state.depthM * 0.5 + houseDepth * 0.1, houseDepth * 0.12);
    const figureWidth = referenceFigure.width;
    const figureDepth = referenceFigure.depth;
    const figureHeight = referenceFigure.height;
    const figureOffsetX = houseOffsetX - houseWidth * 0.22;
    const figureOffsetZ = houseOffsetZ + houseDepth * 0.34;

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

    referenceHouse.group.visible = Boolean(state.showGround && state.showReferenceHouse);
    referenceHouse.group.scale.setScalar(1);
    referenceHouse.group.position.set(houseOffsetX, groundLevel, houseOffsetZ);

    referenceHouseShadow.visible = Boolean(state.showGround && state.showReferenceHouse);
    referenceHouseShadow.position.set(
      houseOffsetX,
      groundLevel + Math.max(maxDimension, 1) * 0.003,
      houseOffsetZ
    );
    referenceHouseShadow.scale.set(houseWidth * 1.35, houseDepth * 1.35, 1);

    referenceFigure.group.visible = Boolean(state.showGround && state.showReferenceFigure);
    referenceFigure.group.scale.setScalar(1);
    referenceFigure.group.position.set(figureOffsetX, groundLevel, figureOffsetZ);

    referenceFigureShadow.visible = Boolean(state.showGround && state.showReferenceFigure);
    referenceFigureShadow.position.set(
      figureOffsetX,
      groundLevel + Math.max(maxDimension, 1) * 0.003,
      figureOffsetZ
    );
    referenceFigureShadow.scale.set(figureWidth * 1.5, figureDepth * 2.1, 1);
  }

  function updateTheme(state) {
    const isDark = state.theme === "dark";
    const groundMaterial = groundPlane.material as THREE.MeshStandardMaterial;
    const houseShadowMaterial = referenceHouseShadow.material as THREE.MeshBasicMaterial;
    const figureShadowMaterial = referenceFigureShadow.material as THREE.MeshBasicMaterial;
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
    sectionNormal.line.material.color.set(isDark ? 0x88b4ff : 0x2b6bff);
    sectionNormal.cone.material.color.set(isDark ? 0x88b4ff : 0x2b6bff);
    contactShadowMaterial.opacity = isDark ? 0.38 : 0.28;
    houseShadowMaterial.opacity = isDark ? 0.22 : 0.18;
    figureShadowMaterial.opacity = isDark ? 0.16 : 0.12;
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
          opacity: 0.34,
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
    const isGroundHit = hit.object === groundStressMesh;
    const pointInSpecimen = specimenGroup.worldToLocal(hit.point.clone());
    const modelPoint = isGroundHit ? hit.point.clone() : pointInSpecimen;
    const coords = currentState.showSection
      ? currentAxis.mapCoords(sectionPlane.worldToLocal(hit.point.clone()), currentState)
      : (
        isGroundHit
          ? [
            { label: "x", value: hit.point.x },
            { label: "z", value: hit.point.z },
          ]
          : mapVolumeCoords(pointInSpecimen, currentState)
      );

    return {
      clientX: event.clientX,
      clientY: event.clientY,
      coords,
      domain: isGroundHit ? "ground" : "specimen",
      modelPoint,
      sectionAxis: currentState.sectionAxis,
      sectionOffsetRatio: currentState.sectionOffsetRatio,
      localPoint: pointInSpecimen,
    };
  }

  function updateHoverFromEvent(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hitTargets = currentState.showSection
      ? [sectionPlane]
      : groundStressMesh.visible
        ? [prismMesh, groundStressMesh]
        : [prismMesh];
    const hit = raycaster.intersectObjects(hitTargets, false)[0];

    if (!hit) {
      hoverMarker.visible = false;
      onProbeLeave();
      return;
    }

    hoverMarker.visible = true;
    hoverMarker.position.copy(hit.point);
    onProbe(toProbePayload(event, hit));
  }

  function handlePointerMove(event) {
    pointerInside = true;
    updateHoverFromEvent(event);
  }

  function handlePointerLeave() {
    pointerInside = false;
    hoverMarker.visible = false;
    onProbeLeave();
  }

  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerleave", handlePointerLeave);

  controls.addEventListener("change", function () {
    clampCameraAboveGround();

    if (pointerInside) {
      hoverMarker.visible = false;
      onProbeLeave();
    }
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
    update(nextState) {
      currentState = { ...currentState, ...nextState };
      updateEnvironment(currentState);
      updateTheme(currentState);
      updateGroundStressField(currentState);
      updateGroundStressVolume(currentState);
      updateStressFlowPath(currentState);
      updatePrismGeometry(currentState);
      updateVolumeSlices(currentState);
      updateSectionGeometry(currentState);
      updateCameraEnvelope(currentSceneExtent);
    },
    dispose() {
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      disposeGroupChildren(referenceFigure.group);
      disposeGroupChildren(referenceHouse.group);
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
