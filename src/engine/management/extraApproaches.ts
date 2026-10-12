// Registry for player-approach kinds defined outside people.ts (e.g. the transfer-bid conversations in bidTalks.ts).
// Deliberately import-free: people.ts chains its APPROACHES table to this object (prototype lookup), so a module can
// register kinds at load time whatever order the import cycle evaluates in.
export const EXTRA_APPROACHES: Record<string, unknown> = {};
