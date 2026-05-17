import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { processQueue, pendingCount, stuckCount, clearStuckItems } from '@/services/syncService';

/**
 * Minimal sync status: tiny dot at bottom-right, click to see details.
 * Visible only when offline or there are pending items.
 */
export default function OfflineIndicator() {
    const online = useOnlineStatus();
    const [pending, setPending] = useState(0);
    const [stuck, setStuck] = useState(0);
    const [syncing, setSyncing] = useState(false);
    const [expanded, setExpanded] = useState(false);

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

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, 3000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (!online) return;
        runSync();
    }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!online || pending === 0) return;
        const id = setInterval(() => { void runSync(); }, 5_000);
        return () => clearInterval(id);
    }, [online, pending]); // eslint-disable-line react-hooks/exhaustive-deps

    async function handleDismissStuck() {
        await clearStuckItems();
        await refresh();
    }

    // Fully hidden when online and nothing pending
    if (online && pending === 0) return null;

    const isAmber = online; // amber = pending sync; rose = offline

    return (
        <div className="fixed bottom-3 right-20 z-50 flex flex-col items-end gap-1">
            {/* Detail card — shown on click */}
            {expanded && (
                <div
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-lg ${
                        isAmber ? 'bg-amber-400 text-amber-900' : 'bg-rose-600 text-white'
                    }`}
                >
                    {isAmber ? (
                        <>
                            <span className={syncing ? 'animate-spin' : ''}>⟳</span>
                            {syncing ? 'Syncing…' : `${pending} change${pending !== 1 ? 's' : ''} pending sync`}
                            {stuck > 0 && !syncing && (
                                <button
                                    onClick={handleDismissStuck}
                                    title="Dismiss stuck items"
                                    className="ml-1 rounded-full bg-amber-700 text-white px-2 py-0.5 hover:bg-amber-800 font-semibold"
                                >
                                    Dismiss
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <span>⚡</span>
                            Offline — changes saved locally
                            {pending > 0 && (
                                <span className="ml-1 bg-white/20 rounded-full px-1.5">{pending}</span>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Tiny icon dot — always visible when there's something to show */}
            <button
                onClick={() => setExpanded(v => !v)}
                title="Sync status"
                className={`w-4 h-4 rounded-full shadow-md border-2 border-slate-900 transition-transform hover:scale-125 ${
                    isAmber ? 'bg-amber-400' : 'bg-rose-500'
                } ${syncing ? 'animate-pulse' : ''}`}
            />
        </div>
    );
}

