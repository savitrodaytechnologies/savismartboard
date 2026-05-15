import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { processQueue, pendingCount } from '@/services/syncService';

/**
 * Floating badge that shows connection status + pending sync count.
 * Triggers queue flush whenever we come back online.
 */
export default function OfflineIndicator() {
    const online = useOnlineStatus();
    const [pending, setPending] = useState(0);
    const [syncing, setSyncing] = useState(false);

    // Poll pending count every 3 s
    useEffect(() => {
        const tick = async () => setPending(await pendingCount());
        tick();
        const id = setInterval(tick, 3000);
        return () => clearInterval(id);
    }, []);

    // Flush queue when we come back online
    useEffect(() => {
        if (!online) return;
        setSyncing(true);
        processQueue().then(async () => {
            setPending(await pendingCount());
            setSyncing(false);
        });
    }, [online]);

    // Only show when offline OR there are pending items
    if (online && pending === 0) return null;

    return (
        <div
            className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-lg transition-all ${online
                    ? 'bg-amber-400 text-amber-900'
                    : 'bg-rose-600 text-white'
                }`}
        >
            {online ? (
                <>
                    <span className={syncing ? 'animate-spin' : ''}>⟳</span>
                    {syncing ? 'Syncing…' : `${pending} change${pending !== 1 ? 's' : ''} pending sync`}
                </>
            ) : (
                <>
                    <span>⚡</span>
                    Offline mode — changes saved locally
                    {pending > 0 && <span className="ml-1 bg-white/20 rounded-full px-1.5">{pending}</span>}
                </>
            )}
        </div>
    );
}
