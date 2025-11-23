import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import Raytracer from './components/Raytracer';
import { Sphere, Camera, SimulationConfig, GroundTextureType, Light, ResolutionMode, SkyboxType, BallTextureType } from './types';
import { ChevronDown, ChevronRight, Droplets, Wind, Activity, RotateCcw, ScanEye, Monitor, Triangle as TriangleIcon, Square, RectangleHorizontal, Box, Shapes, Pyramid, BrickWall, Cylinder, Circle, Grid, Star, Heart, Diamond, CircleDashed, Hexagon, Infinity as InfinityIcon, AlignRight as AlignRightIcon, Globe, Cone, Donut, Layers, Gem } from 'lucide-react';

const DEFAULT_CONFIG: SimulationConfig = {
  raytracingEnabled: false, rayCount: 1, antialiasing: true, maxBounces: 1, renderDistance: 300.0, cameraSpeed: 1.0, 
  rain: false, fog: true, fogDensity: 0.15, fogDistance: 45.0, shadows: true, ambientOcclusion: true, showPerformance: false,
  reflectionIntensity: 0, gravity: false, groundTexture: 'checker', bounciness: 0.5, attraction: false, blackHole: false, followBall: false, 
  lookAtBall: false, lockRotation: true, primaryLightEnabled: true, sunFocusEnabled: false, dayNightCycle: false, timeOfDay: 0, lightIntensity: 0.5, resolutionMode: 'native', water: false, waterLevel: -0.5, renderLightOrbs: true,
  skyboxType: 'blue', indirectLighting: false, globalIllumination: false, roughness: 0.0, ballTexture: 'none', anisotropicFilter: 1
};

const App: React.FC = () => {
  const spheresRef = useRef<Sphere[]>([{ id: 1, x: 0, y: 0, z: 3, radius: 1.0, r: 1.0, g: 1.0, b: 1.0, reflectivity: 0.5, vx: 0, vy: 0, vz: 0 }]);
  const lightsRef = useRef<Light[]>([]);
  const [_, forceUpdate] = useState(0);
  const [newLightColor, setNewLightColor] = useState("#ffffff");
  const [randomLightColor, setRandomLightColor] = useState(false);
  const [newBallColor, setNewBallColor] = useState("#ffffff");
  const [randomBallColor, setRandomBallColor] = useState(false);
  const [lightPowerPercent, setLightPowerPercent] = useState<number | string>(10);
  const [ballSizePercent, setBallSizePercent] = useState<number | string>(100);
  const [config, setConfig] = useState<SimulationConfig>({ ...DEFAULT_CONFIG });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSettingFocus, setIsSettingFocus] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  
  const [menuPosition, setMenuPosition] = useState(() => {
      if (typeof window !== 'undefined') {
          return { x: Math.max(0, window.innerWidth - 400), y: 20 };
      }
      return { x: 0, y: 20 };
  });
  
  const isDraggingMenu = useRef(false);
  const hasDraggedMenu = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const flowIntervalRef = useRef<number | null>(null);
  const flowTimeoutRef = useRef<number | null>(null);
  const savedConfigRef = useRef<SimulationConfig | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPointerStartRef = useRef({ x: 0, y: 0 });
  const prevMenuCenterRef = useRef({ x: 0, y: 0 });

  const [showCamera, setShowCamera] = useState(false);
  const [showPhysics, setShowPhysics] = useState(false);
  const [showLightning, setShowLightning] = useState(false);
  const [showGraphics, setShowGraphics] = useState(false);
  const [showTerrain, setShowTerrain] = useState(false);
  const [showShapes, setShowShapes] = useState(false);

  const [teleportTrigger, setTeleportTrigger] = useState(0);
  const [explodeTrigger, setExplodeTrigger] = useState(0);
  const [pushTrigger, setPushTrigger] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);

  const cameraRef = useRef<Camera>({ x: 0, y: 1, z: -2, yaw: 0, pitch: -0.2 });
  const audioContextRef = useRef<AudioContext | null>(null);

  const blurElement = (e: React.SyntheticEvent) => {
      if (e.currentTarget instanceof HTMLElement) e.currentTarget.blur();
      else if (e.target instanceof HTMLElement) e.target.blur();
  };

  useLayoutEffect(() => {
      if (typeof window !== 'undefined') {
          setMenuPosition(prev => {
              if (prev.x === 0 && prev.y === 20) {
                   return { x: Math.max(0, window.innerWidth - 380), y: 20 };
              }
              return prev;
          });
          setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
      }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (['Space', 'KeyQ', 'KeyD'].includes(e.code) && document.activeElement instanceof HTMLElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'BUTTON' || document.activeElement.tagName === 'SELECT')) {
            e.preventDefault();
            document.activeElement.blur();
        }
        if (e.ctrlKey) {
            e.preventDefault();
        }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  useEffect(() => {
      const initAudio = () => {
          if (!audioContextRef.current) {
              const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
              if (AudioCtx) audioContextRef.current = new AudioCtx();
          }
          if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume().catch(() => {});
          window.removeEventListener('click', initAudio);
      };
      window.addEventListener('click', initAudio);
      return () => window.removeEventListener('click', initAudio);
  }, []);

  const playUiSound = useCallback(() => {
      if (navigator.vibrate) navigator.vibrate(10);
      try {
          const ctx = audioContextRef.current;
          if (!ctx) return;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'triangle'; 
          osc.frequency.setValueAtTime(2000, ctx.currentTime); 
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.015);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.015);
      } catch (e) {}
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setMenuPosition(prev => ({ 
          x: Math.min(prev.x, Math.max(0, window.innerWidth - 380)), 
          y: Math.min(prev.y, Math.max(0, window.innerHeight - 50)) 
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useLayoutEffect(() => {
    if (menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        const padding = 20;
        const targetWidth = isExpanded ? 430 : 160;
        const targetHeight = isExpanded ? Math.min(window.innerHeight * 0.75, 800) : 50;

        let newX = menuPosition.x;
        let newY = menuPosition.y;

        const prevCenter = prevMenuCenterRef.current;
        if (prevCenter.x !== 0) {
            newX = prevCenter.x - targetWidth / 2;
        }

        if (newX + targetWidth > window.innerWidth - padding) {
            newX = window.innerWidth - targetWidth - padding;
        }
        if (newY + targetHeight > window.innerHeight - padding) {
            newY = window.innerHeight - targetHeight - padding;
        }
        if (newX < padding) newX = padding;
        if (newY < padding) newY = padding;

        if (Math.abs(newX - menuPosition.x) > 1 || Math.abs(newY - menuPosition.y) > 1) {
            setMenuPosition({ x: newX, y: newY });
        }
    }
  }, [isExpanded]);

  const hexToRgb = (hex: string) => {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
    const bigint = parseInt(c, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r: r/255, g: g/255, b: b/255 };
  };

  const addLight = () => {
    playUiSound();
    if (lightsRef.current.length >= 30) return;
    const cam = cameraRef.current;
    const dirX = Math.cos(cam.pitch) * Math.sin(cam.yaw);
    const dirY = Math.sin(cam.pitch);
    const dirZ = Math.cos(cam.pitch) * Math.cos(cam.yaw);
    const c = randomLightColor 
        ? { r: Math.random(), g: Math.random(), b: Math.random() }
        : hexToRgb(newLightColor);
    const power = Number(lightPowerPercent) || 50;
    const intensity = 15.0 * (power / 100.0);
    lightsRef.current.push({ id: Date.now(), x: cam.x+dirX*2, y: Math.max(cam.y+dirY*2, 0.5), z: cam.z+dirZ*2, r: c.r, g: c.g, b: c.b, intensity: intensity });
    forceUpdate(n => n + 1);
  };
  
  const addBalls = (count: number) => {
    playUiSound();
    const maxSpheres = config.water ? 15000 : 1000;
    if (spheresRef.current.length >= maxSpheres) return;
    const cam = cameraRef.current;
    let added = 0;
    
    const cx = cam.x + Math.cos(cam.pitch)*Math.sin(cam.yaw)*15;
    const cy = Math.max(cam.y + Math.sin(cam.pitch)*15, -0.5);
    const cz = cam.z + Math.cos(cam.pitch)*Math.cos(cam.yaw)*15;

    const sizePercent = Number(ballSizePercent) || 50;
    // Allow radius to be as small as 0.01 (1%) instead of clamping to 0.1 (10%)
    const fixedRadius = Math.max(0.01, sizePercent / 100.0);

    while (added < count && spheresRef.current.length < maxSpheres) {
        const r = fixedRadius;
        let x = 0, y = 0, z = 0;
        let valid = false;
        let attempts = 0;
        
        while (!valid && attempts < 20) {
            x = cx + (Math.random()-0.5)*15;
            y = cy + (Math.random()-0.5)*15;
            if (y < r - 1.0) y = r - 1.0;
            z = cz + (Math.random()-0.5)*15;
            
            valid = true;
            for (const s of spheresRef.current) {
                const dx = x - s.x;
                const dy = y - s.y;
                const dz = z - s.z;
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (dist < r + s.radius) {
                    valid = false;
                    break;
                }
            }
            attempts++;
        }

        const color = randomBallColor 
            ? { r: Math.random(), g: Math.random(), b: Math.random() }
            : hexToRgb(newBallColor);

        spheresRef.current.push({
            id: Date.now() + Math.random(),
            x: x, y: y, z: z,
            radius: r, ...color, reflectivity: 0.6, vx: 0, vy: 0, vz: 0 
        });
        added++;
    }
    forceUpdate(n => n + 1);
  };

  const spawnShape = (type: string) => {
    playUiSound();
    const cam = cameraRef.current;
    const r = 0.5; 
    const spacing = 2.1 * r; 
    
    const dist = 10.0;
    const startPos = {
        x: cam.x + Math.cos(cam.pitch) * Math.sin(cam.yaw) * dist,
        y: Math.max(cam.y + Math.sin(cam.pitch) * dist, r - 1.0), 
        z: cam.z + Math.cos(cam.pitch) * Math.cos(cam.yaw) * dist
    };
    
    const newBalls: Sphere[] = [];
    const color = { r: Math.random(), g: Math.random(), b: Math.random() };
    const refl = 0.6;

    if (type === 'triangle') {
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col <= row; col++) {
                newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + (col - row * 0.5) * spacing, y: startPos.y, z: startPos.z + row * spacing * 0.866, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            }
        }
    } else if (type === 'square') {
        for (let x = 0; x < 4; x++) {
            for (let z = 0; z < 4; z++) {
                 newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + (x - 1.5) * spacing, y: startPos.y, z: startPos.z + (z - 1.5) * spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            }
        }
    } else if (type === 'rectangle') {
        for (let x = 0; x < 4; x++) {
            for (let z = 0; z < 6; z++) {
                 newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + (x - 1.5) * spacing, y: startPos.y, z: startPos.z + (z - 2.5) * spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            }
        }
    } else if (type === 'wall') {
        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 5; y++) {
                 newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + (x - 4) * spacing, y: startPos.y + y * spacing, z: startPos.z, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            }
        }
    } else if (type === 'circle') {
        const count = 20;
        for(let i=0; i<count; i++) {
            const ang = (i/count)*Math.PI*2;
            newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + Math.cos(ang)*3.0, y: startPos.y, z: startPos.z + Math.sin(ang)*3.0, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        }
        newBalls.push({ id: Date.now()+Math.random(), x: startPos.x, y: startPos.y, z: startPos.z, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
    } else if (type === 'cross') {
        for(let i=0; i<7; i++) {
            newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + (i-3)*spacing, y: startPos.y, z: startPos.z, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            if(i!==3) newBalls.push({ id: Date.now()+Math.random(), x: startPos.x, y: startPos.y, z: startPos.z + (i-3)*spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        }
    } else if (type === 'heart') {
        const heartShape = [[0, -1], [-1, -2], [-2, -1], [-1, 0], [0, 1], [1, 0], [2, -1], [1, -2]];
        heartShape.forEach(p => {
             newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + p[0]*spacing, y: startPos.y, z: startPos.z + p[1]*spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        });
    } else if (type === 'star') {
        for(let i=0; i<5; i++) {
            const ang = (i/5)*Math.PI*2 - Math.PI/2;
            newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + Math.cos(ang)*2.5, y: startPos.y, z: startPos.z + Math.sin(ang)*2.5, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            const innerAng = ang + Math.PI/5;
            newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + Math.cos(innerAng)*1.0, y: startPos.y, z: startPos.z + Math.sin(innerAng)*1.0, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        }
        newBalls.push({ id: Date.now()+Math.random(), x: startPos.x, y: startPos.y, z: startPos.z, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
    } else if (type === 'spiral2d') {
        for(let i=0; i<20; i++) {
            const ang = i * 0.5;
            const dist = i * 0.2;
            newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + Math.cos(ang)*dist, y: startPos.y, z: startPos.z + Math.sin(ang)*dist, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        }
    } else if (type === 'grid2d') {
        for(let x=0; x<5; x++) for(let z=0; z<5; z++) {
             if((x+z)%2===0) newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + (x-2)*spacing, y: startPos.y, z: startPos.z + (z-2)*spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        }
    } else if (type === 'xshape') {
        for(let i=0; i<5; i++) {
            newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + (i-2)*spacing, y: startPos.y, z: startPos.z + (i-2)*spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            if(i!==2) newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + (i-2)*spacing, y: startPos.y, z: startPos.z - (i-2)*spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        }
    } else if (type === 'diamond') {
        newBalls.push({ id: Date.now()+Math.random(), x: startPos.x, y: startPos.y, z: startPos.z - 2*spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        newBalls.push({ id: Date.now()+Math.random(), x: startPos.x - spacing, y: startPos.y, z: startPos.z - spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + spacing, y: startPos.y, z: startPos.z - spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        newBalls.push({ id: Date.now()+Math.random(), x: startPos.x, y: startPos.y, z: startPos.z, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        newBalls.push({ id: Date.now()+Math.random(), x: startPos.x - spacing, y: startPos.y, z: startPos.z + spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + spacing, y: startPos.y, z: startPos.z + spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        newBalls.push({ id: Date.now()+Math.random(), x: startPos.x, y: startPos.y, z: startPos.z + 2*spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
    } else if (type === 'cube') {
        for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) {
             newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + (x - 1.5) * spacing, y: startPos.y + y * spacing, z: startPos.z + (z - 1.5) * spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        }
    } else if (type === 'pyramid') {
        const levels = 5;
        for (let y = 0; y < levels; y++) {
            const size = levels - y;
            const offset = (levels - size) * spacing * 0.5;
            for (let x = 0; x < size; x++) for (let z = 0; z < size; z++) {
                 newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + x * spacing + offset - (levels*spacing)/2, y: startPos.y + y * spacing * 0.85, z: startPos.z + z * spacing + offset - (levels*spacing)/2, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            }
        }
    } else if (type === 'cylinder') {
        for (let h = 0; h < 6; h++) for (let i = 0; i < 12; i++) {
             const ang = (i / 12) * Math.PI * 2;
             newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + Math.cos(ang) * 2.0, y: startPos.y + h * spacing, z: startPos.z + Math.sin(ang) * 2.0, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        }
    } else if (type === 'sphere') {
        const layers = 8;
        for (let lat = 0; lat <= layers; lat++) {
            const theta = (lat * Math.PI) / layers;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);
            const numLong = Math.round(layers * 2 * sinTheta) || 1; 
            for (let lon = 0; lon < numLong; lon++) {
                const phi = (lon * 2 * Math.PI) / numLong;
                newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + 3.0 * sinTheta * Math.cos(phi), y: startPos.y + 3.0 * cosTheta + 3.0, z: startPos.z + 3.0 * sinTheta * Math.sin(phi), radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            }
        }
    } else if (type === 'cone') {
        for (let y = 0; y < 8; y++) {
            const rad = (8-y)*0.5;
            const count = Math.max(1, Math.floor(rad*6));
            for(let i=0; i<count; i++) {
                const ang = (i/count)*Math.PI*2;
                newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + Math.cos(ang)*rad, y: startPos.y + y*spacing*0.8, z: startPos.z + Math.sin(ang)*rad, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            }
        }
    } else if (type === 'torus') {
        const ringRadius = 3.0;
        const tubeRadius = 1.0;
        for(let i=0; i<20; i++) {
            const theta = (i/20)*Math.PI*2;
            const cx = Math.cos(theta)*ringRadius;
            const cz = Math.sin(theta)*ringRadius;
            for(let j=0; j<8; j++) {
                const phi = (j/8)*Math.PI*2;
                const x = cx + Math.cos(theta)*Math.cos(phi)*tubeRadius;
                const y = Math.sin(phi)*tubeRadius + 3.0;
                const z = cz + Math.sin(theta)*Math.cos(phi)*tubeRadius;
                newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + x, y: startPos.y + y, z: startPos.z + z, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            }
        }
    } else if (type === 'helix') {
        for(let i=0; i<40; i++) {
            const ang = i * 0.3;
            const h = i * 0.2;
            const rad = 2.0;
            newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + Math.cos(ang)*rad, y: startPos.y + h, z: startPos.z + Math.sin(ang)*rad, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        }
    } else if (type === 'prism') {
        for (let h = 0; h < 6; h++) {
             for(let i=0; i<3; i++) {
                const ang = (i/3)*Math.PI*2;
                newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + Math.cos(ang)*2.0, y: startPos.y + h*spacing, z: startPos.z + Math.sin(ang)*2.0, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
             }
        }
    } else if (type === 'stairs') {
        for(let i=0; i<10; i++) {
            newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + i*spacing*0.5, y: startPos.y + i*spacing*0.5, z: startPos.z, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + i*spacing*0.5, y: startPos.y + i*spacing*0.5, z: startPos.z + spacing, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        }
    } else if (type === 'dna') {
        for(let i=0; i<20; i++) {
            const ang = i * 0.5;
            const y = i * 0.4;
            newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + Math.cos(ang), y: startPos.y + y, z: startPos.z + Math.sin(ang), radius: r*0.8, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + Math.cos(ang+Math.PI), y: startPos.y + y, z: startPos.z + Math.sin(ang+Math.PI), radius: r*0.8, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            if(i%2===0) {
                 newBalls.push({ id: Date.now()+Math.random(), x: startPos.x, y: startPos.y + y, z: startPos.z, radius: r*0.5, r: 0.8, g: 0.8, b: 0.8, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            }
        }
    } else if (type === 'dome') {
        for(let i=0; i<5; i++) {
            const theta = (i/5)*Math.PI/2; 
            const ringR = Math.sin(theta)*4.0;
            const h = Math.cos(theta)*4.0;
            const count = Math.max(1, Math.floor(ringR*6));
            for(let j=0; j<count; j++) {
                 const phi = (j/count)*Math.PI*2;
                 newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + Math.cos(phi)*ringR, y: startPos.y + h, z: startPos.z + Math.sin(phi)*ringR, radius: r, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
            }
        }
    } else if (type === 'cluster') {
        for(let i=0; i<20; i++) {
            newBalls.push({ id: Date.now()+Math.random(), x: startPos.x + (Math.random()-0.5)*4, y: startPos.y + Math.random()*4, z: startPos.z + (Math.random()-0.5)*4, radius: r + Math.random()*0.5, ...color, reflectivity: refl, vx: 0, vy: 0, vz: 0 });
        }
    }

    const maxSpheres = config.water ? 15000 : 1000;
    if (spheresRef.current.length + newBalls.length <= maxSpheres) {
        spheresRef.current.push(...newBalls);
        forceUpdate(n => n + 1);
    }
  };

  const addWaterBalls = (count: number) => {
      const maxSpheres = 15000;
      if (spheresRef.current.length >= maxSpheres) return;
      const newBalls: Sphere[] = [];
      for (let i = 0; i < count; i++) {
          const offsetX = (Math.random() - 0.5) * 0.5;
          const offsetZ = (Math.random() - 0.5) * 0.5;
          const offsetY = (Math.random() * 0.5);
          newBalls.push({ id: Date.now() + Math.random(), x: offsetX, y: 6.0 + offsetY, z: offsetZ, radius: 0.03 + Math.random() * 0.02, r: 0.1, g: 0.4, b: 0.9, reflectivity: 0.6, vx: (Math.random()-0.5)*0.05, vy: -0.1, vz: (Math.random()-0.5)*0.05 });
      }
      spheresRef.current.push(...newBalls);
      forceUpdate(n => n + 1);
  };

  const clearFlow = () => {
      if (flowTimeoutRef.current) clearTimeout(flowTimeoutRef.current);
      if (flowIntervalRef.current) clearInterval(flowIntervalRef.current);
      flowTimeoutRef.current = null;
      flowIntervalRef.current = null;
  };

  const handleFlowDown = (e: React.PointerEvent) => {
      e.preventDefault();
      playUiSound();
      blurElement(e);
      addWaterBalls(2); 
      flowTimeoutRef.current = window.setTimeout(() => {
          flowIntervalRef.current = window.setInterval(() => {
              addWaterBalls(4); 
          }, 30);
      }, 200);
  };

  const handleFlowUp = (e: React.PointerEvent) => {
      e.preventDefault();
      clearFlow();
      blurElement(e);
  };

  const handleReset = (e?: React.SyntheticEvent) => {
      if(e) blurElement(e);
      playUiSound();
      clearFlow();
      spheresRef.current = [{ id: 1, x: 0, y: 0, z: 3, radius: 1.0, r: 1.0, g: 1.0, b: 1.0, reflectivity: 0.5, vx: 0, vy: 0, vz: 0 }];
      lightsRef.current = [];
      cameraRef.current = { x: 0, y: 1, z: -2, yaw: 0, pitch: -0.2 };
      setIsSettingFocus(false);
      setResetTrigger(n => n + 1);
      forceUpdate(n => n + 1);
  };

  const handleDeleteAll = (e?: React.SyntheticEvent) => {
      if(e) blurElement(e);
      playUiSound();
      clearFlow();
      spheresRef.current = []; 
      setConfig(c => ({...c, lookAtBall: false, followBall: false}));
      forceUpdate(n => n + 1);
  };

  const handleSetFocus = (e: React.SyntheticEvent) => {
      blurElement(e);
      playUiSound();
      setIsSettingFocus(true);
      setConfig(c => ({ ...c, lookAtBall: false }));
  };

  const handleCancelFocus = () => {
      if (isSettingFocus) {
          playUiSound();
          setIsSettingFocus(false);
          if (spheresRef.current.length > 0) {
              setConfig(c => ({ ...c, lookAtBall: true }));
          }
      }
  };

  const toggleWaterAndReset = (e: React.SyntheticEvent) => {
      blurElement(e);
      playUiSound();
      clearFlow();
      const nextWater = !config.water;
      
      if (nextWater) {
          savedConfigRef.current = { ...config };
          spheresRef.current = [];
          setIsSettingFocus(false);
          setConfig(prev => ({ ...DEFAULT_CONFIG, water: true, gravity: true, raytracingEnabled: false, primaryLightEnabled: true, lookAtBall: false, followBall: false, showPerformance: false, shadows: false, ambientOcclusion: false, bounciness: 0.50 }));
      } else {
          spheresRef.current = [{ id: 1, x: 0, y: 0, z: 3, radius: 1.0, r: 1.0, g: 1.0, b: 1.0, reflectivity: 0.5, vx: 0, vy: 0, vz: 0 }];
          cameraRef.current = { x: 0, y: 1, z: -2, yaw: 0, pitch: -0.2 };
          if (savedConfigRef.current) {
              setConfig({ ...savedConfigRef.current, water: false });
          } else {
              setConfig({ ...DEFAULT_CONFIG, water: false });
          }
          setTeleportTrigger(t => t + 1);
      }
      lightsRef.current = [];
  };

  const handleMenuDown = (e: React.PointerEvent) => {
    dragOffset.current = { x: e.clientX - menuPosition.x, y: e.clientY - menuPosition.y };
    menuPointerStartRef.current = { x: e.clientX, y: e.clientY };
    isDraggingMenu.current = true;
    hasDraggedMenu.current = false;
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch(err){}
  };

  const handleMenuMove = (e: React.PointerEvent) => {
     if (isDraggingMenu.current && menuRef.current) {
        const currentX = e.clientX;
        const currentY = e.clientY;
        const dist = Math.hypot(currentX - menuPointerStartRef.current.x, currentY - menuPointerStartRef.current.y);
        if (dist > 5) {
            hasDraggedMenu.current = true;
        }
        const w = menuRef.current.offsetWidth;
        const h = menuRef.current.offsetHeight;
        const maxX = Math.max(0, window.innerWidth - w);
        const maxY = Math.max(0, window.innerHeight - h);
        let newX = currentX - dragOffset.current.x;
        let newY = currentY - dragOffset.current.y;
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));
        setMenuPosition({ x: newX, y: newY });
     }
  };

  const handleMenuUp = (e: React.PointerEvent) => {
    isDraggingMenu.current = false;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch(err){}
    if (!hasDraggedMenu.current) {
        playUiSound();
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            prevMenuCenterRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        setIsExpanded(!isExpanded);
    }
  };

  const togglePerformance = (e: React.SyntheticEvent) => {
    blurElement(e);
    playUiSound();
    setConfig(c => ({...c, showPerformance: !c.showPerformance}));
  };

  const resetSettings = (e: React.SyntheticEvent) => {
    blurElement(e);
    playUiSound();
    setConfig({ ...DEFAULT_CONFIG });
  };

  const formatTime = (rad: number) => {
      let hours = 12 + (rad / (Math.PI * 2)) * 24;
      hours = hours % 24;
      const h = Math.floor(hours);
      const m = Math.floor((hours - h) * 60);
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const isConfigDirty = () => {
      const keys = Object.keys(DEFAULT_CONFIG) as (keyof SimulationConfig)[];
      for (const key of keys) {
          if (config[key] !== DEFAULT_CONFIG[key]) return true;
      }
      return false;
  };

  const hasBalls = spheresRef.current.length > 0;
  const hasLights = lightsRef.current.length > 0;
  const lightBtnClass = "bg-yellow-600/60 hover:bg-yellow-500/60 text-yellow-100";
  const ballBtnClass = "bg-cyan-600/60 hover:bg-cyan-500/60 text-cyan-100";
  const shapeBtnClass = "bg-gray-800 hover:bg-gray-700 p-2 rounded-lg text-gray-300 hover:text-white transition-colors flex items-center justify-center";

  return (
    <div className="relative w-full h-screen bg-gray-900 text-white overflow-hidden font-['Nunito'] select-none">
      <style>{`
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }
        input[type=number] {
            -moz-appearance: textfield;
        }
      `}</style>
      <Raytracer 
        spheresRef={spheresRef} 
        lightsRef={lightsRef} 
        config={config} 
        cameraRef={cameraRef} 
        setTimeOfDay={(t) => setConfig(c => ({...c, timeOfDay: t}))} 
        setLockRotation={(val) => setConfig(c => ({...c, lockRotation: val}))}
        onBallClick={(s) => { 
            if (config.blackHole) {
                 setExplodeTrigger(n=>n+1);
            }
            if (isSettingFocus) {
                const idx = spheresRef.current.indexOf(s);
                if (idx > -1) {
                    spheresRef.current.splice(idx, 1);
                    spheresRef.current.unshift(s);
                    setIsSettingFocus(false);
                    setConfig(c => ({...c, lookAtBall: true}));
                    forceUpdate(n => n + 1);
                }
            } else {
                if (!config.blackHole) {
                    setPushTrigger(n=>n+1); 
                    s.vx+=Math.cos(cameraRef.current.pitch)*Math.sin(cameraRef.current.yaw)*0.5; 
                    s.vz+=Math.cos(cameraRef.current.pitch)*Math.cos(cameraRef.current.yaw)*0.5; 
                    s.vy+=Math.sin(cameraRef.current.pitch)*0.5;
                }
            }
        }} 
        teleportTrigger={teleportTrigger} 
        explodeTrigger={explodeTrigger} 
        pushTrigger={pushTrigger}
        resetTrigger={resetTrigger}
        isSettingFocus={isSettingFocus}
        onCancelFocus={handleCancelFocus}
      />
      
      {isSettingFocus && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-bounce">
              <div className="bg-blue-600/80 px-6 py-2 rounded-full text-xl font-bold shadow-xl border border-white/20">
                  Choose a new ball
              </div>
          </div>
      )}

      <div className="absolute bottom-4 left-4 z-40 flex gap-2 select-none">
          <button tabIndex={-1} onClick={toggleWaterAndReset} className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-lg shadow-lg transition-all active:scale-95 border ${config.water ? 'bg-blue-400 border-blue-200 text-white' : 'bg-black/60 backdrop-blur-md border-white/10 text-blue-400 hover:bg-black/80'}`}><Droplets size={20} /> Water : {config.water ? 'ON' : 'OFF'}</button>
      </div>

      {config.water && (
          <>
            <div className="absolute bottom-4 right-4 z-40 select-none flex gap-2">
                <button tabIndex={-1} onClick={handleReset} className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-xl shadow-lg transition-all active:scale-95 border bg-red-600/80 backdrop-blur-md border-red-400 text-white hover:bg-red-500/80">Reset</button>
                <button 
                    tabIndex={-1}
                    onPointerDown={handleFlowDown} 
                    onPointerUp={handleFlowUp} 
                    onPointerLeave={handleFlowUp} 
                    className="flex items-center gap-2 px-6 py-3 rounded-3xl font-bold text-xl shadow-lg transition-all active:scale-95 border bg-cyan-600 border-cyan-400 text-white hover:bg-cyan-500 animate-pulse"
                >
                    <Wind size={24} /> Flow
                </button>
            </div>
            <div className="absolute top-4 right-4 z-40 select-none">
                <button tabIndex={-1} onClick={togglePerformance} className="flex items-center gap-2 px-4 py-2 rounded-3xl font-bold text-lg shadow-lg transition-all active:scale-95 border bg-cyan-600 border-cyan-400 text-white hover:bg-cyan-500"><Activity size={20} /> Show FPS/Stats</button>
            </div>
          </>
      )}

      {!config.water && (
        <>
        <div className="absolute bottom-4 right-4 z-40 select-none flex gap-2">
            <button tabIndex={-1} onClick={handleReset} className="flex items-center gap-2 px-5 py-2 rounded-full font-bold text-lg shadow-lg transition-all active:scale-95 border bg-red-600/80 backdrop-blur-md border-red-400 text-white hover:bg-red-500/80"><RotateCcw size={20}/> Reset</button>
        </div>
        <div className="absolute z-40 transition-none" style={{ top: menuPosition.y, left: menuPosition.x }}>
            <div 
                ref={menuRef} 
                className={`bg-black/60 backdrop-blur-lg border border-white/10 rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden select-none ${isExpanded ? 'w-96 p-6' : 'w-auto px-4 py-2 cursor-pointer hover:bg-black/80'}`} 
                onKeyDown={(e) => { 
                    if(e.code === 'Space' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }}
            >
            
            <div 
                className={`flex justify-center items-center ${isExpanded ? 'mb-4' : ''} cursor-pointer touch-none whitespace-nowrap`} 
                onPointerDown={handleMenuDown}
                onPointerMove={handleMenuMove}
                onPointerUp={handleMenuUp}
                onPointerCancel={handleMenuUp}
            >
                <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent pointer-events-none">Settings</h1>
            </div>

            {isExpanded && (
                <div className="space-y-0.5 animate-in fade-in duration-300 max-h-[75vh] overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                
                <div className="space-y-0.5" onKeyDown={(e) => e.stopPropagation()}>
                    <button tabIndex={-1} onClick={(e) => {blurElement(e); playUiSound(); setConfig(p => ({...p, raytracingEnabled: !p.raytracingEnabled, rayCount: !p.raytracingEnabled?2:1, maxBounces: !p.raytracingEnabled?3:1, reflectionIntensity: !p.raytracingEnabled?1.0:0, rain:false}))}} className={`w-full h-[49px] px-3 rounded-lg font-bold text-lg shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 mb-0 ${config.raytracingEnabled ? 'bg-green-600/80 text-white' : 'bg-gray-800 text-white'}`}><div className={`w-4 h-4 rounded-full ${config.raytracingEnabled ? 'bg-white' : 'bg-gray-600'}`} /> Raytracing : {config.raytracingEnabled ? 'ON' : 'OFF'}</button>

                    <div className="h-0 -my-px border-none"></div>

                    <div className="flex gap-px w-full h-10 items-center">
                        <div className="relative w-9 h-9 flex-shrink-0 flex items-center justify-center mr-1 group cursor-pointer" title="Light Color">
                            <input tabIndex={-1} type="color" value={newLightColor} onChange={(e) => { setNewLightColor(e.target.value); setRandomLightColor(false); }} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"/>
                            <div className="w-9 h-9 rounded-lg border border-white/50 shadow-md transition-transform active:scale-95" 
                                 style={{ 
                                     background: randomLightColor ? 'linear-gradient(135deg, #ef4444, #eab308, #22c55e, #3b82f6, #a855f7)' : newLightColor 
                                 }}/>
                             <button 
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRandomLightColor(!randomLightColor); }}
                                className="absolute -bottom-1 -right-1 bg-gray-800 text-[10px] text-white w-4 h-4 flex items-center justify-center rounded-full border border-white/30 z-20 hover:bg-gray-700"
                                title="Toggle Random Color"
                            >
                                {randomLightColor ? '?' : '#'}
                            </button>
                        </div>
                        <div className={`relative h-9 rounded-lg font-bold text-lg text-white flex items-center justify-center w-[61px] overflow-hidden flex-shrink-0 ${lightBtnClass}`}>
                           <input 
                                tabIndex={-1} 
                                type="number" 
                                min="1" 
                                max="100" 
                                value={lightPowerPercent} 
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setLightPowerPercent(val === '' ? '' : Math.max(0, Math.min(100, Number(val))));
                                }}
                                onBlur={() => {
                                    let val = Number(lightPowerPercent);
                                    if (isNaN(val) || val < 1) val = 1;
                                    if (val > 100) val = 100;
                                    setLightPowerPercent(val);
                                }}
                                className="w-full h-full bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                                style={{ textAlign: 'center' }}
                            />
                           <span className="absolute right-1 text-[10px] text-yellow-100/80 pointer-events-none">%</span>
                        </div>
                        <div className="w-px h-[15px] bg-transparent mx-px flex-shrink-0"></div>
                        <button tabIndex={-1} onClick={(e) => {blurElement(e); addLight()}} className={`h-9 px-2 rounded-lg font-bold text-lg w-[91px] flex-shrink-0 flex items-center justify-center ${lightBtnClass}`}>+ Light</button>
                        <div className="w-px h-[14px] bg-transparent mx-px flex-shrink-0"></div>
                        <button tabIndex={-1} disabled={!hasLights} onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            blurElement(e);
                            if(lightsRef.current.length > 0){
                                const cam = cameraRef.current;
                                let closestIdx = -1;
                                let minD = Number.MAX_VALUE;
                                lightsRef.current.forEach((l, i) => {
                                    const d = (l.x - cam.x)**2 + (l.y - cam.y)**2 + (l.z - cam.z)**2;
                                    if (d < minD) { minD = d; closestIdx = i; }
                                });
                                if (closestIdx !== -1) {
                                    lightsRef.current.splice(closestIdx, 1);
                                    forceUpdate(n => n + 1);
                                    playUiSound();
                                }
                            }
                        }} className={`h-9 px-2 rounded-lg font-bold text-lg w-[91px] flex-shrink-0 flex items-center justify-center ${hasLights ? 'bg-yellow-900/80 hover:bg-yellow-800/80 text-yellow-100' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>- Light</button>
                    </div>

                    <div className="h-0 -my-px border-none"></div>

                    <div className="flex gap-px w-full items-center mb-1">
                         <div className="relative w-9 h-9 flex-shrink-0 flex items-center justify-center mr-1 group cursor-pointer" title="Ball Color">
                            <input tabIndex={-1} type="color" value={newBallColor} onChange={(e) => { setNewBallColor(e.target.value); setRandomBallColor(false); }} className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"/>
                            <div className="w-9 h-9 rounded-lg border border-white/50 shadow-md transition-transform active:scale-95" 
                                 style={{ 
                                     background: randomBallColor ? 'linear-gradient(135deg, #ef4444, #eab308, #22c55e, #3b82f6, #a855f7)' : newBallColor 
                                 }}/>
                            <button 
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRandomBallColor(!randomBallColor); }}
                                className="absolute -bottom-1 -right-1 bg-gray-800 text-[10px] text-white w-4 h-4 flex items-center justify-center rounded-full border border-white/30 z-20 hover:bg-gray-700"
                                title="Toggle Random Color"
                            >
                                {randomBallColor ? '?' : '#'}
                            </button>
                        </div>

                        <div className={`relative h-9 rounded-lg font-bold text-lg text-white flex items-center justify-center w-[61px] overflow-hidden flex-shrink-0 ${ballBtnClass}`}>
                           <input 
                                tabIndex={-1} 
                                type="number" 
                                min="1" 
                                max="10000" 
                                value={ballSizePercent} 
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setBallSizePercent(val === '' ? '' : Math.max(1, Math.min(10000, Number(val))));
                                }}
                                onBlur={() => {
                                    let val = Number(ballSizePercent);
                                    if (isNaN(val) || val < 1) val = 1;
                                    if (val > 10000) val = 10000;
                                    setBallSizePercent(val);
                                }}
                                className="w-full h-full bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                                style={{ textAlign: 'center' }}
                            />
                           <span className="absolute right-1 text-[10px] text-cyan-100/80 pointer-events-none">%</span>
                        </div>
                        <div className="w-[3px] h-[15px] bg-transparent mx-0 flex-shrink-0"></div>

                        <button tabIndex={-1} onClick={(e) => {blurElement(e); addBalls(1)}} className={`py-1 px-1 rounded-lg font-bold text-lg w-[37px] flex-shrink-0 flex items-center justify-center ${ballBtnClass}`}>+1</button>
                        <div className="w-px h-[15px] bg-transparent mx-px flex-shrink-0"></div>
                        <button tabIndex={-1} onClick={(e) => {blurElement(e); addBalls(10)}} className={`py-1 px-1 rounded-lg font-bold text-lg w-[37px] flex-shrink-0 flex items-center justify-center ${ballBtnClass}`}>+10</button>
                        <div className="w-px h-4 bg-transparent mx-px flex-shrink-0"></div>
                        <button tabIndex={-1} onClick={(e) => {blurElement(e); addBalls(50)}} className={`py-1 px-1 rounded-lg font-bold text-lg w-[37px] flex-shrink-0 flex items-center justify-center ${ballBtnClass}`}>+50</button>
                        <div className="w-px h-4 bg-transparent mx-px flex-shrink-0"></div>
                        <button tabIndex={-1} disabled={!hasBalls} onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            blurElement(e); 
                            if(spheresRef.current.length > 0){
                                const cam = cameraRef.current;
                                let closestIdx = -1;
                                let minD = Number.MAX_VALUE;
                                spheresRef.current.forEach((s, i) => {
                                    const d = (s.x - cam.x)**2 + (s.y - cam.y)**2 + (s.z - cam.z)**2;
                                    if (d < minD) { minD = d; closestIdx = i; }
                                });
                                if (closestIdx !== -1) {
                                    spheresRef.current.splice(closestIdx, 1);
                                    if (spheresRef.current.length === 0) {
                                        setConfig(c => ({...c, lookAtBall: false}));
                                    }
                                    forceUpdate(n=>n+1);
                                    playUiSound(); 
                                }
                            } 
                        }} className={`h-9 px-2 rounded-lg font-bold text-base w-[61px] flex-shrink-0 whitespace-nowrap flex items-center justify-center ${hasBalls ? 'bg-red-900/80 hover:bg-red-800/80 text-red-100' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>- Ball</button>
                    </div>
                    
                    <div className="border-t border-transparent my-2"></div>

                    <div className="flex gap-px w-full items-center mb-1">
                        <button tabIndex={-1} disabled={!hasBalls} onClick={(e) => {blurElement(e); if(hasBalls){setTeleportTrigger(t=>t+1); playUiSound();}}} className={`h-9 px-3 rounded-lg font-bold text-sm w-14 flex-shrink-0 flex items-center justify-center ${hasBalls ? ballBtnClass : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>TP</button>
                        <div className="w-px h-4 bg-transparent mx-px flex-shrink-0"></div>
                        <button tabIndex={-1} onClick={handleSetFocus} disabled={!hasBalls} className={`h-9 px-4 rounded-lg font-bold text-base flex-1 flex items-center justify-center ${hasBalls ? ballBtnClass : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>Set Focus</button>
                        <div className="w-px h-[15px] bg-transparent mx-px flex-shrink-0"></div>
                        <button tabIndex={-1} onClick={handleDeleteAll} disabled={!hasBalls} className={`h-9 px-3 rounded-lg font-bold text-base w-36 flex items-center justify-center ${hasBalls ? 'bg-red-900/80 hover:bg-red-800/80 text-red-100' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>Delete Balls</button>
                    </div>

                    <div className="border-t border-transparent my-2"></div>

                    <div className="w-full pt-0 my-1">
                         <button tabIndex={-1} onClick={(e) => {blurElement(e); if (spheresRef.current.length > 1) {setExplodeTrigger(n=>n+1); playUiSound();}}} className={`w-full h-10 rounded-lg font-bold text-xl mt-0 ${spheresRef.current.length > 1 ? 'bg-red-900/80 hover:bg-red-800/80 text-red-100' : 'bg-gray-900/20 text-gray-500 cursor-not-allowed'}`}>Explode</button>
                    </div>
                    <div className="h-px w-full"></div>
                </div>
                
                <div className="border-t border-white/10 pt-2">
                    <button tabIndex={-1} onClick={(e) => { blurElement(e); playUiSound(); setShowShapes(!showShapes); }} className="flex items-center justify-between w-full text-left text-xl font-bold text-gray-300 hover:text-white"><span>Shapes</span>{showShapes ? (<ChevronDown size={20} />) : (<ChevronRight size={20} />)}</button>
                    {showShapes && (
                    <div className="mt-2 space-y-3 pl-1">
                        <div>
                            <div className="text-xs text-gray-500 font-bold mb-2 uppercase tracking-wider">2D Shapes</div>
                            <div className="grid grid-cols-6 gap-2">
                                <button onClick={() => spawnShape('triangle')} className={shapeBtnClass} title="Triangle"><TriangleIcon size={20}/></button>
                                <button onClick={() => spawnShape('square')} className={shapeBtnClass} title="Square"><Square size={20}/></button>
                                <button onClick={() => spawnShape('rectangle')} className={shapeBtnClass} title="Rectangle"><RectangleHorizontal size={20}/></button>
                                <button onClick={() => spawnShape('wall')} className={shapeBtnClass} title="Wall"><BrickWall size={20}/></button>
                                <button onClick={() => spawnShape('circle')} className={shapeBtnClass} title="Circle"><Circle size={20}/></button>
                                <button onClick={() => spawnShape('cross')} className={shapeBtnClass} title="Cross"><span className="font-bold text-xl">+</span></button>
                                <button onClick={() => spawnShape('heart')} className={shapeBtnClass} title="Heart"><Heart size={20}/></button>
                                <button onClick={() => spawnShape('star')} className={shapeBtnClass} title="Star"><Star size={20}/></button>
                                <button onClick={() => spawnShape('spiral2d')} className={shapeBtnClass} title="Spiral"><RotateCcw size={20}/></button>
                                <button onClick={() => spawnShape('grid2d')} className={shapeBtnClass} title="Grid"><Grid size={20}/></button>
                                <button onClick={() => spawnShape('xshape')} className={shapeBtnClass} title="X-Shape"><span className="font-bold text-xl">X</span></button>
                                <button onClick={() => spawnShape('diamond')} className={shapeBtnClass} title="Diamond"><Diamond size={20}/></button>
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 font-bold mb-2 uppercase tracking-wider">3D Shapes</div>
                            <div className="grid grid-cols-6 gap-2">
                                <button onClick={() => spawnShape('pyramid')} className={shapeBtnClass} title="Pyramid"><Pyramid size={20}/></button>
                                <button onClick={() => spawnShape('cube')} className={shapeBtnClass} title="Cube"><Box size={20}/></button>
                                <button onClick={() => spawnShape('cylinder')} className={shapeBtnClass} title="Cylinder"><Cylinder size={20}/></button>
                                <button onClick={() => spawnShape('sphere')} className={shapeBtnClass} title="Sphere"><CircleDashed size={20}/></button>
                                <button onClick={() => spawnShape('cone')} className={shapeBtnClass} title="Cone"><Cone size={20}/></button>
                                <button onClick={() => spawnShape('torus')} className={shapeBtnClass} title="Torus"><Donut size={20}/></button>
                                <button onClick={() => spawnShape('helix')} className={shapeBtnClass} title="Helix"><Activity size={20}/></button>
                                <button onClick={() => spawnShape('prism')} className={shapeBtnClass} title="Prism"><TriangleIcon size={20} className="rotate-90"/></button>
                                <button onClick={() => spawnShape('stairs')} className={shapeBtnClass} title="Stairs"><AlignRightIcon size={20} className="-rotate-90"/></button>
                                <button onClick={() => spawnShape('dna')} className={shapeBtnClass} title="DNA"><InfinityIcon size={20}/></button>
                                <button onClick={() => spawnShape('dome')} className={shapeBtnClass} title="Dome"><Globe size={20}/></button>
                                <button onClick={() => spawnShape('cluster')} className={shapeBtnClass} title="Cluster"><Gem size={20}/></button>
                            </div>
                        </div>
                    </div>
                    )}
                </div>

                <div className="border-t border-white/10 pt-2">
                    <button tabIndex={-1} onClick={(e) => { blurElement(e); playUiSound(); setShowCamera(!showCamera); }} className="flex items-center justify-between w-full text-left text-xl font-bold text-gray-300 hover:text-white"><span>Camera</span>{showCamera ? (<ChevronDown size={20} />) : (<ChevronRight size={20} />)}</button>
                    {showCamera && (
                    <div className="mt-2 space-y-3 pl-1">
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Speed <span className="ml-2 text-sm text-gray-500 font-bold">{config.cameraSpeed.toFixed(1)}</span></label><input tabIndex={-1} type="range" min="0.1" max="20.0" step="0.1" value={config.cameraSpeed} onChange={(e) => {setConfig({...config, cameraSpeed: parseFloat(e.target.value)}); blurElement(e)}} className="w-28 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-400"/></div>
                        
                        <div className={`flex items-center justify-between ${config.water || !hasBalls || isTouchDevice ? 'opacity-50 pointer-events-none' : ''}`}><label className="text-lg text-gray-400">Always aim</label><input tabIndex={-1} type="checkbox" checked={config.lookAtBall} disabled={config.water || !hasBalls || isTouchDevice} onChange={(e) => {setConfig({...config, lookAtBall: e.target.checked, lockRotation: e.target.checked ? true : config.lockRotation}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>

                        {(config.lookAtBall && !config.water && hasBalls) && (
                            <div className="flex items-center justify-between pl-4"><label className="text-lg text-gray-400">Lock</label><input tabIndex={-1} type="checkbox" checked={config.followBall} disabled={config.water || !hasBalls} onChange={(e) => {setConfig({...config, followBall: e.target.checked}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>
                        )}
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Show FPS/Stats</label><input tabIndex={-1} type="checkbox" checked={config.showPerformance} onChange={(e) => {setConfig({...config, showPerformance: e.target.checked}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>
                    </div>
                    )}
                </div>

                <div className="border-t border-white/10 pt-2">
                    <button tabIndex={-1} onClick={(e) => { blurElement(e); playUiSound(); setShowLightning(!showLightning); }} className="flex items-center justify-between w-full text-left text-xl font-bold text-gray-300 hover:text-white"><span>Lightning</span>{showLightning ? (<ChevronDown size={20} />) : (<ChevronRight size={20} />)}</button>
                    {showLightning && (
                    <div className="mt-2 space-y-3 pl-1">
                         <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Primary Light</label><input tabIndex={-1} type="checkbox" checked={config.primaryLightEnabled} onChange={(e) => { const isChecked = e.target.checked; setConfig({...config, primaryLightEnabled: isChecked, skyboxType: !isChecked ? 'white' : 'blue'}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>

                         {config.primaryLightEnabled && (
                            <>
                             <div className={`flex items-center justify-between pl-4`}><label className="text-lg text-gray-400">Intensity <span className="ml-2 text-sm text-gray-500 font-bold">{Math.round(config.lightIntensity * 100)}%</span></label><input tabIndex={-1} type="range" min="0.0" max="5.0" step="0.1" value={config.lightIntensity} onChange={(e) => {setConfig({...config, lightIntensity: parseFloat(e.target.value)}); blurElement(e)}} className="w-28 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-400"/></div>

                             <div className="flex items-center justify-between pl-4"><label className="text-lg text-gray-400">Time <span className="ml-2 text-sm text-gray-500 font-bold">{formatTime(config.timeOfDay)}</span></label><input tabIndex={-1} type="range" min="0" max={Math.PI * 2} step="0.1" value={config.timeOfDay} onChange={(e) => {setConfig({...config, timeOfDay: parseFloat(e.target.value)}); blurElement(e)}} className="w-28 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-400"/></div>

                             <div className={`flex items-center justify-between pl-4`}><label className="text-lg text-gray-400">Cycle</label><input tabIndex={-1} type="checkbox" checked={config.dayNightCycle} onChange={(e) => {setConfig({...config, dayNightCycle: e.target.checked, sunFocusEnabled: e.target.checked}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>
                            </>
                         )}
                         
                         <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Show Orbs</label><input tabIndex={-1} type="checkbox" checked={config.renderLightOrbs} onChange={(e) => {setConfig({...config, renderLightOrbs: e.target.checked}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>

                         <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Indirect Lighting</label><input tabIndex={-1} type="checkbox" checked={config.indirectLighting} onChange={(e) => {setConfig({...config, indirectLighting: e.target.checked}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>

                         <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Global Illumination</label><input tabIndex={-1} type="checkbox" checked={config.globalIllumination} onChange={(e) => {setConfig({...config, globalIllumination: e.target.checked}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>
                         
                         <div className={`flex items-center justify-between ${!config.raytracingEnabled ? 'opacity-50' : ''}`}><label className="text-lg text-gray-400">Reflection <span className="ml-2 text-sm text-gray-500 font-bold">{Math.round(config.reflectionIntensity*100)}%</span></label><input tabIndex={-1} type="range" min="0.0" max="1.0" step="0.1" value={config.reflectionIntensity} disabled={!config.raytracingEnabled} onChange={(e) => {setConfig({...config, reflectionIntensity: parseFloat(e.target.value)}); blurElement(e)}} className={`w-28 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-400 ${!config.raytracingEnabled ? 'cursor-not-allowed' : ''}`}/></div>
                    </div>
                    )}
                </div>

                <div className="border-t border-white/10 pt-2">
                    <button tabIndex={-1} onClick={(e) => { blurElement(e); playUiSound(); setShowPhysics(!showPhysics); }} className="flex items-center justify-between w-full text-left text-xl font-bold text-gray-300 hover:text-white"><span>Physics</span>{showPhysics ? (<ChevronDown size={20} />) : (<ChevronRight size={20} />)}</button>
                    {showPhysics && (
                    <div className="mt-2 space-y-3 pl-1">
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Attraction</label><input tabIndex={-1} type="checkbox" checked={config.attraction} onChange={(e) => {setConfig({...config, attraction: e.target.checked, blackHole: e.target.checked ? config.blackHole : false}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>
                        
                        <div className={`flex items-center justify-between pl-4 ${!config.attraction ? 'hidden' : ''}`}><label className="text-lg text-gray-400">Black hole</label><input tabIndex={-1} type="checkbox" checked={config.blackHole} disabled={!config.attraction} onChange={(e) => {setConfig({...config, blackHole: e.target.checked}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-purple-500 checked:border-purple-500 transition-colors cursor-pointer disabled:cursor-not-allowed"/></div>

                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Gravity</label><input tabIndex={-1} type="checkbox" checked={config.gravity} onChange={(e) => {setConfig({...config, gravity: e.target.checked}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>
                        
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Bouncing <span className="ml-2 text-sm text-gray-500 font-bold">{Math.round(config.bounciness * 100)}%</span></label><input tabIndex={-1} type="range" min="0.0" max="1.0" step="0.05" value={config.bounciness} onChange={(e) => {setConfig({...config, bounciness: parseFloat(e.target.value)}); blurElement(e)}} className="w-28 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-400"/></div>

                    </div>
                    )}
                </div>

                <div className="border-t border-white/10 pt-2">
                    <button tabIndex={-1} onClick={(e) => { blurElement(e); playUiSound(); setShowTerrain(!showTerrain); }} className="flex items-center justify-between w-full text-left text-xl font-bold text-gray-300 hover:text-white"><span>Terrain</span>{showTerrain ? (<ChevronDown size={20} />) : (<ChevronRight size={20} />)}</button>
                    {showTerrain && (
                    <div className="mt-2 space-y-3 pl-1">
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Skybox</label>
                        <select tabIndex={-1} value={config.skyboxType} onChange={(e) => {setConfig({...config, skyboxType: e.target.value as SkyboxType}); blurElement(e)}} className="bg-gray-800 text-gray-200 text-sm rounded border border-gray-600 px-2 py-1">
                             <option value="blue" disabled={!config.primaryLightEnabled}>Sky</option>
                             <option value="white">White space</option>
                             <option value="none">None</option>
                        </select></div>
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Ground</label>
                        <select tabIndex={-1} value={config.groundTexture} onChange={(e) => {setConfig({...config, groundTexture: e.target.value as GroundTextureType}); blurElement(e)}} className="bg-gray-800 text-gray-200 text-sm rounded border border-gray-600 px-2 py-1">
                             <option value="checker">Checker</option>
                             <option value="asphalt">Asphalt</option>
                             <option value="hex">Hex</option>
                             <option value="grass">Grass</option>
                        </select></div>
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Ball material</label>
                        <select tabIndex={-1} value={config.ballTexture} onChange={(e) => {setConfig({...config, ballTexture: e.target.value as BallTextureType}); blurElement(e)}} className="bg-gray-800 text-gray-200 text-sm rounded border border-gray-600 px-2 py-1">
                            <option value="none">Normal</option>
                            <option value="metal">Metal</option>
                            <option value="glass">Glass</option>
                        </select></div>
                        <div className={`flex items-center justify-between ${!config.raytracingEnabled ? 'opacity-50' : ''}`}><label className="text-lg text-gray-400">Rain</label><input tabIndex={-1} type="checkbox" checked={config.rain} disabled={!config.raytracingEnabled} onChange={(e) => {setConfig({...config, rain: e.target.checked}); blurElement(e)}} className={`w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer ${!config.raytracingEnabled ? 'pointer-events-none' : ''}`}/></div>
                        
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Fog</label><input tabIndex={-1} type="checkbox" checked={config.fog} onChange={(e) => {setConfig({...config, fog: e.target.checked}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>
                        
                        {config.fog && (
                            <>
                            <div className="flex items-center justify-between pl-4">
                                <label className="text-lg text-gray-400">Density <span className="ml-2 text-sm text-gray-500 font-bold">{(config.fogDensity * 1000).toFixed(1)}</span></label>
                                <input tabIndex={-1} type="range" min="0.000" max="0.5" step="0.001" value={config.fogDensity} onChange={(e) => {setConfig({...config, fogDensity: parseFloat(e.target.value)}); blurElement(e)}} className="w-28 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-400"/>
                            </div>
                            </>
                        )}
                    </div>
                    )}
                </div>

                <div className="border-t border-white/10 pt-2">
                    <button tabIndex={-1} onClick={(e) => { blurElement(e); playUiSound(); setShowGraphics(!showGraphics); }} className="flex items-center justify-between w-full text-left text-xl font-bold text-gray-300 hover:text-white"><span>Graphics</span>{showGraphics ? (<ChevronDown size={20} />) : (<ChevronRight size={20} />)}</button>
                    {showGraphics && (
                    <div className="mt-2 space-y-3 pl-1">
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Resolution</label>
                        <select tabIndex={-1} value={config.resolutionMode} onChange={(e) => {setConfig({...config, resolutionMode: e.target.value as ResolutionMode}); blurElement(e)}} className="bg-gray-800 text-gray-200 text-sm rounded border border-gray-600 px-2 py-1">
                             <option value="native">Native</option>
                             <option value="720p">720p</option>
                             <option value="1080p">1080p</option>
                             <option value="1440p">1440p</option>
                             <option value="2160p">4K</option>
                        </select></div>
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Antialiasing</label><input tabIndex={-1} type="checkbox" checked={config.antialiasing} onChange={(e) => {setConfig({...config, antialiasing: e.target.checked}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Shadows</label><input tabIndex={-1} type="checkbox" checked={config.shadows} onChange={(e) => {setConfig({...config, shadows: e.target.checked}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Ambient Occlusion</label><input tabIndex={-1} type="checkbox" checked={config.ambientOcclusion} onChange={(e) => {setConfig({...config, ambientOcclusion: e.target.checked}); blurElement(e)}} className="w-5 h-5 appearance-none rounded-full border-2 border-gray-500 checked:bg-blue-400 checked:border-blue-400 transition-colors cursor-pointer"/></div>
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">Light bounces <span className="ml-2 text-sm text-gray-500 font-bold">{config.maxBounces}</span></label><input tabIndex={-1} type="range" min="1" max="10" step="1" value={config.maxBounces} onChange={(e) => {setConfig({...config, maxBounces: parseInt(e.target.value)}); blurElement(e)}} className="w-28 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-400"/></div>
                        <div className="flex items-center justify-between"><label className="text-lg text-gray-400">LOD <span className="ml-2 text-sm text-gray-500 font-bold">{Math.round(config.renderDistance)}</span></label><input tabIndex={-1} type="range" min="50" max="500" step="10" value={config.renderDistance} onChange={(e) => {setConfig({...config, renderDistance: parseFloat(e.target.value)}); blurElement(e)}} className="w-28 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-400"/></div>
                    </div>
                    )}
                </div>

                {isConfigDirty() && (
                    <div className="pt-4 pb-2">
                        <button onClick={resetSettings} className="w-full py-3 bg-red-900/80 hover:bg-red-800 text-red-100 rounded-xl text-xl font-bold border border-red-500/30 transition-all shadow-lg active:scale-95">
                            Reset Settings
                        </button>
                    </div>
                )}
            </div>
            )}
            </div>
        </div>
        </>
      )}
    </div>
  );
};

export default App;