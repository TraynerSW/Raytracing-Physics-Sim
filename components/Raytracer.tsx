

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Sphere, Camera, SimulationConfig, Light } from '../types';
import { fragmentShaderSource, vertexShaderSource } from '../shaders';
import { useGameAudio } from '../hooks/useGameAudio';
import { usePhysicsEngine } from '../hooks/usePhysicsEngine';

interface RaytracerProps {
  spheresRef: React.MutableRefObject<Sphere[]>;
  lightsRef: React.MutableRefObject<Light[]>;
  config: SimulationConfig;
  cameraRef: React.MutableRefObject<Camera>;
  setTimeOfDay: (t: number) => void;
  setLockRotation: (val: boolean) => void;
  onBallClick: (sphere: Sphere) => void;
  teleportTrigger: number;
  explodeTrigger: number;
  pushTrigger: number;
  resetTrigger: number;
  isSettingFocus: boolean;
  onCancelFocus: () => void;
}

const Raytracer: React.FC<RaytracerProps> = ({ spheresRef, lightsRef, config, cameraRef, setTimeOfDay, setLockRotation, onBallClick, teleportTrigger, explodeTrigger, pushTrigger, resetTrigger, isSettingFocus, onCancelFocus }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const keysPressed = useRef<Set<string>>(new Set());
  const mousePosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const attractionTargetRef = useRef<{ x: number, y: number, z: number }>({ x: 0, y: 0, z: 0 });
  const isTouchDeviceRef = useRef(false);
  const isLaserActive = useRef(false);
  const [isFocused, setIsFocused] = useState(() => typeof document !== 'undefined' ? document.hasFocus() : true);
  const [isLocked, setIsLocked] = useState(false);
  const justLockedRef = useRef(false);

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { playCollisionSound, playExplosion, resetSilence, setSilenceUntil, updateSoundFrame, ensureAudio, playLaser } = useGameAudio(config);

  const { updatePhysics } = usePhysicsEngine({
      spheresRef,
      cameraRef,
      config,
      explodeTrigger,
      playCollisionSound,
      playExplosion,
      setSilenceUntil,
      attractionTargetRef
  });

  useEffect(() => {
      isTouchDeviceRef.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      
      const handleFocus = () => setIsFocused(true);
      const handleBlur = () => setIsFocused(false);
      
      window.addEventListener('focus', handleFocus);
      window.addEventListener('blur', handleBlur);

      const handleLockChange = () => {
          setIsLocked(!!document.pointerLockElement);
      };
      document.addEventListener('pointerlockchange', handleLockChange);

      return () => {
          window.removeEventListener('focus', handleFocus);
          window.removeEventListener('blur', handleBlur);
          document.removeEventListener('pointerlockchange', handleLockChange);
      };
  }, []);

  useEffect(() => { resetSilence(); }, [pushTrigger, resetSilence]);

  useEffect(() => {
      if (resetTrigger === 0) return;
      const cam = cameraRef.current;
      cam.x = 0;
      cam.y = 1;
      cam.z = -2;
      cam.yaw = 0;
      cam.pitch = -0.2;
  }, [resetTrigger, cameraRef]);

  useEffect(() => {
      if (teleportTrigger === 0) return; 
      const cam = cameraRef.current;
      let tx = 0, ty = 0, tz = 0;
      if (spheresRef.current.length > 0) {
          tx = spheresRef.current[0].x;
          ty = spheresRef.current[0].y;
          tz = spheresRef.current[0].z;
      }
      const radius = 8.0;
      const angle = Math.PI;
      const height = 2.0;
      cam.x = tx + Math.sin(angle) * radius;
      cam.z = tz + Math.cos(angle) * radius;
      cam.y = ty + height;
      cam.yaw = Math.atan2(tx - cam.x, tz - cam.z);
      cam.pitch = Math.atan2(ty - cam.y, radius);
  }, [teleportTrigger, spheresRef, cameraRef]);

  const isDragging = useRef(false);
  const isRightClickDragging = useRef(false);
  const lastPointerX = useRef(0);
  const lastPointerY = useRef(0);
  const orbitDelta = useRef({ x: 0, y: 0 });
  const pointerStartPos = useRef({ x: 0, y: 0 });
  const pointerStartTime = useRef(0);
  const zoomDelta = useRef(0);
  const activePointers = useRef<Map<number, { x: number, y: number }>>(new Map());
  const prevPinchDiff = useRef<number>(-1);
  const frameCount = useRef(0);
  const lastFpsUpdate = useRef(0);
  const maxFpsRef = useRef(60); 
  
  const prevTargetPos = useRef<{x:number, y:number, z:number} | null>(null);
  
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const locationsRef = useRef<any>({});
  const sphereTextureRef = useRef<WebGLTexture | null>(null);
  const textureWidth = 1000;
  const textureHeight = 20; 
  const sphereDataArray = useRef(new Float32Array(textureWidth * textureHeight * 4));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
    if (!gl) return;
    glRef.current = gl;

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("Shader Compile Error:", gl.getShaderInfoLog(shader));
          return null;
      }
      return shader;
    };

    const program = gl.createProgram();
    if (!program) return;
    
    const vs = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (!vs || !fs) {
        console.error("Failed to create shaders");
        return;
    }

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);
    programRef.current = program;

    locationsRef.current = {
      position: gl.getAttribLocation(program, 'a_position'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      time: gl.getUniformLocation(program, 'u_time'),
      cameraPos: gl.getUniformLocation(program, 'u_cameraPos'),
      cameraDir: gl.getUniformLocation(program, 'u_cameraDir'),
      cameraUp: gl.getUniformLocation(program, 'u_cameraUp'),
      cameraRight: gl.getUniformLocation(program, 'u_cameraRight'),
      sphereCount: gl.getUniformLocation(program, 'u_sphereCount'),
      u_sphereDataTexture: gl.getUniformLocation(program, 'u_sphereDataTexture'),
      u_sphereTextureSize: gl.getUniformLocation(program, 'u_sphereTextureSize'),
      lightCount: gl.getUniformLocation(program, 'u_lightCount'),
      lightPositions: gl.getUniformLocation(program, 'u_lightPositions'),
      lightColors: gl.getUniformLocation(program, 'u_lightColors'),
      rayCount: gl.getUniformLocation(program, 'u_rayCount'),
      antialiasing: gl.getUniformLocation(program, 'u_antialiasing'),
      groundTexture: gl.getUniformLocation(program, 'u_groundTexture'),
      maxBounces: gl.getUniformLocation(program, 'u_maxBounces'),
      maxDist: gl.getUniformLocation(program, 'u_maxDist'),
      rain: gl.getUniformLocation(program, 'u_rain'),
      fog: gl.getUniformLocation(program, 'u_fog'),
      fogDensity: gl.getUniformLocation(program, 'u_fogDensity'),
      fogDistance: gl.getUniformLocation(program, 'u_fogDistance'),
      shadows: gl.getUniformLocation(program, 'u_shadows'),
      ao: gl.getUniformLocation(program, 'u_ao'),
      reflectionIntensity: gl.getUniformLocation(program, 'u_reflectionIntensity'),
      primaryLightEnabled: gl.getUniformLocation(program, 'u_primaryLightEnabled'),
      sunFocusEnabled: gl.getUniformLocation(program, 'u_sunFocusEnabled'),
      dayNightCycle: gl.getUniformLocation(program, 'u_dayNightCycle'),
      timeOfDay: gl.getUniformLocation(program, 'u_timeOfDay'),
      focusPos: gl.getUniformLocation(program, 'u_focusPos'),
      lightPos: gl.getUniformLocation(program, 'u_lightPos'),
      lightIntensity: gl.getUniformLocation(program, 'u_lightIntensity'),
      u_skyboxType: gl.getUniformLocation(program, 'u_skyboxType'),
      water: gl.getUniformLocation(program, 'u_water'),
      waterLevel: gl.getUniformLocation(program, 'u_waterLevel'),
      showLightOrbs: gl.getUniformLocation(program, 'u_showLightOrbs'),
      indirectLighting: gl.getUniformLocation(program, 'u_indirectLighting'),
      globalIllumination: gl.getUniformLocation(program, 'u_globalIllumination'),
      roughness: gl.getUniformLocation(program, 'u_roughness'),
      ballTexture: gl.getUniformLocation(program, 'u_ballTexture'),
      u_laserActive: gl.getUniformLocation(program, 'u_laserActive'),
      u_laserOrigin: gl.getUniformLocation(program, 'u_laserOrigin'),
      u_laserDir: gl.getUniformLocation(program, 'u_laserDir'),
    };

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(locationsRef.current.position);
    gl.vertexAttribPointer(locationsRef.current.position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, textureWidth, textureHeight, 0, gl.RGBA, gl.FLOAT, null);
    sphereTextureRef.current = texture;

  }, []);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ratio = window.innerWidth / window.innerHeight;
        let targetHeight = window.innerHeight;
        if (config.resolutionMode !== 'native') {
            switch (config.resolutionMode) {
                case '720p': targetHeight = 720; break;
                case '1080p': targetHeight = 1080; break;
                case '1440p': targetHeight = 1440; break;
                case '2160p': targetHeight = 2160; break;
            }
        }
        canvas.width = targetHeight * ratio;
        canvas.height = targetHeight;
        if (glRef.current) glRef.current.viewport(0, 0, canvas.width, canvas.height);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [config.resolutionMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
         if (!(document.activeElement instanceof HTMLElement) || (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'BUTTON' && document.activeElement.tagName !== 'SELECT')) {
             keysPressed.current.add(e.code);
         }
    };
    const handleKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.code);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        zoomDelta.current += e.deltaY * 0.01;
    };
    const canvas = canvasRef.current;
    if (canvas) canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas?.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        mousePosRef.current = { x: e.clientX, y: e.clientY };

        if (Math.abs(e.movementX) > 100 || Math.abs(e.movementY) > 100) return;

        if (!config.lookAtBall && !config.water && !isSettingFocus && document.pointerLockElement === canvasRef.current) {
            cameraRef.current.yaw += e.movementX * 0.005;
            cameraRef.current.pitch -= e.movementY * 0.005;
            const maxPitch = Math.PI / 2 - 0.1;
            cameraRef.current.pitch = Math.max(-maxPitch, Math.min(maxPitch, cameraRef.current.pitch));
        }
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [config.lookAtBall, config.water, isSettingFocus]);

  const handlePointerDown = (e: React.PointerEvent) => {
    window.focus(); 
    const isLocked = document.pointerLockElement === canvasRef.current;

    if (!config.lookAtBall && !config.water && !isSettingFocus && canvasRef.current && !isLocked) {
        try { 
            const promise = (canvasRef.current as any).requestPointerLock();
            if (promise && typeof promise.catch === 'function') {
                promise.catch(() => {});
            }
        } catch (err) {}
        justLockedRef.current = true;
    }

    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch (err) {}
    pointerStartPos.current = { x: e.clientX, y: e.clientY };
    pointerStartTime.current = performance.now();
    
    if (e.button === 2 && !config.lookAtBall && !config.water && !isSettingFocus && !justLockedRef.current) {
        isLaserActive.current = true;
        playLaser();
    }

    ensureAudio();
    
    if (activePointers.current.size === 1) {
        isDragging.current = true;
        if (e.button === 2) {
            isRightClickDragging.current = true;
        } else {
            isRightClickDragging.current = false;
        }
        lastPointerX.current = e.clientX;
        lastPointerY.current = e.clientY;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activePointers.current.has(e.pointerId)) activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.current.size === 2) {
        const points = Array.from(activePointers.current.values()) as {x: number, y: number}[];
        const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        if (prevPinchDiff.current > 0) zoomDelta.current += (prevPinchDiff.current - dist) * 0.05;
        prevPinchDiff.current = dist;
        isDragging.current = false;
        isRightClickDragging.current = false;
        return;
    }
    if (activePointers.current.size === 1 && isDragging.current) {
        if (config.lookAtBall) {
            if (isRightClickDragging.current) {
                const dx = e.clientX - lastPointerX.current;
                const dy = e.clientY - lastPointerY.current;
                cameraRef.current.yaw += dx * 0.005;
                cameraRef.current.pitch -= dy * 0.005;
                const maxPitch = Math.PI / 2 - 0.1;
                cameraRef.current.pitch = Math.max(-maxPitch, Math.min(maxPitch, cameraRef.current.pitch));
            } else {
                orbitDelta.current.x += e.clientX - lastPointerX.current;
                orbitDelta.current.y += e.clientY - lastPointerY.current;
            }
        } else if (config.water || isSettingFocus) {
            const dx = e.clientX - lastPointerX.current;
            const dy = e.clientY - lastPointerY.current;
            const sensitivity = isSettingFocus ? 0.002 : 0.005;
            cameraRef.current.yaw += dx * sensitivity;
            cameraRef.current.pitch -= dy * sensitivity;
            const maxPitch = Math.PI / 2 - 0.1;
            cameraRef.current.pitch = Math.max(-maxPitch, Math.min(maxPitch, cameraRef.current.pitch));
        }
        lastPointerX.current = e.clientX;
        lastPointerY.current = e.clientY;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const dist = Math.hypot(e.clientX - pointerStartPos.current.x, e.clientY - pointerStartPos.current.y);
    const timeDiff = performance.now() - pointerStartTime.current;
    
    if (isLaserActive.current) {
        isLaserActive.current = false;
    }
    
    if (justLockedRef.current) {
        justLockedRef.current = false;
        isDragging.current = false;
        isRightClickDragging.current = false;
        activePointers.current.delete(e.pointerId);
        return;
    }

    if (isRightClickDragging.current) {
        isRightClickDragging.current = false;
    } else {
        const isLongPressDrag = !config.lookAtBall && timeDiff > 200;
        const isFocusDrag = isSettingFocus && dist > 5;
        
        if (dist < 15 && !isLongPressDrag && !isFocusDrag && activePointers.current.size === 1 && canvasRef.current && e.button !== 2) {
             const rect = canvasRef.current.getBoundingClientRect();
             let rd;
             let cam = cameraRef.current;
             
             if (config.lookAtBall) {
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const dir = {
                    x: Math.cos(cam.pitch) * Math.sin(cam.yaw),
                    y: Math.sin(cam.pitch),
                    z: Math.cos(cam.pitch) * Math.cos(cam.yaw),
                };
                const right = { x: Math.cos(cam.yaw), y: 0, z: -Math.sin(cam.yaw) };
                const up = { x: dir.y*right.z - dir.z*right.y, y: dir.z*right.x - dir.x*right.z, z: dir.x*right.y - dir.y*right.x };
                const uvX = (x - rect.width * 0.5) / rect.height;
                const uvY = (rect.height - y - rect.height * 0.5) / rect.height; 
                rd = { 
                    x: dir.x + uvX * right.x + uvY * up.x, 
                    y: dir.y + uvX * right.y + uvY * up.y, 
                    z: dir.z + uvX * right.z + uvY * up.z 
                };
             } else {
                 if (isSettingFocus) {
                     const x = e.clientX - rect.left;
                     const y = e.clientY - rect.top;
                     const dir = {
                        x: Math.cos(cam.pitch) * Math.sin(cam.yaw),
                        y: Math.sin(cam.pitch),
                        z: Math.cos(cam.pitch) * Math.cos(cam.yaw),
                    };
                    const right = { x: Math.cos(cam.yaw), y: 0, z: -Math.sin(cam.yaw) };
                    const up = { x: dir.y*right.z - dir.z*right.y, y: dir.z*right.x - dir.x*right.z, z: dir.x*right.y - dir.y*right.x };
                    const uvX = (x - rect.width * 0.5) / rect.height;
                    const uvY = (rect.height - y - rect.height * 0.5) / rect.height;
                    rd = { 
                        x: dir.x + uvX * right.x + uvY * up.x, 
                        y: dir.y + uvX * right.y + uvY * up.y, 
                        z: dir.z + uvX * right.z + uvY * up.z 
                    };
                 } else {
                     rd = {
                        x: Math.cos(cam.pitch) * Math.sin(cam.yaw),
                        y: Math.sin(cam.pitch),
                        z: Math.cos(cam.pitch) * Math.cos(cam.yaw),
                     };
                 }
             }

             const mag = Math.sqrt(rd.x*rd.x + rd.y*rd.y + rd.z*rd.z);
             rd.x /= mag; rd.y /= mag; rd.z /= mag;
             
             let minT = Infinity;
             let hitSphere: Sphere | null = null;
             spheresRef.current.forEach(s => {
                 const ocX = cam.x - s.x;
                 const ocY = cam.y - s.y;
                 const ocZ = cam.z - s.z;
                 const b = ocX * rd.x + ocY * rd.y + ocZ * rd.z;
                 const c = (ocX*ocX + ocY*ocY + ocZ*ocZ) - (s.radius * 1.5)**2; 
                 const h = b*b - c;
                 if (h >= 0) {
                     const t = -b - Math.sqrt(h);
                     if (t > 0 && t < minT) { minT = t; hitSphere = s; }
                 }
             });
             
             if (hitSphere && !config.water) { 
                 onBallClick(hitSphere); 
                 resetSilence(); 
             } else if (config.blackHole) {
                 onBallClick({} as Sphere);
             }
        }
    }

    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) prevPinchDiff.current = -1;
    if (activePointers.current.size === 0) {
        isDragging.current = false;
        isRightClickDragging.current = false;
    }
    if (activePointers.current.size === 1) {
        isDragging.current = true;
        const p = activePointers.current.values().next().value as { x: number, y: number };
        lastPointerX.current = p.x; lastPointerY.current = p.y;
    }
  };

  const loop = useCallback((time: number) => {
    const curConfig = configRef.current;
    const camera = cameraRef.current;
    const keys = keysPressed.current;
    const spheres = spheresRef.current;
    
    const dt = 0.016; 

    if (curConfig.dayNightCycle) {
        const cycleSpeed = (Math.PI * 2) / 300;
        let nextTime = curConfig.timeOfDay + dt * cycleSpeed;
        if (nextTime > Math.PI * 2) nextTime -= Math.PI * 2;
        setTimeOfDay(nextTime);
    }
    
    if (isLaserActive.current && !curConfig.lookAtBall) {
        const laserDir = {
            x: Math.cos(camera.pitch) * Math.sin(camera.yaw),
            y: Math.sin(camera.pitch),
            z: Math.cos(camera.pitch) * Math.cos(camera.yaw)
        };
        
        spheres.forEach(s => {
            const oc = { x: s.x - camera.x, y: s.y - camera.y, z: s.z - camera.z };
            const dot = oc.x * laserDir.x + oc.y * laserDir.y + oc.z * laserDir.z;
            const cp = { 
                x: camera.x + laserDir.x * dot, 
                y: camera.y + laserDir.y * dot, 
                z: camera.z + laserDir.z * dot 
            };
            
            if (dot > 0) {
                const distSq = (s.x - cp.x)**2 + (s.y - cp.y)**2 + (s.z - cp.z)**2;
                const hitRadius = s.radius + 0.2; 
                
                if (distSq < hitRadius * hitRadius) {
                    const pushForce = 0.15 / (1.0 + s.radius);
                    s.vx += laserDir.x * pushForce;
                    s.vy += laserDir.y * pushForce;
                    s.vz += laserDir.z * pushForce;
                    s.vx += (Math.random() - 0.5) * 0.02;
                    s.vy += (Math.random() - 0.5) * 0.02;
                    s.vz += (Math.random() - 0.5) * 0.02;
                }
            }
        });
    }

    if (curConfig.attraction || curConfig.blackHole) {
        if (document.pointerLockElement === canvasRef.current) {
            const dirX = Math.cos(camera.pitch) * Math.sin(camera.yaw);
            const dirY = Math.sin(camera.pitch);
            const dirZ = Math.cos(camera.pitch) * Math.cos(camera.yaw);
            attractionTargetRef.current = {
                x: camera.x + dirX * 15.0,
                y: camera.y + dirY * 15.0,
                z: camera.z + dirZ * 15.0
            };
        } else {
            if (curConfig.lookAtBall && !isTouchDeviceRef.current) {
                if (canvasRef.current) {
                    const rect = canvasRef.current.getBoundingClientRect();
                    const x = mousePosRef.current.x - rect.left;
                    const y = mousePosRef.current.y - rect.top;
                    const uvX = (x - rect.width * 0.5) / rect.height;
                    const uvY = (rect.height - y - rect.height * 0.5) / rect.height;
                    
                    const dir = {
                        x: Math.cos(camera.pitch) * Math.sin(camera.yaw),
                        y: Math.sin(camera.pitch),
                        z: Math.cos(camera.pitch) * Math.cos(camera.yaw),
                    };
                    const right = { x: Math.cos(camera.yaw), y: 0, z: -Math.sin(camera.yaw) };
                    const up = { x: dir.y*right.z - dir.z*right.y, y: dir.z*right.x - dir.x*right.z, z: dir.x*right.y - dir.y*right.x };
                    
                    const rayDir = {
                        x: dir.x + uvX * right.x + uvY * up.x,
                        y: dir.y + uvX * right.y + uvY * up.y,
                        z: dir.z + uvX * right.z + uvY * up.z
                    };
                    const mag = Math.sqrt(rayDir.x*rayDir.x + rayDir.y*rayDir.y + rayDir.z*rayDir.z);
                    
                    attractionTargetRef.current = {
                        x: camera.x + (rayDir.x / mag) * 15.0,
                        y: camera.y + (rayDir.y / mag) * 15.0,
                        z: camera.z + (rayDir.z / mag) * 15.0
                    };
                }
            } else {
                const dir = {
                    x: Math.cos(camera.pitch) * Math.sin(camera.yaw),
                    y: Math.sin(camera.pitch),
                    z: Math.cos(camera.pitch) * Math.cos(camera.yaw),
                };
                attractionTargetRef.current = {
                    x: camera.x + dir.x * 15.0,
                    y: camera.y + dir.y * 15.0,
                    z: camera.z + dir.z * 15.0
                };
            }
        }
    }

    updatePhysics();
    updateSoundFrame();
    
    const hasSpheres = spheres.length > 0;
    const target = hasSpheres ? spheres[0] : { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, radius: 1 };
    const currentTargetPos = hasSpheres ? {x: target.x, y: target.y, z: target.z} : {x: 0, y: 0, z: 0};
    
    if (prevTargetPos.current && hasSpheres) {
        const dx = currentTargetPos.x - prevTargetPos.current.x;
        const dy = currentTargetPos.y - prevTargetPos.current.y;
        const dz = currentTargetPos.z - prevTargetPos.current.z;
        if (curConfig.lookAtBall && curConfig.followBall) {
            camera.x += dx; camera.y += dy; camera.z += dz;
        }
    }
    prevTargetPos.current = currentTargetPos;

    const sprintMultiplier = (keys.has('ControlLeft') || keys.has('ControlRight')) ? 2.0 : 1.0;
    const speed = curConfig.cameraSpeed * 0.05 * sprintMultiplier;

    if (curConfig.lookAtBall && curConfig.lockRotation && hasSpheres && !isRightClickDragging.current) {
        const dx = camera.x - target.x;
        const dz = camera.z - target.z;
        let radius = Math.sqrt(dx*dx + dz*dz);
        let angle = Math.atan2(dx, dz);
        let height = camera.y - target.y;

        if (keys.has('KeyW') || keys.has('KeyZ')) radius -= speed;
        if (keys.has('KeyS')) radius += speed;
        radius = Math.max(radius + zoomDelta.current, target.radius + 0.5);
        zoomDelta.current = 0;

        const rotSpeed = speed * 0.2; 
        if (keys.has('KeyA') || keys.has('KeyQ')) angle += rotSpeed; 
        if (keys.has('KeyD')) angle -= rotSpeed; 
        
        angle += orbitDelta.current.x * 0.004; 
        height += orbitDelta.current.y * 0.04; 
        orbitDelta.current = { x: 0, y: 0 };

        if (keys.has('Space')) height += speed;
        if (keys.has('ShiftLeft') || keys.has('ShiftRight')) height -= speed;

        camera.x = target.x + Math.sin(angle) * radius;
        camera.z = target.z + Math.cos(angle) * radius;
        camera.y = target.y + height;

    } else if (!curConfig.lookAtBall) {
        const moveSpeed = speed;
        const dx = Math.sin(camera.yaw), dz = Math.cos(camera.yaw);
        const rx = Math.cos(camera.yaw), rz = -Math.sin(camera.yaw);
        if (keys.has('KeyW') || keys.has('KeyZ')) { camera.x += dx*moveSpeed; camera.z += dz*moveSpeed; }
        if (keys.has('KeyS')) { camera.x -= dx*moveSpeed; camera.z -= dz*moveSpeed; }
        if (keys.has('KeyA') || keys.has('KeyQ')) { camera.x -= rx*moveSpeed; camera.z -= rz*moveSpeed; }
        if (keys.has('KeyD')) { camera.x += rx*moveSpeed; camera.z += rz*moveSpeed; }
        if (keys.has('Space')) camera.y += moveSpeed;
        if (keys.has('ShiftLeft') || keys.has('ShiftRight')) camera.y -= moveSpeed;

        if (zoomDelta.current !== 0) {
            const fwdX = Math.cos(camera.pitch) * Math.sin(camera.yaw);
            const fwdY = Math.sin(camera.pitch);
            const fwdZ = Math.cos(camera.pitch) * Math.cos(camera.yaw);
            const zSpeed = moveSpeed * 5.0;
            camera.x -= fwdX * zoomDelta.current * zSpeed;
            camera.y -= fwdY * zoomDelta.current * zSpeed;
            camera.z -= fwdZ * zoomDelta.current * zSpeed;
            zoomDelta.current = 0;
        }
    }

    if (camera.y < -0.9) camera.y = -0.9;
    if (camera.y > 260.0) camera.y = 260.0;

    if (!curConfig.water) {
        const playerRadius = 0.3;
        for(let i=0; i<spheres.length; i++) {
            const s = spheres[i];
            const dx = camera.x - s.x;
            const dy = camera.y - s.y;
            const dz = camera.z - s.z;
            const distSq = dx*dx + dy*dy + dz*dz;
            const minDist = s.radius + playerRadius;
            if (distSq < minDist*minDist) {
                const dist = Math.sqrt(distSq);
                const pushDist = minDist - dist;
                
                if (dist < 0.001) {
                    const fwdX = Math.cos(camera.pitch) * Math.sin(camera.yaw);
                    const fwdZ = Math.cos(camera.pitch) * Math.cos(camera.yaw);
                    camera.x -= fwdX * 0.1;
                    camera.z -= fwdZ * 0.1;
                    
                    s.vx += fwdX * 0.2;
                    s.vz += fwdZ * 0.2;
                } else {
                    camera.x += (dx/dist) * pushDist;
                    camera.y += (dy/dist) * pushDist;
                    camera.z += (dz/dist) * pushDist;
                    
                    const pushForce = 0.15 + pushDist * 0.2;
                    s.vx -= (dx/dist) * pushForce;
                    s.vz -= (dz/dist) * pushForce;
                }
            }
        }
    }

    if (curConfig.lookAtBall && hasSpheres && !isRightClickDragging.current) {
        camera.yaw = Math.atan2(target.x - camera.x, target.z - camera.z);
        const distH = Math.sqrt(Math.pow(target.x - camera.x, 2) + Math.pow(target.z - camera.z, 2));
        camera.pitch = Math.atan2(target.y - camera.y, distH);
    }

    const gl = glRef.current;
    const locs = locationsRef.current;
    if (gl && programRef.current) {
        frameCount.current++;
        if (time - lastFpsUpdate.current >= 500) {
            const fps = Math.round((frameCount.current * 1000) / (time - lastFpsUpdate.current));
            if (fps > maxFpsRef.current) maxFpsRef.current = fps;
            
            if (curConfig.showPerformance && statsRef.current) {
                const maxBalls = curConfig.water ? 15000 : 1000;
                const maxLights = 30;
                statsRef.current.innerText = `Balls: ${spheres.length} / ${maxBalls}\nLight: ${lightsRef.current.length} / ${maxLights}\nFPS: ${fps} / ${maxFpsRef.current}`;
            }
            lastFpsUpdate.current = time;
            frameCount.current = 0;
        }

        gl.uniform2f(locs.resolution, gl.canvas.width, gl.canvas.height);
        gl.uniform1f(locs.time, time * 0.001);
        
        const cam = cameraRef.current;
        const dir = { x: Math.cos(cam.pitch)*Math.sin(cam.yaw), y: Math.sin(cam.pitch), z: Math.cos(cam.pitch)*Math.cos(cam.yaw) };
        const right = { x: Math.cos(cam.yaw), y: 0, z: -Math.sin(cam.yaw) };
        const up = { x: dir.y*right.z - dir.z*right.y, y: dir.z*right.x - dir.x*right.z, z: dir.x*right.y - dir.y*right.x };

        gl.uniform3f(locs.cameraPos, cam.x, cam.y, cam.z);
        gl.uniform3f(locs.cameraDir, dir.x, dir.y, dir.z);
        gl.uniform3f(locs.cameraUp, up.x, up.y, up.z);
        gl.uniform3f(locs.cameraRight, right.x, right.y, right.z);
        gl.uniform3f(locs.lightPos, 20.0, 40.0, 20.0);
        gl.uniform3f(locs.focusPos, cam.x, cam.y, cam.z);
        gl.uniform1f(locs.lightIntensity, curConfig.lightIntensity * 0.4);
        gl.uniform1i(locs.primaryLightEnabled, curConfig.primaryLightEnabled ? 1 : 0);
        gl.uniform1i(locs.sunFocusEnabled, (curConfig.sunFocusEnabled || curConfig.primaryLightEnabled) ? 1 : 0);
        gl.uniform1i(locs.dayNightCycle, curConfig.dayNightCycle ? 1 : 0);
        gl.uniform1f(locs.timeOfDay, curConfig.timeOfDay);
        gl.uniform1i(locs.u_laserActive, isLaserActive.current ? 1 : 0);
        if (isLaserActive.current) {
            gl.uniform3f(locs.u_laserOrigin, cam.x, cam.y, cam.z);
            gl.uniform3f(locs.u_laserDir, dir.x, dir.y, dir.z);
        }
        
        let skyboxTypeInt = 0;
        if (curConfig.skyboxType === 'blue') skyboxTypeInt = 1;
        if (curConfig.skyboxType === 'white') skyboxTypeInt = 2;
        gl.uniform1i(locs.u_skyboxType, skyboxTypeInt);
        
        gl.uniform1i(locs.showLightOrbs, curConfig.renderLightOrbs ? 1 : 0);
        gl.uniform1i(locs.lightCount, lightsRef.current.length);
        
        if (lightsRef.current.length > 0) {
            const pD = new Float32Array(lightsRef.current.length * 4);
            const cD = new Float32Array(lightsRef.current.length * 3);
            lightsRef.current.forEach((l, i) => {
                pD[i*4] = l.x; pD[i*4+1] = l.y; pD[i*4+2] = l.z;
                pD[i*4+3] = 0.15 + (l.intensity / 15.0) * 0.4; 
                cD[i*3] = l.r * l.intensity; cD[i*3+1] = l.g * l.intensity; cD[i*3+2] = l.b * l.intensity;
            });
            gl.uniform4fv(locs.lightPositions, pD);
            gl.uniform3fv(locs.lightColors, cD);
        }

        gl.uniform1i(locs.rayCount, curConfig.rayCount);
        gl.uniform1i(locs.antialiasing, curConfig.antialiasing ? 1 : 0);
        gl.uniform1i(locs.groundTexture, ['checker', 'asphalt', 'hex', 'grass'].indexOf(curConfig.groundTexture));
        gl.uniform1i(locs.maxBounces, curConfig.maxBounces);
        gl.uniform1f(locs.maxDist, curConfig.renderDistance);
        gl.uniform1i(locs.rain, curConfig.rain ? 1 : 0);
        gl.uniform1i(locs.fog, curConfig.fog ? 1 : 0);
        gl.uniform1f(locs.fogDensity, curConfig.fogDensity);
        gl.uniform1f(locs.fogDistance, curConfig.renderDistance / 2.0);
        gl.uniform1i(locs.shadows, curConfig.shadows ? 1 : 0);
        gl.uniform1i(locs.ao, curConfig.ambientOcclusion ? 1 : 0);
        gl.uniform1f(locs.reflectionIntensity, curConfig.reflectionIntensity);
        gl.uniform1i(locs.water, curConfig.water ? 1 : 0);
        gl.uniform1f(locs.waterLevel, curConfig.waterLevel);
        gl.uniform1i(locs.indirectLighting, curConfig.indirectLighting ? 1 : 0);
        gl.uniform1i(locs.globalIllumination, curConfig.globalIllumination ? 1 : 0);
        gl.uniform1f(locs.roughness, curConfig.roughness);
        gl.uniform1i(locs.ballTexture, ['none', 'metal', 'glass'].indexOf(curConfig.ballTexture));
        
        const ext = gl.getExtension("EXT_texture_filter_anisotropic") ||
                    gl.getExtension("MOZ_EXT_texture_filter_anisotropic") ||
                    gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
        if (ext && sphereTextureRef.current) {
            const max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
            gl.bindTexture(gl.TEXTURE_2D, sphereTextureRef.current);
            gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(config.anisotropicFilter, max));
        }

        if (sphereTextureRef.current) {
            const data = sphereDataArray.current;
            const rDistSq = (curConfig.renderDistance + 5.0) ** 2;
            const visibleSpheres = spheres.filter(s => {
                const dx = s.x - cam.x;
                const dy = s.y - cam.y;
                const dz = s.z - cam.z;
                return (dx*dx + dy*dy + dz*dz) <= rDistSq;
            });

            for(let i=0; i<visibleSpheres.length && i < 15000; i++) {
                const s = visibleSpheres[i];
                const i1 = (Math.floor(i / textureWidth) * 2 * textureWidth + (i % textureWidth)) * 4;
                const i2 = ((Math.floor(i / textureWidth) * 2 + 1) * textureWidth + (i % textureWidth)) * 4;
                data[i1] = s.x; data[i1+1] = s.y; data[i1+2] = s.z; data[i1+3] = s.radius;
                data[i2] = s.r; data[i2+1] = s.g; data[i2+2] = s.b; data[i2+3] = s.reflectivity;
            }
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, sphereTextureRef.current);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, textureWidth, textureHeight, gl.RGBA, gl.FLOAT, data);
            gl.uniform1i(locs.u_sphereDataTexture, 0);
            gl.uniform2f(locs.u_sphereTextureSize, textureWidth, textureHeight);
            
            gl.uniform1i(locs.sphereCount, visibleSpheres.length);
        } else {
            gl.uniform1i(locs.sphereCount, 0);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    animationRef.current = requestAnimationFrame(loop);
  }, [updatePhysics, updateSoundFrame, setTimeOfDay, spheresRef, lightsRef, cameraRef, setLockRotation]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current);
  }, [loop]);

  return (
    <>
      <canvas 
        ref={canvasRef} 
        className={`absolute top-0 left-0 w-full h-full touch-none outline-none ${(config.lookAtBall || config.water || isSettingFocus || !isFocused || (!isLocked && !config.lookAtBall)) ? '' : 'cursor-none'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={(e) => { 
            e.preventDefault(); 
            if (isSettingFocus) {
                onCancelFocus();
            } else if (document.pointerLockElement === canvasRef.current) {
                document.exitPointerLock(); 
            }
        }}
      />
      {(!config.lookAtBall && !config.water && !isSettingFocus) ? (
          <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-2xl opacity-50 pointer-events-none select-none`}>+</div>
      ) : null}
      <div className="absolute top-0 left-0 flex flex-col gap-1 pointer-events-none z-50 mt-2 ml-2">
           <div ref={statsRef} className={`text-cyan-400 font-mono text-base bg-black/50 px-2 py-1 w-fit rounded whitespace-pre transition-opacity duration-300 ${config.showPerformance ? 'opacity-100' : 'opacity-0'}`}>Balls: 0 / 0</div>
      </div>
    </>
  );
};

export default Raytracer;