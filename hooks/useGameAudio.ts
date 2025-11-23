
import { useEffect, useRef } from 'react';
import { SimulationConfig } from '../types';

export const useGameAudio = (config: SimulationConfig) => {
  const rainAudioRef = useRef<HTMLAudioElement | null>(null);
  const explosionAudioRef = useRef<HTMLAudioElement | null>(null);
  const blackHoleAudioRef = useRef<HTMLAudioElement | null>(null);
  const laserAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const collisionBufferRef = useRef<AudioBuffer | null>(null);
  const soundSilenceUntil = useRef(0);
  const soundRateLimit = useRef({ count: 0, frames: 0 });
  const wasExplodedRef = useRef(false);

  useEffect(() => {
      const audio = new Audio('https://actions.google.com/sounds/v1/weather/light_rain.ogg');
      audio.loop = true;
      audio.volume = 0.5;
      audio.preload = 'auto';
      rainAudioRef.current = audio;
      return () => { audio.pause(); audio.src = ''; };
  }, []);

  useEffect(() => {
      // Using a humming sound for black hole attraction/magnetism
      const audio = new Audio('https://actions.google.com/sounds/v1/science_fiction/humming_laser_beam.ogg');
      audio.loop = true;
      audio.volume = 0.3; // Slightly lower volume for the hum
      audio.preload = 'auto';
      blackHoleAudioRef.current = audio;
      return () => { audio.pause(); audio.src = ''; };
  }, []);

  useEffect(() => {
      const audio = new Audio('https://actions.google.com/sounds/v1/weapons/explosion_large.ogg');
      audio.volume = 0.8;
      audio.preload = 'auto';
      audio.load();
      explosionAudioRef.current = audio;
  }, []);

  useEffect(() => {
    const audio = new Audio('https://actions.google.com/sounds/v1/science_fiction/laser_gun_shot.ogg');
    audio.volume = 0.4;
    audio.preload = 'auto';
    audio.load();
    laserAudioRef.current = audio;
}, []);

  useEffect(() => {
      const initAudio = async () => {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioCtx) return;
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          try {
              const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
              const data = buffer.getChannelData(0);
              for (let i = 0; i < data.length; i++) {
                  data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length/4));
              }
              collisionBufferRef.current = buffer;
          } catch (e) {}
      };
      initAudio();
      return () => { audioCtxRef.current?.close(); };
  }, []);

  useEffect(() => {
      const rain = rainAudioRef.current;
      if (rain) {
          if (config.rain) {
              rain.volume = 0.5;
              if (rain.paused) rain.play().catch(() => {});
          } else {
              rain.pause();
          }
      }
      
      const bh = blackHoleAudioRef.current;
      if (bh) {
          // Play black hole sound if enabled and not recently exploded
          if (config.blackHole && !wasExplodedRef.current) {
              if (bh.paused) bh.play().catch(() => {});
          } else {
              bh.pause();
              bh.currentTime = 0; // Reset sound when stopped
          }
      }
      
      // Reset exploded flag if black hole is turned off then on (handled by config change primarily)
      if (!config.blackHole) {
          wasExplodedRef.current = false;
          if (bh) {
              bh.pause();
              bh.currentTime = 0;
          }
      }
  }, [config.rain, config.blackHole]);

  const updateSoundFrame = () => {
     soundRateLimit.current.frames++;
     if (soundRateLimit.current.frames > 10) { 
         soundRateLimit.current.frames = 0; 
         soundRateLimit.current.count = 0; 
     }
  };

  const playCollisionSound = (intensity: number) => {
      if (performance.now() < soundSilenceUntil.current) return;
      if (soundRateLimit.current.count >= 4) return;

      const ctx = audioCtxRef.current;
      if (!ctx || !collisionBufferRef.current) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      
      const source = ctx.createBufferSource();
      source.buffer = collisionBufferRef.current;
      const gain = ctx.createGain();
      gain.gain.value = Math.min(Math.max(intensity * 3.0, 0.1), 1.0);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
      
      soundRateLimit.current.count++;
  };

  const playExplosion = () => {
      // Stop black hole sound immediately
      if (blackHoleAudioRef.current) {
          blackHoleAudioRef.current.pause();
          blackHoleAudioRef.current.currentTime = 0;
      }
      wasExplodedRef.current = true;

      if (explosionAudioRef.current) {
          explosionAudioRef.current.currentTime = 0;
          explosionAudioRef.current.play().catch(() => {});
      }
  };

  const playLaser = () => {
    if (laserAudioRef.current) {
        laserAudioRef.current.currentTime = 0;
        laserAudioRef.current.play().catch(() => {});
    }
  };
  
  const resetSilence = () => {
      soundSilenceUntil.current = 0;
  };
  
  const setSilenceUntil = (time: number) => {
      soundSilenceUntil.current = time;
  };
  
  const ensureAudio = () => {
      if (rainAudioRef.current && config.rain && rainAudioRef.current.paused) {
          rainAudioRef.current.play().catch(() => {});
      }
      if (blackHoleAudioRef.current && config.blackHole && !wasExplodedRef.current && blackHoleAudioRef.current.paused) {
          blackHoleAudioRef.current.play().catch(() => {});
      }
  };

  return { 
      playCollisionSound, 
      playExplosion, 
      resetSilence, 
      setSilenceUntil,
      updateSoundFrame,
      ensureAudio,
      playLaser
  };
};
