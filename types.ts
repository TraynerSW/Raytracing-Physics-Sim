export interface Sphere {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  reflectivity: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface Light {
  id: number;
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  intensity: number;
}

export interface Camera {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export type GroundTextureType = 'checker' | 'asphalt' | 'hex' | 'grass';
export type BallTextureType = 'none' | 'metal' | 'glass';
export type ResolutionMode = 'native' | '720p' | '1080p' | '1440p' | '2160p';
export type SkyboxType = 'none' | 'white' | 'blue';

export interface SimulationConfig {
  raytracingEnabled: boolean;
  rayCount: number; // Samples per pixel
  antialiasing: boolean;
  maxBounces: number;
  renderDistance: number; // Direct distance value
  cameraSpeed: number;
  rain: boolean;
  fog: boolean;
  fogDensity: number;
  fogDistance: number; // New config for fog start distance
  shadows: boolean;
  ambientOcclusion: boolean;
  showPerformance: boolean; // Consolidated FPS/Stats
  reflectionIntensity: number;
  gravity: boolean;
  groundTexture: GroundTextureType;
  bounciness: number;
  attraction: boolean;
  blackHole: boolean; // New black hole mode
  followBall: boolean;
  lookAtBall: boolean;
  lockRotation: boolean; // Controls Q/D behavior relative to ball
  primaryLightEnabled: boolean; // Toggle for Sun/Moon/Dir light
  sunFocusEnabled: boolean; // Extra strong light above main ball (Renamed to Day/Night in UI)
  dayNightCycle: boolean;
  timeOfDay: number;
  lightIntensity: number;
  resolutionMode: ResolutionMode; // Changed from scale to mode
  renderLightOrbs: boolean; // Toggle for visible light spheres
  skyboxType: SkyboxType; // Changed from boolean to type
  
  // New Lighting settings
  indirectLighting: boolean;
  globalIllumination: boolean;
  roughness: number;
  ballTexture: BallTextureType;
  anisotropicFilter: number;
  
  // Water
  water: boolean;
  waterLevel: number;
}