import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { nerveCloudPoints, vertebraCloud } from "../lib/anatomy";
import { getMeshCortexPool } from "../lib/brainMesh";
import { synapseLines } from "../lib/connections";
import type { BrainPoint, VizShape } from "../lib/types";

const noopRaycast = () => null;

/** Soft cortex dust from the mesh surface — brain silhouette without the fleshy GLB. */
function cortexSilhouetteCloud(maxPts = 14000): Float32Array {
  const { pts } = getMeshCortexPool();
  const n = pts.length / 3;
  const step = Math.max(1, Math.floor(n / maxPts));
  const out: number[] = [];
  for (let i = 0; i < n; i += step) {
    const o = i * 3;
    out.push(pts[o], pts[o + 1], pts[o + 2]);
  }
  return new Float32Array(out);
}

type Props = {
  points: BrainPoint[];
  shape?: VizShape;
  selectedId: string | null;
  highlightIds?: string[] | null;
  showSynapses?: boolean;
  onSelect: (point: BrainPoint) => void;
};

function makeCircleTexture() {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.95)");
  g.addColorStop(0.7, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function PointCloud({
  positions,
  color,
  size,
  opacity,
}: {
  positions: Float32Array;
  color: string;
  size: number;
  opacity: number;
}) {
  const tex = useMemo(() => makeCircleTexture(), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);
  return (
    <points geometry={geo} frustumCulled={false} raycast={noopRaycast}>
      <pointsMaterial
        map={tex}
        color={color}
        size={size}
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function AnatomyClouds() {
  const cortex = useMemo(() => cortexSilhouetteCloud(14000), []);
  const verts = useMemo(() => vertebraCloud(7800, 9), []);
  const nerves = useMemo(() => nerveCloudPoints(9000, 13), []);

  return (
    <>
      <ambientLight intensity={0.4} />
      {/* Dot silhouette of a real brain — no anatomical flesh mesh */}
      <PointCloud positions={cortex} color="#6a8499" size={0.022} opacity={0.22} />
      <PointCloud positions={verts} color="#9eb0c4" size={0.032} opacity={0.4} />
      <PointCloud positions={nerves} color="#8eb4c8" size={0.026} opacity={0.34} />
    </>
  );
}

/** Screen-space pick: only select if cursor is within MAX_PICK_PX of a note. */
const MAX_PICK_PX = 12;

function NotePoints({ points, selectedId, highlightIds, onSelect }: Props) {
  const tex = useMemo(() => makeCircleTexture(), []);
  const { camera, gl } = useThree();
  const pointsRef = useRef(points);
  const onSelectRef = useRef(onSelect);
  pointsRef.current = points;
  onSelectRef.current = onSelect;

  const highlightSet = useMemo(
    () => (highlightIds && highlightIds.length ? new Set(highlightIds) : null),
    [highlightIds]
  );
  const { positions, colors } = useMemo(() => {
    const n = points.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const c = new THREE.Color();
    points.forEach((p, i) => {
      positions[i * 3] = p.position[0];
      positions[i * 3 + 1] = p.position[1];
      positions[i * 3 + 2] = p.position[2];
      c.set(p.color);
      const isSel = selectedId === p.id;
      const hl = highlightSet;
      const inHl = !hl || hl.has(p.id);
      const dim = isSel ? 0.15 : hl && !inHl ? 0.1 : selectedId && !isSel ? 0.22 : 1;
      if (!isSel && hl && inHl) c.offsetHSL(0, 0.05, 0.12);
      colors[i * 3] = c.r * dim;
      colors[i * 3 + 1] = c.g * dim;
      colors[i * 3 + 2] = c.b * dim;
    });
    return { positions, colors };
  }, [points, selectedId, highlightSet]);

  // Precise pick — Three.js Points.threshold was selecting random nearby notes
  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number } | null = null;
    const scratch = new THREE.Vector3();

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY };
    };

    const onUp = (e: PointerEvent) => {
      if (!down || e.button !== 0) return;
      const moved =
        (e.clientX - down.x) ** 2 + (e.clientY - down.y) ** 2;
      down = null;
      if (moved > 36) return; // orbit drag, not a click

      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const list = pointsRef.current;
      let bestI = -1;
      let bestD = MAX_PICK_PX;
      for (let i = 0; i < list.length; i++) {
        const p = list[i].position;
        scratch.set(p[0], p[1], p[2]).project(camera);
        if (scratch.z < -1 || scratch.z > 1) continue;
        const sx = (scratch.x * 0.5 + 0.5) * rect.width;
        const sy = (-scratch.y * 0.5 + 0.5) * rect.height;
        const d = Math.hypot(sx - mx, sy - my);
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      if (bestI >= 0) onSelectRef.current(list[bestI]);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
    };
  }, [gl, camera]);

  return (
    <points frustumCulled={false} raycast={noopRaycast}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={tex}
        size={0.042}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.95}
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
        alphaTest={0.01}
      />
    </points>
  );
}


function SelectedBeacon({
  point,
}: {
  point: BrainPoint;
}) {
  const pulse = useRef(0);
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    pulse.current += dt * 2.8;
    if (groupRef.current) {
      const s = 1 + Math.sin(pulse.current) * 0.12;
      groupRef.current.scale.setScalar(s);
    }
  });
  return (
    <group position={point.position} raycast={noopRaycast}>
      {/* Mesh beacon — clearly larger than note dots; not pickable */}
      <group ref={groupRef}>
        <mesh raycast={noopRaycast}>
          <sphereGeometry args={[0.11, 24, 24]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={1}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        <mesh raycast={noopRaycast}>
          <sphereGeometry args={[0.065, 20, 20]} />
          <meshBasicMaterial
            color={point.color}
            transparent
            opacity={1}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} raycast={noopRaycast}>
          <torusGeometry args={[0.18, 0.012, 12, 48]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.85}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        <mesh raycast={noopRaycast}>
          <sphereGeometry args={[0.22, 24, 24]} />
          <meshBasicMaterial
            color={point.color}
            transparent
            opacity={0.2}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
      <Html position={[0, 0.28, 0]} center distanceFactor={6} style={{ pointerEvents: "none" }}>
        <div className="brain-label">
          <strong>{point.title}</strong>
          <span>{point.region}</span>
        </div>
      </Html>
    </group>
  );
}


/** Native THREE.LineSegments via primitive — R3F <lineSegments> is unreliable here. */
function SynapseStroke({
  positions,
  color,
  opacity,
}: {
  positions: Float32Array;
  color: string;
  opacity: number;
}) {
  const obj = useMemo(() => {
    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.computeBoundingSphere();
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const line = new THREE.LineSegments(geo, mat);
    line.frustumCulled = false;
    line.raycast = () => undefined;
    return line;
  }, [positions, color, opacity]);
  if (!obj) return null;
  return <primitive object={obj} />;
}

function Synapses({
  points,
  selectedId,
}: {
  points: BrainPoint[];
  selectedId: string | null;
}) {
  const { ambient, focus, ambientGlow, focusGlow } = useMemo(
    () => synapseLines(points, selectedId),
    [points, selectedId]
  );
  const dim = selectedId ? 0.2 : 0.28;
  return (
    <>
      {/* Soft tracts — sparse ambient; bright only on focus */}
      {ambientGlow.length > 0 && (
        <PointCloud positions={ambientGlow} color="#7eb8d4" size={0.014} opacity={dim} />
      )}
      {focusGlow.length > 0 && (
        <PointCloud positions={focusGlow} color="#f2fbff" size={0.024} opacity={0.92} />
      )}
      <SynapseStroke positions={ambient} color="#a8d8ec" opacity={dim + 0.12} />
      <SynapseStroke positions={focus} color="#ffffff" opacity={0.95} />
    </>
  );
}

function SceneInner(props: Props) {
  const { camera } = useThree();
  const selected = useMemo(
    () => (props.selectedId ? props.points.find((p) => p.id === props.selectedId) : null),
    [props.points, props.selectedId]
  );
  const shape = props.shape ?? "brain";
  const isBrain = shape === "brain" || shape === "atlas";
  const baseTarget: [number, number, number] = isBrain ? [0, 0.45, 0] : [0, 0, 0];
  const aimRef = useRef<[number, number, number]>([...baseTarget]);
  const targetRef = useRef<[number, number, number]>([...baseTarget]);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { gl } = useThree();

  // Snap aim when selection / layout mode changes — not every frame (pan must stick)
  useEffect(() => {
    const next: [number, number, number] = selected
      ? [selected.position[0], selected.position[1], selected.position[2]]
      : [...baseTarget];
    aimRef.current = next;
  }, [
    props.selectedId,
    selected?.position[0],
    selected?.position[1],
    selected?.position[2],
    baseTarget[0],
    baseTarget[1],
    baseTarget[2],
  ]);

  useFrame((_, dt) => {
    const k = Math.min(1, dt * 3.2);
    targetRef.current[0] += (aimRef.current[0] - targetRef.current[0]) * k;
    targetRef.current[1] += (aimRef.current[1] - targetRef.current[1]) * k;
    targetRef.current[2] += (aimRef.current[2] - targetRef.current[2]) * k;
    const ctrl = controlsRef.current;
    if (ctrl) {
      ctrl.target.set(
        targetRef.current[0],
        targetRef.current[1],
        targetRef.current[2]
      );
    }
    camera.lookAt(targetRef.current[0], targetRef.current[1], targetRef.current[2]);
  });

  // Mac trackpad / Magic Mouse: two-finger scroll = pan (carte 3D); pinch = zoom
  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      const ctrl = controlsRef.current;
      if (!ctrl) return;
      if (e.ctrlKey || e.metaKey) return; // pinch-zoom → OrbitControls dolly
      e.preventDefault();
      e.stopImmediatePropagation();
      const scale = 0.0045;
      const pan = new THREE.Vector3();
      const te = camera.matrix.elements;
      // camera right / up in world space
      pan.set(te[0], te[1], te[2]).multiplyScalar(-e.deltaX * scale);
      aimRef.current[0] += pan.x;
      aimRef.current[1] += pan.y;
      aimRef.current[2] += pan.z;
      targetRef.current[0] += pan.x;
      targetRef.current[1] += pan.y;
      targetRef.current[2] += pan.z;
      pan.set(te[4], te[5], te[6]).multiplyScalar(e.deltaY * scale);
      aimRef.current[0] += pan.x;
      aimRef.current[1] += pan.y;
      aimRef.current[2] += pan.z;
      targetRef.current[0] += pan.x;
      targetRef.current[1] += pan.y;
      targetRef.current[2] += pan.z;
      ctrl.target.set(
        targetRef.current[0],
        targetRef.current[1],
        targetRef.current[2]
      );
      ctrl.update();
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, true);
  }, [gl, camera]);

  return (
    <>
      <color attach="background" args={["#000000"]} />
      {isBrain && <AnatomyClouds />}
      <NotePoints {...props} />
      {props.showSynapses !== false && (
        <Synapses points={props.points} selectedId={props.selectedId} />
      )}
      {selected && <SelectedBeacon point={selected} />}
      <OrbitControls
        ref={controlsRef}
        enablePan
        screenSpacePanning
        panSpeed={1.2}
        minDistance={isBrain ? 1.8 : 1.4}
        maxDistance={16}
        target={targetRef.current}
        enableDamping
        dampingFactor={0.08}
        autoRotate={false}
        autoRotateSpeed={0.12}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.55} luminanceThreshold={0.28} luminanceSmoothing={0.4} mipmapBlur />
      </EffectComposer>
    </>
  );
}

export function BrainScene(props: Props) {
  return (
    <Canvas
      camera={{ position: [0.55, 1.68, 3.38], fov: 36, near: 0.01, far: 80 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#000000", 1);
        gl.toneMapping = THREE.NoToneMapping;
      }}
    >
      <SceneInner {...props} />
    </Canvas>
  );
}
