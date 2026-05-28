import { useState, useEffect, useRef } from 'react';

// Debounce delay (ms) — prevents rapid online/offline flicker from re-triggering session loads
const DEBOUNCE_MS = 2000;

export function useOnlineStatus(): boolean {
    const [online, setOnline] = useState(navigator.onLine);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const update = (value: boolean) => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setOnline(value), DEBOUNCE_MS);
        };
        const on = () => update(true);
        const off = () => update(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off);
        };
    }, []);
    return online;
}
