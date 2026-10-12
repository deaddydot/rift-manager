// The online ("hosted") build — `npm run build:hosted`, which runs `vite build --mode hosted` and reads
// .env.hosted. It is the same game minus the player / team / staff Editor and the in-browser AI chat
// (the stream chat uses its built-in lines). Node scripts have no import.meta.env, so this is false there.
export const HOSTED = import.meta.env?.VITE_HOSTED === '1';
