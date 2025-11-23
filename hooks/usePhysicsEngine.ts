

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

  const updatePhysics = () => {
    const allSpheres = spheresRef.current;
    
    if (lastAttractionEnabled.current && !config.attraction) setSilenceUntil(performance.now() + 5000);
    lastAttractionEnabled.current = config.attraction;

    // LOD Optimization: Cull physics calculations for spheres far from camera
    const cam = cameraRef.current;
    const physicsDist = config.renderDistance + 30.0;
    const physicsDistSq = physicsDist * physicsDist;
    const activeSpheres: Sphere[] = [];
    
    for(let i = 0; i < allSpheres.length; i++) {
        const s = allSpheres[i];
        const dx = s.x - cam.x;
        const dy = s.y - cam.y;
        const dz = s.z - cam.z;
        if (dx*dx + dy*dy + dz*dz < physicsDistSq) {
            activeSpheres.push(s);
        }
    }
    
    const spheres = activeSpheres;
    
    if (explosionState.current.active) {
        const { phase, center, startTime } = explosionState.current;
        if (phase === 'gather') {
            let allClose = true;
            let gatherRadius = 1.0;
            const count = spheres.length;
            
            if (count >= 11 && count <= 22) {
                gatherRadius = 3.0; 
            } else if (count > 22) {
                gatherRadius = count * 0.1;
            } else {
                gatherRadius = Math.max(1.0, count * 0.5);
            }
            
            spheres.forEach(s => {
                const dx = center.x - s.x, dy = center.y - s.y, dz = center.z - s.z;
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                s.vx += dx * 0.25; s.vy += dy * 0.25; s.vz += dz * 0.25; 
                s.vx *= 0.7; s.vy *= 0.7; s.vz *= 0.7; 
                if (dist > gatherRadius) allClose = false;
            });
            
            if (allClose || (performance.now() - startTime > 800)) {
                explosionState.current.phase = 'explode';
                playExplosion();
            }
        } else {
            spheres.forEach(s => {
                const dx = s.x - center.x, dy = s.y - center.y, dz = s.z - center.z;
                let len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.001;
                const force = 45.0 + Math.random() * 20.0; 
                s.vx = (dx/len) * force; s.vy = (dy/len) * force; s.vz = (dz/len) * force;
            });
            explosionState.current.active = false;
        }
    }

    if ((config.attraction || config.blackHole) && !explosionState.current.active) {
        const targetX = attractionTargetRef?.current?.x ?? 0;
        const targetY = attractionTargetRef?.current?.y ?? 0;
        const targetZ = attractionTargetRef?.current?.z ?? 0;

        const strength = config.blackHole ? 0.05 : 0.008;
        const damping = config.blackHole ? 0.96 : 0.9;

        spheres.forEach(s => {
            const dx = targetX - s.x, dy = targetY - s.y, dz = targetZ - s.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            const minDist = config.blackHole ? 0.1 : 0.5;

            if(dist > minDist) { 
                s.vx += (dx/dist)*strength; 
                s.vy += (dy/dist)*strength; 
                s.vz += (dz/dist)*strength; 
            } else if (config.blackHole && dist < 0.05) {
                s.vx *= 0.5; s.vy *= 0.5; s.vz *= 0.5;
            }
            
            if (dist < 3.0) {
                s.vx *= damping; s.vy *= damping; s.vz *= damping;
            }
        });
    }

    spheres.forEach(s => {
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
                 s.vy *= -(config.bounciness + 0.02); 
                 
                 if (config.blackHole) {
                     s.y += 0.1; // Larger nudge to unglue
                     s.vy = Math.abs(s.vy) * 0.5 + 0.2; // Stronger bounce base
                 } else {
                     s.vx *= 0.99; 
                     s.vz *= 0.99;
                 }
             }
        }

        s.x += s.vx;
        s.y += s.vy;
        s.z += s.vz;
        
        if (!config.water && !config.blackHole) {
             const bounds = 500.0;
             if (s.x < -bounds || s.x > bounds) { s.vx *= -0.9; s.x = Math.sign(s.x)*bounds; }
             if (s.z < -bounds || s.z > bounds) { s.vz *= -0.9; s.z = Math.sign(s.z)*bounds; }
        }
    });

    for (let i = 0; i < spheres.length; i++) {
        for (let j = i + 1; j < spheres.length; j++) {
            const s1 = spheres[i];
            const s2 = spheres[j];
            const dx = s2.x - s1.x;
            const dy = s2.y - s1.y;
            const dz = s2.z - s1.z;
            const distSq = dx*dx + dy*dy + dz*dz;
            const minDist = s1.radius + s2.radius;

            if (distSq < minDist*minDist) {
                const dist = Math.sqrt(distSq);
                if (dist < 0.0001) continue;
                
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
                
                if (velAlongNormal > 0) continue;
                
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
        }
    }
  };

  return { updatePhysics };
};