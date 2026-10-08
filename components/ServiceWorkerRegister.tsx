"use client";
import { useEffect } from 'react';

// Registra el service worker (solo producción) para poder abrir cualquier pantalla sin conexión.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
