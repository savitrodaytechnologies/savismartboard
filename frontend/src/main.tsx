import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from '@/app/App';
import '@/styles.css';

const qc = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <GoogleOAuthProvider clientId="454672128789-fvk5hknkeco219qo722cmrghtlsvco68.apps.googleusercontent.com">
            <QueryClientProvider client={qc}>
                <BrowserRouter>
                    <App />
                </BrowserRouter>
            </QueryClientProvider>
        </GoogleOAuthProvider>
    </React.StrictMode>
);
