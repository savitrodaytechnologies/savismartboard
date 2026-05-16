import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { processQueue, pendingCount, stuckCount, clearStuckItems } from '@/services/syncService';

/**
 * Floating badge that shows connection status + pending sync count.
 * Triggers queue flush whenever we come back online, and retries every 30 s.
 */
export default function OfflineIndicator() {
    const online = useOnlineStatus();
    const [pending, setPending] = useState(0);
    const [stuck, setStuck] = useState(0);
    const [syncing, setSyncing] = useState(false);

    async function refresh() {
        setPending(await pendingCount());
        setStuck(await stuckCount());
    }

    async function runSync() {
        setSyncing(true);
        await processQueue();
        await refresh();
        setSyncing(false);
    }

    // Poll counts every 3 s
    useEffect(() => {
        refresh();
        const id = setInterval(refresh, 3000);
        return () => clearInterval(id);
    }, []);

    // Flush queue on mount + whenever we come back online
    useEffect(() => {
        if (!online) return;
        runSync();
    }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

    // Retry every 5 s while there are pending items
    useEffect(() => {
        if (!online || pending === 0) return;
        const id = setInterval(() => { void runSync(); }, 5_000);
        return () => clearInterval(id);
    }, [online, pending]); // eslint-disable-line react-hooks/exhaustive-deps

    async function handleDismissStuck() {
        await clearStuckItems();
        await refresh();
    }

    // Only show when offline OR there are pending items
    if (online && pending === 0) return null;

    return (
        <div
            className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-lg transition-all ${
                online
                    ? 'bg-amber-400 text-amber-900'
                    : 'bg-rose-600 text-white'
            }`}
        >
            {online ? (
                <>
                    <span className={syncing ? 'animate-spin' : ''}>⟳</span>
                    {syncing ? 'Syncing…' : `${pending} change${pending !== 1 ? 's' : ''} pending sync`}
                    {stuck > 0 && !syncing && (
                        <button
                            onClick={handleDismissStuck}
                            title="Dismiss stuck items — your drawing is saved locally"
                            className="ml-1 rounded-full bg-amber-700 text-white px-2 py-0.5 hover:bg-amber-800 font-semibold"
                        >
                            Dismiss
                        </button>
                    )}
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
