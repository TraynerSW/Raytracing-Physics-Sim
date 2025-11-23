
import { useRef, useEffect, MutableRefObject } from 'react';
import { Sphere, Camera, SimulationConfig } from '../types';

interface UsePhysicsEngineProps {
  spheresRef: MutableRefObject<Sphere[]>;
  cameraRef: MutableRefObject<Camera>;
  config: SimulationConfig;
  explodeTrigger: number;
  playCollisionSound: (intensity: number) => void;
  playExplosion: () => void;
  setSilenceUntil: (time: number) => void;
  attractionTargetRef?: MutableRefObject<{x: number, y: number, z: number}>;
}

export const usePhysicsEngine = ({
  spheresRef,
  cameraRef,
  config,
  explodeTrigger,
  playCollisionSound,
  playExplosion,
  setSilenceUntil,
  attractionTargetRef
}: UsePhysicsEngineProps) => {
  
  const lastAttractionEnabled = useRef(config.attraction);
  const prevBlackHole = useRef(config.blackHole);
  
  // Optimization: Spatial Hash Grid & Reusable structures to avoid GC
  const grid = useRef<Map<string, number[]>>(new Map());
  const largeSpheres = useRef<number[]>([]);
  const activeSpheresIndices = useRef<number[]>([]);

  const explosionState = useRef<{
      active: boolean;
      phase: 'gather' | 'explode';
      center: { x: number; y: number; z: number };
      startTime: number;
  }>({ active: false, phase: 'gather', center: { x: 0, y: 0, z: 0 }, startTime: 0 });
  
  useEffect(() => {
      if (explodeTrigger === 0) return;
      triggerExplosion();
  }, [explodeTrigger]);

  useEffect(() => {
      if (!config.blackHole && explosionState.current.active) {
          explosionState.current.active = false;
      }
      
      if (prevBlackHole.current && !config.blackHole) {
          spheresRef.current.forEach(s => {
              s.vx *= 0.1;
              s.vy *= 0.1;
              s.vz *= 0.1;
          });
      }
      prevBlackHole.current = config.blackHole;
  }, [config.blackHole, spheresRef]);

  const triggerExplosion = () => {
      const spheres = spheresRef.current;
      if (spheres.length === 0) return;
      const cam = cameraRef.current;
      const dirX = Math.cos(cam.pitch) * Math.sin(cam.yaw);
      const dirY = Math.sin(cam.pitch);
      const dirZ = Math.cos(cam.pitch) * Math.cos(cam.yaw);
      const targetX = cam.x + dirX * 10.0;
      const targetY = Math.max(cam.y + dirY * 10.0, 1.0);
      const targetZ = cam.z + dirZ * 10.0;

      explosionState.current = {
          active: true,
          phase: 'gather',
          center: { x: targetX, y: targetY, z: targetZ },
          startTime: performance.now(),
      };
      spheres.forEach(s => { s.vx *= 0.1; s.vy *= 0.1; s.vz *= 0.1; });
  };

  const resolveCollision = (s1: Sphere, s2: Sphere) => {
        const dx = s2.x - s1.x;
        const dy = s2.y - s1.y;
        const dz = s2.z - s1.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        const minDist = s1.radius + s2.radius;

        if (distSq < minDist*minDist) {
            const dist = Math.sqrt(distSq);
            if (dist < 0.0001) return;
            
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;

            const m1 = s1.radius * s1.radius * s1.radius;
            const m2 = s2.radius * s2.radius * s2.radius;
            const invM1 = 1 / m1;
            const invM2 = 1 / m2;
            const totalInvM = invM1 + invM2;

            const overlap = minDist - dist;
            const correction = overlap * 0.5 / totalInvM;
            
            s1.x -= nx * correction * invM1;
            s1.y -= ny * correction * invM1;
            s1.z -= nz * correction * invM1;
            
            s2.x += nx * correction * invM2;
            s2.y += ny * correction * invM2;
            s2.z += nz * correction * invM2;
            
            const rvx = s2.vx - s1.vx;
            const rvy = s2.vy - s1.vy;
            const rvz = s2.vz - s1.vz;
            
            const velAlongNormal = rvx * nx + rvy * ny + rvz * nz;
            
            if (velAlongNormal > 0) return;
            
            const jImpulse = -(1 + config.bounciness) * velAlongNormal / totalInvM;
            
            const ix = jImpulse * nx;
            const iy = jImpulse * ny;
            const iz = jImpulse * nz;
            
            s1.vx -= ix * invM1;
            s1.vy -= iy * invM1;
            s1.vz -= iz * invM1;
            
            s2.vx += ix * invM2;
            s2.vy += iy * invM2;
            s2.vz += iz * invM2;
            
            if (Math.abs(velAlongNormal) > 0.2) {
                playCollisionSound(Math.abs(velAlongNormal));
            }
        }
  };

  const updatePhysics = () => {
    const spheres = spheresRef.current;
    
    if (lastAttractionEnabled.current && !config.attraction) setSilenceUntil(performance.now() + 5000);
    lastAttractionEnabled.current = config.attraction;

    const cam = cameraRef.current;
    const physicsDist = config.renderDistance + 30.0;
    const physicsDistSq = physicsDist * physicsDist;
    
    // Reset Grid & Lists
    grid.current.clear();
    largeSpheres.current.length = 0;
    activeSpheresIndices.current.length = 0;
    
    const CELL_SIZE = 4.0;
    const activeIndices = activeSpheresIndices.current;
    
    // 1. Identify active spheres & Move them
    for(let i = 0; i < spheres.length; i++) {
        const s = spheres[i];
        const dx = s.x - cam.x;
        const dy = s.y - cam.y;
        const dz = s.z - cam.z;
        if (dx*dx + dy*dy + dz*dz < physicsDistSq) {
            activeIndices.push(i);
        }
    }

    // Explosion Logic (Movement Phase)
    if (explosionState.current.active) {
        const { phase, center, startTime } = explosionState.current;
        if (phase === 'gather') {
            let allClose = true;
            let gatherRadius = 1.0;
            const count = activeIndices.length;
            if (count >= 11 && count <= 22) gatherRadius = 3.0; 
            else if (count > 22) gatherRadius = count * 0.1;
            else gatherRadius = Math.max(1.0, count * 0.5);
            
            for (let i = 0; i < activeIndices.length; i++) {
                const s = spheres[activeIndices[i]];
                const dx = center.x - s.x, dy = center.y - s.y, dz = center.z - s.z;
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                s.vx += dx * 0.25; s.vy += dy * 0.25; s.vz += dz * 0.25; 
                s.vx *= 0.7; s.vy *= 0.7; s.vz *= 0.7; 
                if (dist > gatherRadius) allClose = false;
            }
            if (allClose || (performance.now() - startTime > 800)) {
                explosionState.current.phase = 'explode';
                playExplosion();
            }
        } else {
            for (let i = 0; i < activeIndices.length; i++) {
                const s = spheres[activeIndices[i]];
                const dx = s.x - center.x, dy = s.y - center.y, dz = s.z - center.z;
                let len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.001;
                const force = 45.0 + Math.random() * 20.0; 
                s.vx = (dx/len) * force; s.vy = (dy/len) * force; s.vz = (dz/len) * force;
            }
            explosionState.current.active = false;
        }
    }

    // Attraction & Movement Logic
    if ((config.attraction || config.blackHole) && !explosionState.current.active) {
        const targetX = attractionTargetRef?.current?.x ?? 0;
        const targetY = attractionTargetRef?.current?.y ?? 0;
        const targetZ = attractionTargetRef?.current?.z ?? 0;
        const strength = config.blackHole ? 0.05 : 0.008;
        const damping = config.blackHole ? 0.96 : 0.9;
        const minDist = config.blackHole ? 0.1 : 0.5;

        for (let i = 0; i < activeIndices.length; i++) {
            const s = spheres[activeIndices[i]];
            const dx = targetX - s.x, dy = targetY - s.y, dz = targetZ - s.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if(dist > minDist) { 
                s.vx += (dx/dist)*strength; s.vy += (dy/dist)*strength; s.vz += (dz/dist)*strength; 
            } else if (config.blackHole && dist < 0.05) {
                s.vx *= 0.5; s.vy *= 0.5; s.vz *= 0.5;
            }
            if (dist < 3.0) { s.vx *= damping; s.vy *= damping; s.vz *= damping; }
        }
    }

    // General Physics Update (Gravity, Bounds, Grid Population)
    for (let i = 0; i < activeIndices.length; i++) {
        const idx = activeIndices[i];
        const s = spheres[idx];
        const isResting = !config.water && !config.blackHole && (Math.abs(s.y - (-1.0 + s.radius)) < 0.001) && (Math.abs(s.vy) < 0.01);

        if (config.gravity && !explosionState.current.active && !isResting) {
            s.vy -= config.water ? 0.0018 : 0.005; 
        }
        
        if (config.water) {
             if (s.y - s.radius < -1.0) { s.y = -1.0 + s.radius; s.vy *= -0.05; }
             if (s.x - s.radius < -3.0) { s.x = -3.0 + s.radius; s.vx *= -0.05; }
             if (s.x + s.radius > 3.0) { s.x = 3.0 - s.radius; s.vx *= -0.05; }
             if (s.z - s.radius < -0.8) { s.z = -0.8 + s.radius; s.vz *= -0.05; }
             if (s.z + s.radius > 0.8) { s.z = 0.8 - s.radius; s.vz *= -0.05; }
        } else {
             if (s.y - s.radius < -1.0) { 
                 s.y = -1.0 + s.radius; 
                 // Fix: Removed +0.02 energy addition and added velocity threshold to stop bouncing
                 s.vy *= -config.bounciness;
                 if (!config.blackHole) {
                     s.vx *= 0.96;
                     s.vz *= 0.96;
                 }
                 if (Math.abs(s.vy) < 0.1) {
                     s.vy = 0;
                 }
             }
        }

        s.x += s.vx; s.y += s.vy; s.z += s.vz;
        
        if (!config.water && !config.blackHole) {
             const bounds = 500.0;
             if (s.x < -bounds || s.x > bounds) { s.vx *= -0.9; s.x = Math.sign(s.x)*bounds; }
             if (s.z < -bounds || s.z > bounds) { s.vz *= -0.9; s.z = Math.sign(s.z)*bounds; }
        }

        // Grid Population
        if (s.radius > CELL_SIZE / 2) {
            largeSpheres.current.push(idx);
        } else {
            const k = `${Math.floor(s.x/CELL_SIZE)}|${Math.floor(s.y/CELL_SIZE)}|${Math.floor(s.z/CELL_SIZE)}`;
            let cell = grid.current.get(k);
            if (!cell) { cell = []; grid.current.set(k, cell); }
            cell.push(idx);
        }
    }

    // Collision Detection (Optimized Spatial Hash)
    
    // 1. Large Spheres vs All
    for (const idx1 of largeSpheres.current) {
        const s1 = spheres[idx1];
        for (const idx2 of activeIndices) {
            if (idx1 === idx2) continue;
            const s2 = spheres[idx2];
            // If both are large, enforce order to prevent double check
            if (s2.radius > CELL_SIZE/2 && idx1 > idx2) continue;
            resolveCollision(s1, s2);
        }
    }

    // 2. Grid Cells (Small vs Small)
    // Check specific neighbors (forward direction) to avoid double counting and self-check
    const offsets = [
        [0,0,0], [1,0,0], [-1,1,0], [0,1,0], [1,1,0],
        [-1,-1,1], [0,-1,1], [1,-1,1],
        [-1,0,1], [0,0,1], [1,0,1],
        [-1,1,1], [0,1,1], [1,1,1]
    ];
    
    for (const [key, cellIndices] of grid.current.entries()) {
        const [cx, cy, cz] = key.split('|').map(Number);
        
        for (let i = 0; i < cellIndices.length; i++) {
            const idx1 = cellIndices[i];
            const s1 = spheres[idx1];
            
            // Iterate neighbor cells (including own cell via 0,0,0)
            for (const off of offsets) {
                const nKey = `${cx+off[0]}|${cy+off[1]}|${cz+off[2]}`;
                const nIndices = grid.current.get(nKey);
                
                if (nIndices) {
                    for (const idx2 of nIndices) {
                         // If same cell, enforce index order to prevent A-B vs B-A
                         if (key === nKey) {
                             if (idx1 < idx2) resolveCollision(s1, spheres[idx2]);
                         } else {
                             // Different cell, always check
                             resolveCollision(s1, spheres[idx2]);
                         }
                    }
                }
            }
        }
    }
  };

  return { updatePhysics };
};
