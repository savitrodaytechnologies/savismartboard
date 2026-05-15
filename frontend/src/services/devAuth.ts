// Only used in development builds (import.meta.env.DEV).
// Calls /api/dev/token and stores the JWT in localStorage.
export async function fetchDevToken(): Promise<string> {
    const res = await fetch('/api/dev/token');
    if (!res.ok) throw new Error('Dev token endpoint failed');
    const data = await res.json() as { token: string };
    localStorage.setItem('savischools_jwt', data.token);
    return data.token;
}

export function clearDevToken() {
    localStorage.removeItem('savischools_jwt');
}

export function hasToken(): boolean {
    return !!localStorage.getItem('savischools_jwt');
}
