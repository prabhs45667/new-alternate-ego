import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function Particles({ count = 2500 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = [
      new THREE.Color("hsl(270, 95%, 65%)"),
      new THREE.Color("hsl(320, 90%, 60%)"),
      new THREE.Color("hsl(190, 95%, 55%)"),
    ];
    for (let i = 0; i < count; i++) {
      const r = 6 + Math.random() * 10;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      const c = palette[Math.floor(Math.random() * palette.length)];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    return [pos, col];
  }, [count]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    ref.current.rotation.y = t * 0.04;
    ref.current.rotation.x = Math.sin(t * 0.2) * 0.15;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        vertexColors
        transparent
        opacity={0.85}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function FloatingOrb() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    ref.current.rotation.x = t * 0.15;
    ref.current.rotation.y = t * 0.2;
    ref.current.position.y = Math.sin(t * 0.5) * 0.5;
  });
  return (
    <mesh ref={ref} position={[0, 0, -2]}>
      <icosahedronGeometry args={[2.2, 1]} />
      <meshBasicMaterial color="hsl(270, 95%, 55%)" wireframe transparent opacity={0.18} />
    </mesh>
  );
}

const ThreeBackground = () => {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 8], fov: 60 }} dpr={[1, 1.5]}>
        <Particles />
        <FloatingOrb />
      </Canvas>
    </div>
  );
};

export default ThreeBackground;
