import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: false
});

// TODO: attach Savischools JWT bearer once auth handoff is wired.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('savischools_jwt');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
